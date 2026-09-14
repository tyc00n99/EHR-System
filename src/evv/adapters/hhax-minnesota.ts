/**
 * Minnesota HHAeXchange adapter. This is the boundary where EVVora's canonical visit becomes
 * whatever the Minnesota HHAX aggregator specification says a visit looks like. That
 * specification, the endpoint paths and the credentials are obtained through DHS/HHAX
 * onboarding (see docs/evv-hhax-integration-checklist.md) and are not in this repository, so:
 *
 *  - no endpoint path, payload key or rejection code is invented here;
 *  - the transport is a typed boundary whose path and credentials come from configuration;
 *  - with anything missing the adapter fails closed: `submit` returns `blocked`, never `accepted`.
 *
 * When the specification arrives, `transform()` gains the official field mapping and
 * `normalizeRejection()` the official code table; nothing outside this file changes.
 */
import { createHash } from "node:crypto";
import type { EvvEvent, EvvVisit } from "@/db/schema";
import { toOutbound, validateOutbound, type AcknowledgmentResult, type EvvAggregatorAdapter, type ExternalRecord, type HealthResult, type NormalizedRejection, type Operation, type OutboundVisit, type SubmissionOutcome } from "./types";

export interface HhaxConfig {
  environment: "sandbox" | "production" | "off";
  baseUrl: string | null;
  /** Path of the visit endpoint, relative to baseUrl. From the official spec; null until known. */
  visitPath: string | null;
  acknowledgmentPath: string | null;
  clientId: string | null;
  providerId: string | null;
  /** Whatever credential HHAX issues: never logged, never in source. */
  secret: string | null;
  timeoutMs: number;
  /** Feature flag: production submission is on only when this is true. */
  submissionEnabled: boolean;
}

/** Reads the configuration from the environment. Nothing here is a default endpoint. */
export function hhaxConfigFromEnv(env: NodeJS.ProcessEnv = process.env): HhaxConfig {
  const environment = (env.HHAX_ENVIRONMENT ?? "off").toLowerCase();
  return {
    environment: environment === "sandbox" || environment === "production" ? environment : "off",
    baseUrl: env.HHAX_BASE_URL?.trim() || null,
    visitPath: env.HHAX_VISIT_PATH?.trim() || null,
    acknowledgmentPath: env.HHAX_ACK_PATH?.trim() || null,
    clientId: env.HHAX_CLIENT_ID?.trim() || null,
    providerId: env.HHAX_PROVIDER_ID?.trim() || null,
    secret: env.HHAX_CLIENT_SECRET?.trim() || null,
    timeoutMs: Number(env.HHAX_TIMEOUT_MS) > 0 ? Number(env.HHAX_TIMEOUT_MS) : 15_000,
    submissionEnabled: env.EVV_SUBMISSION_ENABLED === "1",
  };
}

export function hhaxConfigProblems(c: HhaxConfig): string[] {
  const problems: string[] = [];
  if (c.environment === "off") problems.push("HHAX_ENVIRONMENT is off");
  if (!c.baseUrl) problems.push("HHAX_BASE_URL missing");
  if (!c.visitPath) problems.push("HHAX_VISIT_PATH missing (from the official HHAX specification)");
  if (!c.clientId) problems.push("HHAX_CLIENT_ID missing");
  if (!c.providerId) problems.push("HHAX_PROVIDER_ID missing");
  if (!c.secret) problems.push("HHAX_CLIENT_SECRET missing");
  if (!c.submissionEnabled) problems.push("EVV_SUBMISSION_ENABLED is not 1");
  return problems;
}

/** The transport boundary: one HTTP call with credentials applied. Typed, mockable, no PHI logging. */
export interface HhaxTransport {
  post(path: string, body: unknown, options: { timeoutMs: number }): Promise<{ status: number; body: unknown }>;
  get(path: string, options: { timeoutMs: number }): Promise<{ status: number; body: unknown }>;
}

/** fetch-based transport. Only constructed when configuration is complete. */
export class FetchHhaxTransport implements HhaxTransport {
  constructor(private baseUrl: string, private headers: Record<string, string>) {}
  private async call(method: "POST" | "GET", path: string, body: unknown, timeoutMs: number) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(new URL(path, this.baseUrl), { method, headers: { "content-type": "application/json", accept: "application/json", ...this.headers }, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl.signal });
      const text = await res.text();
      let parsed: unknown = text;
      try { parsed = text ? JSON.parse(text) : null; } catch { /* keep text */ }
      return { status: res.status, body: parsed };
    } finally { clearTimeout(timer); }
  }
  post(path: string, body: unknown, o: { timeoutMs: number }) { return this.call("POST", path, body, o.timeoutMs); }
  get(path: string, o: { timeoutMs: number }) { return this.call("GET", path, undefined, o.timeoutMs); }
}

