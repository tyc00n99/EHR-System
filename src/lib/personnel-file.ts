/**
 * The personnel file as a 245D licensor reads it (245D.095 subd. 3): thirteen items, in the
 * licensor's order, each either satisfied or not. Pure functions over the staff row, the credential
 * rows and the documents, so the tab, the roster dot and any future export agree.
 *
 * One rule runs through it: every item except the date of hire is satisfied only when a credential
 * row exists AND a document is attached to it. A row with no paper behind it is "undocumented",
 * which the licensor treats the same as missing.
 */
import type { CredentialType, StaffCredential, StaffDocument } from "@/db/schema";
import { credentialLabel } from "./credentials";
import { fmtDate } from "./format";

/** `optional` is an extra the agency has not recorded — neither a tick nor a fault. */
export type PersonnelStatus = "ok" | "due_soon" | "overdue" | "missing" | "undocumented" | "pending" | "optional";

export interface PersonnelDoc { id: string; title: string; fileName: string; createdAt: string }

export interface PersonnelRecord {
  id: string;
  completedOn: string;
  expiresOn: string | null;
  hours: string | null;
  instructor: string | null;
  renewMonths: number | null;
  note: string | null;
  createdAt: string;
  documents: PersonnelDoc[];
}

export interface PersonnelItem {
  key: string;
  group: string;
  label: string;
  cite: string;
  /** How the item renews, which decides what "current" means. */
  renews: "never" | "annual" | "expiry";
  /** True for the licensor's list; false for the licence-holder extras (first aid, CPR, licences). */
  required: boolean;
  status: PersonnelStatus;
  due: string | null;
  /** One plain sentence about where the item stands. */
  detail: string;
  /** The credential type that records it, or null for the date of hire. */
  type: CredentialType | null;
  /** Newest first. Empty for the date of hire. */
  records: PersonnelRecord[];
  /** Whether the training form must name a trainer. */
  needsInstructor: boolean;
}

const DAY = 86_400_000;
const SOON_DAYS = 30;
const addDays = (iso: string, days: number) => new Date(new Date(iso + "T12:00:00Z").getTime() + days * DAY).toISOString().slice(0, 10);
const addMonths = (iso: string, months: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() + months); return d.toISOString().slice(0, 10); };
const addYear = (iso: string) => addMonths(iso, 12);
const dueStatus = (due: string, today: string): PersonnelStatus => (due < today ? "overdue" : addDays(today, SOON_DAYS) >= due ? "due_soon" : "ok");

const GROUPS = { employment: "Employment", training: "Qualifications, orientation, training", background: "Background study", contact: "Direct contact · employees hired after Jan 1, 2014", extras: "Licences and other certificates" };

interface Spec { type: CredentialType; group: string; required: boolean; needsInstructor?: boolean; renews: "never" | "annual" | "expiry"; cite?: string; /** Satisfied by a written source when no document is attached. */ sourceOk?: boolean }

/** The licensor's order, then the licence-holder extras. */
const SPECS: Spec[] = [
  { type: "application", group: GROUPS.employment, required: true, renews: "never" },
  { type: "duties_acknowledgment", group: GROUPS.employment, required: true, renews: "never" },
  { type: "position_requirements", group: GROUPS.employment, required: true, renews: "never", sourceOk: true },
  { type: "qualifications", group: GROUPS.training, required: true, renews: "never" },
  { type: "orientation", group: GROUPS.training, required: true, renews: "never", needsInstructor: true },
  { type: "maltreatment_reporting", group: GROUPS.training, required: true, renews: "annual", needsInstructor: true },
  { type: "annual_training", group: GROUPS.training, required: true, renews: "annual", needsInstructor: true },
  { type: "evaluation", group: GROUPS.training, required: true, renews: "annual" },
  { type: "background_study", group: GROUPS.background, required: true, renews: "never" },
  { type: "background_study_results", group: GROUPS.background, required: true, renews: "never" },
  { type: "first_supervised_contact", group: GROUPS.contact, required: true, renews: "never" },
  { type: "first_unsupervised_contact", group: GROUPS.contact, required: true, renews: "never" },
  { type: "drivers_license", group: GROUPS.extras, required: false, renews: "expiry" },
  { type: "other", group: GROUPS.extras, required: false, renews: "expiry" },
];

const CITES: Partial<Record<CredentialType, string>> = {
  orientation: "245D.09, subd. 4", maltreatment_reporting: "245D.09, subd. 4(5); 245A.65, subd. 3", annual_training: "245D.09, subd. 5",
  evaluation: "245D.09, subd. 3 to 5", background_study: "245C.03; 245D.09, subd. 6", background_study_results: "chapter 245C",
  qualifications: "245D.09, subd. 3", first_aid: "245D.09, subd. 5",
};

