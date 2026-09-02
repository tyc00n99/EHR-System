/**
 * Caregiver compliance rules from Minn. Stat. 245D.09 and chapter 245C.
 * Pure functions over a staff member's credential rows.
 */
import type { CredentialType, StaffCredential } from "@/db/schema";

export const CREDENTIAL_TYPES: { type: CredentialType; label: string; cite: string; renews: "never" | "annual" | "expiry" }[] = [
  { type: "background_study", label: "DHS background study", cite: "245C.03; 245D.09, subd. 6", renews: "never" },
  { type: "orientation", label: "Orientation to program requirements", cite: "245D.09, subd. 4", renews: "never" },
  { type: "maltreatment_reporting", label: "Maltreatment reporting training", cite: "245D.09, subd. 4(5); 245A.65, subd. 3", renews: "annual" },
  { type: "annual_training", label: "Annual training", cite: "245D.09, subd. 5", renews: "annual" },
  { type: "first_aid", label: "First aid certification", cite: "245D.09, subd. 5", renews: "expiry" },
  { type: "cpr", label: "CPR certification", cite: "License holder policy", renews: "expiry" },
  { type: "drivers_license", label: "Driver's license", cite: "License holder policy", renews: "expiry" },
  { type: "auto_insurance", label: "Auto insurance", cite: "License holder policy", renews: "expiry" },
  { type: "other", label: "Other training or certificate", cite: "", renews: "expiry" },
];

export function credentialLabel(type: CredentialType) {
  return CREDENTIAL_TYPES.find((c) => c.type === type)?.label ?? type;
}

export type ComplianceStatus = "ok" | "due_soon" | "overdue" | "missing";

export interface ComplianceItem {
  type: CredentialType;
  label: string;
  cite: string;
  status: ComplianceStatus;
  /** Date the item is or was due, when one exists. */
  due: string | null;
  detail: string;
}

const DAY = 86_400_000;
const SOON_DAYS = 30;

function addDays(iso: string, days: number) {
  return new Date(new Date(iso + "T12:00:00Z").getTime() + days * DAY).toISOString().slice(0, 10);
}
function addYear(iso: string) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function statusFor(due: string | null, today: string): ComplianceStatus {
  if (!due) return "ok";
  if (due < today) return "overdue";
  return addDays(today, SOON_DAYS) >= due ? "due_soon" : "ok";
}

/** Required items for a direct support staff member, evaluated against their credential rows. */
export function evaluateCompliance(hireDate: string, rows: StaffCredential[], today = new Date().toISOString().slice(0, 10)): ComplianceItem[] {
  const latest = (type: CredentialType) => rows.filter((r) => r.type === type).sort((a, b) => (a.completedOn < b.completedOn ? 1 : -1))[0];
  const items: ComplianceItem[] = [];

  const bg = latest("background_study");
  items.push({ type: "background_study", label: "DHS background study", cite: "245C.03", status: bg ? "ok" : "missing", due: bg ? null : hireDate, detail: bg ? `Cleared ${bg.completedOn}` : "Required before any direct contact with a person served." });

  const orient = latest("orientation");
  const orientDue = addDays(hireDate, 60);
  items.push({ type: "orientation", label: "Orientation to program requirements", cite: "245D.09, subd. 4", status: orient ? "ok" : statusFor(orientDue, today) === "ok" ? "due_soon" : "overdue", due: orient ? null : orientDue, detail: orient ? `Completed ${orient.completedOn}` : `Due within 60 days of hire (${orientDue}).` });

  const malt = latest("maltreatment_reporting");
  const maltDue = malt ? addYear(malt.completedOn) : hireDate;
  items.push({ type: "maltreatment_reporting", label: "Maltreatment reporting training", cite: "245D.09, subd. 4(5)", status: malt ? statusFor(maltDue, today) : "missing", due: maltDue, detail: malt ? `Renews ${maltDue}` : "Within 72 hours of first direct contact, then annually." });

  const firstAid = latest("first_aid");
  const firstAidCurrent = Boolean(firstAid?.expiresOn && firstAid.expiresOn >= today);
  const annual = latest("annual_training");
  const annualDue = annual ? addYear(annual.completedOn) : addYear(hireDate);
  items.push({ type: "annual_training", label: "Annual training", cite: "245D.09, subd. 5", status: statusFor(annualDue, today), due: annualDue, detail: `${annual ? `Last ${annual.completedOn}${annual.hours ? ` · ${annual.hours} h` : ""}. ` : ""}Due ${annualDue}.${firstAidCurrent ? " First aid topic covered by current certificate." : ""}` });

  for (const type of ["first_aid", "cpr", "drivers_license", "auto_insurance"] as const) {
    const row = latest(type);
    if (!row) { if (type === "first_aid") items.push({ type, label: credentialLabel(type), cite: "245D.09, subd. 5", status: "missing", due: null, detail: "Optional, but a current certificate replaces the annual first aid topic." }); continue; }
    items.push({ type, label: credentialLabel(type), cite: "", status: row.expiresOn ? statusFor(row.expiresOn, today) : "ok", due: row.expiresOn, detail: row.expiresOn ? `Expires ${row.expiresOn}` : `Completed ${row.completedOn}` });
  }
  return items;
}

export function complianceSummary(items: ComplianceItem[]) {
  const overdue = items.filter((i) => i.status === "overdue" || (i.status === "missing" && i.type === "background_study")).length;
  const dueSoon = items.filter((i) => i.status === "due_soon").length;
  return { overdue, dueSoon, ok: overdue === 0 && dueSoon === 0 };
}
