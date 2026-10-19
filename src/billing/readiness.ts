/**
 * Billing readiness: the rules in `./rules` applied to one note. Pure: the caller loads the facts
 * (`./claims` does it in bulk). Every check names its rule id, its source and where to fix it.
 */
import { check, type Check, type Severity } from "./rules";

export { blocking, warnings, type Check, type RuleSource } from "./rules";

export interface Coverage { id: string; payerId: string | null; payerName: string; waiver: string | null; memberId: string | null; priority: string; startDate: string; endDate: string | null; relationshipToSubscriber: string }

/** What billing reads from the visit's EVV record. Billing never writes EVV state. */
export interface EvvFacts {
  /** Whether the service requires EVV: the EVV visit's own flag, else the DHS rule for the code. */
  required: boolean;
  /** An EVV visit is linked to this note. */
  recorded: boolean;
  compliance: "COMPLIANT" | "NONCOMPLIANT" | "INCOMPLETE" | "EXEMPT_LIVE_IN" | "PENDING_REVIEW" | null;
  submission: string | null;
  openExceptions: number;
  evvVisitId: string | null;
}

/** How hard EVV problems bite. From the payer profile (`evvAggregatorRecord`) and the EVV policy. */
export interface EvvPolicyFacts { aggregator: Severity | "off"; holdNoncompliant: boolean }

export interface ReadinessFacts {
  date: string;
  personId: string;
  visitId: string;
  staffId: string;
  renderingId: string;
  returnedAt: Date | null;
  evv: EvvFacts;
  evvPolicy: EvvPolicyFacts;
  /** Other notes this one cannot coexist with (`findOverlaps`). */
  overlaps: { caregiver: Overlap[]; service: Overlap[] };
  units: number;
  staffSignedAt: Date | null;
  clientSignedAt: Date | null;
  manualEntry: boolean;
  manualEvidenceAt: Date | null;
  pmi: string;
  address: { address1: string | null; city: string | null; zip: string | null };
  diagnoses: string[];
  /** The coverage this date bills to, chosen by `coverageFor`; null when none is in force. */
  coverage: Coverage | null;
  /** The payer that coverage resolves to; null when it cannot be resolved. */
  payerId: string | null;
  serviceCode: string;
  modifiers: string[];
  agreement: { status: string; startDate: string; endDate: string; serviceCode: string; modifiers: string[]; authorizedUnits: number; archivedAt: Date | null };
  /** Units already reserved or billed on this agreement by other notes. */
  unitsUsed: number;
  /** Of `unitsUsed`, units belonging to earlier notes that are not billed yet. */
  unitsPendingEarlier?: number;
}

export interface Overlap { visitId: string; personName: string; at: Date }

/** The primary coverage in force on a date. Secondary and tertiary payers are not billed yet. */
export function coverageFor(date: string, rows: Coverage[]): Coverage | null {
  const live = rows.filter((c) => c.startDate <= date && (!c.endDate || c.endDate >= date));
  return live.find((c) => c.priority === "primary") ?? null;
}

/**
 * Which payer a coverage bills. An explicit link wins. Otherwise waiver coverage (CADI, BI, DD,
 * CAC, CFSS and Elderly Waiver alike) bills DHS fee-for-service: the agency's answer of Oct 19, 2026.
 */
export function resolvePayer(c: Coverage | null, defaultPayerId: string | null): string | null {
  if (!c) return null;
  if (c.payerId) return c.payerId;
  if (c.waiver || /\b(MA|MHCP|DHS)\b|medical assistance|minnesota health care/i.test(c.payerName)) return defaultPayerId;
  return null;
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

const ACCEPTED = new Set(["accepted", "accepted_with_warning"]);
const REJECTED = new Set(["rejected", "correction_required", "permanently_failed"]);
const fmtTime = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d);

