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

      <section className="overflow-hidden rounded-xl border border-line bg-card">
        <div className="border-b border-line px-5 py-3 text-[13px] font-medium uppercase tracking-[0.11em]">Other files · {others.length}</div>
        {others.length === 0 ? <p className="px-5 py-5 text-[13px]">Medical orders, correspondence, photos of paperwork — anything staff should read before a shift.</p> : (
          <ul className="divide-y divide-line-soft">
            {others.map((d) => (
              <li key={d.id} className="px-5 py-4">
                <div className="mb-2 text-[13px] uppercase tracking-[0.06em] opacity-60">{DOCUMENT_CATEGORIES.find(([v]) => v === d.category)?.[1] ?? d.category}</div>
                <FileRow d={d} primary />
              </li>
            ))}
          </ul>
        )}
      </section>

      {archived.length > 0 && (
        <section className="mt-5 overflow-hidden rounded-xl border border-line bg-card opacity-80">
          <div className="border-b border-line px-5 py-3 text-[13px] font-medium uppercase tracking-[0.11em]">Archived · {archived.length}</div>
          <ul className="divide-y divide-line-soft">
            {archived.map((d) => (
              <li key={d.id} className="px-5 py-3">
                <div className="mb-1 text-[13px] uppercase tracking-[0.06em] opacity-60">{DOCUMENT_CATEGORIES.find(([v]) => v === d.category)?.[1] ?? d.category}{d.archivedAt ? ` · archived ${fmtDate(d.archivedAt)}` : ""}</div>
                <FileRow d={d} primary />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
