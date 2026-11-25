/**
 * Minnesota HHAeXchange aggregator adapter, built from the HHAX *Minnesota DHS EVV Data Aggregator
 * Specification* (rev. 10/28/2024) and the *Business Requirements for Third Party EVV Data
 * Aggregation — MN EVV* (May 2023). docs/evv-hhax-spec-notes.md summarises both.
 *
 *  - OAuth2 client credentials at /identity/connect/token; the token lives 30 minutes and is reused
 *    until then; a 401 refreshes it once.
 *  - At most five calls a second per consumer: every call waits its turn (`throttle`).
 *  - Caregivers first (POST /api/v1/caregivers), then visits (POST /api/v1/visits create,
 *    PUT /api/v1/visits/{evvmsid} update, DELETE /api/v1/visits/{evvmsid} void).
 *  - Submission is asynchronous: a 2xx is receipt, and the result is read later from
 *    GET /api/v1/visits/transactions/{transactionId}. Nothing is marked accepted on receipt.
 *  - It fails closed: with configuration missing, `submit` returns `blocked`, never `accepted`.
 *
 * What the specification does not print — the JSON shape of the POST receipt and of the transaction
 * status — is read tolerantly here (see `transactionIdFrom`, `readTransaction`) and must be confirmed
 * against the sandbox during HHAX testing. An unrecognised status is "pending", never "accepted".
 */
import type { EvvEvent, EvvVisit } from "@/db/schema";
import { inMiwsTable, isDhsEditAction, isDhsEditReason } from "../dhs-codes";
import { toOutbound, validateOutbound, type AcknowledgmentResult, type EvvAggregatorAdapter, type ExternalRecord, type HealthResult, type NormalizedRejection, type Operation, type OutboundAddress, type OutboundCall, type OutboundCaregiver, type OutboundProvider, type OutboundVisit, type RejectionCategory, type SubmissionOutcome } from "./types";

export const HHAX_BASE_URLS = { sandbox: "https://implementation.hhaexchange.com", production: "https://cloud.hhaexchange.com" } as const;
/** The specification: "Required timezone: US/Central". Times themselves go in UTC. */
export const HHAX_TIMEZONE = "US/Central";
/** Spec: maximum five calls per second per consumer. */
const MIN_SPACING_MS = 200;

export interface HhaxConfig {
  environment: "sandbox" | "production" | "off";
  baseUrl: string | null;
  apiVersion: string;
  clientId: string | null;
  /** Issued by HHAX at API onboarding. Never logged, never in source. */
  secret: string | null;
  scope: string | null;
  timeoutMs: number;
  /** Feature flag: nothing is transmitted unless this is true. */
  submissionEnabled: boolean;
}

/** Reads the configuration from the environment. The base URL follows the environment unless overridden. */
export function hhaxConfigFromEnv(env: NodeJS.ProcessEnv = process.env): HhaxConfig {
  const e = (env.HHAX_ENVIRONMENT ?? "off").toLowerCase();
  const environment = e === "sandbox" || e === "production" ? e : "off";
  return {
    environment,
    baseUrl: env.HHAX_BASE_URL?.trim() || (environment === "off" ? null : HHAX_BASE_URLS[environment]),
    apiVersion: env.HHAX_API_VERSION?.trim() || "v1",
    clientId: env.HHAX_CLIENT_ID?.trim() || null,
    secret: env.HHAX_CLIENT_SECRET?.trim() || null,
    scope: env.HHAX_SCOPE?.trim() || null,
    timeoutMs: Number(env.HHAX_TIMEOUT_MS) > 0 ? Number(env.HHAX_TIMEOUT_MS) : 15_000,
    submissionEnabled: env.EVV_SUBMISSION_ENABLED === "1",
  };
}

export function hhaxConfigProblems(c: HhaxConfig): string[] {
  const problems: string[] = [];
  if (c.environment === "off") problems.push("HHAX_ENVIRONMENT is off (set sandbox or production)");
  if (!c.baseUrl) problems.push("HHAX base URL unknown");
  if (!c.clientId) problems.push("HHAX_CLIENT_ID missing (issued by HHAX after the API onboarding ticket)");
  if (!c.secret) problems.push("HHAX_CLIENT_SECRET missing (issued by HHAX)");
  if (!c.scope) problems.push("HHAX_SCOPE missing (issued by HHAX)");
  if (!c.submissionEnabled) problems.push("EVV_SUBMISSION_ENABLED is not 1");
  return problems;
}

