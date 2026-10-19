import { createWorld, type World } from "./harness";
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import * as schema from "@/db/schema";
import { billableLines, ensureBillingDefaults, pollClaimStatus, prepareCorrection, runClaims, sentClaims, voidBatch } from "@/billing/claims";
import { clearinghouseFromEnv, MockClearinghouse, type ClearinghouseConfig } from "@/billing/clearinghouse";
import { centsToDecimal, lineCents, sumCents, toCents } from "@/billing/money";
import { addAddendum } from "@/billing/notes";
import { coverageFor, resolvePayer } from "@/billing/readiness";
import { build837P, type ClaimInput } from "@/billing/x12-837p";

let w: World;
const FROM = new Date("2026-09-01T00:00:00Z");
const TO = new Date("2026-10-31T23:59:59Z");
const CFG: ClearinghouseConfig = { submitterId: "EVVORATEST", receiverId: "MOCKCH", receiverName: "WAYSTAR", usage: "T", payerId: "MNDHS", payerName: "MINNESOTA DHS" };
const mock = new MockClearinghouse(CFG);
const admin = () => ({ userId: w.a.adminUserId });
const lines = () => billableLines(w.db, w.a.orgId, FROM, TO);
const line = async (id: string) => (await lines()).find((l) => l.visitId === id)!;
const run = (visitIds: string[], o: Partial<Parameters<typeof runClaims>[1]> = {}) =>
  runClaims(w.db, { orgId: w.a.orgId, actor: admin(), adapter: mock, visitIds, method: "clearinghouse", now: new Date("2026-10-01T15:00:00Z"), ...o });

let day = 0;
/** A completed, fully signed note on its own Central date (synthetic data only). */
async function note(o: Partial<typeof schema.visits.$inferInsert> = {}) {
  day += 1;
  const d = new Date(Date.UTC(2026, 8, day, 15));
  const [p] = await w.db.select().from(schema.people).where(eq(schema.people.id, w.a.personId));
  const [v] = await w.db.insert(schema.visits).values({
    personId: w.a.personId, staffId: w.a.staffId, serviceAgreementId: w.a.agreementId, providerTaxId: "410000001", pmi: p.pmi, serviceCode: "H2014", modifiers: ["UC", "U3"],
    renderingIdType: "npi", renderingId: "1111111111", placeOfService: "12", units: 8, clockInAt: d, clockOutAt: new Date(d.getTime() + 2 * 3600_000),
    clockInLat: 44.97, clockInLng: -93.26, status: "completed", staffSignedAt: d, clientSignedAt: d, createdBy: w.a.adminUserId, updatedBy: w.a.adminUserId, ...o,
  }).returning();
  return v;
}

const claimOf = async (batchId: string) => (await w.db.select().from(schema.claims).where(eq(schema.claims.batchId, batchId)))[0];
const unitsFor = (visitId: string) => w.db.select().from(schema.authorizationUnits).where(eq(schema.authorizationUnits.visitId, visitId));

before(async () => {
  w = await createWorld();
  await w.db.update(schema.organizations).set({ address1: "100 Main St", city: "Minneapolis", zip: "55401", phone: "6125550100", taxId: "410000001" }).where(eq(schema.organizations.id, w.a.orgId));
  await w.db.update(schema.people).set({ address1: "1 Elm St", city: "Minneapolis", zip: "55401", sexAtBirth: "male" }).where(eq(schema.people.id, w.a.personId));
});

test("money is integer cents and refuses anything that is not", () => {
  assert.equal(toCents("6.85"), 685);
  assert.equal(toCents("0.1"), 10);
  assert.equal(toCents("12"), 1200);
  assert.equal(toCents("-0.05"), -5);
  assert.equal(lineCents(3, toCents("0.10")), 30, "no 0.30000000000000004");
  assert.equal(sumCents([10, 20]), 30);
  assert.equal(centsToDecimal(5480), "54.80");
  assert.equal(centsToDecimal(5), "0.05");
  assert.equal(centsToDecimal(-105), "-1.05");
  assert.throws(() => toCents("1.234"));
  assert.throws(() => toCents("abc"));
  assert.throws(() => toCents(0.1 + 0.2));
  assert.throws(() => lineCents(1.5, 100));
});

