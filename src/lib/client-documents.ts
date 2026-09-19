/**
 * The documents a client record has to hold, as the agency has defined them (`document_types`):
 * which type satisfies each item, how often it renews, and where each stands today. Pure functions
 * over the rows so the tab, any future export and the review queue agree.
 */
import type { ClientDocument, DocumentType } from "@/db/schema";
import { fmtDate } from "./format";

export type DocStatus = "ok" | "due_soon" | "overdue" | "missing";

/** The renewal choices an agency can pick from. Null means once, at intake. */
export const RENEW_OPTIONS: { months: number | null; label: string }[] = [
  { months: null, label: "Once, at intake" },
  { months: 3, label: "Every 3 months" },
  { months: 6, label: "Every 6 months" },
  { months: 12, label: "Every year" },
  { months: 24, label: "Every 2 years" },
];

export function cadenceLabel(renewMonths: number | null): string {
  return RENEW_OPTIONS.find((o) => o.months === renewMonths)?.label ?? `Every ${renewMonths} months`;
}

export interface ChecklistItem {
  type: DocumentType;
  status: DocStatus;
  /** Live documents of this type, newest first. */
  documents: ClientDocument[];
  latest: ClientDocument | null;
  /** When the current document should be renewed, when the type renews. */
  renewBy: string | null;
}

const DAY = 86_400_000;
const addMonths = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };

/** Which type a document belongs to: the linked type, or the legacy category for rows written before types existed. */
export function typeIdOf(d: ClientDocument, types: DocumentType[]): string | null {
  return d.documentTypeId ?? types.find((t) => t.key === d.category)?.id ?? null;
}

export function buildDocumentChecklist(docs: ClientDocument[], types: DocumentType[], today = new Date().toISOString().slice(0, 10)): ChecklistItem[] {
  const effective = (d: ClientDocument) => d.effectiveOn ?? d.createdAt.toISOString().slice(0, 10);
  const soon = new Date(new Date(today + "T12:00:00Z").getTime() + 30 * DAY).toISOString().slice(0, 10);
  return types.filter((t) => t.active && t.required).sort((a, b) => a.sortOrder - b.sortOrder).map((type) => {
    const documents = docs.filter((d) => typeIdOf(d, types) === type.id).sort((a, b) => (effective(a) < effective(b) ? 1 : -1));
    const latest = documents[0] ?? null;
    if (!latest) return { type, status: "missing", documents, latest, renewBy: null };
    if (type.renewMonths == null) return { type, status: "ok", documents, latest, renewBy: null };
    const renewBy = addMonths(effective(latest), type.renewMonths);
    const status: DocStatus = renewBy < today ? "overdue" : renewBy <= soon ? "due_soon" : "ok";
    return { type, status, documents, latest, renewBy };
  });
}

export function checklistSummary(items: ChecklistItem[]) {
  const onFile = items.filter((i) => i.status !== "missing").length;
  return { onFile, total: items.length, overdue: items.filter((i) => i.status === "overdue").length, dueSoon: items.filter((i) => i.status === "due_soon").length, missing: items.length - onFile };
}

/** One sentence for the file line: its effective date and, when the type renews, the date it is due. */
export function documentLine(d: ClientDocument, renewBy: string | null): string {
  const eff = d.effectiveOn ? `effective ${fmtDate(d.effectiveOn)}` : `uploaded ${fmtDate(d.createdAt)}`;
  return renewBy ? `${eff} · next by ${fmtDate(renewBy)}` : eff;
}