export class MinnesotaHhaxAdapter implements EvvAggregatorAdapter {
  readonly key = "hhax_mn";
  readonly environment: "sandbox" | "production";
  constructor(private config: HhaxConfig, private transport: HhaxTransport | null = null) {
    this.environment = config.environment === "production" ? "production" : "sandbox";
    if (!this.transport && hhaxConfigProblems(config).length === 0) {
      // The header scheme HHAX uses is part of the specification; until it is known no header is
      // guessed. The transport is constructed so a spec-driven subclass can add it.
      this.transport = new FetchHhaxTransport(config.baseUrl!, {});
    }
  }

  transform(visit: EvvVisit, events: { clockIn: EvvEvent | null; clockOut: EvvEvent | null }, provider: { aggregatorProviderId: string | null; caregiver: { npi: string | null; umpi: string | null } }, operation: Operation): OutboundVisit {
    // TODO(hhax-spec): map to the official Minnesota HHAX visit schema. Until then the canonical
    // payload is the outbound shape, and submission is blocked below.
    return toOutbound(visit, events, { ...provider, aggregatorProviderId: provider.aggregatorProviderId ?? this.config.providerId }, operation);
  }
  validate(payload: OutboundVisit) { return validateOutbound(payload); }

  private blocked(): SubmissionOutcome | null {
    const problems = hhaxConfigProblems(this.config);
    if (problems.length) return { kind: "blocked", reason: `HHAX submission is not configured: ${problems.join("; ")}` };
    if (!this.transport) return { kind: "blocked", reason: "HHAX transport unavailable." };
    // The official schema mapping is not implemented; a request would be malformed. Fail closed.
    return { kind: "blocked", reason: "HHAX visit schema mapping is pending the official Minnesota specification; submission is disabled until it is implemented and certified." };
  }

  private async send(payload: OutboundVisit): Promise<SubmissionOutcome> {
    const blocked = this.blocked();
    if (blocked) return blocked;
    // Unreachable until the mapping exists; kept so the transport path is exercised by a spec-driven test double.
    const res = await this.transport!.post(this.config.visitPath!, payload, { timeoutMs: this.config.timeoutMs });
    if (res.status >= 200 && res.status < 300) {
      const ref = (res.body as { referenceId?: string } | null)?.referenceId ?? createHash("sha256").update(payload.visitId + payload.version).digest("hex").slice(0, 16);
      return { kind: res.status === 202 ? "pending" : "accepted", externalReferenceId: ref, warnings: [], transport: `HTTP ${res.status}` } as SubmissionOutcome;
    }
    return { kind: "rejected", rejection: this.normalizeRejection({ status: res.status, body: res.body }), transport: `HTTP ${res.status}` };
  }
  submit(payload: OutboundVisit) { return this.send(payload); }
  update(payload: OutboundVisit) { return this.send(payload); }
  voidVisit(payload: OutboundVisit) { return this.send(payload); }

  async checkAcknowledgment(): Promise<AcknowledgmentResult> {
    if (this.blocked() || !this.config.acknowledgmentPath) return { kind: "unknown", message: "Acknowledgment endpoint is not configured." };
    return { kind: "unknown", message: "Acknowledgment parsing is pending the official specification." };
  }

  /** Categorises by transport status only; vendor codes are applied once the official code table is known. */
  normalizeRejection(raw: unknown): NormalizedRejection {
    const r = raw as { status?: number; body?: unknown } | undefined;
    const status = r?.status ?? 0;
    const message = typeof r?.body === "string" ? r.body.slice(0, 500) : "Rejected by the aggregator";
    if (status === 401 || status === 403) return { category: "authentication", vendorCode: String(status), message, retryable: false };
    if (status === 404) return { category: "not_found", vendorCode: "404", message, retryable: false };
    if (status === 409) return { category: "duplicate", vendorCode: "409", message, retryable: false };
    if (status === 408 || status === 429 || status >= 500 || status === 0) return { category: "transient", vendorCode: String(status), message, retryable: true };
    if (status >= 400) return { category: "validation", vendorCode: String(status), message, retryable: false };
    return { category: "unknown", vendorCode: null, message, retryable: false };
  }

  async reconcile(): Promise<ExternalRecord | null> { return null; }

  async health(): Promise<HealthResult> {
    const problems = hhaxConfigProblems(this.config);
    problems.push("Official HHAX schema mapping not implemented (blocked on specification)");
    return { ok: false, environment: this.environment, configured: hhaxConfigProblems(this.config).length === 0, submissionEnabled: this.config.submissionEnabled, problems };
  }
}