test("waiver coverage, Elderly Waiver included, bills DHS fee-for-service; other payers need a link", () => {
  const base = { id: "c", payerId: null, memberId: null, priority: "primary", startDate: "2026-01-01", endDate: null, relationshipToSubscriber: "18" };
  assert.equal(resolvePayer({ ...base, payerName: "Elderly Waiver", waiver: "EW" }, "dhs"), "dhs");
  assert.equal(resolvePayer({ ...base, payerName: "Minnesota Health Care Programs (MA)", waiver: null }, "dhs"), "dhs");
  assert.equal(resolvePayer({ ...base, payerName: "Some Health Plan", waiver: null }, "dhs"), null);
  assert.equal(resolvePayer({ ...base, payerName: "Some Health Plan", waiver: null, payerId: "plan" }, "dhs"), "plan");
  assert.equal(coverageFor("2025-12-31", [{ ...base, payerName: "MA", waiver: "CADI" }]), null, "not yet in force");
});

test("a note is held until the client has coverage and a diagnosis, then priced in cents", async () => {
  const v = await note();
  let l = await line(v.id);
  assert.equal(l.state, "hold");
  assert.ok(l.holds.includes("No diagnosis on the client's profile"));
  assert.ok(l.holds.some((h) => h.startsWith("No coverage in force")));
  assert.equal(l.checks.find((c) => c.id === "coverage")?.source, "coverage");
  await w.db.insert(schema.clientDiagnoses).values({ personId: w.a.personId, icdCode: "F84.0", description: "Autism", isPrimary: true });
  await w.db.insert(schema.clientFundingSources).values({ personId: w.a.personId, payer: "Elderly Waiver", waiver: "EW", memberId: null, startDate: "2026-01-01" });
  await ensureBillingDefaults(w.db, w.a.orgId);
  l = await line(v.id);
  assert.deepEqual(l.holds, []);
  assert.equal(l.state, "ready");
  assert.equal(l.rateCents, 685);
  assert.equal(l.amountCents, 5480);
  assert.ok(l.payerId);
});

test("missing signatures and unconfirmed manual entries block billing", async () => {
  const a = await note({ clientSignedAt: null });
  const b = await note({ manualEntry: true, manualEntryReason: "Phone died" });
  const c = await note({ staffSignedAt: null });
  assert.deepEqual((await line(a.id)).holds, ["Not signed by client"]);
  assert.deepEqual((await line(b.id)).holds, ["Manual entry: evidence not confirmed"]);
  assert.deepEqual((await line(c.id)).holds, ["Caregiver has not signed"]);
  await w.db.update(schema.visits).set({ clientSignedAt: null, clientUnsignedReason: "Asleep" }).where(eq(schema.visits.id, c.id));
  assert.ok((await line(c.id)).holds.includes("Not signed by client"), "an unable-to-sign reason still blocks");
});

let firstBatch = "";
let firstVisits: string[] = [];
test("approval builds one claim per client and authorization, freezes a version, locks the notes and reserves units", async () => {
  const ready = (await lines()).filter((l) => l.state === "ready").map((l) => l.visitId);
  assert.equal(ready.length, 1);
  const extra = await note();
  firstVisits = [...ready, extra.id];
  const r = await run(firstVisits);
  assert.ok(r.ok, JSON.stringify(r));
  if (!r.ok) return;
  firstBatch = r.batchId;
  assert.equal(r.claims, 1);
  assert.equal(r.lines, 2);
  assert.equal(r.totalCents, 10960);
  const [batch] = await w.db.select().from(schema.claimBatches).where(eq(schema.claimBatches.id, r.batchId));
  const f = batch.fileText;
  assert.match(f, /GS\*HC\*EVVORATEST\*MOCKCH\*/);
  assert.match(f, /NM1\*85\*2\*ORG A~/, "no NPI: billing provider by name");
  assert.match(f, /REF\*G2\*A000000001~/, "UMPI as secondary ID");
  assert.match(f, /SBR\*P\*18\*{7}MC~/);
  assert.match(f, /CLM\*EV[0-9A-F]{18}\*109\.60\*\*\*12:B:1\*Y\*A\*Y\*Y~/);
  assert.match(f, /SV1\*HC:H2014:UC:U3\*54\.80\*UN\*8\*\*\*1~/);
  assert.match(f, /HI\*ABK:F840~/);
  const segs = f.trim().split("~\n");
  const st = segs.findIndex((s) => s.startsWith("ST*"));
  assert.equal(Number(segs.find((s) => s.startsWith("SE*"))!.split("*")[1]), segs.length - st - 2, "SE counts ST through SE");

  const claim = await claimOf(r.batchId);
  const [version] = await w.db.select().from(schema.claimVersions).where(eq(schema.claimVersions.claimId, claim.id));
  assert.equal(claim.currentVersionId, version.id);
  assert.equal(version.frequencyCode, "1");
  assert.equal(version.totalCents, 10960);
  assert.equal(version.profileKey, "mhcp-ffs");
  const snap = version.snapshot as { notes: { visitId: string; hash: string }[]; agreement: { rateCents: number }; profile: { verified: boolean } };
  assert.equal(snap.notes.length, 2);
  assert.equal(snap.agreement.rateCents, 685);
  assert.equal(snap.profile.verified, false, "the MHCP mapping is not verified against a companion guide");
  for (const id of firstVisits) {
    const [v] = await w.db.select().from(schema.visits).where(eq(schema.visits.id, id));
    assert.ok(v.lockedAt, "note locked");
    const [nv] = await w.db.select().from(schema.noteVersions).where(eq(schema.noteVersions.visitId, id));
    assert.equal(snap.notes.find((n) => n.visitId === id)!.hash, nv.hash);
    assert.deepEqual((await unitsFor(id)).map((u) => u.state), ["billed"]);
  }
  const again = await run([firstVisits[0]]);
  assert.equal(again.ok, false, "a note is billed once");
  assert.equal((await line(firstVisits[0])).state, "claimed");
});

