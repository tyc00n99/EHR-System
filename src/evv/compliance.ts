/**
 * The compliance engine. Pure and deterministic: it reads the visit, its two events, the policy
 * and a handful of facts the service layer looked up, and returns a status plus reason codes.
 * It never touches the database, so the same inputs always give the same answer and a test can
 * pin every branch.
 *
 * Statuses:
 *  - INCOMPLETE       one of the six federal elements is missing (usually no clock-out yet)
 *  - EXEMPT_LIVE_IN   a documented live-in relationship covers the date; ordinary rules do not apply
 *  - PENDING_REVIEW   something is ambiguous (out-of-order events, implausible values, rejection)
 *  - NONCOMPLIANT     all elements present but at least one was not electronically verified live
 *  - COMPLIANT        every element captured electronically, in real time, in an allowed way
 */
import { policyFor } from "./policy";
import { REASON, type ComplianceInput, type ComplianceResult, type ReasonCode } from "./types";
import { minutesBetween } from "./time";

export function evaluateCompliance(input: ComplianceInput): ComplianceResult {
  const { visit, clockIn, clockOut, rule } = input;
  const policy = policyFor(input.policy);
  const reasons = new Set<ReasonCode>();

  if (visit.status === "voided") return { status: "PENDING_REVIEW", reasons: [REASON.VOIDED] };
  if (!visit.evvRequired || !rule?.requiresEvv) return { status: "COMPLIANT", reasons: [REASON.EVV_NOT_REQUIRED] };

  // The six federal elements.
  if (!visit.serviceCode) reasons.add(REASON.MISSING_SERVICE_TYPE);
  if (!visit.personId || !visit.memberId) reasons.add(REASON.MISSING_CLIENT);
  if (!visit.staffId) reasons.add(REASON.MISSING_CAREGIVER);
  if (!visit.serviceDate) reasons.add(REASON.MISSING_SERVICE_DATE);
  if (!visit.clockInAt || !clockIn) reasons.add(REASON.MISSING_CLOCK_IN);
  if (!visit.clockOutAt || !clockOut) reasons.add(REASON.MISSING_CLOCK_OUT);
  if (clockIn && clockIn.locationState !== "protected_address" && clockIn.locationState !== "registered_location" && !clockIn.locationEncrypted) reasons.add(REASON.MISSING_START_LOCATION);
  if (clockOut && clockOut.locationState !== "protected_address" && clockOut.locationState !== "registered_location" && !clockOut.locationEncrypted) reasons.add(REASON.MISSING_END_LOCATION);
  if (!input.providerIdentifiersOk) reasons.add(REASON.PROVIDER_IDENTIFIER_MISSING);

  const incomplete = [REASON.MISSING_SERVICE_TYPE, REASON.MISSING_CLIENT, REASON.MISSING_CAREGIVER, REASON.MISSING_SERVICE_DATE, REASON.MISSING_CLOCK_IN, REASON.MISSING_CLOCK_OUT].some((r) => reasons.has(r));
  if (incomplete) return { status: "INCOMPLETE", reasons: [...reasons] };

  // Live-in: only a documented, effective relationship earns the exemption. A claim without one
  // is an ordinary manual visit and is marked as such.
  if (visit.liveIn) {
    if (input.liveInDocumented) {
      const late = clockIn && clockIn.delayed && !policy.liveInMayBeNonRealTime();
      if (late) reasons.add(REASON.NOT_VERIFIED_REAL_TIME);
      return { status: "EXEMPT_LIVE_IN", reasons: [...reasons] };
    }
    reasons.add(REASON.LIVE_IN_NOT_DOCUMENTED);
    reasons.add(REASON.MANUAL_ENTRY);
  }

  // Ambiguities a person has to settle.
  if (input.aggregatorRejected) reasons.add(REASON.AGGREGATOR_REJECTION);
  if (clockIn && clockOut && visit.clockInAt && visit.clockOutAt) {
    const minutes = minutesBetween(visit.clockInAt, visit.clockOutAt);
    if (minutes < input.policy.minVisitMinutes || minutes > input.policy.maxVisitMinutes) reasons.add(REASON.IMPLAUSIBLE_DURATION);
    if (clockIn.serverReceivedAt && clockOut.serverReceivedAt && clockOut.serverReceivedAt < clockIn.serverReceivedAt && clockIn.delayed) reasons.add(REASON.OUT_OF_ORDER_EVENTS);
  }
  if (visit.sharedCare && visit.sharedCareUnitsAllocated == null) reasons.add(REASON.SHARED_CARE_DATA_INCOMPLETE);

  // Electronic verification, in real time, by an allowed method.
  const electronic = policy.electronicMethods();
  for (const ev of [clockIn, clockOut]) {
    if (!ev) continue;
    if (visit.imported || ev.verificationMethod === "imported") reasons.add(REASON.IMPORTED_NOT_VERIFIED);
    if (ev.verificationMethod === "manual") reasons.add(REASON.MANUAL_ENTRY);
    else if (!electronic.has(ev.verificationMethod) && ev.verificationMethod !== "live_in") reasons.add(REASON.INVALID_VERIFICATION_METHOD);
    if (ev.delayed) reasons.add(REASON.NOT_VERIFIED_REAL_TIME);
    if (ev.locationState === "outside_geofence") reasons.add(REASON.OUTSIDE_GEOFENCE);
    if (ev.locationState === "accuracy_insufficient") reasons.add(REASON.LOCATION_ACCURACY_INSUFFICIENT);
    if (ev.locationState === "permission_denied") reasons.add(REASON.LOCATION_PERMISSION_DENIED);
    if (ev.actorStaffId && ev.actorStaffId !== visit.staffId) reasons.add(REASON.CAREGIVER_MISMATCH);
  }
  if (visit.manualEntry) reasons.add(REASON.MANUAL_ENTRY);
  if (visit.corrected) reasons.add(REASON.CORRECTED_VISIT);
  if (input.duplicate) reasons.add(REASON.DUPLICATE_VISIT);
  if (input.overlapping) reasons.add(REASON.OVERLAPPING_VISIT);

  const auth = input.authorization;
  if (auth) {
    if (!auth.found) reasons.add(REASON.AUTHORIZATION_MISMATCH);
    else {
      if (!auth.activeOnDate) reasons.add(REASON.AUTHORIZATION_EXPIRED);
      if (!auth.serviceMatches || !auth.modifiersMatch) reasons.add(REASON.SERVICE_CODE_MISMATCH);
      if (!auth.unitsWithinAuthorized) reasons.add(REASON.AUTHORIZATION_UNITS_EXCEEDED);
    }
  }

  const review: ReasonCode[] = [REASON.AGGREGATOR_REJECTION, REASON.IMPLAUSIBLE_DURATION, REASON.IMPLAUSIBLE_TIMESTAMP, REASON.OUT_OF_ORDER_EVENTS, REASON.DUPLICATE_VISIT, REASON.CAREGIVER_MISMATCH];
  if (review.some((r) => reasons.has(r))) return { status: "PENDING_REVIEW", reasons: [...reasons] };

  // Authorization problems are billing facts, not verification facts: a compliant capture
  // against an exhausted authorization is still compliant EVV. They stay in the reasons so the
  // billing check sees them, but they do not decide the status.
  const billingOnly = new Set<ReasonCode>([REASON.AUTHORIZATION_MISMATCH, REASON.AUTHORIZATION_EXPIRED, REASON.AUTHORIZATION_UNITS_EXCEEDED, REASON.SERVICE_CODE_MISMATCH, REASON.PROVIDER_IDENTIFIER_MISSING]);
  const verificationFaults = [...reasons].filter((r) => !billingOnly.has(r));
  return { status: verificationFaults.length ? "NONCOMPLIANT" : "COMPLIANT", reasons: [...reasons] };
}
