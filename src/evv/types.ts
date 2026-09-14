/**
 * Canonical EVV domain types. Nothing here knows about HHAeXchange: the aggregator adapters
 * translate from these. Statuses are deliberately separate — a visit's lifecycle, its EVV
 * compliance, its submission state, the 245D note's signature and billing readiness are five
 * different questions with five different answers.
 */
import type { EvvEvent, EvvPolicy, EvvServiceRule, EvvVisit } from "@/db/schema";

export type VisitStatus = EvvVisit["status"];
export type ComplianceStatus = EvvVisit["complianceStatus"];
export type BillingReadiness = EvvVisit["billingReadiness"];
export type VerificationMethod = EvvEvent["verificationMethod"];
export type LocationType = NonNullable<EvvEvent["locationType"]>;
export type LocationState = EvvEvent["locationState"];
export type SubmissionStatus = NonNullable<EvvVisit["submissionStatus"]>;

/** Machine-readable reasons. The list is the contract with the review UI and the reports. */
export const REASON = {
  MISSING_SERVICE_TYPE: "MISSING_SERVICE_TYPE",
  MISSING_CLIENT: "MISSING_CLIENT",
  MISSING_CAREGIVER: "MISSING_CAREGIVER",
  MISSING_SERVICE_DATE: "MISSING_SERVICE_DATE",
  MISSING_CLOCK_IN: "MISSING_CLOCK_IN",
  MISSING_CLOCK_OUT: "MISSING_CLOCK_OUT",
  MISSING_START_LOCATION: "MISSING_START_LOCATION",
  MISSING_END_LOCATION: "MISSING_END_LOCATION",
  MANUAL_ENTRY: "MANUAL_ENTRY",
  CORRECTED_VISIT: "CORRECTED_VISIT",
  NOT_VERIFIED_REAL_TIME: "NOT_VERIFIED_REAL_TIME",
  INVALID_VERIFICATION_METHOD: "INVALID_VERIFICATION_METHOD",
  OUTSIDE_GEOFENCE: "OUTSIDE_GEOFENCE",
  LOCATION_ACCURACY_INSUFFICIENT: "LOCATION_ACCURACY_INSUFFICIENT",
  LOCATION_PERMISSION_DENIED: "LOCATION_PERMISSION_DENIED",
  CAREGIVER_MISMATCH: "CAREGIVER_MISMATCH",
  PROVIDER_IDENTIFIER_MISSING: "PROVIDER_IDENTIFIER_MISSING",
  AUTHORIZATION_MISMATCH: "AUTHORIZATION_MISMATCH",
  AUTHORIZATION_EXPIRED: "AUTHORIZATION_EXPIRED",
  AUTHORIZATION_UNITS_EXCEEDED: "AUTHORIZATION_UNITS_EXCEEDED",
  SERVICE_CODE_MISMATCH: "SERVICE_CODE_MISMATCH",
  DUPLICATE_VISIT: "DUPLICATE_VISIT",
  OVERLAPPING_VISIT: "OVERLAPPING_VISIT",
  SHARED_CARE_DATA_INCOMPLETE: "SHARED_CARE_DATA_INCOMPLETE",
  AGGREGATOR_REJECTION: "AGGREGATOR_REJECTION",
  LIVE_IN_NOT_DOCUMENTED: "LIVE_IN_NOT_DOCUMENTED",
  IMPORTED_NOT_VERIFIED: "IMPORTED_NOT_VERIFIED",
  IMPLAUSIBLE_TIMESTAMP: "IMPLAUSIBLE_TIMESTAMP",
  IMPLAUSIBLE_DURATION: "IMPLAUSIBLE_DURATION",
  OUT_OF_ORDER_EVENTS: "OUT_OF_ORDER_EVENTS",
  DELAYED_SYNC: "DELAYED_SYNC",
  EVV_NOT_REQUIRED: "EVV_NOT_REQUIRED",
  VOIDED: "VOIDED",
} as const;
export type ReasonCode = (typeof REASON)[keyof typeof REASON];

