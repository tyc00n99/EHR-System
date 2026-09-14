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
}

export interface LocationSummary { type: string | null; state: string; capturedAtUtc: string | null; verificationMethod: string; delayed: boolean; offline: boolean }

export type RejectionCategory = "transient" | "authentication" | "validation" | "duplicate" | "not_found" | "configuration" | "unknown";

export interface NormalizedRejection { category: RejectionCategory; vendorCode: string | null; message: string; retryable: boolean }

export type SubmissionOutcome =
  | { kind: "accepted"; externalReferenceId: string; warnings: string[]; transport: string }
  | { kind: "pending"; externalReferenceId: string | null; transport: string }
  | { kind: "rejected"; rejection: NormalizedRejection; transport: string }
  | { kind: "blocked"; reason: string };

export type AcknowledgmentResult =
  | { kind: "accepted"; warnings: string[] }
  | { kind: "rejected"; rejection: NormalizedRejection }
  | { kind: "pending" }
  | { kind: "unknown"; message: string };

export interface ExternalRecord { externalReferenceId: string; status: string; lastUpdatedUtc: string | null; raw?: unknown }

export interface HealthResult { ok: boolean; environment: AggregatorEnvironment; configured: boolean; submissionEnabled: boolean; problems: string[] }

export interface ValidationResult { ok: boolean; errors: string[] }

export interface EvvAggregatorAdapter {
  readonly key: string;
  readonly environment: AggregatorEnvironment;
  transform(visit: EvvVisit, events: { clockIn: EvvEvent | null; clockOut: EvvEvent | null }, provider: { aggregatorProviderId: string | null; caregiver: { npi: string | null; umpi: string | null } }, operation: Operation): OutboundVisit;
  validate(payload: OutboundVisit): ValidationResult;
  submit(payload: OutboundVisit): Promise<SubmissionOutcome>;
  update(payload: OutboundVisit): Promise<SubmissionOutcome>;
  voidVisit(payload: OutboundVisit): Promise<SubmissionOutcome>;
  checkAcknowledgment(externalReferenceId: string): Promise<AcknowledgmentResult>;
  normalizeRejection(raw: unknown): NormalizedRejection;
  reconcile(externalReferenceId: string): Promise<ExternalRecord | null>;
  health(): Promise<HealthResult>;
}

/** Shared by every adapter: the canonical payload from a visit and its two events. */
export function toOutbound(visit: EvvVisit, events: { clockIn: EvvEvent | null; clockOut: EvvEvent | null }, provider: { aggregatorProviderId: string | null; caregiver: { npi: string | null; umpi: string | null } }, operation: Operation): OutboundVisit {
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
