import "./harness";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { EvvEvent, EvvPolicy, EvvServiceRule, EvvVisit } from "@/db/schema";
import { evaluateCompliance } from "@/evv/compliance";
import { classifyLocation, haversineMeters } from "@/evv/geo";
import { MN_EVV_RULE_SEED, modifiersMatch, ruleFor } from "@/evv/rules";
import { backoffSeconds } from "@/evv/submission";
import { localDate, submissionDeadlineFor, utcOffsetMinutes } from "@/evv/time";
import { REASON } from "@/evv/types";
import { allocateShared, unitsFor } from "@/evv/units";

const policy: EvvPolicy = { id: "p", organizationId: "o", state: "MN", geofenceMeters: 500, maxAccuracyMeters: 200, realTimeToleranceMinutes: 60, maxFutureSkewMinutes: 10, maxVisitMinutes: 1440, minVisitMinutes: 1, submissionDeadlineDay: 14, deadlineWarningDays: 5, liveInNonRealTimeAllowed: true, billingHoldOnNoncompliant: false, maxSubmissionAttempts: 8, retryBaseSeconds: 60, retryMaxSeconds: 21600, ackTimeoutHours: 48, sourceUrl: null, sourceNote: null, createdAt: new Date(), updatedAt: new Date() };
const rules: EvvServiceRule[] = MN_EVV_RULE_SEED.map((r, i) => ({ id: `r${i}`, organizationId: "o", state: "MN", payerId: null, serviceCode: r.serviceCode, requiredModifiers: r.requiredModifiers, excludedModifiers: r.excludedModifiers ?? [], allowAdditionalModifiers: r.allowAdditionalModifiers ?? true, label: r.label, requiresEvv: true, unitType: r.unitType, sharedCare: r.sharedCare ?? false, effectiveFrom: "2026-01-01", effectiveTo: null, active: true, version: 1, supersedesId: null, sourceUrl: null, sourceLabel: null, sourceEffectiveDate: null, createdBy: null, createdAt: new Date(), updatedAt: new Date() }));

const visit = (o: Partial<EvvVisit> = {}): EvvVisit => ({ id: "v", organizationId: "o", version: 2, providerMedicaidId: "M1", providerTaxId: "41-0000001", billingIdType: "umpi", billingId: "A1", personId: "p", memberId: "12345678", staffId: "s", serviceAgreementId: "a", shiftId: null, visitId: null, sharedCareGroupId: null, sharedCareUnitsAllocated: null, serviceCode: "H2014", modifiers: ["UC", "U3"], payerId: null, serviceRuleId: "r9", evvRequired: true, scheduledStartAt: null, scheduledEndAt: null, clockInAt: new Date("2026-09-14T15:00:00Z"), clockOutAt: new Date("2026-09-14T17:00:00Z"), clockInEventId: "e1", clockOutEventId: "e2", serviceDate: "2026-09-14", timeZone: "America/Chicago", durationMinutes: 120, units: 8, unitType: "fifteen_minute", locationType: "home", verificationMethod: "mobile", liveIn: false, liveInRelationshipId: null, sharedCare: false, manualEntry: false, corrected: false, imported: false, status: "completed", complianceStatus: "INCOMPLETE", complianceReasons: [], complianceEvaluatedAt: null, billingReadiness: "not_ready", billingReasons: [], submissionStatus: null, externalReferenceId: null, resubmissionRequired: true, voidedAt: null, voidedBy: null, voidReason: null, reviewedAt: null, reviewedBy: null, createdBy: null, createdAt: new Date(), updatedAt: new Date(), ...o });
const ev = (o: Partial<EvvEvent> = {}): EvvEvent => ({ id: "e", organizationId: "o", evvVisitId: "v", eventId: "x", idempotencyKey: "k", type: "clock_in", deviceCapturedAt: new Date(), deviceUtcOffsetMinutes: -300, serverReceivedAt: new Date(), effectiveAt: new Date(), locationEncrypted: "enc", accuracyMeters: 10, locationSource: "gps", locationType: "home", locationState: "inside_geofence", distanceFromHomeMeters: 5, registeredLocationRef: null, verificationMethod: "mobile", deviceId: null, offline: false, delayed: false, actorUserId: null, actorStaffId: "s", metadata: null, integrityHash: "h", createdAt: new Date(), ...o });
const base = () => ({ visit: visit(), clockIn: ev({ id: "e1" }), clockOut: ev({ id: "e2", type: "clock_out" }), policy, rule: rules[9], liveInDocumented: false, overlapping: false, duplicate: false, aggregatorRejected: false, providerIdentifiersOk: true, authorization: { found: true, activeOnDate: true, serviceMatches: true, modifiersMatch: true, unitsWithinAuthorized: true, unitsUsedBefore: 0, authorizedUnits: 1000 } });

