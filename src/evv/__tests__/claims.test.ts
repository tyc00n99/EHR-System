import { createWorld, type World } from "./harness";
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { billableLines, pollClaimStatus, runClaims, voidBatch } from "@/billing/claims";
import { clearinghouseFromEnv, MockClearinghouse } from "@/billing/clearinghouse";
import { build837P } from "@/billing/x12-837p";

let w: World;
const FROM = new Date("2026-09-01T00:00:00Z");
const TO = new Date("2026-09-30T23:59:59Z");
const mock = new MockClearinghouse({ submitterId: "EVVORATEST", receiverId: "MOCKCH", receiverName: "WAYSTAR", usage: "T", payerId: "MNDHS", payerName: "MINNESOTA DHS" });

async function note(day: string, o: Partial<typeof schema.visits.$inferInsert> = {}) {
  const [p] = await w.db.select().from(schema.people).where(eq(schema.people.id, w.a.personId));
  const [v] = await w.db.insert(schema.visits).values({
    personId: w.a.personId, staffId: w.a.staffId, serviceAgreementId: w.a.agreementId, providerTaxId: "410000001", pmi: p.pmi, serviceCode: "H2014", modifiers: ["UC", "U3"],
    renderingIdType: "npi", renderingId: "1111111111", placeOfService: "12", units: 8, clockInAt: new Date(`${day}T15:00:00Z`), clockOutAt: new Date(`${day}T17:00:00Z`),
    clockInLat: 44.97, clockInLng: -93.26, status: "completed", staffSignedAt: new Date(), clientSignedAt: new Date(), createdBy: w.a.adminUserId, updatedBy: w.a.adminUserId, ...o,
  }).returning();
  return v;
}

before(async () => {
  w = await createWorld();
  await w.db.update(schema.organizations).set({ address1: "100 Main St", city: "Minneapolis", zip: "55401", phone: "6125550100", taxId: "410000001" }).where(eq(schema.organizations.id, w.a.orgId));
  await w.db.update(schema.people).set({ address1: "1 Elm St", city: "Minneapolis", zip: "55401", sexAtBirth: "male" }).where(eq(schema.people.id, w.a.personId));
});

test("a note with no diagnosis on file is held, then ready once one is added", async () => {
  const v = await note("2026-09-08");
  let line = (await billableLines(w.db, FROM, TO)).find((l) => l.visitId === v.id)!;
  assert.equal(line.state, "hold");
  assert.ok(line.holds.includes("No diagnosis on the client's profile"));
  await w.db.insert(schema.clientDiagnoses).values({ personId: w.a.personId, icdCode: "F84.0", description: "Autism", isPrimary: true });
  line = (await billableLines(w.db, FROM, TO)).find((l) => l.visitId === v.id)!;
  assert.equal(line.state, "ready");
  assert.equal(line.amount, 54.8);
});

test("unsigned and unconfirmed manual notes are held", async () => {
  const a = await note("2026-09-09", { clientSignedAt: null });
  const b = await note("2026-09-10", { manualEntry: true, manualEntryReason: "Phone died" });
  const lines = await billableLines(w.db, FROM, TO);
  assert.deepEqual(lines.find((l) => l.visitId === a.id)!.holds, ["Not signed by client"]);
  assert.deepEqual(lines.find((l) => l.visitId === b.id)!.holds, ["Manual entry: evidence not confirmed"]);
});

