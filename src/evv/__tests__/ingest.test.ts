import { admin, createWorld, dsp, event, HOME, newId, type World } from "./harness";
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { and, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { eventIntegrityHash, verifyChain } from "@/evv/audit";
import { clockIn, clockOut } from "@/evv/ingest";
import { REASON } from "@/evv/types";
import { createVisit, EvvError } from "@/evv/visits";

let w: World;
before(async () => { w = await createWorld(); });

const planned = (o: Partial<Parameters<typeof createVisit>[1]> = {}) => createVisit(w.ctx(w.a), { personId: w.a.personId, staffId: w.a.staffId, serviceAgreementId: w.a.agreementId, ...o });

test("1. valid home clock-in and clock-out: COMPLIANT, units from duration, submission queued", async () => {
  w.set("2026-09-14T15:00:00Z");
  const v = await planned();
  const cin = await clockIn(w.ctx(w.a, w.a.staffUserId), v.id, event(w), dsp(w.a));
  assert.equal(cin.visit.status, "in_progress"); assert.equal(cin.visit.complianceStatus, "INCOMPLETE"); assert.equal(cin.visit.serviceDate, "2026-09-14");
  w.advance(125);
  const cout = await clockOut(w.ctx(w.a, w.a.staffUserId), v.id, event(w), dsp(w.a));
  assert.equal(cout.visit.status, "completed"); assert.equal(cout.visit.durationMinutes, 125); assert.equal(cout.visit.units, 8);
  assert.equal(cout.visit.complianceStatus, "COMPLIANT"); assert.deepEqual(cout.visit.complianceReasons, []);
  assert.equal(cout.visit.submissionStatus, "queued"); assert.equal(cout.visit.billingReadiness, "ready_with_warnings", "not accepted by the aggregator yet");
  const chain = await verifyChain(w.ctx(w.a), v.id); assert.ok(chain.ok && chain.rows >= 4);
});

test("2. community visit away from home is COMPLIANT", async () => {
  w.set("2026-09-15T15:00:00Z");
  const v = await planned();
  const far = { latitude: HOME.lat + 0.05, longitude: HOME.lng, locationType: "community" as const };
  await clockIn(w.ctx(w.a), v.id, event(w, far), dsp(w.a)); w.advance(60);
  const r = await clockOut(w.ctx(w.a), v.id, event(w, far), dsp(w.a));
  assert.equal(r.visit.complianceStatus, "COMPLIANT"); assert.equal(r.event.locationState, "community");
});

test("8/9. outside the geofence: NONCOMPLIANT at home, COMPLIANT with a community designation", async () => {
  w.set("2026-09-16T15:00:00Z");
  const v = await planned();
  await clockIn(w.ctx(w.a), v.id, event(w, { latitude: HOME.lat + 0.05 }), dsp(w.a)); w.advance(60);
  const r = await clockOut(w.ctx(w.a), v.id, event(w, { latitude: HOME.lat + 0.05 }), dsp(w.a));
  assert.equal(r.visit.complianceStatus, "NONCOMPLIANT"); assert.ok(r.visit.complianceReasons.includes(REASON.OUTSIDE_GEOFENCE));
  const ex = await w.db.select().from(schema.evvExceptions).where(and(eq(schema.evvExceptions.evvVisitId, v.id), eq(schema.evvExceptions.type, REASON.OUTSIDE_GEOFENCE)));
  assert.equal(ex.length, 1, "one open exception, not one per event");
  assert.equal(r.visit.submissionStatus, "queued", "noncompliant visits are still submitted");
});

test("3/4. offline synchronisation keeps the device time, marks the delay, and a duplicate sync is a no-op", async () => {
  w.set("2026-09-17T15:00:00Z");
  const v = await planned();
  const captured = "2026-09-17T12:00:00Z"; // three hours before the server sees it
  const e = event(w, { deviceCapturedAt: captured, offline: true });
  const first = await clockIn(w.ctx(w.a), v.id, e, dsp(w.a));
  const iso = new Date(captured).toISOString();
  assert.equal(first.duplicate, false); assert.equal(first.event.deviceCapturedAt?.toISOString(), iso); assert.equal(first.event.effectiveAt?.toISOString(), iso);
  assert.equal(first.event.serverReceivedAt.toISOString(), "2026-09-17T15:00:00.000Z"); assert.equal(first.event.delayed, true); assert.equal(first.visit.clockInAt?.toISOString(), iso);
  const again = await clockIn(w.ctx(w.a), v.id, e, dsp(w.a));
  assert.equal(again.duplicate, true); assert.equal(again.event.id, first.event.id);
  const sameKey = await clockIn(w.ctx(w.a), v.id, { ...e, eventId: newId() }, dsp(w.a));
  assert.equal(sameKey.duplicate, true, "same idempotency key, different event id: still the original");
  const rows = await w.db.select().from(schema.evvEvents).where(eq(schema.evvEvents.evvVisitId, v.id));
  assert.equal(rows.length, 1);
  w.advance(30);
  const out = await clockOut(w.ctx(w.a), v.id, event(w, { deviceCapturedAt: "2026-09-17T13:30:00Z", offline: true }), dsp(w.a));
  assert.equal(out.visit.durationMinutes, 90); assert.equal(out.visit.complianceStatus, "NONCOMPLIANT"); assert.ok(out.visit.complianceReasons.includes(REASON.NOT_VERIFIED_REAL_TIME));
});

test("5. clock-out arriving before a delayed clock-in waits, then reconciles", async () => {
  w.set("2026-09-18T18:00:00Z");
  const v = await planned();
  const out = await clockOut(w.ctx(w.a), v.id, event(w, { deviceCapturedAt: "2026-09-18T17:00:00Z", offline: true }), dsp(w.a));
  assert.equal(out.visit.status, "awaiting_clock_in"); assert.ok(out.flags.includes(REASON.OUT_OF_ORDER_EVENTS));
  const inn = await clockIn(w.ctx(w.a), v.id, event(w, { deviceCapturedAt: "2026-09-18T15:00:00Z", offline: true }), dsp(w.a));
  assert.equal(inn.visit.status, "completed"); assert.equal(inn.visit.durationMinutes, 120); assert.equal(inn.visit.units, 8);
  // Ambiguous order: the clock-in claims to be *after* the clock-out.
  const v2 = await planned();
  await clockOut(w.ctx(w.a), v2.id, event(w, { deviceCapturedAt: "2026-09-18T16:00:00Z", offline: true }), dsp(w.a));
  const bad = await clockIn(w.ctx(w.a), v2.id, event(w, { deviceCapturedAt: "2026-09-18T17:00:00Z", offline: true }), dsp(w.a));
  assert.equal(bad.visit.status, "in_progress"); assert.equal(bad.visit.clockOutAt, null, "the visit cannot end before it starts; the events remain for review");
  const ex = await w.db.select().from(schema.evvExceptions).where(and(eq(schema.evvExceptions.evvVisitId, v2.id), eq(schema.evvExceptions.type, REASON.OUT_OF_ORDER_EVENTS), eq(schema.evvExceptions.status, "open")));
  assert.equal(ex.length, 1);
});

test("6/7. missing GPS permission and poor accuracy are recorded, classified and not rejected", async () => {
  w.set("2026-09-19T15:00:00Z");
  const v = await planned();
  const a = await clockIn(w.ctx(w.a), v.id, event(w, { latitude: undefined, longitude: undefined, accuracyMeters: undefined, locationPermissionDenied: true, locationSource: "none" }), dsp(w.a));
  assert.equal(a.event.locationState, "permission_denied"); assert.equal(a.event.locationEncrypted, null);
  w.advance(45);
  const b = await clockOut(w.ctx(w.a), v.id, event(w, { accuracyMeters: 850 }), dsp(w.a));
  assert.equal(b.event.locationState, "accuracy_insufficient");
  assert.equal(b.visit.complianceStatus, "NONCOMPLIANT");
  assert.ok(b.visit.complianceReasons.includes(REASON.LOCATION_PERMISSION_DENIED) && b.visit.complianceReasons.includes(REASON.LOCATION_ACCURACY_INSUFFICIENT) && b.visit.complianceReasons.includes(REASON.MISSING_START_LOCATION));
});

test("10. a manual visit is stored and NONCOMPLIANT with MANUAL_ENTRY; a manual event without a reason is refused", async () => {
  w.set("2026-09-20T15:00:00Z");
  const v = await planned();
  await assert.rejects(clockIn(w.ctx(w.a), v.id, event(w, { verificationMethod: "manual" }), admin(w.a)), /manual/i);
  await clockIn(w.ctx(w.a), v.id, event(w, { verificationMethod: "manual", manualReason: "Phone died", latitude: undefined, longitude: undefined }), admin(w.a)); w.advance(60);
  const r = await clockOut(w.ctx(w.a), v.id, event(w, { verificationMethod: "manual", manualReason: "Phone died", latitude: undefined, longitude: undefined }), admin(w.a));
  assert.equal(r.visit.manualEntry, true); assert.equal(r.visit.complianceStatus, "NONCOMPLIANT"); assert.ok(r.visit.complianceReasons.includes(REASON.MANUAL_ENTRY));
  assert.equal(r.visit.submissionStatus, "queued");
});

test("15/16. overlapping visits raise an exception; duplicate visits go to PENDING_REVIEW", async () => {
  w.set("2026-09-21T15:00:00Z");
  const v1 = await planned(); const v2 = await planned({ personId: w.a.secondPersonId, serviceAgreementId: null, serviceCode: "H2014", modifiers: ["UC", "U3"] });
  await clockIn(w.ctx(w.a), v1.id, event(w), dsp(w.a)); w.advance(10);
  const second = await clockIn(w.ctx(w.a), v2.id, event(w), dsp(w.a));
  assert.ok(second.flags.includes(REASON.OVERLAPPING_VISIT));
  w.advance(50);
  const r1 = await clockOut(w.ctx(w.a), v1.id, event(w), dsp(w.a));
  assert.ok(r1.visit.complianceReasons.includes(REASON.OVERLAPPING_VISIT));
  await clockOut(w.ctx(w.a), v2.id, event(w), dsp(w.a));
  // Duplicate: same client, same caregiver, same clock-in minute.
  w.set("2026-09-21T20:00:00Z");
  const d1 = await planned(); const d2 = await planned();
  await clockIn(w.ctx(w.a), d1.id, event(w), dsp(w.a)); await clockIn(w.ctx(w.a), d2.id, event(w), dsp(w.a)); w.advance(30);
  await clockOut(w.ctx(w.a), d1.id, event(w), dsp(w.a));
  const r2 = await clockOut(w.ctx(w.a), d2.id, event(w), dsp(w.a));
  assert.equal(r2.visit.complianceStatus, "PENDING_REVIEW"); assert.ok(r2.visit.complianceReasons.includes(REASON.DUPLICATE_VISIT));
});

test("17/18. a service that does not require EVV is recorded but never queued; an EVV service is", async () => {
  w.set("2026-09-22T15:00:00Z");
  const no = await planned({ personId: w.a.personId, staffId: w.a.staffId, serviceAgreementId: w.a.nonEvvAgreementId });
  assert.equal(no.evvRequired, false); assert.equal(no.serviceRuleId, null);
  await clockIn(w.ctx(w.a), no.id, event(w), dsp(w.a)); w.advance(30);
  const r = await clockOut(w.ctx(w.a), no.id, event(w), dsp(w.a));
  assert.equal(r.visit.complianceStatus, "COMPLIANT"); assert.deepEqual(r.visit.complianceReasons, [REASON.EVV_NOT_REQUIRED]); assert.equal(r.visit.submissionStatus, null);
  const yes = await planned(); assert.equal(yes.evvRequired, true); assert.ok(yes.serviceRuleId);
});

test("19/20. expired authorization and units beyond the authorization are separate billing facts", async () => {
  w.set("2026-09-23T15:00:00Z");
  const [old] = await w.db.insert(schema.serviceAgreements).values({ personId: w.a.personId, agreementNumber: "SA-A-OLD", serviceCode: "H2014", modifiers: ["UC", "U3"], authorizedUnits: 4, unitRate: "6.85", unitMinutes: 15, startDate: "2025-01-01", endDate: "2025-12-31", authorizingCounty: "Hennepin", status: "expired" }).returning();
  const v = await planned({ personId: w.a.personId, staffId: w.a.staffId, serviceAgreementId: old.id });
  const cin = await clockIn(w.ctx(w.a), v.id, event(w), dsp(w.a)); assert.ok(cin.flags.includes(REASON.AUTHORIZATION_EXPIRED));
  w.advance(120);
  const r = await clockOut(w.ctx(w.a), v.id, event(w), dsp(w.a));
  assert.equal(r.visit.complianceStatus, "COMPLIANT", `capture was electronic and live: ${r.visit.complianceReasons.join(",")}`);
  assert.ok(r.visit.complianceReasons.includes(REASON.AUTHORIZATION_EXPIRED)); assert.ok(r.visit.complianceReasons.includes(REASON.AUTHORIZATION_UNITS_EXCEEDED));
  assert.ok(r.visit.billingReasons.includes(REASON.AUTHORIZATION_UNITS_EXCEEDED)); assert.equal(r.visit.billingReadiness, "ready_with_warnings");
});

test("21. missing provider identifiers are flagged, not fatal", async () => {
  w.set("2026-09-24T15:00:00Z");
  const [org] = await w.db.insert(schema.organizations).values({ name: "Org C", taxId: "41-0000003" }).returning();
  const { ensureEvvDefaults, makeCtx } = await import("@/evv/context");
  await ensureEvvDefaults(w.db, org.id);
  const ctx = makeCtx(w.db, org.id, null, w.now);
  const v = await createVisit(ctx, { personId: w.a.personId, staffId: w.a.staffId, serviceCode: "H2014", modifiers: ["UC", "U3"] });
  assert.equal(v.billingId, null);
  await clockIn(ctx, v.id, event(w), admin(w.a)); w.advance(30);
  const r = await clockOut(ctx, v.id, event(w), admin(w.a));
  assert.ok(r.visit.complianceReasons.includes(REASON.PROVIDER_IDENTIFIER_MISSING));
});

test("27/28. daylight-saving transition and a visit crossing midnight keep real durations and the Central service date", async () => {
  w.set("2026-11-01T06:30:00Z"); // 01:30 CDT, half an hour before the fall-back
  const v = await planned();
  await clockIn(w.ctx(w.a), v.id, event(w, { deviceUtcOffsetMinutes: -300 }), dsp(w.a));
  w.set("2026-11-01T08:30:00Z"); // 02:30 CST — the clock showed 1:30 twice, but two real hours passed
  const r = await clockOut(w.ctx(w.a), v.id, event(w, { deviceUtcOffsetMinutes: -360 }), dsp(w.a));
  assert.equal(r.visit.durationMinutes, 120); assert.equal(r.visit.serviceDate, "2026-11-01");
  w.set("2026-09-26T04:30:00Z"); // 23:30 CDT on the 25th
  const m = await planned();
  await clockIn(w.ctx(w.a), m.id, event(w), dsp(w.a)); w.advance(90);
  const mr = await clockOut(w.ctx(w.a), m.id, event(w), dsp(w.a));
  assert.equal(mr.visit.serviceDate, "2026-09-25", "date of service is the clock-in's Central date"); assert.equal(mr.visit.durationMinutes, 90);
});

test("events are immutable and integrity-hashed; a wrong caregiver or a second clock-in is refused", async () => {
  w.set("2026-09-27T15:00:00Z");
  const v = await planned();
  const r = await clockIn(w.ctx(w.a), v.id, event(w), dsp(w.a));
  const e = r.event;
  assert.equal(e.integrityHash, eventIntegrityHash({ eventId: e.eventId, type: e.type, deviceCapturedAt: e.deviceCapturedAt, serverReceivedAt: e.serverReceivedAt, effectiveAt: e.effectiveAt, locationEncrypted: e.locationEncrypted, verificationMethod: e.verificationMethod, actorStaffId: e.actorStaffId, evvVisitId: e.evvVisitId }));
  await assert.rejects(clockIn(w.ctx(w.a), v.id, event(w), dsp(w.a)), (err: EvvError) => err.code === "ALREADY_CLOCKED_IN");
  await assert.rejects(clockOut(w.ctx(w.a), v.id, event(w), { userId: null, staffId: w.a.secondStaffId, role: "dsp" }), (err: EvvError) => err.code === "CAREGIVER_MISMATCH" && err.status === 403);
  const [stored] = await w.db.select().from(schema.evvEvents).where(eq(schema.evvEvents.id, e.id));
  assert.equal(stored.effectiveAt?.toISOString(), e.effectiveAt?.toISOString());
  // Timestamp too far in the future: kept, but server time is used and the visit is flagged.
  const f = await planned();
  const fr = await clockIn(w.ctx(w.a), f.id, event(w, { deviceCapturedAt: "2026-09-27T17:00:00Z" }), dsp(w.a));
  assert.ok(fr.flags.includes(REASON.IMPLAUSIBLE_TIMESTAMP)); assert.equal(fr.event.deviceCapturedAt?.toISOString(), "2026-09-27T17:00:00.000Z", "the device value is never replaced"); assert.equal(fr.event.effectiveAt?.toISOString(), "2026-09-27T15:00:00.000Z");
});
