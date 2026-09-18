"use client";

import { useState } from "react";
import { DocumentTextChip } from "@/components/document-text-chip";
import { Icon } from "@/components/icons";
import { Badge, Button, cx } from "@/components/kit";
import type { ClientDocument, DocumentCategory } from "@/db/schema";
import type { ChecklistItem } from "@/lib/client-documents";
import { fmtDate } from "@/lib/format";
import { DOCUMENT_CATEGORIES } from "@/lib/validation";
import { PreviewButton } from "./doc-preview";
import { ArchiveDocument, DeleteDocument, DocumentUpload } from "./documents";

const DOT: Record<ChecklistItem["status"], string> = { ok: "bg-ok", due_soon: "bg-warn", overdue: "bg-danger", missing: "bg-danger" };

/**
 * The client's documents as a checklist first — what a 245D record must hold, ticked or flagged —
 * then everything else. Uploading is a drawer-less inline form that opens on demand, preset to
 * the item you clicked Add on.
 */
export function DocumentsTab({ personId, items, others, archived, summary, manage, aiReady }: {
  personId: string; items: ChecklistItem[]; others: ClientDocument[]; archived: ClientDocument[]; summary: { onFile: number; total: number; overdue: number; missing: number }; manage: boolean; aiReady: boolean;
}) {
  const [upload, setUpload] = useState<DocumentCategory | null>(null);
  const open = (c: DocumentCategory) => setUpload((v) => (v === c ? null : c));

  const FileRow = ({ d, primary }: { d: ClientDocument; primary?: boolean }) => (
    <div className={cx("flex min-h-9 flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px]", !primary && "pl-6")}>
      <PreviewButton variant="icon" href={`/clients/${personId}/documents/${d.id}`} title={d.title} mime={d.mimeType} />
      <span className={cx("min-w-0", primary ? "font-medium text-text-strong" : "")}>{d.title}</span>
      <span>{d.effectiveOn ? `effective ${fmtDate(d.effectiveOn)}` : `uploaded ${fmtDate(d.createdAt)}`}</span>
      {d.note && <span>· {d.note}</span>}
      <span className="ml-auto flex items-center gap-2">
        {manage && <DocumentTextChip kind="client" id={d.id} ownerId={personId} hasText={Boolean(d.extractedText)} summary={d.extractionSummary} aiReady={aiReady} />}
        {manage && <ArchiveDocument id={d.id} personId={personId} archived={Boolean(d.archivedAt)} />}
        {manage && <DeleteDocument id={d.id} personId={personId} />}
      </span>
    </div>
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-[18px]">Documents</h2>
        <span className="text-[13.5px]">{summary.onFile} of {summary.total} required on file{summary.overdue ? ` · ${summary.overdue} overdue` : ""}</span>
        <span className="flex-1" />
        {manage && <Button variant={upload === "other" ? "primary" : "outline"} className="h-9" onClick={() => open("other")}><Icon.plus size={15} /> Upload</Button>}
      </div>

      {upload && manage && (
        <div className="mb-4 rounded-xl border border-primary bg-primary-soft/30 p-4">
          <div className="mb-3 flex items-center justify-between"><div className="text-[15px] font-semibold text-text-strong">Upload a document</div><button type="button" onClick={() => setUpload(null)} className="text-[13px] hover:underline">Close</button></div>
          <DocumentUpload key={upload} personId={personId} defaultCategory={upload} onDone={() => setUpload(null)} />
        </div>
      )}

      <section className="mb-5 overflow-hidden rounded-xl border border-line bg-card">
        <div className="grid grid-cols-[minmax(0,1fr)_170px_140px_112px] items-center gap-4 border-b border-line px-5 py-3 text-[13px] font-medium uppercase tracking-[0.11em]">
          <span>Document</span><span>Renew by</span><span /><span />
        </div>
        <ul className="divide-y divide-line-soft">
          {items.map((it) => { const missing = it.status === "missing"; return (
            <li key={it.category} className={cx("px-5 py-4", missing && "bg-danger-soft/50")}>
              <div className="grid grid-cols-[minmax(0,1fr)_170px_140px_112px] items-center gap-4">
                <div className="flex min-w-0 items-center gap-3"><span className={cx("size-2.5 shrink-0 rounded-full", DOT[it.status])} /><span className="text-[15px] font-medium text-text-strong">{it.label}</span></div>
                <span className="text-[13.5px]">{it.renewBy ? fmtDate(it.renewBy) : it.cadenceLabel}</span>
                <span>{it.status === "due_soon" && <Badge tone="warn">Renew soon</Badge>}{it.status === "overdue" && <Badge tone="danger">Renewal overdue</Badge>}{missing && <span className="text-[13.5px] font-medium text-danger">Nothing on file</span>}</span>
                <span className="text-right">{manage && <Button variant="outline" className="h-8 w-full text-[13px]" onClick={() => open(it.category)}>{it.latest ? "Add new" : "Add"}</Button>}</span>
              </div>
              {it.documents.length > 0 && <div className="mt-3 space-y-2 pl-[22px]">{it.documents.map((d, i) => <FileRow key={d.id} d={d} primary={i === 0} />)}</div>}
            </li>
          ); })}
        </ul>
      </section>

      <DocFold personId={personId} docs={others} manage={manage} noun="other file" hint="medical orders, correspondence, anything staff should read before a shift" empty="medical orders, correspondence, photos of paperwork; add one with Upload" groupBy={(d) => DOCUMENT_CATEGORIES.find(([v]) => v === d.category)?.[1] ?? d.category} />

      {archived.length > 0 && <DocFold personId={personId} docs={archived} manage={manage} noun="archived document" hint="kept for the record, restorable any time" groupBy={(d) => (d.archivedAt ? `Archived ${fmtDate(d.archivedAt)}` : "Archived earlier")} />}
    </div>
  );
}

