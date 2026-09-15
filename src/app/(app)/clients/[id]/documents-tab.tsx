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
import { DeleteDocument, DocumentUpload } from "./documents";

const TONE: Record<ChecklistItem["status"], { dot: string; badge: "ok" | "warn" | "danger"; label: string }> = {
  ok: { dot: "bg-ok", badge: "ok", label: "On file" },
  due_soon: { dot: "bg-warn", badge: "warn", label: "Renew soon" },
  overdue: { dot: "bg-danger", badge: "danger", label: "Renewal overdue" },
  missing: { dot: "bg-warn", badge: "warn", label: "Missing" },
};
const KB = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`;

/**
 * The client's documents as a checklist first — what a 245D record must hold, ticked or flagged —
 * then everything else. Uploading is a drawer-less inline form that opens on demand, preset to
 * the item you clicked Add on.
 */
export function DocumentsTab({ personId, items, others, summary, manage, aiReady, uploaders }: {
  personId: string; items: ChecklistItem[]; others: ClientDocument[]; summary: { onFile: number; total: number; overdue: number; missing: number }; manage: boolean; aiReady: boolean; uploaders: Record<string, string>;
}) {
  const [upload, setUpload] = useState<DocumentCategory | null>(null);
  const open = (c: DocumentCategory) => setUpload((v) => (v === c ? null : c));

  const FileRow = ({ d, primary }: { d: ClientDocument; primary?: boolean }) => (
    <div className={cx("flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]", !primary && "pl-5")}>
      <a href={`/clients/${personId}/documents/${d.id}`} target="_blank" rel="noreferrer" className={cx("min-w-0 hover:underline", primary ? "font-medium text-text-strong" : "")}>{d.title}</a>
      <span>{d.effectiveOn ? `effective ${fmtDate(d.effectiveOn)}` : `uploaded ${fmtDate(d.createdAt)}`} · {d.fileName} · {KB(d.sizeBytes)}{uploaders[d.uploadedBy] ? ` · ${uploaders[d.uploadedBy]}` : ""}</span>
      {d.note && <span>· {d.note}</span>}
      <span className="ml-auto flex items-center gap-2">
        <PreviewButton href={`/clients/${personId}/documents/${d.id}`} title={d.title} mime={d.mimeType} />
        {manage && <DocumentTextChip kind="client" id={d.id} ownerId={personId} hasText={Boolean(d.extractedText)} summary={d.extractionSummary} aiReady={aiReady} />}
        {manage && <DeleteDocument id={d.id} personId={personId} />}
      </span>
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-[18px]">Documents</h2>
        <Badge tone={summary.missing || summary.overdue ? "warn" : "ok"}>{summary.onFile} of {summary.total} required on file{summary.overdue ? ` · ${summary.overdue} overdue` : ""}</Badge>
        <span className="flex-1" />
        {manage && <Button variant={upload === "other" ? "primary" : "outline"} className="h-9" onClick={() => open("other")}><Icon.plus size={15} /> Upload</Button>}
      </div>

      {upload && manage && (
        <div className="mb-4 rounded-xl border border-primary bg-primary-soft/30 p-4">
          <div className="mb-3 flex items-center justify-between"><div className="text-[15px] font-semibold text-text-strong">Upload a document</div><button type="button" onClick={() => setUpload(null)} className="text-[13px] hover:underline">Close</button></div>
          <DocumentUpload key={upload} personId={personId} defaultCategory={upload} onDone={() => setUpload(null)} />
        </div>
      )}

      <section className="mb-4 overflow-hidden rounded-xl border border-line bg-card">
        <div className="border-b border-line px-4 py-2.5 text-[13px] font-medium uppercase tracking-[0.11em]">Required for a 245D record</div>
        <ul className="divide-y divide-line-soft">
          {items.map((it) => { const t = TONE[it.status]; return (
            <li key={it.category} className="px-4 py-3">
              <div className="flex flex-wrap items-start gap-3">
                <span className={cx("mt-[7px] size-2 shrink-0 rounded-full", t.dot)} />
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-medium text-text-strong">{it.label}</div>
                </div>
                <span className="text-[13px]">{it.renewBy ? `${it.status === "overdue" ? "Was due" : "Renew by"} ${fmtDate(it.renewBy)}` : it.cadenceLabel}</span>
                <Badge tone={t.badge}>{t.label}</Badge>
                {manage && <Button variant="outline" className="h-7 px-2 text-[13px]" onClick={() => open(it.category)}>{it.latest ? "Add new" : "Add"}</Button>}
              </div>
              {it.documents.length > 0 && <div className="mt-2 space-y-1 pl-5">{it.documents.map((d, i) => <FileRow key={d.id} d={d} primary={i === 0} />)}</div>}
            </li>
          ); })}
        </ul>
      </section>

      <section className="overflow-hidden rounded-xl border border-line bg-card">
        <div className="border-b border-line px-4 py-2.5 text-[13px] font-medium uppercase tracking-[0.11em]">Other files · {others.length}</div>
        {others.length === 0 ? <p className="px-4 py-4 text-[13px]">Medical orders, correspondence, photos of paperwork — anything staff should read before a shift.</p> : (
          <ul className="divide-y divide-line-soft">
            {others.map((d) => (
              <li key={d.id} className="px-4 py-2.5">
                <div className="mb-0.5 text-[13px] uppercase tracking-[0.06em] opacity-60">{DOCUMENT_CATEGORIES.find(([v]) => v === d.category)?.[1] ?? d.category}</div>
                <FileRow d={d} primary />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
