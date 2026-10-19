/**
 * The billing rule catalog: every reason a note can be held or flagged, in one place, so the
 * billing screen, the tests and the plan all speak about the same rule by the same id.
 *
 * `source` says where a rule's authority comes from:
 *  - "policy": the agency's own decision (e.g. the client co-signs before a note is billed).
 *  - "standard": required by the 837P as we read it; unverified until the TR3 and companion
 *    guides are reconciled (docs/waystar-integration-plan.md §3, §4.3).
 *  - "authorization": the service agreement on file.
 *  - "coverage": the client's funding source and the payer it resolves to.
 *  - "evv": the visit's EVV record. Severity follows the payer profile and the EVV policy.
 *  - "integrity": two records that cannot both be true (the same caregiver in two places).
 *  - "setup": agency-level configuration, not a single note.
 *
 * `basis` is what the rule rests on, in plain words, and `verified` says whether that basis has
 * been checked against a published document we hold. Client-safe: no server imports.
 */
export type RuleSource = "policy" | "standard" | "authorization" | "coverage" | "evv" | "integrity" | "setup";
export type Severity = "block" | "warn";

export interface RuleSpec { label: string; source: RuleSource; basis: string; verified: boolean; fixLabel: string }

export const RULES = {
  caregiver_signature: { label: "Caregiver has not signed", source: "policy", basis: "Agency policy: a note is billed only after the caregiver signs it.", verified: true, fixLabel: "Open the note" },
  client_signature: { label: "Client has not signed", source: "policy", basis: "Agency policy (Oct 19, 2026): a missing client co-signature holds billing. DHS's Fall 2026 EVV notice says signatures are not an EVV requirement.", verified: true, fixLabel: "Open the note" },
  manual_evidence: { label: "Manual entry without evidence", source: "policy", basis: "Agency policy: a hand-entered visit is held until its evidence is confirmed.", verified: true, fixLabel: "Review queue" },
  note_returned: { label: "Note sent back for correction", source: "policy", basis: "Agency policy: a note a supervisor returned is not billed until it is resubmitted.", verified: true, fixLabel: "Open the note" },
  units: { label: "No units", source: "standard", basis: "An 837P service line needs a quantity (SV104).", verified: false, fixLabel: "Open the note" },
  rendering_id: { label: "No rendering provider ID", source: "standard", basis: "Each line names the caregiver who rendered it by NPI or UMPI (loop 2420A as we read the 837P).", verified: false, fixLabel: "Open the team member" },
  pmi: { label: "PMI is not 8 digits", source: "standard", basis: "MHCP identifies the member by an 8-digit PMI.", verified: false, fixLabel: "Open the profile" },
  diagnosis: { label: "No diagnosis", source: "standard", basis: "A professional claim carries at least one ICD-10 code (HI segment).", verified: false, fixLabel: "Add a diagnosis" },
  client_address: { label: "Client's address is incomplete", source: "standard", basis: "The subscriber address (N3/N4) is required on the 837P as we read it.", verified: false, fixLabel: "Edit the client" },
  coverage: { label: "No coverage on the date of service", source: "coverage", basis: "A claim needs a primary payer in force on the date of service.", verified: true, fixLabel: "Add a funding source" },
  payer: { label: "Coverage not linked to a payer", source: "coverage", basis: "The funding source must resolve to a payer EVVora can bill.", verified: true, fixLabel: "Fix the funding source" },
  subscriber: { label: "Client is not the subscriber", source: "coverage", basis: "MHCP members are their own subscriber; dependent claims are not supported yet.", verified: false, fixLabel: "Fix the funding source" },
  authorization_status: { label: "Authorization not active", source: "authorization", basis: "Only an active service agreement can be billed.", verified: true, fixLabel: "Open the authorization" },
  authorization_dates: { label: "Outside the authorization dates", source: "authorization", basis: "The date of service must fall inside the service agreement.", verified: true, fixLabel: "Open the authorization" },
  authorization_code: { label: "Service does not match the authorization", source: "authorization", basis: "The code and modifiers billed must be the ones authorized.", verified: true, fixLabel: "Open the authorization" },
  authorization_units: { label: "Not enough authorized units", source: "authorization", basis: "Units are counted in date order against the agreement: billed, reserved, earlier unbilled notes, then this one.", verified: true, fixLabel: "Open the authorization" },
  caregiver_overlap: { label: "Caregiver in two visits at once", source: "integrity", basis: "One caregiver cannot render two visits in the same minutes unless both are recorded as shared care.", verified: true, fixLabel: "Open the note" },
  duplicate_service: { label: "Same service billed twice", source: "integrity", basis: "Two notes for the same client and service code overlap in time.", verified: true, fixLabel: "Open the note" },
  evv_no_record: { label: "No EVV record", source: "evv", basis: "The service requires EVV (DHS list in evv_service_rules) but no EVV visit is linked. DHS announced prepayment validation for Q4 2026: no aggregator record, no payment. Match rules are not published yet.", verified: false, fixLabel: "Open the note" },
  evv_not_accepted: { label: "EVV not accepted yet", source: "evv", basis: "The aggregator has not accepted this visit. Under DHS prepayment validation (announced Q4 2026) a claim without an aggregator record is not paid.", verified: false, fixLabel: "Open in EVV" },
  evv_rejected: { label: "EVV rejected by the aggregator", source: "evv", basis: "The aggregator rejected the visit; it needs a correction and resubmission.", verified: true, fixLabel: "Open in EVV" },
  evv_noncompliant: { label: "EVV noncompliant", source: "evv", basis: "The compliance engine found the visit noncompliant. Holds only when the EVV policy says to (Settings → EVV); otherwise a warning.", verified: true, fixLabel: "Open in EVV" },
  evv_review: { label: "EVV still under review", source: "evv", basis: "The EVV visit is incomplete or waiting for a reviewer.", verified: true, fixLabel: "Open in EVV" },
  evv_exceptions: { label: "Open EVV exceptions", source: "evv", basis: "The EVV visit has exceptions nobody has resolved.", verified: true, fixLabel: "Open in EVV" },
  provider_tax_id: { label: "Billing provider has no tax ID", source: "setup", basis: "The billing provider is identified by its TIN on the 837P.", verified: false, fixLabel: "Settings" },
  provider_id: { label: "Billing provider has no NPI or UMPI", source: "setup", basis: "The billing provider needs an NPI, or a UMPI as an atypical provider.", verified: false, fixLabel: "Settings" },
  provider_address: { label: "Billing provider address incomplete", source: "setup", basis: "The billing provider address (N3/N4) is required on the 837P.", verified: false, fixLabel: "Settings" },
  payer_route: { label: "Waystar payer ID unknown", source: "setup", basis: "Waystar has not supplied its payer ID for Minnesota DHS; EVVora never guesses one.", verified: true, fixLabel: "See the plan" },
  profile_unverified: { label: "Payer rules not verified", source: "setup", basis: "The payer profile has not been checked against the TR3, the Minnesota companion guide and Waystar's guide.", verified: true, fixLabel: "See the plan" },
} as const satisfies Record<string, RuleSpec>;

export type RuleId = keyof typeof RULES;

export interface Check { id: RuleId; severity: Severity; source: RuleSource; message: string; fix?: string; fixLabel?: string }

export function check(id: RuleId, severity: Severity, message: string, fix?: string): Check {
  const r: RuleSpec = RULES[id];
  return { id, severity, source: r.source, message, fix, fixLabel: fix ? r.fixLabel : undefined };
}

export const blocking = (checks: Check[]) => checks.filter((c) => c.severity === "block");
export const warnings = (checks: Check[]) => checks.filter((c) => c.severity === "warn");

export const SOURCE_LABEL: Record<RuleSource, string> = {
  policy: "Agency policy", standard: "837P", authorization: "Authorization", coverage: "Coverage", evv: "EVV", integrity: "Conflict", setup: "Setup",
};