test("a submitted claim never changes when rates, names or notes change afterwards", async () => {
  const claim = await claimOf(firstBatch);
  const [before] = await w.db.select().from(schema.claimVersions).where(eq(schema.claimVersions.claimId, claim.id));
  const [batchBefore] = await w.db.select().from(schema.claimBatches).where(eq(schema.claimBatches.id, firstBatch));
  await w.db.update(schema.serviceAgreements).set({ unitRate: "9.99" }).where(eq(schema.serviceAgreements.id, w.a.agreementId));
  await w.db.update(schema.people).set({ lastName: "Renamed" }).where(eq(schema.people.id, w.a.personId));
  await assert.rejects(w.db.update(schema.visits).set({ shiftNote: "rewritten" }).where(eq(schema.visits.id, firstVisits[0])), "a locked note cannot be overwritten");
  await assert.rejects(w.db.delete(schema.visits).where(eq(schema.visits.id, firstVisits[0])));
  await assert.rejects(w.db.update(schema.claimVersions).set({ totalCents: 1 }).where(eq(schema.claimVersions.id, before.id)), "claim versions are insert-only");
  await assert.rejects(w.db.update(schema.noteVersions).set({ hash: "x" }).where(eq(schema.noteVersions.visitId, firstVisits[0])), "note versions are insert-only");
  const [after] = await w.db.select().from(schema.claimVersions).where(eq(schema.claimVersions.id, before.id));
  const [batchAfter] = await w.db.select().from(schema.claimBatches).where(eq(schema.claimBatches.id, firstBatch));
  assert.equal(after.snapshotHash, before.snapshotHash);
  assert.deepEqual(after.snapshot, before.snapshot);
  assert.equal(batchAfter.fileText, batchBefore.fileText);
  await w.db.update(schema.serviceAgreements).set({ unitRate: "6.85" }).where(eq(schema.serviceAgreements.id, w.a.agreementId));
  await w.db.update(schema.people).set({ lastName: "A" }).where(eq(schema.people.id, w.a.personId));
});

test("changes to a locked note are addenda beside the original", async () => {
  const r = await addAddendum(w.db, admin(), firstVisits[0], "Client also walked to the mailbox; omitted from the original note.");
  assert.ok(r.ok);
  const rows = await w.db.select().from(schema.noteAddenda).where(eq(schema.noteAddenda.visitId, firstVisits[0]));
  assert.equal(rows.length, 1);
  const [v] = await w.db.select().from(schema.visits).where(eq(schema.visits.id, firstVisits[0]));
  assert.equal(v.shiftNote, null, "the original is untouched");
  assert.equal((await addAddendum(w.db, admin(), firstVisits[0], " ")).ok, false);
});

