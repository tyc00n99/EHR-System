import { createWorld, dsp, event, type World } from "./harness";
import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { MinnesotaHhaxAdapter, readTransaction, resetHhaxThrottle, toHhaxVisit, type HhaxConfig, type HttpRequest, type HttpResult } from "@/evv/adapters/hhax-minnesota";
import { getProfile, writer } from "@/evv/context";
import { correctVisit } from "@/evv/corrections";
import { dhsReasonForManualText, inMiwsTable } from "@/evv/dhs-codes";
import { clockIn, clockOut } from "@/evv/ingest";
import { reconcile } from "@/evv/reconciliation";
import { processQueue } from "@/evv/submission";
import { createVisit, loadVisit } from "@/evv/visits";

const CONFIG: HhaxConfig = { environment: "sandbox", baseUrl: "https://implementation.hhaexchange.com", apiVersion: "v1", clientId: "cid", secret: "shh", scope: "scope", timeoutMs: 1000, submissionEnabled: true };

/** Records every request; answers like HHAX as far as the specification describes it. */
class FakeHhax {
  requests: HttpRequest[] = [];
  tokens = 0;
  txStatus: HttpResult = { status: 200, body: { status: "Processing" } };
  visitReply: HttpResult = { status: 200, body: { transactionId: "TX-1" } };
  expireNext = false;
  async send(req: HttpRequest): Promise<HttpResult> {
    this.requests.push(req);
    if (req.path === "/identity/connect/token") { this.tokens++; return { status: 200, body: { access_token: `tok${this.tokens}`, expires_in: 1800 } }; }
    if (this.expireNext) { this.expireNext = false; return { status: 401, body: "expired" }; }
    if (req.path.endsWith("/caregivers")) return { status: 200, body: { transactionId: "CG-1" } };
    if (req.path.includes("/visits/transactions/")) return this.txStatus;
    return this.visitReply;
  }
  calls(path: string) { return this.requests.filter((r) => r.path.endsWith(path)); }
}

let w: World;
const clock = { now: () => Date.now(), sleep: async () => {} };
before(async () => {
  w = await createWorld();
  // The specification needs a service address with every call.
  await w.db.update(schema.clientLocations).set({ address1: "100 Main St", city: "Minneapolis", state: "MN", zip: "55401" }).where(eq(schema.clientLocations.personId, w.a.personId));
});
beforeEach(() => resetHhaxThrottle());

async function completed(day: string, o: { method?: "mobile" | "manual" } = {}) {
  w.set(`${day}T15:00:00Z`);
  const v = await createVisit(w.ctx(w.a), { personId: w.a.personId, staffId: w.a.staffId, serviceAgreementId: w.a.agreementId });
  const extra = o.method === "manual" ? { verificationMethod: "manual" as const, manualReason: "Phone or app problem — battery died", latitude: undefined, longitude: undefined, locationSource: "none" as const } : {};
  await clockIn(w.ctx(w.a), v.id, event(w, extra), dsp(w.a)); w.advance(60);
  return (await clockOut(w.ctx(w.a), v.id, event(w, extra), dsp(w.a))).visit;
}

test("HHAX: OAuth token, caregiver before visit, MN visit shape, receipt then transaction result", async () => {
  const fake = new FakeHhax();
  const adapter = new MinnesotaHhaxAdapter(CONFIG, fake, clock);
  const v = await completed("2026-08-04");
  await processQueue(w.ctx(w.a), adapter);

  const paths = fake.requests.map((r) => `${r.method} ${r.path}`);
  assert.deepEqual(paths, ["POST /identity/connect/token", "POST /api/v1/caregivers", "POST /api/v1/visits"], "token once, caregiver first, then the visit");
  const cg = fake.requests[1].json as { ssn: string; external?: unknown };
  assert.equal(cg.ssn, "999999999", "never a real SSN");
  assert.ok(fake.requests[1].bearer && fake.requests[2].bearer === fake.requests[1].bearer, "the token is reused");

  const body = fake.requests[2].json as { visits: Array<Record<string, unknown>> };
  assert.equal(body.visits.length, 1);
  const hv = body.visits[0] as { evvmsid: string; timezone: string; payerId: string; procedureCode: string; visitStartDateTime: string; evv: { clockIn: { callType: string; callLatitude: number; callDateTime: string; serviceAddress: { zipcode: string } } } };
  assert.equal(hv.evvmsid, `~${v.id}`);
  assert.equal(hv.timezone, "US/Central");
  assert.equal(hv.payerId, "MIWS");
  assert.equal(hv.procedureCode, "H2014");
  assert.match(hv.visitStartDateTime, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "UTC, minutes, no seconds or zone");
  assert.equal(hv.evv.clockIn.callType, "Mobile");
  assert.equal(typeof hv.evv.clockIn.callLatitude, "number");

  let row = (await loadVisit(w.ctx(w.a), v.id))!;
  assert.equal(row.submissionStatus, "submitted", "a 2xx is a receipt, not an acceptance");
  assert.equal(row.externalReferenceId, `~${v.id}`);
  const [sub] = await w.db.select().from(schema.evvSubmissions).where(eq(schema.evvSubmissions.evvVisitId, v.id));
  assert.equal(sub.transactionId, "TX-1");

  fake.txStatus = { status: 200, body: { transactionId: "TX-1", status: "Success", evvmsid: `~${v.id}` } };
  await reconcile(w.ctx(w.a), adapter);
  row = (await loadVisit(w.ctx(w.a), v.id))!;
  assert.equal(row.submissionStatus, "accepted");

  // A second visit for the same caregiver does not resend the unchanged caregiver record.
  fake.requests = [];
  await completed("2026-08-05");
  await processQueue(w.ctx(w.a), adapter);
  assert.equal(fake.calls("/caregivers").length, 0);
  assert.equal(fake.calls("/visits").length, 1);
});

