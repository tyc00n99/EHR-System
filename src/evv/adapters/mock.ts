/**
 * Deterministic in-memory aggregator for tests and non-production deployments. Behaviour is a
 * script the caller supplies; the default accepts everything. It records every call so a test
 * can assert what was sent without any network.
 */
import { createHash } from "node:crypto";
import type { EvvEvent, EvvVisit } from "@/db/schema";
import { toOutbound, validateOutbound, type AcknowledgmentResult, type EvvAggregatorAdapter, type ExternalRecord, type HealthResult, type NormalizedRejection, type Operation, type OutboundVisit, type SubmissionOutcome } from "./types";

export type MockScript = (payload: OutboundVisit, attempt: number) => SubmissionOutcome;

export class MockAggregatorAdapter implements EvvAggregatorAdapter {
  readonly key = "mock";
  readonly environment = "mock" as const;
  readonly calls: { operation: Operation; payload: OutboundVisit; outcome: SubmissionOutcome }[] = [];
  readonly acknowledgments = new Map<string, AcknowledgmentResult>();
  private attempts = new Map<string, number>();

  constructor(private script: MockScript = () => ({ kind: "accepted", externalReferenceId: "", warnings: [], transport: "mock 200" })) {}

  transform(visit: EvvVisit, events: { clockIn: EvvEvent | null; clockOut: EvvEvent | null }, provider: { aggregatorProviderId: string | null; caregiver: { npi: string | null; umpi: string | null } }, operation: Operation) {
    return toOutbound(visit, events, provider, operation);
  }
  validate(payload: OutboundVisit) { return validateOutbound(payload); }

  private run(payload: OutboundVisit): Promise<SubmissionOutcome> {
    const n = (this.attempts.get(payload.visitId) ?? 0) + 1;
    this.attempts.set(payload.visitId, n);
    let outcome = this.script(payload, n);
    if (outcome.kind === "accepted" && !outcome.externalReferenceId) outcome = { ...outcome, externalReferenceId: `MOCK-${createHash("sha1").update(payload.visitId).digest("hex").slice(0, 12).toUpperCase()}` };
    this.calls.push({ operation: payload.operation, payload, outcome });
    return Promise.resolve(outcome);
  }
  submit(payload: OutboundVisit) { return this.run(payload); }
  update(payload: OutboundVisit) { return this.run(payload); }
  voidVisit(payload: OutboundVisit) { return this.run(payload); }

  checkAcknowledgment(externalReferenceId: string): Promise<AcknowledgmentResult> {
    return Promise.resolve(this.acknowledgments.get(externalReferenceId) ?? { kind: "accepted", warnings: [] });
  }
  normalizeRejection(raw: unknown): NormalizedRejection {
    const r = raw as Partial<NormalizedRejection> | undefined;
    return { category: r?.category ?? "unknown", vendorCode: r?.vendorCode ?? null, message: r?.message ?? "Rejected", retryable: r?.retryable ?? false };
  }
  reconcile(externalReferenceId: string): Promise<ExternalRecord | null> {
    const call = this.calls.find((c) => c.outcome.kind === "accepted" && c.outcome.externalReferenceId === externalReferenceId);
    return Promise.resolve(call ? { externalReferenceId, status: "accepted", lastUpdatedUtc: null } : null);
  }
  health(): Promise<HealthResult> { return Promise.resolve({ ok: true, environment: "mock", configured: true, submissionEnabled: true, problems: [] }); }
}

/** Handy outcomes for scripts. */
export const outcomes = {
  accept: (warnings: string[] = []): SubmissionOutcome => ({ kind: "accepted", externalReferenceId: "", warnings, transport: "mock 200" }),
  transient: (message = "Service unavailable"): SubmissionOutcome => ({ kind: "rejected", rejection: { category: "transient", vendorCode: "503", message, retryable: true }, transport: "mock 503" }),
  validation: (vendorCode = "V100", message = "Invalid visit"): SubmissionOutcome => ({ kind: "rejected", rejection: { category: "validation", vendorCode, message, retryable: false }, transport: "mock 400" }),
  pending: (): SubmissionOutcome => ({ kind: "pending", externalReferenceId: null, transport: "mock 202" }),
};