test("compliance: a live home visit with both fixes inside the geofence is COMPLIANT", () => {
  assert.deepEqual(evaluateCompliance(base()), { status: "COMPLIANT", reasons: [] });
});
test("compliance: no clock-out is INCOMPLETE, not noncompliant", () => {
  const r = evaluateCompliance({ ...base(), visit: visit({ clockOutAt: null, clockOutEventId: null }), clockOut: null });
  assert.equal(r.status, "INCOMPLETE"); assert.ok(r.reasons.includes(REASON.MISSING_CLOCK_OUT));
});
test("compliance: manual entry is NONCOMPLIANT with MANUAL_ENTRY", () => {
  const r = evaluateCompliance({ ...base(), visit: visit({ manualEntry: true }), clockIn: ev({ id: "e1", verificationMethod: "manual", locationState: "unavailable", locationEncrypted: null }) });
  assert.equal(r.status, "NONCOMPLIANT"); assert.ok(r.reasons.includes(REASON.MANUAL_ENTRY));
});
test("compliance: a corrected visit is NONCOMPLIANT with CORRECTED_VISIT", () => {
  const r = evaluateCompliance({ ...base(), visit: visit({ corrected: true }) });
  assert.equal(r.status, "NONCOMPLIANT"); assert.deepEqual(r.reasons, [REASON.CORRECTED_VISIT]);
});
test("compliance: outside the geofence at home is NONCOMPLIANT; the same fix on a community visit is COMPLIANT", () => {
  assert.equal(evaluateCompliance({ ...base(), clockIn: ev({ id: "e1", locationState: "outside_geofence", distanceFromHomeMeters: 2000 }) }).status, "NONCOMPLIANT");
  assert.equal(evaluateCompliance({ ...base(), visit: visit({ locationType: "community" }), clockIn: ev({ id: "e1", locationType: "community", locationState: "community", distanceFromHomeMeters: 2000 }), clockOut: ev({ id: "e2", type: "clock_out", locationType: "community", locationState: "community" }) }).status, "COMPLIANT");
});
test("compliance: poor accuracy, denied permission and a delayed sync each carry their own reason", () => {
  assert.ok(evaluateCompliance({ ...base(), clockIn: ev({ id: "e1", locationState: "accuracy_insufficient" }) }).reasons.includes(REASON.LOCATION_ACCURACY_INSUFFICIENT));
  assert.ok(evaluateCompliance({ ...base(), clockIn: ev({ id: "e1", locationState: "permission_denied", locationEncrypted: null }) }).reasons.includes(REASON.LOCATION_PERMISSION_DENIED));
  assert.ok(evaluateCompliance({ ...base(), clockOut: ev({ id: "e2", type: "clock_out", delayed: true }) }).reasons.includes(REASON.NOT_VERIFIED_REAL_TIME));
});
test("compliance: documented live-in is EXEMPT_LIVE_IN; an undocumented claim is NONCOMPLIANT", () => {
  assert.equal(evaluateCompliance({ ...base(), visit: visit({ liveIn: true, verificationMethod: "live_in" }), liveInDocumented: true, clockIn: ev({ id: "e1", verificationMethod: "live_in" }), clockOut: ev({ id: "e2", type: "clock_out", verificationMethod: "live_in" }) }).status, "EXEMPT_LIVE_IN");
  const r = evaluateCompliance({ ...base(), visit: visit({ liveIn: true }), liveInDocumented: false });
  assert.equal(r.status, "NONCOMPLIANT"); assert.ok(r.reasons.includes(REASON.LIVE_IN_NOT_DOCUMENTED));
});
test("compliance: authorization problems are billing facts and do not make verified capture noncompliant", () => {
  const r = evaluateCompliance({ ...base(), authorization: { found: true, activeOnDate: false, serviceMatches: true, modifiersMatch: true, unitsWithinAuthorized: false, unitsUsedBefore: 990, authorizedUnits: 1000 } });
  assert.equal(r.status, "COMPLIANT"); assert.ok(r.reasons.includes(REASON.AUTHORIZATION_EXPIRED)); assert.ok(r.reasons.includes(REASON.AUTHORIZATION_UNITS_EXCEEDED));
});
test("compliance: duplicates, caregiver mismatch and aggregator rejection go to PENDING_REVIEW; a non-EVV service is COMPLIANT by exemption", () => {
  assert.equal(evaluateCompliance({ ...base(), duplicate: true }).status, "PENDING_REVIEW");
  assert.equal(evaluateCompliance({ ...base(), clockIn: ev({ id: "e1", actorStaffId: "someone-else" }) }).status, "PENDING_REVIEW");
  assert.equal(evaluateCompliance({ ...base(), aggregatorRejected: true }).status, "PENDING_REVIEW");
  assert.deepEqual(evaluateCompliance({ ...base(), visit: visit({ evvRequired: false, serviceRuleId: null }), rule: null }), { status: "COMPLIANT", reasons: [REASON.EVV_NOT_REQUIRED] });
});