test("HHAX: a 401 gets a fresh token and the call is retried once", async () => {
  const fake = new FakeHhax();
  const adapter = new MinnesotaHhaxAdapter(CONFIG, fake, clock);
  await completed("2026-08-06");
  fake.expireNext = true;
  // Caregiver already synced; the visit call meets the 401.
  await processQueue(w.ctx(w.a), adapter);
  assert.equal(fake.tokens, 2);
  assert.equal(fake.calls("/visits").length, 2);
});

test("HHAX: a manual entry goes as a manual confirmation with DHS edit codes; a correction keeps the call times", async () => {
  const fake = new FakeHhax();
  const adapter = new MinnesotaHhaxAdapter(CONFIG, fake, clock);
  const m = await completed("2026-08-07", { method: "manual" });
  await processQueue(w.ctx(w.a), adapter);
  const hv = (fake.calls("/visits")[0].json as { visits: Array<{ evv?: { clockIn?: unknown }; editVisit?: { reasonCode: string; actionCode: string } }> }).visits[0];
  assert.equal(hv.evv?.clockIn, undefined, "no device call for a manual entry");
  assert.equal(hv.editVisit?.reasonCode, "217", "battery died → attendant unable to use mobile device");
  assert.equal(hv.editVisit?.actionCode, "123");
  void m;

  fake.requests = [];
  const v = await completed("2026-08-08");
  await processQueue(w.ctx(w.a), adapter);
  const original = (fake.calls("/visits")[0].json as { visits: Array<{ evv: { clockOut: { callDateTime: string } } }> }).visits[0].evv.clockOut.callDateTime;
  fake.requests = [];
  await correctVisit(w.ctx(w.a), v.id, { reasonCode: "FORGOT_CLOCK_OUT", dhsReasonCode: "209", explanation: "Stayed until 4:30; supervisor confirmed by phone.", changes: { clockOutAt: "2026-08-08T16:30:00Z" } });
  await processQueue(w.ctx(w.a), adapter);
  const put = fake.requests.find((r) => r.method === "PUT")!;
  assert.equal(put.path, `/api/v1/visits/${encodeURIComponent(`~${v.id}`)}`);
  const pv = put.json as { visitEndDateTime: string; evv: { clockOut: { callDateTime: string } }; editVisit: { reasonCode: string; notes: string } };
  assert.equal(pv.visitEndDateTime, "2026-08-08T16:30");
  assert.equal(pv.evv.clockOut.callDateTime, original, "clock data never changes once sent (101052)");
  assert.equal(pv.editVisit.reasonCode, "209");
  assert.match(pv.editVisit.notes, /supervisor confirmed/);
  const [c] = await w.db.select().from(schema.evvCorrections).where(eq(schema.evvCorrections.evvVisitId, v.id));
  assert.equal(c.dhsReasonCode, "209"); assert.equal(c.dhsActionCode, "123");
});

test("HHAX: Appendix F rejections are normalised; local validation stops a code outside the MIWS table", async () => {
  const fake = new FakeHhax();
  const adapter = new MinnesotaHhaxAdapter(CONFIG, fake, clock);
  fake.visitReply = { status: 400, body: { errors: [{ code: "101010", message: "Member not found" }] } };
  const v = await completed("2026-08-09");
  await processQueue(w.ctx(w.a), adapter);
  const [sub] = await w.db.select().from(schema.evvSubmissions).where(eq(schema.evvSubmissions.evvVisitId, v.id));
  assert.equal(sub.vendorRejectionCode, "101010");
  assert.equal(sub.status, "correction_required");

  assert.equal(inMiwsTable("H2014", ["U3", "UC"]), true, "modifier order does not matter");
  assert.equal(inMiwsTable("H2019", []), false);
  assert.equal(dhsReasonForManualText("Paper timesheet — no phone").reason, "221");
  assert.deepEqual(readTransaction(204, null), { kind: "pending" });
  assert.equal(readTransaction(200, { status: "Failed", errors: [{ code: "101035" }] }).kind, "rejected");
});

test("HHAX: blocked when the provider uses HHAX directly, or in production before the switch is on", async () => {
  const fake = new FakeHhax();
  const { profile } = await getProfile(w.ctx(w.a));
  await writer(w.ctx(w.a)).update(schema.evvProviderProfiles, profile.id, { evvSystem: "hhax_direct" });
  const v = await completed("2026-08-10");
  await processQueue(w.ctx(w.a), new MinnesotaHhaxAdapter(CONFIG, fake, clock));
  assert.equal((await loadVisit(w.ctx(w.a), v.id))!.submissionStatus, "blocked");
  await writer(w.ctx(w.a)).update(schema.evvProviderProfiles, profile.id, { evvSystem: "third_party" });

  const x = await completed("2026-08-11");
  await processQueue(w.ctx(w.a), new MinnesotaHhaxAdapter({ ...CONFIG, environment: "production" }, fake, clock));
  assert.equal((await loadVisit(w.ctx(w.a), x.id))!.submissionStatus, "blocked");
  assert.equal(fake.requests.length, 0, "nothing left the server");
});