/* ---------------------------------------------------------------- transport */

export interface HttpResult { status: number; body: unknown }
export interface HttpRequest { method: "GET" | "POST" | "PUT" | "DELETE"; path: string; json?: unknown; form?: Record<string, string>; bearer?: string; timeoutMs: number }

/** The one HTTP boundary. Typed and mockable; never logs bodies (they carry PHI). */
export interface HhaxTransport { send(req: HttpRequest): Promise<HttpResult> }

export class FetchHhaxTransport implements HhaxTransport {
  constructor(private baseUrl: string) {}
  async send(req: HttpRequest): Promise<HttpResult> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), req.timeoutMs);
    try {
      const headers: Record<string, string> = { accept: "application/json" };
      let body: string | undefined;
      if (req.form) { headers["content-type"] = "application/x-www-form-urlencoded"; body = new URLSearchParams(req.form).toString(); }
      else if (req.json !== undefined) { headers["content-type"] = "application/json"; body = JSON.stringify(req.json); }
      if (req.bearer) headers.authorization = `Bearer ${req.bearer}`;
      const res = await fetch(new URL(req.path, this.baseUrl), { method: req.method, headers, body, signal: ctl.signal });
      const text = await res.text();
      let parsed: unknown = text;
      try { parsed = text ? JSON.parse(text) : null; } catch { /* keep text */ }
      return { status: res.status, body: parsed };
    } finally { clearTimeout(timer); }
  }
}

/** Shared across adapter instances in one process: the limit is per consumer, not per object. */
let nextSlot = 0;
async function throttle(sleep: (ms: number) => Promise<void>, now: () => number): Promise<void> {
  const t = now();
  const at = Math.max(t, nextSlot);
  nextSlot = at + MIN_SPACING_MS;
  if (at > t) await sleep(at - t);
}

/* ---------------------------------------------------------------- payloads */

const hhaxTime = (iso: string | null) => (iso ? iso.slice(0, 16) : null); // YYYY-MM-DDThh:mm, UTC
const round6 = (n: number | null) => (n == null ? null : Math.round(n * 1e6) / 1e6);
const zip = (z: string | null | undefined) => (z ?? "").replace(/\D/g, "");

function address(a: OutboundAddress | null) {
  return { addressLine1: a?.line1 ?? null, addressLine2: a?.line2 || null, city: a?.city ?? null, state: (a?.state ?? "").toUpperCase().slice(0, 2) || null, zipcode: zip(a?.zip) || null };
}

const CALL_TYPE: Record<OutboundCall["method"], string> = { mobile: "Mobile", ivr: "Telephony", fob: "FOB" };

function call(c: OutboundCall, p: OutboundVisit, end: "in" | "out") {
  const x = p.extras!;
  return {
    callDateTime: hhaxTime(c.atUtc),
    callType: CALL_TYPE[c.method],
    ...(c.method === "mobile" ? { callLatitude: round6(c.lat), callLongitude: round6(c.lng) } : {}),
    ...(c.method === "ivr" ? { originatingPhoneNumber: c.phone } : {}),
    ...(x.locationType ? { LocationType: x.locationType } : {}),
    serviceAddress: address(x.serviceAddress),
    ...(end === "out" && x.performedTasks.length ? { performedTasks: x.performedTasks.map((code) => ({ code })) } : {}),
  };
}

/** The HHAX Visit record (Appendix D `Visit` schema) for one canonical visit. Pure. */
export function toHhaxVisit(p: OutboundVisit) {
  const x = p.extras;
  if (!x) throw new Error("HHAX payload needs the outbound extras.");
  const evv = x.clockIn ? { clockIn: call(x.clockIn, p, "in"), ...(x.clockOut ? { clockOut: call(x.clockOut, p, "out") } : {}) } : undefined;
  return {
    providerTaxId: p.provider.taxId.replace(/\D/g, ""),
    office: { qualifier: x.office.qualifier, identifier: x.office.identifier },
    member: { qualifier: "MedicaidID", identifier: p.member.memberId },
    caregiver: { qualifier: "ExternalID", identifier: x.caregiverExternalId },
    residingCaregiver: x.residingCaregiver ? "Yes" : "No",
    payerId: x.payerExternalId,
    externalVisitId: x.externalVisitId,
    evvmsid: x.externalEvvmsid,
    procedureCode: p.service.code.toUpperCase(),
    procedureModifierCode: p.service.modifiers.map((m) => m.toUpperCase()),
    timezone: HHAX_TIMEZONE,
    scheduleStartTime: hhaxTime(x.scheduleStartUtc),
    scheduleEndTime: hhaxTime(x.scheduleEndUtc),
    visitStartDateTime: hhaxTime(x.visitStartUtc),
    visitEndDateTime: hhaxTime(x.visitEndUtc),
    ...(evv ? { evv } : {}),
    ...(x.edit ? { editVisit: { edited: true, reasonCode: x.edit.reasonCode, actionCode: x.edit.actionCode, notes: x.edit.notes ?? "" } } : {}),
    ...(x.billing ? { billing: { externalInvoiceNumber: x.billing.invoiceNumber, totalBilledAmount: x.billing.totalBilledAmount, totalUnitsBilled: x.billing.totalUnitsBilled, contractRate: x.billing.contractRate, diagnosisCodes: x.billing.diagnosisCodes } } : {}),
  };
}