test("rules: Minnesota seed decides which code + modifier combinations require EVV", () => {
  assert.equal(ruleFor(rules, "H2014", ["UC", "U3"], "2026-09-14")?.label, "IHS with training");
  assert.equal(ruleFor(rules, "H2014", ["UC", "UN", "U3"], "2026-09-14")?.label, "Shared IHS with training");
  assert.equal(ruleFor(rules, "S5125", ["UC", "UN"], "2026-09-14")?.sharedCare, true);
  assert.equal(ruleFor(rules, "T1005", ["TG"], "2026-09-14")?.label, "Specialized crisis respite");
  assert.equal(ruleFor(rules, "T1005", [], "2026-09-14")?.label, "Crisis respite, 15 minutes");
  assert.equal(ruleFor(rules, "S5135", ["UA"], "2026-09-14")?.label, "Night supervision");
  assert.equal(ruleFor(rules, "T1019", ["UC", "U3"], "2026-09-14")?.label, "PCA / CFSS (all applicable modifiers)");
  assert.equal(ruleFor(rules, "H2019", [], "2026-09-14"), null, "positive support is not an EVV service");
  assert.equal(ruleFor(rules, "S5130", [], "2026-09-14"), null, "homemaker cleaning is not; only TG is");
  assert.equal(ruleFor(rules, "H2014", ["UC", "U3"], "2025-12-31"), null, "not before the effective date");
  assert.equal(modifiersMatch({ requiredModifiers: ["UC"], excludedModifiers: ["UN"], allowAdditionalModifiers: false }, ["UC", "U8"]), false);
});

test("geo: haversine and the geofence classification, including accuracy credit", () => {
  const home = { lat: 44.9778, lng: -93.265 };
  assert.ok(Math.abs(haversineMeters(home, { lat: 44.9868, lng: -93.265 }) - 1000) < 10);
  assert.equal(classifyLocation({ coordinates: { lat: 44.9779, lng: -93.265, accuracy: 10 }, permissionDenied: false, locationType: "home", home, registeredLocationRef: null, method: "mobile", policy }).state, "inside_geofence");
  assert.equal(classifyLocation({ coordinates: { lat: 44.9868, lng: -93.265, accuracy: 10 }, permissionDenied: false, locationType: "home", home, registeredLocationRef: null, method: "mobile", policy }).state, "outside_geofence");
  assert.equal(classifyLocation({ coordinates: { lat: 44.9868, lng: -93.265, accuracy: 10 }, permissionDenied: false, locationType: "community", home, registeredLocationRef: null, method: "mobile", policy }).state, "community");
  assert.equal(classifyLocation({ coordinates: { lat: 44.9779, lng: -93.265, accuracy: 900 }, permissionDenied: false, locationType: "home", home, registeredLocationRef: null, method: "mobile", policy }).state, "accuracy_insufficient");
  assert.equal(classifyLocation({ coordinates: null, permissionDenied: true, locationType: "home", home, registeredLocationRef: null, method: "mobile", policy }).state, "permission_denied");
  assert.equal(classifyLocation({ coordinates: null, permissionDenied: false, locationType: "protected", home, registeredLocationRef: null, method: "mobile", policy }).state, "protected_address");
  assert.equal(classifyLocation({ coordinates: null, permissionDenied: false, locationType: "home", home, registeredLocationRef: "612-555-0100", method: "ivr", policy }).state, "registered_location");
});

test("time: Central dates across DST and midnight; the monthly deadline", () => {
  assert.equal(localDate(new Date("2026-09-15T04:30:00Z")), "2026-09-14", "23:30 CDT is still the 14th");
  assert.equal(utcOffsetMinutes(new Date("2026-09-14T15:00:00Z")), -300);
  assert.equal(utcOffsetMinutes(new Date("2026-11-01T09:00:00Z")), -360, "after the fall-back at 2:00 CDT on Nov 1 2026");
  assert.equal(submissionDeadlineFor("2026-09-30", 14), "2026-10-14");
  assert.equal(submissionDeadlineFor("2026-12-03", 14), "2027-01-14");
});

test("units and backoff", () => {
  assert.equal(unitsFor("fifteen_minute", new Date("2026-09-14T15:00:00Z"), new Date("2026-09-14T17:08:00Z")), 9, "2h08 rounds up the last unit");
  assert.equal(unitsFor("daily", new Date("2026-09-14T15:00:00Z"), new Date("2026-09-14T17:00:00Z")), 1);
  assert.deepEqual(allocateShared(9, ["a", "b"]), { a: 5, b: 4 });
  assert.equal(backoffSeconds(1, 60, 21600, () => 0.5), 60);
  assert.equal(backoffSeconds(4, 60, 21600, () => 0.5), 480);
  assert.equal(backoffSeconds(20, 60, 21600, () => 0.5), 21600, "capped");
  assert.ok(backoffSeconds(3, 60, 21600, () => 0) < backoffSeconds(3, 60, 21600, () => 1), "jitter");
});