test("the mock reports nothing back on its own; staged synthetic responses move the claim", async () => {
  const claim = await claimOf(firstBatch);
  assert.deepEqual(await pollClaimStatus(w.db, w.a.orgId, { userId: null }, mock), { updated: 0 });
  assert.equal((await claimOf(firstBatch)).status, "sent");
  mock.stage({ patientControlNumber: claim.patientControlNumber, status: "accepted", payerClaimNumber: "ICN-SYNTH-1" });
  assert.deepEqual(await pollClaimStatus(w.db, w.b.orgId, { userId: null }, mock), { updated: 0 }, "another agency's poll never matches this claim");
  assert.deepEqual(await pollClaimStatus(w.db, w.a.orgId, { userId: null }, mock), { updated: 1 });
  const c = await claimOf(firstBatch);
  assert.equal(c.status, "accepted");
  assert.equal(c.payerClaimNumber, "ICN-SYNTH-1");
});

test("a replacement or void claim is a new version linked to the original and its payer claim number", async () => {
  const claim = await claimOf(firstBatch);
  const r = await prepareCorrection(w.db, { orgId: w.a.orgId, actor: admin(), claimId: claim.id, kind: "replace" });
  assert.ok(r.ok, JSON.stringify(r));
  if (!r.ok) return;
  const [v2] = await w.db.select().from(schema.claimVersions).where(eq(schema.claimVersions.id, r.versionId));
  assert.equal(v2.versionNo, 2);
  assert.equal(v2.frequencyCode, "7");
  assert.equal(v2.replacesVersionId, claim.currentVersionId);
  const snap = v2.snapshot as { provider: Parameters<typeof build837P>[0]; claim: ClaimInput };
  const f = build837P(snap.provider, { name: "MINNESOTA DHS", id: "MNDHS" }, { senderId: "S", receiverId: "R", receiverName: "W", controlNumber: 9, usage: "T", now: new Date("2026-10-02T15:00:00Z") }, [snap.claim]);
  assert.match(f, /CLM\*EV[0-9A-F]{18}\*109\.60\*\*\*12:B:7\*/);
  assert.match(f, /REF\*G1\*SA-A-1~\nREF\*F8\*ICN-SYNTH-1~/);
  assert.equal((await prepareCorrection(w.db, { orgId: w.b.orgId, actor: { userId: w.b.adminUserId }, claimId: claim.id, kind: "void" })).ok, false, "another agency cannot touch it");
});

test("taking a file back voids its claims, releases units and unlocks notes; it never crosses agencies", async () => {
  const v = await note();
  const r = await run([v.id], { method: "download" });
  assert.ok(r.ok, JSON.stringify(r));
  if (!r.ok) return;
  assert.equal((await voidBatch(w.db, w.b.orgId, { userId: w.b.adminUserId }, r.batchId)).ok, false, "agency B cannot see A's file");
  assert.deepEqual(await sentClaims(w.db, w.b.orgId, "2026-09-01", "2026-10-31"), []);
  assert.ok((await sentClaims(w.db, w.a.orgId, "2026-09-01", "2026-10-31")).length >= 2);
  assert.deepEqual(await voidBatch(w.db, w.a.orgId, admin(), r.batchId), { ok: true });
  assert.equal((await claimOf(r.batchId)).status, "void");
  assert.deepEqual((await unitsFor(v.id)).map((u) => u.state), ["released"]);
  const [after] = await w.db.select().from(schema.visits).where(eq(schema.visits.id, v.id));
  assert.equal(after.lockedAt, null);
  assert.equal((await line(v.id)).state, "ready");
  const again = await run([v.id], { method: "download" });
  assert.ok(again.ok);
  if (!again.ok) return;
  const [b] = await w.db.select().from(schema.claimBatches).where(eq(schema.claimBatches.id, again.batchId));
  assert.equal(b.controlNumber, 3, "control numbers are never reused");
  await voidBatch(w.db, w.a.orgId, admin(), again.batchId);
});

test("a send that fails after approval is undone and kept as a record", async () => {
  const failing = new MockClearinghouse(CFG);
  failing.submit = async () => ({ status: "failed", message: "Connection reset (synthetic)" });
  const v = await note();
  const r = await run([v.id], { adapter: failing });
  assert.deepEqual(r, { ok: false, problems: ["Connection reset (synthetic)"] });
  const [claimLine] = await w.db.select().from(schema.claimLines).where(eq(schema.claimLines.visitId, v.id));
  const [c] = await w.db.select().from(schema.claims).where(eq(schema.claims.id, claimLine.claimId));
  assert.equal(c.status, "void");
  const [batch] = await w.db.select().from(schema.claimBatches).where(eq(schema.claimBatches.id, c.batchId));
  assert.ok(batch.voidedAt);
  assert.match(batch.message ?? "", /Not delivered/);
  assert.deepEqual((await unitsFor(v.id)).map((u) => u.state), ["released"]);
  assert.equal((await line(v.id)).state, "ready");
});