/**
 * A document list folded behind one line (option C, 2026-09-18). Open, rows group under small
 * headings and each row is just the file icon (preview), the title, and icon buttons: no category or
 * dates on the row itself. Used for "Other files" (grouped by category) and "Archived" (by date).
 */
function DocFold({ personId, docs, manage, noun, hint, empty, groupBy }: { personId: string; docs: ClientDocument[]; manage: boolean; noun: string; hint: string; empty?: string; groupBy: (d: ClientDocument) => string }) {
  const [open, setOpen] = useState(false);
  const groups = new Map<string, ClientDocument[]>();
  for (const d of docs) { const k = groupBy(d); groups.set(k, [...(groups.get(k) ?? []), d]); }
  if (docs.length === 0) return (
    <section className="mt-5 flex items-center gap-2.5 rounded-xl border border-line bg-card px-5 py-3.5 text-[14px]">
      <span className="font-medium text-text-strong">0 {noun}s</span><span className="text-muted-foreground">· {empty ?? hint}</span>
    </section>
  );
  return (
    <section className="mt-5 overflow-hidden rounded-xl border border-line bg-card">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2.5 px-5 py-3.5 text-left text-[14px] hover:bg-sidebar">
        <span className="font-medium text-text-strong">{docs.length} {noun}{docs.length === 1 ? "" : "s"}</span>
        <span className="text-muted-foreground">· {hint}</span>
        <Icon.chevron size={18} className={cx("ml-auto text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && [...groups.entries()].map(([heading, list]) => (
        <div key={heading}>
          <div className="border-t border-line px-5 pb-1.5 pt-2.5 text-[12.5px] font-medium uppercase tracking-[0.06em] text-hint">{heading}</div>
          {list.map((d) => (
            <div key={d.id} className="flex items-center gap-3 border-t border-line-soft px-5 py-2">
              <PreviewButton variant="icon" href={`/clients/${personId}/documents/${d.id}`} title={d.title} mime={d.mimeType} />
              <span className="min-w-0 truncate text-[14px] font-medium text-text-strong">{d.title}</span>
              {manage && (
                <span className="ml-auto flex gap-1.5">
                  <ArchiveDocument id={d.id} personId={personId} archived={Boolean(d.archivedAt)} icon />
                  <DeleteDocument id={d.id} personId={personId} icon />
                </span>
              )}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