test("sending builds one 837P claim per client and authorization, and a note is billed once", async () => {
  const c = await note("2026-09-11");
  const ready = (await billableLines(w.db, FROM, TO)).filter((l) => l.state === "ready").map((l) => l.visitId);
  assert.equal(ready.length, 2);
  const r = await runClaims(w.db, { orgId: w.a.orgId, actor: { userId: w.a.adminUserId }, adapter: mock, visitIds: ready, method: "clearinghouse", now: new Date("2026-09-20T15:00:00Z") });
  assert.ok(r.ok, JSON.stringify(r));
  if (!r.ok) return;
  assert.equal(r.claims, 1);
  assert.equal(r.lines, 2);
  const [batch] = await w.db.select().from(schema.claimBatches).where(eq(schema.claimBatches.id, r.batchId));
  const f = batch.fileText;
  assert.match(f, /^ISA\*00\*/);
  assert.match(f, /GS\*HC\*EVVORATEST\*MOCKCH\*/);
  assert.match(f, /NM1\*85\*2\*ORG A~/, "no NPI: billing provider by name");
  assert.match(f, /REF\*G2\*A000000001~/, "UMPI as secondary ID");
  assert.match(f, /NM1\*IL\*1\*A\*CLIENT\*\*\*\*MI\*\d{8}~/);
  assert.match(f, /CLM\*EV[0-9A-F]{18}\*109\.60\*\*\*12:B:1\*Y\*A\*Y\*Y~/);
  assert.match(f, /REF\*G1\*SA-A-1~/);
  assert.match(f, /HI\*ABK:F840~/);
  assert.match(f, /SV1\*HC:H2014:UC:U3\*54\.80\*UN\*8\*\*\*1~/);
  assert.match(f, /DTP\*472\*D8\*20260911~/);
  assert.match(f, /NM1\*82\*1\*GIVERA\*CARE\*\*\*\*XX\*1111111111~/);
  const segs = f.trim().split("~\n");
  const st = segs.findIndex((s) => s.startsWith("ST*"));
  const se = segs.find((s) => s.startsWith("SE*"))!;
  assert.equal(Number(se.split("*")[1]), segs.length - st - 2, "SE counts ST through SE");

  const again = await runClaims(w.db, { orgId: w.a.orgId, actor: { userId: w.a.adminUserId }, adapter: mock, visitIds: [c.id], method: "clearinghouse" });
  assert.equal(again.ok, false, "already on a live claim");
  assert.equal((await billableLines(w.db, FROM, TO)).find((l) => l.visitId === c.id)!.state, "claimed");

  assert.deepEqual(await pollClaimStatus(w.db, { userId: null }, mock), { updated: 1 });
  const [claim] = await w.db.select().from(schema.claims).where(eq(schema.claims.batchId, r.batchId));
  assert.equal(claim.status, "accepted");
});

test("taking a file back voids its claims and the notes are ready again", async () => {
  const ready = (await billableLines(w.db, FROM, TO)).filter((l) => l.state === "claimed").map((l) => l.visitId);
  const [batch] = await w.db.select().from(schema.claimBatches);
  assert.deepEqual(await voidBatch(w.db, { userId: w.a.adminUserId }, batch.id), { ok: true });
  const lines = await billableLines(w.db, FROM, TO);
  for (const id of ready) assert.equal(lines.find((l) => l.visitId === id)!.state, "ready");
  const r = await runClaims(w.db, { orgId: w.a.orgId, actor: { userId: w.a.adminUserId }, adapter: mock, visitIds: ready, method: "download" });
  assert.ok(r.ok, JSON.stringify(r));
  if (!r.ok) return;
  const [b2] = await w.db.select().from(schema.claimBatches).where(eq(schema.claimBatches.id, r.batchId));
  assert.equal(b2.controlNumber, 2);
});

test("Waystar fails closed: nothing is sent or recorded without its configuration", async () => {
  const adapter = clearinghouseFromEnv({ NODE_ENV: "production" } as NodeJS.ProcessEnv);
  assert.equal(adapter.key, "waystar");
  assert.equal(adapter.health().ok, false);
  const v = await note("2026-09-15");
  const before = (await w.db.select().from(schema.claimBatches)).length;
  const r = await runClaims(w.db, { orgId: w.a.orgId, actor: { userId: w.a.adminUserId }, adapter, visitIds: [v.id], method: "clearinghouse" });
  assert.equal(r.ok, false);
  assert.equal((await w.db.select().from(schema.claimBatches)).length, before);
  assert.equal(clearinghouseFromEnv({ NODE_ENV: "development" } as NodeJS.ProcessEnv).key, "mock");
});

test("837P escapes delimiters in names", () => {
  const f = build837P({ name: "A*B~C", taxId: "41-0000001", npi: "1234567893", umpi: null, address1: "1 St", city: "X", state: "MN", zip: "55401", phone: null }, { name: "P", id: "X" }, { senderId: "S", receiverId: "R", receiverName: "W", controlNumber: 7, usage: "T", now: new Date("2026-09-20T15:00:00Z") }, []);
  assert.match(f, /NM1\*85\*2\*A B C\*\*\*\*\*XX\*1234567893~/);
  assert.match(f, /ISA\*.*\*000000007\*0\*T\*:~/);
});