test("authorizations: dates, code and remaining units are enforced, cumulatively", async () => {
  const outside = await note({ clockInAt: new Date("2027-01-05T15:00:00Z"), clockOutAt: new Date("2027-01-05T17:00:00Z") });
  const lines27 = await billableLines(w.db, w.a.orgId, new Date("2027-01-01"), new Date("2027-01-31"));
  assert.ok(lines27.find((l) => l.visitId === outside.id)!.holds.some((h) => h.startsWith("Date of service is outside the authorization")));

  // Bill whatever earlier tests left ready, so only the two notes below compete for what is left.
  const pending = (await lines()).filter((l) => l.state === "ready").map((l) => l.visitId);
  if (pending.length) assert.ok((await run(pending, { method: "download" })).ok);
  const used = (await w.db.select().from(schema.authorizationUnits).where(and(eq(schema.authorizationUnits.serviceAgreementId, w.a.agreementId), inArray(schema.authorizationUnits.state, ["reserved", "billed"])))).reduce((n, u) => n + u.units, 0);
  await w.db.update(schema.serviceAgreements).set({ authorizedUnits: used + 10 }).where(eq(schema.serviceAgreements.id, w.a.agreementId));
  const a = await note();
  const b = await note();
  assert.equal((await line(a.id)).state, "ready");
  assert.deepEqual((await line(b.id)).holds, ["Authorization has 2 units left; this note needs 8"]);
  const r = await run([a.id, b.id], { method: "download" });
  assert.ok(r.ok && r.lines === 1, "only the note that fits is billed");
  assert.deepEqual((await line(b.id)).holds, ["Authorization has 2 units left; this note needs 8"]);

  await w.db.update(schema.serviceAgreements).set({ status: "expired" }).where(eq(schema.serviceAgreements.id, w.a.agreementId));
  assert.ok((await line(b.id)).holds.includes("Authorization is expired"));
  await w.db.update(schema.serviceAgreements).set({ status: "active", authorizedUnits: 1000 }).where(eq(schema.serviceAgreements.id, w.a.agreementId));
});

test("two simultaneous approvals of the same note bill it once", async () => {
  const v = await note();
  const [x, y] = await Promise.all([run([v.id], { method: "download" }), run([v.id], { method: "download" })]);
  assert.equal([x, y].filter((r) => r.ok).length, 1, JSON.stringify([x, y]));
  assert.equal((await w.db.select().from(schema.claimLines).where(eq(schema.claimLines.visitId, v.id))).length, 1);
  assert.equal((await unitsFor(v.id)).filter((u) => u.state !== "released").length, 1);
});

test("Waystar fails closed: nothing is approved, locked or recorded without its configuration", async () => {
  const adapter = clearinghouseFromEnv({ NODE_ENV: "production" } as NodeJS.ProcessEnv);
  assert.equal(adapter.key, "waystar");
  assert.equal(adapter.health().ok, false);
  const v = await note();
  const before = (await w.db.select().from(schema.claimBatches)).length;
  const r = await run([v.id], { adapter });
  assert.equal(r.ok, false);
  assert.equal((await w.db.select().from(schema.claimBatches)).length, before);
  const [after] = await w.db.select().from(schema.visits).where(eq(schema.visits.id, v.id));
  assert.equal(after.lockedAt, null);
  assert.equal(clearinghouseFromEnv({ NODE_ENV: "development" } as NodeJS.ProcessEnv).key, "mock");
});

test("837P escapes delimiters and writes amounts from cents", () => {
  const f = build837P({ name: "A*B~C", taxId: "41-0000001", npi: "1234567893", umpi: null, address1: "1 St", city: "X", state: "MN", zip: "55401", phone: null }, { name: "P", id: "X" }, { senderId: "S", receiverId: "R", receiverName: "W", controlNumber: 7, usage: "T", now: new Date("2026-09-20T15:00:00Z") }, []);
  assert.match(f, /NM1\*85\*2\*A B C\*\*\*\*\*XX\*1234567893~/);
  assert.match(f, /ISA\*.*\*000000007\*0\*T\*:~/);
});