export const REASON_LABEL: Record<ReasonCode, string> = {
  MISSING_SERVICE_TYPE: "No service type on the visit",
  MISSING_CLIENT: "No client on the visit",
  MISSING_CAREGIVER: "No caregiver on the visit",
  MISSING_SERVICE_DATE: "No date of service",
  MISSING_CLOCK_IN: "No clock-in recorded",
  MISSING_CLOCK_OUT: "No clock-out recorded",
  MISSING_START_LOCATION: "No location at clock-in",
  MISSING_END_LOCATION: "No location at clock-out",
  MANUAL_ENTRY: "Entered manually rather than captured live",
  CORRECTED_VISIT: "Corrected after capture",
  NOT_VERIFIED_REAL_TIME: "Not verified in real time",
  INVALID_VERIFICATION_METHOD: "Verification method not allowed for this service",
  OUTSIDE_GEOFENCE: "Outside the client's home geofence without a community designation",
  LOCATION_ACCURACY_INSUFFICIENT: "GPS accuracy too poor to place the caregiver",
  LOCATION_PERMISSION_DENIED: "Device refused to share its location",
  CAREGIVER_MISMATCH: "Caregiver on the event is not the caregiver on the visit",
  PROVIDER_IDENTIFIER_MISSING: "Provider NPI/UMPI or Medicaid ID missing",
  AUTHORIZATION_MISMATCH: "Visit does not match an authorization",
  AUTHORIZATION_EXPIRED: "Authorization not active on the date of service",
  AUTHORIZATION_UNITS_EXCEEDED: "Units exceed the authorization",
  SERVICE_CODE_MISMATCH: "Service code or modifiers differ from the authorization",
  DUPLICATE_VISIT: "Another visit has the same client, caregiver and times",
  OVERLAPPING_VISIT: "Overlaps another visit by the same caregiver",
  SHARED_CARE_DATA_INCOMPLETE: "Shared-care allocation missing",
  AGGREGATOR_REJECTION: "Rejected by the aggregator",
  LIVE_IN_NOT_DOCUMENTED: "Live-in claimed but no documented relationship covers the date",
  IMPORTED_NOT_VERIFIED: "Imported from historical records; not electronically verified",
  IMPLAUSIBLE_TIMESTAMP: "Timestamp is implausible",
  IMPLAUSIBLE_DURATION: "Duration is implausible",
  OUT_OF_ORDER_EVENTS: "Clock-out arrived before clock-in",
  DELAYED_SYNC: "Synchronised after a delay",
  EVV_NOT_REQUIRED: "Service does not require EVV",
  VOIDED: "Voided",
};

export interface Coordinates { lat: number; lng: number; accuracy: number | null }

/** What the compliance engine returns. Deterministic: same inputs, same output. */
export interface ComplianceResult {
  status: ComplianceStatus;
  reasons: ReasonCode[];
}

/** Everything the evaluator needs, gathered by the service layer so the evaluator stays pure. */
export interface ComplianceInput {
  visit: EvvVisit;
  clockIn: EvvEvent | null;
  clockOut: EvvEvent | null;
  policy: EvvPolicy;
  rule: EvvServiceRule | null;
  liveInDocumented: boolean;
  overlapping: boolean;
  duplicate: boolean;
  aggregatorRejected: boolean;
  providerIdentifiersOk: boolean;
  authorization: AuthorizationCheck | null;
}

export interface AuthorizationCheck {
  found: boolean;
  activeOnDate: boolean;
  serviceMatches: boolean;
  modifiersMatch: boolean;
  unitsWithinAuthorized: boolean;
  unitsUsedBefore: number;
  authorizedUnits: number;
}

/** Correction reason codes a reviewer can pick. Free text is required alongside. */
export const CORRECTION_REASONS = [
  "FORGOT_CLOCK_IN",
  "FORGOT_CLOCK_OUT",
  "DEVICE_FAILURE",
  "NO_CONNECTIVITY",
  "WRONG_CLIENT",
  "WRONG_SERVICE",
  "WRONG_TIME",
  "LOCATION_ERROR",
  "CLIENT_REQUEST",
  "SUPERVISOR_REVIEW",
  "OTHER",
] as const;
export type CorrectionReason = (typeof CORRECTION_REASONS)[number];

/** Fields a correction may change. Anything else is a new visit, not a correction. */
export const CORRECTABLE_FIELDS = ["clockInAt", "clockOutAt", "locationType", "serviceCode", "modifiers", "staffId", "personId", "serviceAgreementId", "verificationMethod"] as const;
export type CorrectableField = (typeof CORRECTABLE_FIELDS)[number];
