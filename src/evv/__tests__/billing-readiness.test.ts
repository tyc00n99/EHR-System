/**
 * Billing Phase 2: readiness rules, EVV as an input, overlaps, and units counted in date order.
 * Synthetic data only. Pure rules first, then the same rules through the database.
 */
import { createWorld, type World } from "./harness";
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { authorizationSummaries, billableLines, billingSetup, ensureBillingDefaults, runClaims } from "@/billing/claims";
import { MockClearinghouse } from "@/billing/clearinghouse";
import { DEFAULT_PROFILE, payerProfile } from "@/billing/profiles";
import { findOverlaps, readiness, setupReadiness, type ReadinessFacts, type Span } from "@/billing/readiness";
import { RULES } from "@/billing/rules";

/* ---------- pure rules ---------- */

const signed = new Date("2026-09-10T17:00:00Z");
function facts(o: Partial<ReadinessFacts> = {}): ReadinessFacts {
  return {
    date: "2026-09-10", personId: "p1", visitId: "v1", staffId: "s1", renderingId: "1111111111", returnedAt: null,
    units: 8, staffSignedAt: signed, clientSignedAt: signed, manualEntry: false, manualEvidenceAt: null,
    pmi: "12345678", address: { address1: "1 Elm St", city: "Minneapolis", zip: "55401" }, diagnoses: ["F84.0"],
    coverage: { id: "c1", payerId: null, payerName: "MA", waiver: "CADI", memberId: null, priority: "primary", startDate: "2026-01-01", endDate: null, relationshipToSubscriber: "18" },
    payerId: "dhs", serviceCode: "H2014", modifiers: ["UC", "U3"],
    agreement: { status: "active", startDate: "2026-01-01", endDate: "2026-12-31", serviceCode: "H2014", modifiers: ["U3", "UC"], authorizedUnits: 100, archivedAt: null },
    unitsUsed: 0,
    evv: { required: true, recorded: true, compliance: "COMPLIANT", submission: "accepted", openExceptions: 0, evvVisitId: "e1" },
    evvPolicy: { aggregator: "warn", holdNoncompliant: false },
    overlaps: { caregiver: [], service: [] },
    ...o,
  };
}
const ids = (f: ReadinessFacts) => readiness(f).map((c) => `${c.id}:${c.severity}`);

test("a clean note passes every rule", () => {
  assert.deepEqual(readiness(facts()), []);
});

test("every check names a catalogued rule, its source and where to fix it", () => {
  const all = readiness(facts({
    staffSignedAt: null, clientSignedAt: null, returnedAt: signed, manualEntry: true, units: 0, renderingId: " ", pmi: "123", diagnoses: [], address: { address1: null, city: null, zip: null },
    agreement: { ...facts().agreement, status: "expired", startDate: "2026-10-01", serviceCode: "S5135" }, unitsUsed: 100,
    overlaps: { caregiver: [{ visitId: "v2", personName: "Other", at: signed }], service: [{ visitId: "v3", personName: "Same", at: signed }] },
    evv: { required: true, recorded: true, compliance: "NONCOMPLIANT", submission: "rejected", openExceptions: 2, evvVisitId: "e1" },
  }));
  assert.ok(all.length >= 15);
  for (const c of all) {
    assert.ok(c.id in RULES, c.id);
    assert.equal(c.source, RULES[c.id].source, c.id);
    assert.ok(c.fix && c.fixLabel, `${c.id} has a fix link`);
    assert.ok(c.message.length > 0);
  }
});

test("authorization: expired, outside dates, wrong code, exhausted, and earlier unbilled notes", () => {
  assert.deepEqual(ids(facts({ agreement: { ...facts().agreement, status: "expired" } })), ["authorization_status:block"]);
  assert.deepEqual(ids(facts({ agreement: { ...facts().agreement, archivedAt: signed } })), ["authorization_status:block"]);
  assert.deepEqual(ids(facts({ date: "2027-01-02" })), ["authorization_dates:block"]);
  assert.deepEqual(ids(facts({ modifiers: ["UC"] })), ["authorization_code:block"]);
  assert.equal(readiness(facts({ unitsUsed: 100 }))[0].message, "Authorization has no units left");
  assert.equal(readiness(facts({ unitsUsed: 95 }))[0].message, "Authorization has 5 units left; this note needs 8");
  assert.equal(readiness(facts({ unitsUsed: 95, unitsPendingEarlier: 40 }))[0].message, "Authorization has 5 units left after 40 units of earlier notes not billed yet; this note needs 8");
  assert.deepEqual(ids(facts({ unitsUsed: 92 })), [], "exactly enough is enough");
});