/**
 * The HHAX Caregiver record. SSN and hire date are the literal defaults the specification tells
 * vendors to send ("should only send a default value of '999999999'"; hire date "should default to
 * sending 1900-01-02"): EVVora never sends a caregiver's real SSN anywhere.
 */
export function toHhaxCaregiver(c: OutboundCaregiver) {
  return {
    providerTaxId: c.providerTaxId,
    qualifier: "ExternalID",
    externalID: c.externalId,
    ssn: "999999999",
    dateOfBirth: c.dateOfBirth,
    lastName: c.lastName.slice(0, 30),
    firstName: c.firstName.slice(0, 30),
    gender: c.gender,
    email: c.email ?? "",
    phoneNumber: c.phone ?? "",
    type: "Both",
    stateRegistrationID: c.umpi ?? "",
    professionalLicenseNumber: c.umpi ?? "999999999999",
    hireDate: "1900-01-02",
    address: address(c.address),
  };
}

/** Local mirror of the Appendix E rules, so a caregiver HHAX would reject is caught here first. */
export function validateHhaxCaregiver(c: OutboundCaregiver): string[] {
  const e: string[] = [];
  if (!/^\d{9}$/.test(c.providerTaxId)) e.push("102004 provider tax ID must be 9 digits");
  if (!c.externalId || c.externalId.length > 20) e.push("102029 external ID must be 1–20 characters");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.dateOfBirth)) e.push("102010 date of birth missing");
  if (!c.firstName.trim()) e.push("102013 first name missing");
  if (!c.lastName.trim()) e.push("102012 last name missing");
  if (!c.address.state || c.address.state.length !== 2) e.push("102023 caregiver address state missing");
  const z = zip(c.address.zip);
  if (z.length !== 5 && z.length !== 9) e.push("102025 caregiver ZIP must be 5 or 9 digits");
  return e;
}

/* ---------------------------------------------------------------- responses */

/** Every Appendix E/F code mentioned anywhere in a response body. */
export function hhaxCodesIn(body: unknown): string[] {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? "");
  return [...new Set(text.match(/\b10[12]\d{3}\b/g) ?? [])];
}

/** Codes that are about the integration's own setup rather than the visit's data. */
const CONFIG_CODES = new Set(["101001", "101002", "101003", "101004", "101005", "101006", "101007", "101008", "101009", "101025", "101026", "101027", "101028", "101089", "101090", "102001", "102002", "102003", "102004", "102026", "102027"]);
const NOT_FOUND_CODES = new Set(["101030", "101031", "101032", "101033"]);
const TRANSIENT_CODES = new Set(["101999", "102999"]);

function categoryFor(codes: string[], status: number): { category: RejectionCategory; retryable: boolean } {
  if (codes.some((c) => TRANSIENT_CODES.has(c))) return { category: "transient", retryable: true };
  if (codes.some((c) => CONFIG_CODES.has(c))) return { category: "configuration", retryable: false };
  if (codes.some((c) => NOT_FOUND_CODES.has(c))) return { category: "not_found", retryable: false };
  if (codes.length) return { category: "validation", retryable: false };
  if (status === 401 || status === 403) return { category: "authentication", retryable: false };
  if (status === 404) return { category: "not_found", retryable: false };
  if (status === 408 || status === 429 || status >= 500 || status === 0) return { category: "transient", retryable: true };
  if (status >= 400) return { category: "validation", retryable: false };
  return { category: "unknown", retryable: false };
}