export function readiness(f: ReadinessFacts): Check[] {
  const out: Check[] = [];
  const block = (id: Parameters<typeof check>[0], message: string, fix?: string) => out.push(check(id, "block", message, fix));
  const warn = (id: Parameters<typeof check>[0], message: string, fix?: string) => out.push(check(id, "warn", message, fix));
  const person = `/clients/${f.personId}`;
  const note = `?visit=${f.visitId}`;

  if (!f.staffSignedAt) block("caregiver_signature", "Caregiver has not signed", note);
  if (!f.clientSignedAt) block("client_signature", "Not signed by client", note);
  if (f.returnedAt) block("note_returned", "Sent back for correction and not resubmitted", note);
  if (f.manualEntry && !f.manualEvidenceAt) block("manual_evidence", "Manual entry: evidence not confirmed", "/attention");
  if (f.units <= 0) block("units", "No units", note);
  if (!f.renderingId.trim()) block("rendering_id", "The caregiver has no NPI or UMPI on this note", `/staff/${f.staffId}`);
  if (!/^\d{8}$/.test(f.pmi)) block("pmi", "PMI is not 8 digits", `${person}?tab=profile`);
  if (!f.diagnoses.length) block("diagnosis", "No diagnosis on the client's profile", `${person}?tab=profile&section=medical`);
  if (!f.address.address1 || !f.address.city || !f.address.zip) block("client_address", "Client's address is incomplete", `${person}/edit`);

  if (!f.coverage) block("coverage", `No coverage in force on ${f.date}`, `${person}?tab=profile&section=funding`);
  else {
    if (!f.payerId) block("payer", `Coverage "${f.coverage.payerName}" is not linked to a billing payer`, `${person}?tab=profile&section=funding`);
    if (f.coverage.relationshipToSubscriber !== "18") block("subscriber", "Client is not the subscriber; dependent claims are not supported yet", `${person}?tab=profile&section=funding`);
  }

  const ag = f.agreement;
  const agFix = `${person}?tab=overview`;
  if (ag.archivedAt || ag.status !== "active") block("authorization_status", `Authorization is ${ag.archivedAt ? "archived" : ag.status}`, agFix);
  if (f.date < ag.startDate || f.date > ag.endDate) block("authorization_dates", `Date of service is outside the authorization (${ag.startDate} to ${ag.endDate})`, agFix);
  if (f.serviceCode !== ag.serviceCode || !sameSet(f.modifiers, ag.modifiers)) block("authorization_code", `Service ${[f.serviceCode, ...f.modifiers].join(" ")} does not match the authorization (${[ag.serviceCode, ...ag.modifiers].join(" ")})`, agFix);
  const left = ag.authorizedUnits - f.unitsUsed;
  if (f.units > left) {
    const earlier = f.unitsPendingEarlier ? ` after ${f.unitsPendingEarlier} units of earlier notes not billed yet` : "";
    block("authorization_units", left <= 0 ? `Authorization has no units left${earlier}` : `Authorization has ${left} units left${earlier}; this note needs ${f.units}`, agFix);
  }

  for (const o of f.overlaps.caregiver) block("caregiver_overlap", `The caregiver is also on ${o.personName}'s note at ${fmtTime(o.at)}`, `?visit=${o.visitId}`);
  for (const o of f.overlaps.service) block("duplicate_service", `Overlaps another ${f.serviceCode} note for this client at ${fmtTime(o.at)}`, `?visit=${o.visitId}`);

  const e = f.evv;
  const evvFix = e.evvVisitId ? `/evv?tab=queue&visit=${e.evvVisitId}` : note;
  const agg = f.evvPolicy.aggregator;
  if (e.required && agg !== "off") {
    const add = agg === "block" ? block : warn;
    if (!e.recorded) add("evv_no_record", "This service requires EVV and no EVV visit is linked", note);
    else if (e.submission && REJECTED.has(e.submission)) add("evv_rejected", "The aggregator rejected the EVV visit", evvFix);
    else if (!e.submission || !ACCEPTED.has(e.submission)) add("evv_not_accepted", e.submission ? `EVV is ${e.submission.replace(/_/g, " ")}, not accepted yet` : "EVV has not been sent to the aggregator yet", evvFix);
  }
  if (e.recorded) {
    if (e.compliance === "NONCOMPLIANT") (f.evvPolicy.holdNoncompliant ? block : warn)("evv_noncompliant", "EVV visit is noncompliant", evvFix);
    else if (e.compliance === "INCOMPLETE" || e.compliance === "PENDING_REVIEW") warn("evv_review", e.compliance === "INCOMPLETE" ? "EVV visit is incomplete" : "EVV visit is waiting for review", evvFix);
    if (e.openExceptions > 0) warn("evv_exceptions", `${e.openExceptions} open EVV exception${e.openExceptions === 1 ? "" : "s"}`, evvFix);
  }
  return out;
}

/**
 * Pairs of notes that cannot both be billed. A caregiver overlaps when two of their visits share
 * minutes and neither is shared care; a service is duplicated when one client has two notes with
 * the same code sharing minutes. Touching end-to-start is not an overlap. Pure.
 */
export interface Span { visitId: string; personId: string; personName: string; staffId: string; serviceCode: string; start: Date; end: Date | null; sharedCare: boolean }

export function findOverlaps(spans: Span[]): Map<string, { caregiver: Overlap[]; service: Overlap[] }> {
  const out = new Map<string, { caregiver: Overlap[]; service: Overlap[] }>();
  const get = (id: string) => out.get(id) ?? out.set(id, { caregiver: [], service: [] }).get(id)!;
  const live = spans.filter((s) => s.end && s.end > s.start).sort((a, b) => +a.start - +b.start);
  for (let i = 0; i < live.length; i++) {
    const a = live[i];
    for (let j = i + 1; j < live.length && live[j].start < a.end!; j++) {
      const b = live[j];
      if (a.staffId === b.staffId && !(a.sharedCare && b.sharedCare)) {
        get(a.visitId).caregiver.push({ visitId: b.visitId, personName: b.personName, at: b.start });
        get(b.visitId).caregiver.push({ visitId: a.visitId, personName: a.personName, at: a.start });
      }
      if (a.personId === b.personId && a.serviceCode === b.serviceCode) {
        get(a.visitId).service.push({ visitId: b.visitId, personName: b.personName, at: b.start });
        get(b.visitId).service.push({ visitId: a.visitId, personName: a.personName, at: a.start });
      }
    }
  }
  return out;
}

/** Agency-level readiness: the billing provider and payer every claim depends on. */
export interface SetupFacts {
  provider: { taxId: string | null; npi: string | null; umpi: string | null; address1: string | null; city: string | null; zip: string | null } | null;
  payer: { name: string; clearinghousePayerId: string | null; profileVerified: boolean } | null;
}

export function setupReadiness(f: SetupFacts): Check[] {
  const out: Check[] = [];
  const p = f.provider;
  if (!p?.taxId) out.push(check("provider_tax_id", "block", "The billing provider has no tax ID", "/settings"));
  if (!p?.npi && !p?.umpi) out.push(check("provider_id", "block", "The billing provider has no NPI or UMPI", "/settings"));
  if (!p?.address1 || !p?.city || !p?.zip) out.push(check("provider_address", "block", "The billing provider's address is incomplete", "/settings"));
  if (f.payer && !f.payer.clearinghousePayerId) out.push(check("payer_route", "warn", `Waystar has not supplied its payer ID for ${f.payer.name}. Sending through Waystar stays off until it does.`));
  if (f.payer && !f.payer.profileVerified) out.push(check("profile_unverified", "warn", `The rules for ${f.payer.name} have not been checked against the companion guides yet.`));
  return out;
}