test("signatures, returned notes and rendering IDs hold billing", () => {
  assert.deepEqual(ids(facts({ staffSignedAt: null })), ["caregiver_signature:block"]);
  assert.deepEqual(ids(facts({ clientSignedAt: null })), ["client_signature:block"]);
  assert.deepEqual(ids(facts({ returnedAt: signed })), ["note_returned:block"]);
  assert.deepEqual(ids(facts({ renderingId: "" })), ["rendering_id:block"]);
  assert.equal(readiness(facts({ staffSignedAt: null }))[0].fix, "?visit=v1", "the fix opens the note");
});

test("EVV follows the payer profile: warn by default, block or off when the profile says so", () => {
  const none = { required: true, recorded: false, compliance: null, submission: null, openExceptions: 0, evvVisitId: null };
  assert.deepEqual(ids(facts({ evv: none })), ["evv_no_record:warn"]);
  assert.deepEqual(ids(facts({ evv: none, evvPolicy: { aggregator: "block", holdNoncompliant: false } })), ["evv_no_record:block"]);
  assert.deepEqual(ids(facts({ evv: none, evvPolicy: { aggregator: "off", holdNoncompliant: false } })), []);
  assert.deepEqual(ids(facts({ evv: { ...none, required: false } })), [], "a service without EVV needs no record");
  assert.deepEqual(ids(facts({ evv: { ...facts().evv, submission: "rejected" } })), ["evv_rejected:warn"]);
  assert.deepEqual(ids(facts({ evv: { ...facts().evv, submission: "queued" } })), ["evv_not_accepted:warn"]);
  assert.deepEqual(ids(facts({ evv: { ...facts().evv, submission: null } })), ["evv_not_accepted:warn"]);
  assert.match(readiness(facts({ evv: { ...facts().evv, submission: "rejected" } }))[0].fix!, /^\/evv\?tab=queue&visit=e1$/);
});

test("EVV compliance and exceptions: noncompliant holds only when the EVV policy says to", () => {
  const nc = { ...facts().evv, compliance: "NONCOMPLIANT" as const };
  assert.deepEqual(ids(facts({ evv: nc })), ["evv_noncompliant:warn"]);
  assert.deepEqual(ids(facts({ evv: nc, evvPolicy: { aggregator: "warn", holdNoncompliant: true } })), ["evv_noncompliant:block"]);
  assert.deepEqual(ids(facts({ evv: { ...facts().evv, compliance: "PENDING_REVIEW" } })), ["evv_review:warn"]);
  assert.deepEqual(ids(facts({ evv: { ...facts().evv, openExceptions: 1 } })), ["evv_exceptions:warn"]);
});

test("overlaps: a caregiver in two places, the same service twice; shared care and back-to-back are fine", () => {
  const t = (h: number, m = 0) => new Date(Date.UTC(2026, 8, 10, h, m));
  const span = (o: Partial<Span>): Span => ({ visitId: "x", personId: "p1", personName: "Ann", staffId: "s1", serviceCode: "H2014", start: t(15), end: t(17), sharedCare: false, ...o });
  const o = findOverlaps([
    span({ visitId: "a" }),
    span({ visitId: "b", personId: "p2", personName: "Bea", serviceCode: "S5135", start: t(16), end: t(18) }),
    span({ visitId: "c", staffId: "s2", start: t(16, 30), end: t(16, 45) }),
    span({ visitId: "d", personId: "p3", personName: "Cy", serviceCode: "S5135", start: t(17), end: t(19), staffId: "s3" }),
  ]);
  assert.deepEqual(o.get("a")!.caregiver.map((x) => x.visitId), ["b"]);
  assert.deepEqual(o.get("b")!.caregiver.map((x) => x.visitId), ["a"]);
  assert.deepEqual(o.get("a")!.service.map((x) => x.visitId), ["c"], "same client, same code, other caregiver");
  assert.equal(o.get("d"), undefined, "touching end to start is not an overlap");
  const shared = findOverlaps([span({ visitId: "a", sharedCare: true }), span({ visitId: "b", personId: "p2", serviceCode: "S5135", sharedCare: true })]);
  assert.equal(shared.size, 0, "shared care on both visits");
  assert.deepEqual(ids(facts({ overlaps: o.get("a")! })), ["caregiver_overlap:block", "duplicate_service:block"]);
});

