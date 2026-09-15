/**
 * The documents a 245D client record has to hold, as a licensor reads them: which category
 * satisfies each item, how often it renews, and the statute behind it. Pure functions over the
 * document rows so the tab, any future export and the review queue agree.
 */
import type { ClientDocument, DocumentCategory } from "@/db/schema";
import { fmtDate } from "./format";

export type DocStatus = "ok" | "due_soon" | "overdue" | "missing";

export interface RequiredDoc {
  category: DocumentCategory;
  label: string;
  cite: string;
  /** How the item renews: yearly, quarterly, or once at intake. */
  cadence: "annual" | "quarterly" | "once";
  cadenceLabel: string;
}

export const REQUIRED_CLIENT_DOCUMENTS: RequiredDoc[] = [
  { category: "support_plan", label: "Support plan (CSSP / support plan addendum)", cite: "245D.07 subd. 2; 245D.071 subd. 3", cadence: "annual", cadenceLabel: "Reviewed at least annually" },
  { category: "iapp", label: "Individual abuse prevention plan", cite: "245D.071 subd. 2; 245A.65 subd. 2", cadence: "annual", cadenceLabel: "Reviewed at least annually" },
  { category: "treatment_goals", label: "Support plan goals and outcomes", cite: "245D.071 subd. 4", cadence: "quarterly", cadenceLabel: "Progress reviewed quarterly" },
  { category: "rights", label: "Service recipient rights notice", cite: "245D.04 subd. 1", cadence: "once", cadenceLabel: "At service initiation" },
  { category: "release", label: "Release of information / consent", cite: "245D.04; 13.46", cadence: "once", cadenceLabel: "At intake" },
];

export const REQUIRED_CATEGORIES = new Set<DocumentCategory>(REQUIRED_CLIENT_DOCUMENTS.map((r) => r.category));

const DAY = 86_400_000;
const addMonths = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };

export interface ChecklistItem extends RequiredDoc {
  status: DocStatus;
  /** Newest first. */
  documents: ClientDocument[];
  latest: ClientDocument | null;
  /** When the current document should be renewed, when the cadence has one. */
  renewBy: string | null;
  /** One plain sentence about where the item stands. */
  detail: string;
}

export function buildDocumentChecklist(docs: ClientDocument[], today = new Date().toISOString().slice(0, 10)): ChecklistItem[] {
  const effective = (d: ClientDocument) => d.effectiveOn ?? d.createdAt.toISOString().slice(0, 10);
  return REQUIRED_CLIENT_DOCUMENTS.map((r) => {
    const documents = docs.filter((d) => d.category === r.category).sort((a, b) => (effective(a) < effective(b) ? 1 : -1));
    const latest = documents[0] ?? null;
    if (!latest) return { ...r, status: "missing", documents, latest, renewBy: null, detail: "Nothing uploaded." };
    if (r.cadence === "once") return { ...r, status: "ok", documents, latest, renewBy: null, detail: `${latest.title} · ${fmtDate(effective(latest))}` };
    const renewBy = addMonths(effective(latest), r.cadence === "annual" ? 12 : 3);
    const soon = new Date(new Date(today + "T12:00:00Z").getTime() + 30 * DAY).toISOString().slice(0, 10);
    const status: DocStatus = renewBy < today ? "overdue" : renewBy <= soon ? "due_soon" : "ok";
    return { ...r, status, documents, latest, renewBy, detail: `${latest.title} · effective ${fmtDate(effective(latest))}` };
  });
}

export function checklistSummary(items: ChecklistItem[]) {
  const onFile = items.filter((i) => i.status !== "missing").length;
  return { onFile, total: items.length, overdue: items.filter((i) => i.status === "overdue").length, missing: items.length - onFile };
}