/** A human-readable message from a ProblemDetails or error list, without echoing the whole body. */
function messageFrom(body: unknown): string {
  if (typeof body === "string") return body.slice(0, 500);
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    const parts: string[] = [];
    for (const k of ["title", "detail", "message", "errorMessage"]) if (typeof o[k] === "string") parts.push(o[k] as string);
    const errs = o.errors ?? o.Errors ?? o.errorDetails;
    if (errs) parts.push(JSON.stringify(errs).slice(0, 400));
    if (parts.length) return parts.join(" · ").slice(0, 500);
  }
  return "Rejected by HHAeXchange";
}

/** The transaction id from a receipt: a bare string, or the first field whose name says so. */
export function transactionIdFrom(body: unknown): string | null {
  if (typeof body === "string") { const s = body.trim().replace(/^"|"$/g, ""); return s && s.length <= 100 ? s : null; }
  if (body && typeof body === "object") {
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) if (/transaction.?id/i.test(k) && (typeof v === "string" || typeof v === "number")) return String(v);
    for (const v of Object.values(body as Record<string, unknown>)) { const nested = v && typeof v === "object" ? transactionIdFrom(v) : null; if (nested) return nested; }
  }
  return null;
}

function walk(o: unknown, visit: (k: string, v: unknown) => void) {
  if (Array.isArray(o)) { for (const x of o) walk(x, visit); return; }
  if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { visit(k, v); walk(v, visit); }
}

/** Reads a transaction-status body. Tolerant of shape; unrecognised means pending. */
export function readTransaction(status: number, body: unknown): AcknowledgmentResult {
  if (status === 204 || body == null || body === "") return { kind: "pending" };
  if (status === 404) return { kind: "pending" };
  if (status >= 400) return { kind: "unknown", message: `Transaction lookup failed: HTTP ${status}` };
  const statuses: string[] = []; let evvmsid: string | null = null;
  walk(body, (k, v) => {
    if (/^(status|transactionstatus|recordstatus|result)$/i.test(k) && typeof v === "string") statuses.push(v);
    if (/^evvmsid$/i.test(k) && typeof v === "string" && v) evvmsid ??= v;
  });
  const codes = hhaxCodesIn(body);
  const failed = statuses.some((s) => /fail|reject|error|invalid|denied/i.test(s));
  if (failed || codes.length) {
    const c = categoryFor(codes, 400);
    return { kind: "rejected", rejection: { category: c.category, vendorCode: codes[0] ?? null, message: messageFrom(body), retryable: c.retryable } };
  }
  if (statuses.some((s) => /success|accept|complete|processed|created|updated|deleted/i.test(s))) return { kind: "accepted", warnings: [], aggregatorVisitId: evvmsid };
  return { kind: "pending" };
}

/* ---------------------------------------------------------------- adapter */