test("setup: provider identifiers block; the unknown Waystar payer ID and unverified rules warn", () => {
  const provider = { taxId: "410000001", npi: null, umpi: "A000000001", address1: "1 St", city: "Minneapolis", zip: "55401" };
  const payer = { name: "Minnesota DHS", clearinghousePayerId: null, profileVerified: false };
  assert.deepEqual(setupReadiness({ provider, payer }).map((c) => `${c.id}:${c.severity}`), ["payer_route:warn", "profile_unverified:warn"]);
  assert.deepEqual(setupReadiness({ provider: { ...provider, taxId: null, umpi: null, zip: null }, payer: { ...payer, clearinghousePayerId: "X", profileVerified: true } }).map((c) => c.id), ["provider_tax_id", "provider_id", "provider_address"]);
});

test("payer profiles: v2 is the default and warns on EVV; v1 stays loadable and never read EVV", () => {
  assert.equal(DEFAULT_PROFILE.version, "2026-10-19.2");
  assert.equal(DEFAULT_PROFILE.evvAggregatorRecord, "warn");
  assert.equal(payerProfile("mhcp-ffs", "2026-10-19.1").evvAggregatorRecord, "off");
  assert.equal(DEFAULT_PROFILE.verified, false);
});

/* ---------- through the database ---------- */

let w: World;
const mock = new MockClearinghouse({ submitterId: "EVVORATEST", receiverId: "MOCKCH", receiverName: "WAYSTAR", usage: "T", payerId: "MNDHS", payerName: "MINNESOTA DHS" });
const admin = () => ({ userId: w.a.adminUserId });
const lines = (from = "2026-09-01", to = "2026-09-30") => billableLines(w.db, w.a.orgId, new Date(`${from}T05:00:00Z`), new Date(`${to}T23:59:59Z`));
const line = async (id: string, from?: string, to?: string) => (await lines(from, to)).find((l) => l.visitId === id)!;
const approve = (visitIds: string[]) => runClaims(w.db, { orgId: w.a.orgId, actor: admin(), adapter: mock, visitIds, method: "download", now: new Date("2026-10-15T15:00:00Z") });

async function note(at: string, o: Partial<typeof schema.visits.$inferInsert> = {}) {
  const d = new Date(at);
  const [p] = await w.db.select().from(schema.people).where(eq(schema.people.id, o.personId ?? w.a.personId));
  const [v] = await w.db.insert(schema.visits).values({
    personId: w.a.personId, staffId: w.a.staffId, serviceAgreementId: w.a.agreementId, providerTaxId: "410000001", pmi: p.pmi, serviceCode: "H2014", modifiers: ["UC", "U3"],
    renderingIdType: "npi", renderingId: "1111111111", placeOfService: "12", units: 8, clockInAt: d, clockOutAt: new Date(d.getTime() + 2 * 3600_000), clockInLat: 44.97, clockInLng: -93.26,
    status: "completed", staffSignedAt: d, clientSignedAt: d, createdBy: w.a.adminUserId, updatedBy: w.a.adminUserId, ...o,
  }).returning();
  return v;
}

async function evvFor(v: typeof schema.visits.$inferSelect, o: Partial<typeof schema.evvVisits.$inferInsert> = {}) {
  const [e] = await w.db.insert(schema.evvVisits).values({
    organizationId: w.a.orgId, providerTaxId: "410000001", personId: v.personId, memberId: v.pmi, staffId: v.staffId, serviceCode: v.serviceCode, modifiers: v.modifiers,
    visitId: v.id, evvRequired: true, status: "completed", clockInAt: v.clockInAt, clockOutAt: v.clockOutAt, complianceStatus: "COMPLIANT", submissionStatus: "accepted", ...o,
  }).returning();
  return e;
}

before(async () => {
  w = await createWorld();
  await w.db.update(schema.organizations).set({ address1: "100 Main St", city: "Minneapolis", zip: "55401", phone: "6125550100" }).where(eq(schema.organizations.id, w.a.orgId));
  for (const id of [w.a.personId, w.a.secondPersonId]) {
    await w.db.update(schema.people).set({ address1: "1 Elm St", city: "Minneapolis", zip: "55401" }).where(eq(schema.people.id, id));
    await w.db.insert(schema.clientFundingSources).values({ personId: id, payer: "Medical Assistance", waiver: "CADI", priority: "primary", startDate: "2026-01-01" });
    await w.db.insert(schema.clientDiagnoses).values({ personId: id, icdCode: "F84.0", description: "Autism", isPrimary: true });
  }
  await ensureBillingDefaults(w.db, w.a.orgId, admin());
});

