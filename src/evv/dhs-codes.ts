/**
 * Minnesota DHS EVV code tables, from Appendix B of the HHAeXchange *Minnesota DHS EVV Data
 * Aggregator Specification* (revision 10/28/2024). These are the codes the aggregator accepts in
 * `editVisit` and `missedVisit`; anything else is rejected (101079/101082, 101073/101076).
 *
 * The business requirements (item 8) say a third-party system must gather the DHS reason code for
 * every manual entry and every edit. EVVora's own correction reasons stay (they are what a reviewer
 * thinks in); each maps to a DHS code by default, and a reviewer can pick the DHS code directly.
 * Client-safe: no server imports.
 */
import type { CorrectionReason } from "./types";

/** Visit Edit Reason Codes (editVisit.reasonCode). */
export const DHS_EDIT_REASONS = {
  "200": "Phone number did not link to the member",
  "201": "Member won't let attendant use phone",
  "202": "Member doesn't have a phone in home",
  "203": "Phone in use by member or someone in the member's home",
  "204": "Member received services outside of the home",
  "205": "Member's phone line not working",
  "206": "Member requested to change or cancel the visit, or services suspended",
  "207": "Address did not link to the member (GPS)",
  "208": "Attendant failed to call in",
  "209": "Attendant failed to call out",
  "210": "Attendant failed to call in and out",
  "211": "Attendant called in or out early or late",
  "212": "Attendant ID does not match the shift, or task does not match the plan of care",
  "213": "Attendant entered invalid fixed location device code(s)",
  "214": "Attendant failed to report to member's home",
  "215": "Fixed location device on order or pending placement",
  "216": "Fixed location device malfunctioned",
  "217": "Attendant unable to use mobile device",
  "218": "Attendant unable to connect to internet or EVV system down",
  "219": "Data entry error",
  "220": "Agency unable to provide replacement coverage",
  "221": "Timesheet received",
  "222": "Other",
} as const;
export type DhsEditReason = keyof typeof DHS_EDIT_REASONS;

/** Visit Edit Action Taken (editVisit.actionCode). There is no 100, 102 or 112–121. */
export const DHS_EDIT_ACTIONS = {
  "101": "Confirmed visit with outside entity and documented",
  "103": "New attendant assigned to member",
  "104": "Visit rescheduled",
  "105": "Service(s) cancelled or suspended until further notice",
  "106": "Updated member's address and documented",
  "107": "Updated member's phone number and documented",
  "108": "Changed verification collection method and documented",
  "109": "Timesheet received and signed by supervisor",
  "110": "Mutual case, cluster case or live-in case",
  "111": "Change in schedule",
  "122": "Unverified visit; this service cannot be billed",
  "123": "Supervisor approved change",
  "124": "Confirmed with the member or representative and documented (cannot be billed)",
  "125": "Timesheet verified",
  "126": "Other",
} as const;
export type DhsEditAction = keyof typeof DHS_EDIT_ACTIONS;

/** Missed Visit Edit Reason Codes (missedVisit.reasonCode). */
export const DHS_MISSED_REASONS = {
  "600": "Agency unable to provide replacement coverage",
  "601": "Attendant failed to report to member's home",
  "602": "Member requested to change or cancel, or services suspended",
  "603": "Member refused service",
  "604": "Member refused service, original aide on vacation",
  "605": "COVID-19: agency could not staff",
  "606": "COVID-19: member refused, receiving informal supports",
  "607": "COVID-19: member refused, self-isolating",
  "608": "Hospitalization unplanned",
  "609": "Other",
} as const;
export type DhsMissedReason = keyof typeof DHS_MISSED_REASONS;

/** Missed Visit Action Taken (missedVisit.actionCode). Every one means the service cannot be billed. */
export const DHS_MISSED_ACTIONS = {
  "501": "Confirmed with the member or representative and documented",
  "502": "New attendant assigned to member",
  "503": "Other",
  "504": "Service(s) cancelled or suspended until further notice",
  "505": "Unverified visit",
  "506": "Visit rescheduled",
} as const;
export type DhsMissedAction = keyof typeof DHS_MISSED_ACTIONS;

export const DHS_EDIT_REASON_CODES = Object.keys(DHS_EDIT_REASONS) as [DhsEditReason, ...DhsEditReason[]];
export const DHS_EDIT_ACTION_CODES = Object.keys(DHS_EDIT_ACTIONS) as [DhsEditAction, ...DhsEditAction[]];

export const isDhsEditReason = (c: unknown): c is DhsEditReason => typeof c === "string" && c in DHS_EDIT_REASONS;
export const isDhsEditAction = (c: unknown): c is DhsEditAction => typeof c === "string" && c in DHS_EDIT_ACTIONS;

/** The default action when a supervisor reviewed and approved the change, which is every EVVora edit. */
export const DEFAULT_EDIT_ACTION: DhsEditAction = "123";

