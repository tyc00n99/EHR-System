import { createWorld, dsp, event, type World } from "./harness";
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { and, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { MockAggregatorAdapter, outcomes } from "@/evv/adapters/mock";
import { hhaxConfigFromEnv, MinnesotaHhaxAdapter } from "@/evv/adapters/hhax-minnesota";
import { correctVisit, voidVisit } from "@/evv/corrections";
import { clockIn, clockOut } from "@/evv/ingest";
import { createLiveInRelationship } from "@/evv/live-in";
import { reconcile } from "@/evv/reconciliation";
import { complianceSummary } from "@/evv/reporting";
import { reviewQueue, visitDetail } from "@/evv/review";
import { clockInGroup, clockOutGroup, createSharedCareGroup } from "@/evv/shared-care";
import { processQueue, processSubmission, resubmitVisit } from "@/evv/submission";
import { REASON } from "@/evv/types";
import { createVisit, loadVisit } from "@/evv/visits";

let w: World;
before(async () => { w = await createWorld(); });

async function completed(day: string, o: Partial<Parameters<typeof createVisit>[1]> = {}) {
  w.set(`${day}T15:00:00Z`);
  const v = await createVisit(w.ctx(w.a), { personId: w.a.personId, staffId: w.a.staffId, serviceAgreementId: w.a.agreementId, ...o });
  await clockIn(w.ctx(w.a), v.id, event(w), dsp(w.a)); w.advance(60);
  return (await clockOut(w.ctx(w.a), v.id, event(w), dsp(w.a))).visit;
}
const latestSubmission = async (visitId: string) => (await w.db.select().from(schema.evvSubmissions).where(eq(schema.evvSubmissions.evvVisitId, visitId)).orderBy(schema.evvSubmissions.createdAt)).at(-1)!;

test("11/25. a correction keeps the original, versions the visit, makes it noncompliant and queues a resubmission", async () => {
  const v = await completed("2026-08-03");
  const mock = new MockAggregatorAdapter();
  await processQueue(w.ctx(w.a), mock);
  const before = (await loadVisit(w.ctx(w.a), v.id))!;
  assert.equal(before.submissionStatus, "accepted"); assert.equal(before.version, 3);
  const { visit, correction } = await correctVisit(w.ctx(w.a), v.id, { reasonCode: "FORGOT_CLOCK_OUT", explanation: "Caregiver forgot to clock out; supervisor confirmed the end time by phone.", changes: { clockOutAt: "2026-08-03T16:30:00Z" } });
  assert.equal(visit.version, 4); assert.equal(visit.corrected, true); assert.equal(visit.durationMinutes, 90); assert.equal(visit.units, 6);
  assert.equal(visit.complianceStatus, "NONCOMPLIANT"); assert.ok(visit.complianceReasons.includes(REASON.CORRECTED_VISIT));
  assert.equal(correction.priorVersion, 3); assert.equal(correction.resultingVersion, 4);
  assert.deepEqual(correction.changes.clockOutAt, { from: "2026-08-03T16:00:00.000Z", to: "2026-08-03T16:30:00.000Z" });
  const versions = await w.db.select().from(schema.evvVisitVersions).where(eq(schema.evvVisitVersions.evvVisitId, v.id));
  assert.equal(versions.length, 4); assert.equal((versions.find((x) => x.version === 3)!.snapshot as { clockOutAt: string }).clockOutAt, "2026-08-03T16:00:00.000Z", "the prior snapshot still holds the original value");
  const events = await w.db.select().from(schema.evvEvents).where(eq(schema.evvEvents.evvVisitId, v.id));
  assert.equal(events.length, 2, "no event was altered or added by the correction");
  const sub = await latestSubmission(v.id);
  assert.equal(sub.operation, "update"); assert.equal(sub.status, "queued"); assert.equal(sub.visitVersion, 4); assert.ok(sub.resubmissionOf);
  await processQueue(w.ctx(w.a), mock);
  assert.equal((await latestSubmission(v.id)).status, "accepted"); assert.equal(mock.calls.at(-1)!.operation, "update"); assert.equal(mock.calls.at(-1)!.payload.verification.corrected, true);
});

test("12/13. a documented live-in daily entry is EXEMPT_LIVE_IN; a claimed but undocumented one is NONCOMPLIANT", async () => {
  await createLiveInRelationship(w.ctx(w.a), { personId: w.a.personId, staffId: w.a.staffId, effectiveFrom: "2026-08-01", effectiveTo: "2026-08-31", documentationRef: "staff-doc: live-in attestation 2026-08-01" });
  w.set("2026-08-10T13:00:00Z");
  const v = await createVisit(w.ctx(w.a), { personId: w.a.personId, staffId: w.a.staffId, serviceAgreementId: w.a.agreementId, liveIn: true });
  await clockIn(w.ctx(w.a), v.id, event(w, { verificationMethod: "live_in", deviceCapturedAt: "2026-08-10T06:00:00Z" }), dsp(w.a)); w.advance(60);
  const r = await clockOut(w.ctx(w.a), v.id, event(w, { verificationMethod: "live_in" }), dsp(w.a));
  assert.equal(r.visit.complianceStatus, "EXEMPT_LIVE_IN"); assert.ok(r.visit.liveInRelationshipId); assert.equal(r.visit.submissionStatus, "queued", "exempt visits are still submitted");
  // Same caregiver, a date the relationship does not cover.
  w.set("2026-09-10T13:00:00Z");
  const x = await createVisit(w.ctx(w.a), { personId: w.a.personId, staffId: w.a.staffId, serviceAgreementId: w.a.agreementId, liveIn: true });
  await clockIn(w.ctx(w.a), x.id, event(w, { verificationMethod: "live_in" }), dsp(w.a)); w.advance(60);
  const bad = await clockOut(w.ctx(w.a), x.id, event(w, { verificationMethod: "live_in" }), dsp(w.a));
  assert.equal(bad.visit.complianceStatus, "NONCOMPLIANT"); assert.ok(bad.visit.complianceReasons.includes(REASON.LIVE_IN_NOT_DOCUMENTED)); assert.equal(bad.visit.liveInRelationshipId, null);
});

test("14. shared care: one device event, one visit per client, explicit unit allocation", async () => {
  w.set("2026-08-12T15:00:00Z");
  const [ag1, ag2] = await w.db.insert(schema.serviceAgreements).values([
    { personId: w.a.personId, agreementNumber: "SA-A-SH1", serviceCode: "H2014", modifiers: ["UC", "UN", "U3"], authorizedUnits: 500, unitRate: "4.00", unitMinutes: 15, startDate: "2026-01-01", endDate: "2026-12-31", authorizingCounty: "Hennepin", status: "active" },
    { personId: w.a.secondPersonId, agreementNumber: "SA-A-SH2", serviceCode: "H2014", modifiers: ["UC", "UN", "U3"], authorizedUnits: 500, unitRate: "4.00", unitMinutes: 15, startDate: "2026-01-01", endDate: "2026-12-31", authorizingCounty: "Hennepin", status: "active" },
  ]).returning();
  const { groupId, visits } = await createSharedCareGroup(w.ctx(w.a), dsp(w.a), { members: [{ personId: w.a.personId, serviceAgreementId: ag1.id }, { personId: w.a.secondPersonId, serviceAgreementId: ag2.id }] });
  assert.equal(visits.length, 2); assert.ok(visits.every((v) => v.sharedCare && v.sharedCareGroupId === groupId));
  const src = event(w);
  const ins = await clockInGroup(w.ctx(w.a), groupId, src, dsp(w.a));
  assert.equal(ins.length, 2); assert.notEqual(ins[0].event.eventId, ins[1].event.eventId); assert.equal(ins[0].event.metadata?.sharedCareSourceEventId, src.eventId);
  assert.ok(!ins[1].flags.includes(REASON.OVERLAPPING_VISIT), "siblings in the group are not overlaps");
  const again = await clockInGroup(w.ctx(w.a), groupId, src, dsp(w.a));
  assert.ok(again.every((r) => r.duplicate), "re-syncing the same source event is idempotent per client");
  w.advance(135);
  const outs = await clockOutGroup(w.ctx(w.a), groupId, event(w), dsp(w.a));
  const after = await Promise.all(outs.map((o) => loadVisit(w.ctx(w.a), o.visit.id)));
  assert.deepEqual(after.map((v) => v!.units), [9, 9]); assert.deepEqual(after.map((v) => v!.sharedCareUnitsAllocated).sort(), [4, 5]);
  assert.ok(after.every((v) => v!.complianceStatus === "COMPLIANT"), JSON.stringify(after.map((v) => v!.complianceReasons)));
});

test("22/24. transient aggregator failure retries with backoff, then a successful acknowledgment", async () => {
  const v = await completed("2026-08-04");
  let n = 0;
  const mock = new MockAggregatorAdapter(() => (++n === 1 ? outcomes.transient() : outcomes.accept(["late submission"])));
  const s0 = await latestSubmission(v.id);
  const s1 = await processSubmission(w.ctx(w.a), mock, s0.id, () => 0.5);
  assert.equal(s1.status, "retry_scheduled"); assert.equal(s1.attemptCount, 1); assert.ok(s1.nextAttemptAt!.getTime() > w.now().getTime());
  await processQueue(w.ctx(w.a), mock);
  assert.equal((await latestSubmission(v.id)).status, "retry_scheduled", "not due yet");
  w.advance(5);
  await processQueue(w.ctx(w.a), mock);
  const s2 = await latestSubmission(v.id);
  assert.equal(s2.status, "accepted_with_warning"); assert.equal(s2.attemptCount, 2); assert.ok(s2.externalReferenceId); assert.deepEqual(s2.warnings, ["late submission"]);
  const attempts = await w.db.select().from(schema.evvSubmissionAttempts).where(eq(schema.evvSubmissionAttempts.submissionId, s0.id));
  assert.equal(attempts.length, 2); assert.ok(attempts.every((a) => a.payloadHash && !JSON.stringify(a).includes("12345")), "attempts carry a payload hash, not the payload");
  const visit = (await loadVisit(w.ctx(w.a), v.id))!;
  assert.equal(visit.submissionStatus, "accepted_with_warning"); assert.equal(visit.externalReferenceId, s2.externalReferenceId); assert.equal(visit.resubmissionRequired, false); assert.equal(visit.billingReadiness, "ready");
});

test("23. a permanent validation rejection does not retry, opens an exception, and a reviewer can resubmit", async () => {
  const v = await completed("2026-08-05");
  const mock = new MockAggregatorAdapter((_, attempt) => (attempt === 1 ? outcomes.validation("V42", "Member not found") : outcomes.accept()));
  await processQueue(w.ctx(w.a), mock);
  const s = await latestSubmission(v.id);
  assert.equal(s.status, "correction_required"); assert.equal(s.vendorRejectionCode, "V42"); assert.equal(s.nextAttemptAt, null);
  w.advance(600);
  assert.equal((await processQueue(w.ctx(w.a), mock)).processed, 0, "validation rejections are never retried automatically");
  const visit = (await loadVisit(w.ctx(w.a), v.id))!;
  assert.equal(visit.complianceStatus, "PENDING_REVIEW"); assert.ok(visit.complianceReasons.includes(REASON.AGGREGATOR_REJECTION));
  const ex = await w.db.select().from(schema.evvExceptions).where(and(eq(schema.evvExceptions.evvVisitId, v.id), eq(schema.evvExceptions.type, REASON.AGGREGATOR_REJECTION)));
  assert.equal(ex.length, 1);
  await resubmitVisit(w.ctx(w.a), v.id);
  await processQueue(w.ctx(w.a), mock);
  assert.equal((await latestSubmission(v.id)).status, "accepted");
  assert.equal((await loadVisit(w.ctx(w.a), v.id))!.complianceStatus, "COMPLIANT");
});

test("dead letter: transient failures stop at the policy limit and never look accepted", async () => {
  const v = await completed("2026-08-06");
  const mock = new MockAggregatorAdapter(() => outcomes.transient());
  for (let i = 0; i < 12; i++) { await processQueue(w.ctx(w.a), mock); w.advance(60 * 24); }
  const s = await latestSubmission(v.id);
  assert.equal(s.status, "permanently_failed"); assert.equal(s.attemptCount, 8);
  const ex = await w.db.select().from(schema.evvExceptions).where(and(eq(schema.evvExceptions.evvVisitId, v.id), eq(schema.evvExceptions.type, "SUBMISSION_DEAD_LETTER")));
  assert.equal(ex.length, 1);
});

test("fail closed: the Minnesota HHAX adapter without configuration blocks and cannot produce an acceptance", async () => {
  const v = await completed("2026-08-07");
  const adapter = new MinnesotaHhaxAdapter(hhaxConfigFromEnv({ HHAX_ENVIRONMENT: "production", EVV_SUBMISSION_ENABLED: "1" } as unknown as NodeJS.ProcessEnv));
  const health = await adapter.health();
  assert.equal(health.ok, false); assert.ok(health.problems.some((p) => p.includes("HHAX_BASE_URL")));
  const s = await processSubmission(w.ctx(w.a), adapter, (await latestSubmission(v.id)).id);
  assert.equal(s.status, "blocked"); assert.equal(s.externalReferenceId, null);
  assert.equal((await loadVisit(w.ctx(w.a), v.id))!.submissionStatus, "blocked");
  const full = new MinnesotaHhaxAdapter(hhaxConfigFromEnv({ HHAX_ENVIRONMENT: "sandbox", EVV_SUBMISSION_ENABLED: "1", HHAX_BASE_URL: "https://example.invalid", HHAX_VISIT_PATH: "/x", HHAX_CLIENT_ID: "c", HHAX_PROVIDER_ID: "p", HHAX_CLIENT_SECRET: "s" } as unknown as NodeJS.ProcessEnv), { post: async () => { throw new Error("must not be called"); }, get: async () => { throw new Error("must not be called"); } });
  const out = await full.submit(adapter.transform((await loadVisit(w.ctx(w.a), v.id))!, { clockIn: null, clockOut: null }, { aggregatorProviderId: null, caregiver: { npi: null, umpi: null } }, "create"));
  assert.equal(out.kind, "blocked", "even fully configured, the unmapped schema never transmits");
});

test("reconciliation: pending submissions get acknowledged, and the monthly deadline raises alerts", async () => {
  const v = await completed("2026-08-08");
  const mock = new MockAggregatorAdapter(() => outcomes.pending());
  await processQueue(w.ctx(w.a), mock);
  const pending = await latestSubmission(v.id);
  assert.equal(pending.status, "submitted");
  mock.acknowledgments.set(pending.externalReferenceId ?? "", { kind: "accepted", warnings: [] });
  // Two mock adapters: the second one answers acknowledgments for whatever reference it is asked.
  const acker = new MockAggregatorAdapter(); acker.acknowledgments.set(pending.externalReferenceId ?? "", { kind: "accepted", warnings: [] });
  w.set("2026-09-10T15:00:00Z"); // four days before the September 14 deadline for August visits
  const summary = await reconcile(w.ctx(w.a), acker);
  assert.ok(summary.deadlineWarnings >= 1, JSON.stringify(summary));
  const q = await reviewQueue(w.ctx(w.a), { approachingDeadline: "true", from: "2026-08-01", to: "2026-08-31" });
  assert.ok(q.count >= 1); assert.ok(q.items.every((i) => i.submissionDeadline === "2026-09-14"));
  assert.ok(q.items.some((i) => i.exceptions.some((e) => e.type === "DEADLINE_APPROACHING")));
});

test("30. an EVV visit cannot be deleted: voiding keeps every row and is reversible", async () => {
  const v = await completed("2026-08-09");
  await assert.rejects(voidVisit(w.ctx(w.a), v.id, "x"), /reason/i);
  const voided = await voidVisit(w.ctx(w.a), v.id, "Entered against the wrong client; re-entered as a new visit.");
  assert.equal(voided.status, "voided"); assert.equal(voided.complianceStatus, "PENDING_REVIEW");
  assert.equal((await w.db.select().from(schema.evvEvents).where(eq(schema.evvEvents.evvVisitId, v.id))).length, 2);
  assert.ok((await w.db.select().from(schema.evvVisitVersions).where(eq(schema.evvVisitVersions.evvVisitId, v.id))).length >= 4);
  const detail = await visitDetail(w.ctx(w.a), v.id);
  assert.ok(detail.versions.some((x) => x.cause === "void")); assert.ok(detail.events.every((e) => !("locationEncrypted" in e)), "coordinates are not in the detail payload");
});

test("review queue filters and the compliance summary are estimates labelled as such", async () => {
  const q = await reviewQueue(w.ctx(w.a), { from: "2026-08-01", to: "2026-08-31", complianceStatus: "NONCOMPLIANT" });
  assert.ok(q.items.every((i) => i.complianceStatus === "NONCOMPLIANT"));
  const manual = await reviewQueue(w.ctx(w.a), { manualOrCorrected: "true" });
  assert.ok(manual.items.length >= 1 && manual.items.every((i) => i.manualEntry || i.corrected));
  const s = await complianceSummary(w.ctx(w.a), "2026-08-01", "2026-08-31");
  assert.match(s.label, /not the official DHS determination/);
  assert.ok(s.totals.evvRequired >= 6); assert.ok(s.byCaregiver.length >= 1); assert.ok(s.byBillingId.length >= 1);
  assert.ok(s.topExceptionReasons.some((r) => r.type === REASON.CORRECTED_VISIT));
});