test("the billing screen reads the EVV record: accepted is clean, rejected and missing warn, and both still bill", async () => {
  const ok = await note("2026-09-02T15:00:00Z");
  await evvFor(ok);
  const rejected = await note("2026-09-03T15:00:00Z");
  const e = await evvFor(rejected, { submissionStatus: "rejected" });
  const missing = await note("2026-09-04T15:00:00Z");
  assert.deepEqual((await line(ok.id)).checks, []);
  const r = await line(rejected.id);
  assert.equal(r.state, "ready");
  assert.deepEqual(r.warnings.map((c) => c.id), ["evv_rejected"]);
  assert.equal(r.warnings[0].fix, `/evv?tab=queue&visit=${e.id}`);
  assert.deepEqual((await line(missing.id)).warnings.map((c) => c.id), ["evv_no_record"]);
  const run = await approve([ok.id, rejected.id, missing.id]);
  assert.ok(run.ok && run.lines === 3, "warnings never stop a send");
});

test("an EVV policy that holds noncompliant visits holds the note on screen and at approval", async () => {
  const v = await note("2026-09-05T15:00:00Z");
  await evvFor(v, { complianceStatus: "NONCOMPLIANT" });
  assert.deepEqual((await line(v.id)).warnings.map((c) => c.id), ["evv_noncompliant"]);
  await w.db.update(schema.evvPolicies).set({ billingHoldOnNoncompliant: true }).where(eq(schema.evvPolicies.organizationId, w.a.orgId));
  const l = await line(v.id);
  assert.equal(l.state, "hold");
  assert.deepEqual(l.holds, ["EVV visit is noncompliant"]);
  assert.deepEqual(await approve([v.id]), { ok: false, problems: ["None of the chosen notes are ready to bill."] });
  await w.db.update(schema.evvPolicies).set({ billingHoldOnNoncompliant: false }).where(eq(schema.evvPolicies.organizationId, w.a.orgId));
});

test("overlapping notes hold each other until one is fixed", async () => {
  const a = await note("2026-09-06T15:00:00Z");
  const c = await note("2026-09-06T15:30:00Z", { staffId: w.a.secondStaffId, renderingIdType: "umpi", renderingId: "B000000001" });
  const la = await line(a.id);
  assert.equal(la.state, "hold");
  assert.deepEqual(la.checks.filter((x) => x.severity === "block").map((x) => x.id).sort(), ["duplicate_service"]);
  assert.deepEqual((await line(c.id)).holds.length, 1, "both notes are held");
  assert.deepEqual(await approve([a.id, c.id]), { ok: false, problems: ["None of the chosen notes are ready to bill."] });
  await w.db.update(schema.visits).set({ status: "void" }).where(eq(schema.visits.id, c.id));
  assert.equal((await line(a.id)).state, "ready", "voiding the duplicate clears it");
});

