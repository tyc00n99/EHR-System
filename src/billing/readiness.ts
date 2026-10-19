/**
 * Billing readiness as traceable rules. Each check has an id, whether it blocks, where the rule
 * comes from, and a sentence the office can act on. Pure: the caller loads the facts.
 *
 * `source` says how much weight a rule carries:
 *  - "policy": the agency's own decision (e.g. the client co-signs before a note is billed).
 *  - "standard": required by the 837P as we read it; unverified until the TR3 and companion
 *    guides are reconciled (see docs/waystar-integration-plan.md).
 *  - "authorization": the service agreement on file.
 */
export type RuleSource = "policy" | "standard" | "authorization" | "coverage";

export interface Check { id: string; severity: "block" | "warn"; source: RuleSource; message: string; fix?: string }

export interface Coverage { id: string; payerId: string | null; payerName: string; waiver: string | null; memberId: string | null; priority: string; startDate: string; endDate: string | null; relationshipToSubscriber: string }

export interface ReadinessFacts {
  date: string;
  personId: string;
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
}

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

export function readiness(f: ReadinessFacts): Check[] {
  const out: Check[] = [];
  const block = (id: string, source: RuleSource, message: string, fix?: string) => out.push({ id, severity: "block", source, message, fix });
  const person = `/clients/${f.personId}`;

  if (!f.staffSignedAt) block("caregiver_signature", "policy", "Caregiver has not signed");
  if (!f.clientSignedAt) block("client_signature", "policy", "Not signed by client");
  if (f.manualEntry && !f.manualEvidenceAt) block("manual_evidence", "policy", "Manual entry: evidence not confirmed", "/attention");
  if (f.units <= 0) block("units", "standard", "No units");
  if (!/^\d{8}$/.test(f.pmi)) block("pmi", "standard", "PMI is not 8 digits", `${person}?tab=profile`);
  if (!f.diagnoses.length) block("diagnosis", "standard", "No diagnosis on the client's profile", `${person}?tab=profile&section=medical`);
  if (!f.address.address1 || !f.address.city || !f.address.zip) block("client_address", "standard", "Client's address is incomplete", `${person}/edit`);

  if (!f.coverage) block("coverage", "coverage", `No coverage in force on ${f.date}`, `${person}?tab=profile&section=funding`);
  else {
    if (!f.payerId) block("payer", "coverage", `Coverage "${f.coverage.payerName}" is not linked to a billing payer`, `${person}?tab=profile&section=funding`);
    if (f.coverage.relationshipToSubscriber !== "18") block("subscriber", "coverage", "Client is not the subscriber; dependent claims are not supported yet", `${person}?tab=profile&section=funding`);
  }

  const ag = f.agreement;
  const agFix = `${person}?tab=overview`;
  if (ag.archivedAt || ag.status !== "active") block("authorization_status", "authorization", `Authorization is ${ag.archivedAt ? "archived" : ag.status}`, agFix);
  if (f.date < ag.startDate || f.date > ag.endDate) block("authorization_dates", "authorization", `Date of service is outside the authorization (${ag.startDate} to ${ag.endDate})`, agFix);
  if (f.serviceCode !== ag.serviceCode || !sameSet(f.modifiers, ag.modifiers)) block("authorization_code", "authorization", `Service ${[f.serviceCode, ...f.modifiers].join(" ")} does not match the authorization (${[ag.serviceCode, ...ag.modifiers].join(" ")})`, agFix);
  const left = ag.authorizedUnits - f.unitsUsed;
  if (f.units > left) block("authorization_units", "authorization", left <= 0 ? "Authorization has no units left" : `Authorization has ${left} units left; this note needs ${f.units}`, agFix);
  return out;
}

export const blocking = (checks: Check[]) => checks.filter((c) => c.severity === "block");