export class MinnesotaHhaxAdapter implements EvvAggregatorAdapter {
  readonly key = "hhax_mn";
  readonly environment: "sandbox" | "production";
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private config: HhaxConfig,
    private transport: HhaxTransport | null = null,
    private clock: { now: () => number; sleep: (ms: number) => Promise<void> } = { now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) },
  ) {
    this.environment = config.environment === "production" ? "production" : "sandbox";
    if (!this.transport && config.baseUrl) this.transport = new FetchHhaxTransport(config.baseUrl);
  }

  transform(visit: EvvVisit, events: { clockIn: EvvEvent | null; clockOut: EvvEvent | null }, provider: OutboundProvider, operation: Operation): OutboundVisit {
    return toOutbound(visit, events, provider, operation);
  }

  /** The canonical checks plus a local mirror of the Appendix F rules HHAX would reject on. */
  validate(p: OutboundVisit) {
    const base = validateOutbound(p);
    // A manual confirmation has no device location; HHAX accepts it with an edit reason, so the
    // canonical "location record missing" errors do not apply here.
    const errors = base.errors.filter((e) => !/location record missing/.test(e));
    const x = p.extras;
    if (!x) return { ok: false, errors: [...errors, "outbound extras missing"] };
    if (p.operation === "void") return { ok: errors.length === 0, errors };
    const now = Date.now();
    if (!/^\d{9}$/.test(p.provider.taxId.replace(/\D/g, ""))) errors.push("101004 provider tax ID must be 9 digits");
    if (!x.office.identifier) errors.push("101005 office identifier missing (Settings → EVV)");
    if (!p.member.memberId || p.member.memberId.length > 50) errors.push("101010 member PMI missing");
    if (!x.payerExternalId) errors.push("101025 payer has no HHAX payer ID (Settings → EVV → payers; Waiver Services FFS is MIWS)");
    if (p.service.modifiers.length > 4 || p.service.modifiers.some((m) => m.length !== 2)) errors.push("101039 at most four two-character modifiers");
    if (x.payerExternalId === "MIWS" && !inMiwsTable(p.service.code, p.service.modifiers)) errors.push(`101035 ${p.service.code}${p.service.modifiers.length ? ` ${p.service.modifiers.join(" ")}` : ""} is not in the HHAX Waiver Services procedure code table`);
    if (!x.scheduleStartUtc || !x.scheduleEndUtc) errors.push("101042 schedule times missing");
    if (x.visitStartUtc && Date.parse(x.visitStartUtc) > now) errors.push("101047 visit start is in the future");
    if (x.visitEndUtc && Date.parse(x.visitEndUtc) > now) errors.push("101049 visit end is in the future");
    if (x.visitStartUtc && x.visitEndUtc) {
      const minutes = (Date.parse(x.visitEndUtc) - Date.parse(x.visitStartUtc)) / 60_000;
      if (minutes <= 0) errors.push("101050 visit end must be after visit start");
      if (minutes > 24 * 60) errors.push("101044 visit longer than 24 hours (the copied schedule would exceed HHAX's limit)");
    }
    if (x.clockIn) {
      const a = x.serviceAddress;
      if (!a?.line1) errors.push("101064 client service address line 1 missing");
      if (!a?.city) errors.push("101065 client service address city missing");
      if (!a?.state) errors.push("101066 client service address state missing");
      const z = zip(a?.zip);
      if (z.length !== 5 && z.length !== 9) errors.push("101067 client service address ZIP must be 5 or 9 digits");
      for (const c of [x.clockIn, x.clockOut]) if (c?.method === "mobile" && (c.lat == null || c.lng == null)) errors.push("101057 mobile call without coordinates");
    }
    if (x.clockOut && !x.clockIn) errors.push("101053 clock-out call without a clock-in call");
    const manual = !x.clockIn || !x.clockOut;
    if (manual && !x.edit) errors.push("101078 manually confirmed visit needs a DHS edit reason");
    if (x.edit && !isDhsEditReason(x.edit.reasonCode)) errors.push(`101079 ${x.edit.reasonCode} is not a DHS edit reason code`);
    if (x.edit && !isDhsEditAction(x.edit.actionCode)) errors.push(`101082 ${x.edit.actionCode} is not a DHS edit action code`);
    if (x.billing && (!x.billing.diagnosisCodes.length || !x.billing.contractRate)) errors.push("101084 billing needs a contract rate and at least one diagnosis code");
    return { ok: errors.length === 0, errors };
  }

  private problems(): string[] { return hhaxConfigProblems(this.config); }

  private async accessToken(force = false): Promise<string> {
    const now = this.clock.now();
    if (!force && this.token && this.token.expiresAt > now) return this.token.value;
    await throttle(this.clock.sleep, this.clock.now);
    const res = await this.transport!.send({ method: "POST", path: "/identity/connect/token", form: { grant_type: "client_credentials", client_id: this.config.clientId!, client_secret: this.config.secret!, scope: this.config.scope! }, timeoutMs: this.config.timeoutMs });
    const b = res.body as { access_token?: string; expires_in?: number } | null;
    if (res.status < 200 || res.status >= 300 || !b?.access_token) throw Object.assign(new Error(`HHAX token request failed: HTTP ${res.status}`), { status: res.status });
    // Thirty minutes per the specification; refresh a minute early so a call never carries a dying token.
    const life = Math.min(Number(b.expires_in) || 1800, 1800);
    this.token = { value: b.access_token, expiresAt: now + (life - 60) * 1000 };
    return this.token.value;
  }

  /** One authenticated call: throttled, and retried once with a fresh token on 401. */
  private async call(method: HttpRequest["method"], path: string, json?: unknown): Promise<HttpResult> {
    const full = `/api/${this.config.apiVersion}${path}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      const bearer = await this.accessToken(attempt > 0);
      await throttle(this.clock.sleep, this.clock.now);
      const res = await this.transport!.send({ method, path: full, json, bearer, timeoutMs: this.config.timeoutMs });
      if (res.status !== 401) return res;
    }
    return { status: 401, body: "Unauthorized after refreshing the token" };
  }

  private blocked(): SubmissionOutcome | null {
    const problems = this.problems();
    if (problems.length) return { kind: "blocked", reason: `HHAX submission is not configured: ${problems.join("; ")}` };
    if (!this.transport) return { kind: "blocked", reason: "HHAX transport unavailable." };
    return null;
  }

  private async send(method: HttpRequest["method"], path: string, json: unknown): Promise<SubmissionOutcome> {
    const blocked = this.blocked();
    if (blocked) return blocked;
    let res: HttpResult;
    try { res = await this.call(method, path, json); }
    catch (e) {
      const status = (e as { status?: number }).status ?? 0;
      // A failed token request (400/401/403) is a credentials problem, not a visit problem.
      const cat = status === 400 || status === 401 || status === 403 ? { category: "authentication" as const, retryable: false } : categoryFor([], status);
      return { kind: "rejected", rejection: { ...cat, vendorCode: status ? String(status) : null, message: e instanceof Error ? e.message : "Transport error" }, transport: status ? `HTTP ${status}` : "network" };
    }
    if (res.status >= 200 && res.status < 300) {
      // Receipt only. The transaction id is how the result is read later.
      return { kind: "pending", externalReferenceId: transactionIdFrom(res.body), transport: `HTTP ${res.status}` };
    }
    return { kind: "rejected", rejection: this.normalizeRejection(res), transport: `HTTP ${res.status}` };
  }

  submit(p: OutboundVisit) { return this.send("POST", "/visits", { visits: [toHhaxVisit(p)] }); }
  update(p: OutboundVisit) { return this.send("PUT", `/visits/${encodeURIComponent(p.extras!.externalEvvmsid)}`, toHhaxVisit(p)); }
  voidVisit(p: OutboundVisit) { return this.send("DELETE", `/visits/${encodeURIComponent(p.extras?.externalEvvmsid ?? `~${p.visitId}`)}`, undefined); }

  async syncCaregiver(c: OutboundCaregiver): Promise<SubmissionOutcome> {
    const blocked = this.blocked();
    if (blocked) return blocked;
    const errors = validateHhaxCaregiver(c);
    if (errors.length) return { kind: "rejected", rejection: { category: "validation", vendorCode: errors[0].slice(0, 6), message: `Caregiver record incomplete: ${errors.join(", ")}`, retryable: false }, transport: "local validation" };
    let res: HttpResult;
    try { res = await this.call("POST", "/caregivers", toHhaxCaregiver(c)); }
    catch (e) { return { kind: "rejected", rejection: { category: "transient", vendorCode: null, message: e instanceof Error ? e.message : "Transport error", retryable: true }, transport: "network" }; }
    if (res.status >= 200 && res.status < 300) return { kind: "accepted", externalReferenceId: transactionIdFrom(res.body) ?? c.externalId, warnings: [], transport: `HTTP ${res.status}` };
    return { kind: "rejected", rejection: this.normalizeRejection(res), transport: `HTTP ${res.status}` };
  }

  async checkAcknowledgment(transactionId: string): Promise<AcknowledgmentResult> {
    if (this.blocked()) return { kind: "unknown", message: "HHAX is not configured." };
    try {
      const res = await this.call("GET", `/visits/transactions/${encodeURIComponent(transactionId)}`);
      return readTransaction(res.status, res.body);
    } catch (e) { return { kind: "unknown", message: e instanceof Error ? e.message : "Transport error" }; }
  }

  /** Appendix E/F codes first, then the HTTP class (Appendix C). */
  normalizeRejection(raw: unknown): NormalizedRejection {
    const r = raw as { status?: number; body?: unknown } | undefined;
    const status = r?.status ?? 0;
    const codes = hhaxCodesIn(r?.body);
    const c = categoryFor(codes, status);
    return { category: c.category, vendorCode: codes[0] ?? (status ? String(status) : null), message: messageFrom(r?.body), retryable: c.retryable };
  }

  /** The specification has no visit lookup beyond transactions; reconciliation goes through those. */
  async reconcile(): Promise<ExternalRecord | null> { return null; }

  async health(): Promise<HealthResult> {
    const problems = this.problems();
    return { ok: problems.length === 0, environment: this.environment, configured: problems.filter((p) => !p.startsWith("EVV_SUBMISSION_ENABLED")).length === 0, submissionEnabled: this.config.submissionEnabled, problems };
  }
}

/** Test hook: forget the shared rate-limit slot. */
export function resetHhaxThrottle() { nextSlot = 0; }