/** EVVora correction reason → the DHS reason it most nearly is. A reviewer may override. */
export const DHS_REASON_FOR_CORRECTION: Record<CorrectionReason, DhsEditReason> = {
  FORGOT_CLOCK_IN: "208",
  FORGOT_CLOCK_OUT: "209",
  DEVICE_FAILURE: "217",
  NO_CONNECTIVITY: "218",
  WRONG_CLIENT: "219",
  WRONG_SERVICE: "219",
  WRONG_TIME: "219",
  LOCATION_ERROR: "207",
  CLIENT_REQUEST: "206",
  SUPERVISOR_REVIEW: "222",
  OTHER: "222",
};

/**
 * The manual-note categories (`MANUAL_REASONS` in src/lib/manual-note.ts) arrive as the start of the
 * manual-entry reason text: "Phone or app problem — battery died". Map that sentence to a DHS code.
 * Unknown text is "Other", which the aggregator accepts with the notes carrying the detail.
 */
export function dhsReasonForManualText(text: string | null | undefined): { reason: DhsEditReason; action: DhsEditAction } {
  const t = (text ?? "").toLowerCase();
  if (/forgot to clock in and out|failed to call in and out/.test(t)) return { reason: "210", action: DEFAULT_EDIT_ACTION };
  if (/forgot to clock in/.test(t)) return { reason: "208", action: DEFAULT_EDIT_ACTION };
  if (/forgot to clock out/.test(t)) return { reason: "209", action: DEFAULT_EDIT_ACTION };
  if (/no signal|no internet|outage|system down/.test(t) && !/paper/.test(t)) return { reason: "218", action: DEFAULT_EDIT_ACTION };
  if (/paper|timesheet/.test(t)) return { reason: "221", action: "109" };
  if (/phone|app|device|battery/.test(t)) return { reason: "217", action: DEFAULT_EDIT_ACTION };
  if (/wrong client|wrong service|data entry/.test(t)) return { reason: "219", action: DEFAULT_EDIT_ACTION };
  return { reason: "222", action: DEFAULT_EDIT_ACTION };
}

/**
 * Waiver duties (Appendix B "Duties", payer MIWS) by service code + modifiers. Optional on the
 * clock-out; EVVora sends them only when HHAX_SEND_TASKS=1, because a wrong duty code rejects the
 * whole visit (101070) and the table is short on guidance.
 */
export function waiverDutyFor(code: string, modifiers: string[]): string | null {
  const m = new Set(modifiers.map((x) => x.toUpperCase()));
  const c = code.toUpperCase();
  if (c === "T1005" || c === "S9125") return "320";
  if (c === "S5130" && m.has("TG")) return "321";
  if (c === "H2015") return "322";
  if (c === "S5135" && m.has("UA")) return "323";
  if ((c === "H2014" || c === "H0043" || c === "S5125") && m.has("UC")) return "324";
  if (c === "S5135" && m.has("UC")) return "325";
  return null;
}

/**
 * The Waiver Services FFS (MIWS) procedure code table, Appendix B, revision 10/28/2024. Codes are
 * written CODE:MOD:MOD exactly as HHAX lists them; HHAX matches code and modifiers exactly
 * (101035/101037). An MCO payer has its own table, so this list only applies to MIWS.
 */
export const MIWS_PROCEDURE_CODES = [
  "H0043:UC:U3", "H2014:U3", "H2014:UC:U3", "H2014:UC:UN:U3", "H2015:U3", "H2032:TF", "H2032:TF:TT",
  "S5125", "S5125:UC", "S5125:UC:UN", "S5130:TG", "S5135", "S5135:U4", "S5135:UA", "S5135:UC", "S5135:UC:UN",
  "S5150", "S5151", "T1005", "T1005:TG", "S9125",
] as const;

/** HHAX lists modifiers in a fixed order; the visit may carry them in another. Compare as sets. */
export function inMiwsTable(code: string, modifiers: string[]): boolean {
  const want = [code.toUpperCase(), ...[...modifiers].map((m) => m.toUpperCase()).sort()].join(":");
  return MIWS_PROCEDURE_CODES.some((entry) => { const [c, ...mods] = entry.split(":"); return [c, ...mods.sort()].join(":") === want; });
}

/** HHAX payer initials (Appendix B, "MCO Portal Initials"). */
export const HHAX_PAYER_INITIALS = {
  MIWS: "Waiver Services FFS",
  MINN: "Financial Management Services FFS",
  MIHH: "Home Health FFS",
  MICS: "Community First Services and Supports (PCA) FFS",
  BCMP: "Blue Cross MN",
  HPMP: "HealthPartners MN",
  HHMP: "Hennepin Health MN",
  ICMP: "IMCare Itasca MN",
  MDMP: "Medica MN",
  PWMP: "PrimeWest MN",
  SCMP: "South Country Health Alliance MN",
  UCMP: "UCare MN",
  UHMP: "United Healthcare MN",
} as const;
