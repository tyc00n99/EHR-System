/**
 * The aggregator boundary. The rest of the EVV module speaks only this vocabulary; an adapter
 * translates it for one aggregator and one state. `OutboundVisit` is EVVora's canonical wire
 * shape — it is *not* the HHAeXchange schema, whose field names are applied inside the
 * Minnesota adapter once the official specification is in hand.
 */
import type { EvvEvent, EvvVisit } from "@/db/schema";

export type AggregatorEnvironment = "mock" | "sandbox" | "production";
export type Operation = "create" | "update" | "void";

export interface OutboundVisit {
  schema: "evvora-canonical/1";
  operation: Operation;
  visitId: string;
  version: number;
  externalReferenceId: string | null;
  provider: { taxId: string; medicaidProviderId: string | null; billingIdType: "npi" | "umpi" | null; billingId: string | null; aggregatorProviderId: string | null };
  member: { memberId: string };
  caregiver: { staffId: string; npi: string | null; umpi: string | null };
  service: { code: string; modifiers: string[]; payerId: string | null; unitType: string | null };
  times: { clockInUtc: string | null; clockOutUtc: string | null; serviceDate: string | null; timeZone: string; durationMinutes: number | null; units: number | null };
  locations: { clockIn: LocationSummary | null; clockOut: LocationSummary | null };
  verification: { method: string | null; liveIn: boolean; manualEntry: boolean; corrected: boolean; sharedCare: boolean; sharedCareUnitsAllocated: number | null; complianceStatus: string; complianceReasons: string[] };
  voided: { at: string; reason: string } | null;
  /**
   * What an aggregator needs beyond the canonical record: identifiers in its own format, the
   * service address, the coordinates of each call, the DHS edit codes. Built by `buildExtras` in
   * src/evv/outbound.ts. Absent in unit tests that only exercise the canonical shape.
   */
  extras?: OutboundExtras;
}

/** One end of the visit as an electronic call. Null when that end was not electronically verified. */
export interface OutboundCall {
  /** UTC ISO instant of the original event. Never the corrected time: HHAX refuses changed clock data (101052). */
  atUtc: string;
  method: "mobile" | "ivr" | "fob";
  lat: number | null;
  lng: number | null;
  /** Caller ID for telephony, ten digits. */
  phone: string | null;
}

export interface OutboundAddress { line1: string | null; line2: string | null; city: string | null; state: string | null; zip: string | null }

export interface OutboundExtras {
  office: { qualifier: "FederalTaxID" | "NPI" | "UMPI"; identifier: string };
  payerExternalId: string | null;
  /** ≤ 20 characters, stable per caregiver. */
  caregiverExternalId: string;
  /** ≤ 30 characters, stable per visit. */
  externalVisitId: string;
  /** "~" + our id: the external EVVMSID HHAX lets a vendor assign, used for create, update and delete. */
  externalEvvmsid: string;
  /** The member's address (HHAX `serviceAddress` is "individual's street address"). */
  serviceAddress: OutboundAddress | null;
  locationType: "Home" | "Community" | null;
  clockIn: OutboundCall | null;
  clockOut: OutboundCall | null;
  /** Visit times as the provider confirms them now (corrected times when corrected). */
  visitStartUtc: string | null;
  visitEndUtc: string | null;
  scheduleStartUtc: string | null;
  scheduleEndUtc: string | null;
  edit: { reasonCode: string; actionCode: string; notes: string | null } | null;
  residingCaregiver: boolean;
  performedTasks: string[];
  billing: { invoiceNumber: string; totalBilledAmount: number; totalUnitsBilled: number; contractRate: number; diagnosisCodes: string[] } | null;
}

/** The caregiver demographic record an aggregator keeps (HHAX Caregiver endpoint). */
export interface OutboundCaregiver {
  staffId: string;
  externalId: string;
  providerTaxId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: "Male" | "Female" | "Other";
  email: string | null;
  phone: string | null;
  umpi: string | null;
  address: OutboundAddress;
}

export interface LocationSummary { type: string | null; state: string; capturedAtUtc: string | null; verificationMethod: string; delayed: boolean; offline: boolean }

export type RejectionCategory = "transient" | "authentication" | "validation" | "duplicate" | "not_found" | "configuration" | "unknown";

export interface NormalizedRejection { category: RejectionCategory; vendorCode: string | null; message: string; retryable: boolean }

export type SubmissionOutcome =
  | { kind: "accepted"; externalReferenceId: string; warnings: string[]; transport: string; aggregatorVisitId?: string | null }
  | { kind: "pending"; externalReferenceId: string | null; transport: string; aggregatorVisitId?: string | null }
  | { kind: "rejected"; rejection: NormalizedRejection; transport: string }
  | { kind: "blocked"; reason: string };

export type AcknowledgmentResult =
  | { kind: "accepted"; warnings: string[]; aggregatorVisitId?: string | null }
  | { kind: "rejected"; rejection: NormalizedRejection }
  | { kind: "pending" }
  | { kind: "unknown"; message: string };