test("a caregiver on two clients at once holds both notes", async () => {
  const [ag2] = await w.db.insert(schema.serviceAgreements).values({ personId: w.a.secondPersonId, agreementNumber: "SA-A-3", serviceCode: "H2014", modifiers: ["UC", "U3"], authorizedUnits: 500, unitRate: "6.85", unitMinutes: 15, startDate: "2026-01-01", endDate: "2026-12-31", authorizingCounty: "Hennepin", status: "active" }).returning();
  const a = await note("2026-09-07T15:00:00Z");
  const b = await note("2026-09-07T16:00:00Z", { personId: w.a.secondPersonId, serviceAgreementId: ag2.id });
  assert.deepEqual((await line(a.id)).holds, [`The caregiver is also on Second A's note at 9/7, 11:00 AM`]);
  assert.match((await line(b.id)).holds[0], /^The caregiver is also on Client A's note at 9\/7, 10:00 AM$/);
  await evvFor(a, { sharedCare: true });
  await evvFor(b, { sharedCare: true });
  assert.equal((await line(a.id)).state, "ready", "shared care on both is allowed");
});

test("units are counted in date order across pay periods, the same on screen and at approval", async () => {
  const [ag] = await w.db.insert(schema.serviceAgreements).values({ personId: w.a.personId, agreementNumber: "SA-A-UNITS", serviceCode: "S5135", modifiers: ["UC"], authorizedUnits: 12, unitRate: "5.95", unitMinutes: 15, startDate: "2026-01-01", endDate: "2026-12-31", authorizingCounty: "Hennepin", status: "active" }).returning();
  const earlier = await note("2026-09-20T15:00:00Z", { serviceAgreementId: ag.id, serviceCode: "S5135", modifiers: ["UC"] });
  const later = await note("2026-10-05T15:00:00Z", { serviceAgreementId: ag.id, serviceCode: "S5135", modifiers: ["UC"] });
  const onScreen = await line(later.id, "2026-10-01", "2026-10-31");
  assert.deepEqual(onScreen.holds, ["Authorization has 4 units left after 8 units of earlier notes not billed yet; this note needs 8"]);
  assert.deepEqual(await approve([later.id]), { ok: false, problems: ["None of the chosen notes are ready to bill."] }, "approval agrees with the screen");

  // A held earlier note consumes nothing: once it is held, the later one fits.
  await w.db.update(schema.visits).set({ clientSignedAt: null }).where(eq(schema.visits.id, earlier.id));
  assert.equal((await line(later.id, "2026-10-01", "2026-10-31")).state, "ready");

  const [summary] = await authorizationSummaries(w.db, w.a.orgId, (await lines("2026-10-01", "2026-10-31")).filter((l) => l.agreementId === ag.id), "2026-10-15");
  assert.equal(summary.authorized, 12);
  assert.equal(summary.readyInView, 8);
  assert.equal(summary.left, 12);
  assert.deepEqual(summary.flags.map((f) => f.message), []);
});

test("authorization summaries flag ending, exhausted and over-drawn authorizations", async () => {
  const [ag] = await w.db.insert(schema.serviceAgreements).values({ personId: w.a.personId, agreementNumber: "SA-A-END", serviceCode: "S5130", modifiers: [], authorizedUnits: 10, unitRate: "5.00", unitMinutes: 15, startDate: "2026-01-01", endDate: "2026-10-31", authorizingCounty: "Hennepin", status: "active" }).returning();
  const v = await note("2026-09-25T15:00:00Z", { serviceAgreementId: ag.id, serviceCode: "S5130", modifiers: [] });
  let [s] = await authorizationSummaries(w.db, w.a.orgId, (await lines()).filter((l) => l.visitId === v.id), "2026-10-15");
  assert.deepEqual(s.flags.map((f) => f.message), ["Ends 2026-10-31", "80% used with the ready notes"]);
  assert.ok((await approve([v.id])).ok);
  [s] = await authorizationSummaries(w.db, w.a.orgId, (await lines()).filter((l) => l.visitId === v.id), "2026-11-02");
  assert.equal(s.billed, 8);
  assert.equal(s.left, 2);
  assert.deepEqual(s.flags.map((f) => [f.tone, f.message]), [["danger", "Ended 2026-10-31"], ["warn", "80% used with the ready notes"]]);
});

test("setup: billing fills provider gaps from Settings and moves the payer to the current profile", async () => {
  await ensureBillingDefaults(w.db, w.a.orgId, admin());
  await w.db.update(schema.payers).set({ profileVersion: "2026-10-19.1" }).where(eq(schema.payers.organizationId, w.a.orgId));
  await w.db.update(schema.billingProviders).set({ zip: null }).where(eq(schema.billingProviders.organizationId, w.a.orgId));
  assert.ok((await billingSetup(w.db, w.a.orgId)).some((c) => c.id === "provider_address"));
  const { provider, defaultPayer } = await ensureBillingDefaults(w.db, w.a.orgId, admin());
  assert.equal(provider.zip, "55401");
  assert.equal(defaultPayer.profileVersion, DEFAULT_PROFILE.version);
  assert.deepEqual((await billingSetup(w.db, w.a.orgId)).map((c) => c.id), ["payer_route", "profile_unverified"]);
  const audit = await w.db.select().from(schema.auditLog).where(eq(schema.auditLog.tableName, "payers"));
  assert.ok(audit.some((r) => r.action === "update"), "the profile move is audited");
});

test("another agency's EVV records and authorizations never reach this agency's readiness", async () => {
  const v = await note("2026-09-28T15:00:00Z");
  await w.db.insert(schema.evvVisits).values({ organizationId: w.b.orgId, providerTaxId: "410000002", personId: v.personId, memberId: v.pmi, staffId: v.staffId, serviceCode: v.serviceCode, modifiers: v.modifiers, visitId: v.id, evvRequired: true, status: "completed", complianceStatus: "COMPLIANT", submissionStatus: "accepted" });
  assert.deepEqual((await line(v.id)).warnings.map((c) => c.id), ["evv_no_record"], "B's EVV record is not A's");
  assert.deepEqual(await billableLines(w.db, w.b.orgId, new Date("2026-09-28T00:00:00Z"), new Date("2026-09-29T00:00:00Z")).then((ls) => ls.find((l) => l.visitId === v.id)?.evv.recorded), true,
    "B reads its own record (the clinical tables are one organisation per database)");
});