export function buildPersonnelFile(hireDate: string, rows: StaffCredential[], docs: StaffDocument[], today = new Date().toISOString().slice(0, 10)): PersonnelItem[] {
  const docsFor = (credentialId: string): PersonnelDoc[] =>
    docs.filter((d) => d.credentialId === credentialId).map((d) => ({ id: d.id, title: d.title, fileName: d.fileName, createdAt: d.createdAt.toISOString().slice(0, 10) }));
  const records = (type: CredentialType): PersonnelRecord[] =>
    rows.filter((r) => r.type === type).sort((a, b) => (a.completedOn < b.completedOn ? 1 : -1))
      .map((r) => ({ id: r.id, completedOn: r.completedOn, expiresOn: r.expiresOn, hours: r.hours, instructor: r.instructor, renewMonths: r.renewMonths, note: r.note, createdAt: r.createdAt.toISOString().slice(0, 10), documents: docsFor(r.id) }));

  const items: PersonnelItem[] = [{
    key: "hire", group: GROUPS.employment, label: "Date of hire", cite: "245D.095, subd. 3", renews: "never", required: true,
    status: "ok", due: null, detail: `Hired ${fmtDate(hireDate)}. Recorded on the staff record.`, type: null, records: [], needsInstructor: false,
  }];

  const bgSubmitted = rows.some((r) => r.type === "background_study");

  for (const spec of SPECS) {
    const recs = records(spec.type);
    const latest = recs[0];
    const documented = Boolean(latest && (latest.documents.length > 0 || (spec.sourceOk && latest.note?.trim())));
    let status: PersonnelStatus;
    let due: string | null = null;
    let detail: string;

    if (!latest) {
      if (spec.type === "background_study_results" && bgSubmitted) { status = "pending"; detail = "Submitted; the DHS determination has not been recorded yet."; }
      else if (spec.type === "orientation") { due = addDays(hireDate, 60); status = dueStatus(due, today) === "ok" ? "due_soon" : "overdue"; detail = `Due within 60 days of hire (${fmtDate(due)}).`; }
      else if (spec.type === "annual_training") { due = addYear(hireDate); status = dueStatus(due, today); detail = `Twelve hours due each year from hire; first by ${fmtDate(due)}.`; }
      else if (spec.type === "evaluation") { due = addYear(hireDate); status = dueStatus(due, today); detail = `Annual; first due ${fmtDate(due)}.`; }
      else if (spec.type === "maltreatment_reporting") { status = "missing"; due = hireDate; detail = "Within 72 hours of first direct contact, then annually."; }
      else if (!spec.required) { status = "optional"; detail = "Not recorded."; }
      else { status = "missing"; detail = "Nothing on file."; }
    } else if (!documented) {
      status = "undocumented";
      detail = spec.sourceOk
        ? `Recorded ${fmtDate(latest.completedOn)} with neither a document nor a source. Attach the paper, or note how they meet the requirements.`
        : `Recorded ${fmtDate(latest.completedOn)}, but no document is attached. Attach the paper that shows it.`;
    } else if (spec.renews === "annual") {
      // Evaluations may run quarterly; the record says so. Everything else renews yearly.
      const months = latest.renewMonths ?? 12;
      due = addMonths(latest.completedOn, months);
      status = dueStatus(due, today);
      detail = `Last ${fmtDate(latest.completedOn)}${latest.hours ? ` · ${latest.hours} h` : ""}${latest.instructor ? ` · ${latest.instructor}` : ""}${months === 3 ? " · quarterly" : ""}. Due again ${fmtDate(due)}.`;
    } else if (spec.renews === "expiry" && latest.expiresOn) {
      due = latest.expiresOn;
      status = dueStatus(due, today);
      detail = `Expires ${fmtDate(latest.expiresOn)}.`;
    } else {
      status = "ok";
      detail = `${fmtDate(latest.completedOn)}${latest.instructor ? ` · ${latest.instructor}` : ""}${latest.note ? ` · ${latest.note}` : ""}`;
    }

    items.push({
      key: spec.type, group: spec.group, label: credentialLabel(spec.type), cite: CITES[spec.type] ?? "245D.095, subd. 3", renews: spec.renews,
      required: spec.required, status, due, detail, type: spec.type, records: recs, needsInstructor: Boolean(spec.needsInstructor),
    });
  }
  return items;
}

/** How many of the licensor's items are satisfied, for the tab count and the roster. */
export function personnelSummary(items: PersonnelItem[]) {
  const required = items.filter((i) => i.required);
  const satisfied = required.filter((i) => i.status === "ok" || i.status === "due_soon").length;
  return { satisfied, total: required.length, open: required.length - satisfied };
}