export interface ExternalRecord { externalReferenceId: string; status: string; lastUpdatedUtc: string | null; raw?: unknown }

export interface HealthResult { ok: boolean; environment: AggregatorEnvironment; configured: boolean; submissionEnabled: boolean; problems: string[] }

export interface ValidationResult { ok: boolean; errors: string[] }

export interface EvvAggregatorAdapter {
  readonly key: string;
  readonly environment: AggregatorEnvironment;
  transform(visit: EvvVisit, events: { clockIn: EvvEvent | null; clockOut: EvvEvent | null }, provider: OutboundProvider, operation: Operation): OutboundVisit;
  validate(payload: OutboundVisit): ValidationResult;
  submit(payload: OutboundVisit): Promise<SubmissionOutcome>;
  update(payload: OutboundVisit): Promise<SubmissionOutcome>;
  voidVisit(payload: OutboundVisit): Promise<SubmissionOutcome>;
  checkAcknowledgment(externalReferenceId: string): Promise<AcknowledgmentResult>;
  normalizeRejection(raw: unknown): NormalizedRejection;
  reconcile(externalReferenceId: string): Promise<ExternalRecord | null>;
  health(): Promise<HealthResult>;
  /**
   * Send the caregiver record. Adapters whose aggregator needs a caregiver before a visit implement
   * it; the submission service calls it before the caregiver's visits and whenever the record changes.
   */
  syncCaregiver?(caregiver: OutboundCaregiver): Promise<SubmissionOutcome>;
}

export interface OutboundProvider { aggregatorProviderId: string | null; caregiver: { npi: string | null; umpi: string | null }; extras?: OutboundExtras }

/** Shared by every adapter: the canonical payload from a visit and its two events. */
export function toOutbound(visit: EvvVisit, events: { clockIn: EvvEvent | null; clockOut: EvvEvent | null }, provider: OutboundProvider, operation: Operation): OutboundVisit {
  const loc = (e: EvvEvent | null): LocationSummary | null => e ? { type: e.locationType, state: e.locationState, capturedAtUtc: e.effectiveAt?.toISOString() ?? null, verificationMethod: e.verificationMethod, delayed: e.delayed, offline: e.offline } : null;
  return {
    schema: "evvora-canonical/1", operation, visitId: visit.id, version: visit.version, externalReferenceId: visit.externalReferenceId,
    provider: { taxId: visit.providerTaxId, medicaidProviderId: visit.providerMedicaidId, billingIdType: visit.billingIdType, billingId: visit.billingId, aggregatorProviderId: provider.aggregatorProviderId },
    member: { memberId: visit.memberId },
    caregiver: { staffId: visit.staffId, npi: provider.caregiver.npi, umpi: provider.caregiver.umpi },
    service: { code: visit.serviceCode, modifiers: visit.modifiers, payerId: visit.payerId, unitType: visit.unitType },
    times: { clockInUtc: visit.clockInAt?.toISOString() ?? null, clockOutUtc: visit.clockOutAt?.toISOString() ?? null, serviceDate: visit.serviceDate, timeZone: visit.timeZone, durationMinutes: visit.durationMinutes, units: visit.units },
    locations: { clockIn: loc(events.clockIn), clockOut: loc(events.clockOut) },
    verification: { method: visit.verificationMethod, liveIn: visit.liveIn, manualEntry: visit.manualEntry, corrected: visit.corrected, sharedCare: visit.sharedCare, sharedCareUnitsAllocated: visit.sharedCareUnitsAllocated, complianceStatus: visit.complianceStatus, complianceReasons: visit.complianceReasons },
    voided: visit.status === "voided" ? { at: visit.voidedAt?.toISOString() ?? "", reason: visit.voidReason ?? "" } : null,
    ...(provider.extras ? { extras: provider.extras } : {}),
  };
}

/** The six federal elements plus the identifiers an aggregator cannot accept a visit without. */
export function validateOutbound(p: OutboundVisit): ValidationResult {
  const errors: string[] = [];
  if (!p.service.code) errors.push("service code missing");
  if (!p.member.memberId) errors.push("member identifier missing");
  if (!p.caregiver.staffId) errors.push("caregiver missing");
  if (!p.times.serviceDate) errors.push("service date missing");
  if (p.operation !== "void") {
    if (!p.times.clockInUtc) errors.push("clock-in missing");
    if (!p.times.clockOutUtc) errors.push("clock-out missing");
    if (!p.locations.clockIn) errors.push("clock-in location record missing");
    if (!p.locations.clockOut) errors.push("clock-out location record missing");
  }
  if (!p.provider.taxId) errors.push("provider tax id missing");
  if (!p.provider.billingId && !p.provider.medicaidProviderId) errors.push("provider NPI/UMPI or Medicaid id missing");
  if (p.operation !== "create" && !p.externalReferenceId) errors.push("external reference required for update/void");
  return { ok: errors.length === 0, errors };
}
