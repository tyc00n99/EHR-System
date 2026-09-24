"use client";

import { useState } from "react";
import { DocumentTextChip } from "@/components/document-text-chip";
import { MarginSection } from "@/components/chart";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DocumentTypesEditor } from "../../settings/document-types";
import { MarginFold } from "@/components/margin-fold";
import { Icon } from "@/components/icons";
import { cx } from "@/components/kit";
import type { ClientDocument, DocumentType } from "@/db/schema";
import { cadenceLabel, typeIdOf, type ChecklistItem } from "@/lib/client-documents";
import { fmtDate } from "@/lib/format";
import { PreviewButton } from "./doc-preview";
import { ArchiveDocument, DeleteDocument, DocumentUpload } from "./documents";

/**
 * The client's documents as a checklist of what this agency requires (set under Settings), then
 * everything else and the archive folded away. Colour is spent on one thing: a renewal that is due.
 */
export function DocumentsTab({ personId, items, others, archived, types, summary, manage, canEditTypes, orgName, aiReady }: {
  personId: string; items: ChecklistItem[]; others: ClientDocument[]; archived: ClientDocument[]; types: DocumentType[];
  summary: { onFile: number; total: number; overdue: number; dueSoon: number; missing: number }; manage: boolean; canEditTypes: boolean; orgName: string; aiReady: boolean;
}) {
  const [upload, setUpload] = useState<string | null>(null);
  // The required list opens in a window here rather than sending the person to Settings (user, Sept 24, 2026).
  const [editingList, setEditingList] = useState(false);
  const open = (typeId: string) => setUpload((v) => (v === typeId ? null : typeId));
  const labelOf = (d: ClientDocument) => types.find((t) => t.id === typeIdOf(d, types))?.label ?? "Other file";
  const fallbackType = types.find((t) => t.active && !t.required)?.id ?? types.find((t) => t.active)?.id ?? "";

  return (
    <div>
      {upload && manage && (
        <div className="mb-5 rounded-xl border border-line p-4">
          <div className="mb-3 flex items-center justify-between"><div className="text-[15px] font-semibold text-text-strong">Upload a document</div><button type="button" onClick={() => setUpload(null)} className="text-[13px] hover:underline">Close</button></div>
          <DocumentUpload key={upload} personId={personId} types={types} defaultTypeId={upload} onDone={() => setUpload(null)} />
        </div>
      )}

      {canEditTypes && editingList && (
        <Dialog open onOpenChange={(o) => { if (!o) setEditingList(false); }}>
          <DialogContent showCloseButton className="block max-h-[calc(100vh-3rem)] w-[calc(100%-2rem)] overflow-y-auto p-6 sm:max-w-[1040px]">
            <DialogTitle className="mb-1 text-[17px] font-semibold text-text-strong">Required documents</DialogTitle>
            <p className="mb-4 text-[13px] text-muted-foreground">The list every client&apos;s Documents tab checks against. Changes apply to all clients.</p>
            <DocumentTypesEditor types={types} onDone={() => setEditingList(false)} />
          </DialogContent>
        </Dialog>
      )}

      {/* The count rides on the label (user's pick "B", Sept 24, 2026): the label says Required, the list says what,
          and the record is the agency's by definition, so the margin carries nothing else unless a renewal is due. */}
      <MarginSection
        label="Required"
        labelAfter={summary.total > 0 && <span className="font-medium normal-case tracking-normal">· {summary.onFile} of {summary.total}</span>}
        note={summary.total === 0 ? `${orgName} has not set a required list yet.` : (summary.dueSoon > 0 || summary.overdue > 0) && (
          <span className="block font-medium text-warn">{[summary.overdue > 0 && `${summary.overdue} overdue`, summary.dueSoon > 0 && `${summary.dueSoon} renew${summary.dueSoon === 1 ? "s" : ""} soon`].filter(Boolean).join(" · ")}</span>
        )}
        action={(manage || canEditTypes) && (<>
          {manage && <button type="button" onClick={() => open(items[0]?.type.id ?? fallbackType)} className="block hover:underline">+ Upload</button>}
          {/* The required list is agency policy; editing it is a real action, not a phrase in a sentence (user, Sept 21). */}
          {canEditTypes && <button type="button" onClick={() => setEditingList(true)} className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 text-[13px] font-medium text-text hover:bg-tab-hover"><Icon.settings size={13} /> Edit required list</button>}
        </>)}
      >
        {items.length === 0 ? (
          <p className="py-2 text-[14px] text-muted-foreground">Nothing is required yet. An administrator sets the list under Settings.</p>
        ) : items.map((it) => {
          const onFile = it.status !== "missing";
          const due = it.status === "due_soon" || it.status === "overdue";
          return (
            <div key={it.type.id} className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-start gap-x-4 border-t border-line-soft py-3.5 first:border-t-0">
              <span className={cx("mt-0.5 inline-flex size-[22px] items-center justify-center rounded-md border-[1.5px]", onFile ? "border-text-strong bg-text-strong" : "border-line")} aria-label={onFile ? "On file" : "Nothing on file"}>{onFile && <Icon.check size={14} className="text-white" />}</span>
              <div className="min-w-0">
                <div className="text-[15px] font-medium leading-snug text-text-strong">{it.type.label}</div>
                {it.documents.map((d, i) => (
                  <div key={d.id} className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
                    <PreviewButton variant="inline" href={`/clients/${personId}/documents/${d.id}`} title={d.title} mime={d.mimeType} />
                    <span>· {d.effectiveOn ? `effective ${fmtDate(d.effectiveOn)}` : `uploaded ${fmtDate(d.createdAt)}`}</span>
                    {i === 0 && it.renewBy && <span className={cx(due && "font-medium text-warn")}>· {it.status === "overdue" ? "was due" : due ? "renew by" : "next by"} {fmtDate(it.renewBy)}</span>}
                    {d.note && <span>· {d.note}</span>}
                    {manage && <DocumentTextChip kind="client" id={d.id} ownerId={personId} hasText={Boolean(d.extractedText)} summary={d.extractionSummary} aiReady={aiReady} />}
                    {manage && <span className="ml-1 inline-flex gap-1"><ArchiveDocument id={d.id} personId={personId} archived={false} icon /><DeleteDocument id={d.id} personId={personId} icon /></span>}
                  </div>
                ))}
              </div>
              <span className="whitespace-nowrap pt-0.5 text-[13.5px] text-muted-foreground">
                {cadenceLabel(it.type.renewMonths).toLowerCase()}
                {manage && <> · <button type="button" onClick={() => open(it.type.id)} className="font-medium text-text-strong underline decoration-line underline-offset-[3px] hover:decoration-text-strong">{onFile ? "replace" : "add"}</button></>}
              </span>
            </div>
          );
        })}
      </MarginSection>

      <MarginFold label="Other files" note="Medical orders, correspondence, anything staff should read before a shift." summary={others.length ? <><span className="font-medium text-text-strong">{others.length} file{others.length === 1 ? "" : "s"}</span> · {others.map((d) => d.title).join(", ")}</> : "None yet"}>
        <FileRows personId={personId} docs={others} manage={manage} groupBy={labelOf} />
      </MarginFold>

      {archived.length > 0 && (
        <MarginFold label="Archived" note="Kept for the record, restorable any time." summary={<><span className="font-medium text-text-strong">{archived.length} document{archived.length === 1 ? "" : "s"}</span> · {archived.map((d) => d.title).join(", ")}</>}>
          <FileRows personId={personId} docs={archived} manage={manage} groupBy={(d) => (d.archivedAt ? `Archived ${fmtDate(d.archivedAt)}` : "Archived earlier")} />
        </MarginFold>
      )}
    </div>
  );
}

/** Files under small group headings: the icon opens the file, then the title, then restore or archive and delete. */
function FileRows({ personId, docs, manage, groupBy }: { personId: string; docs: ClientDocument[]; manage: boolean; groupBy: (d: ClientDocument) => string }) {
  const groups = new Map<string, ClientDocument[]>();
  for (const d of docs) { const k = groupBy(d); groups.set(k, [...(groups.get(k) ?? []), d]); }
  if (docs.length === 0) return <p className="pt-3 text-[14px] text-muted-foreground">Nothing here yet.</p>;
  return (
    <div className="mt-2">
      {[...groups.entries()].map(([heading, list]) => (
        <div key={heading}>
          <div className="pb-1.5 pt-3 text-[12.5px] font-medium uppercase tracking-[0.06em] text-hint">{heading}</div>
          {list.map((d) => (
            <div key={d.id} className="flex items-center gap-3 border-t border-line-soft py-2">
              <PreviewButton variant="icon" href={`/clients/${personId}/documents/${d.id}`} title={d.title} mime={d.mimeType} />
              <span className="min-w-0 truncate text-[14px] font-medium text-text-strong">{d.title}</span>
              <span className="text-[13px] text-muted-foreground">{d.effectiveOn ? fmtDate(d.effectiveOn) : fmtDate(d.createdAt)}</span>
              {manage && <span className="ml-auto flex gap-1.5"><ArchiveDocument id={d.id} personId={personId} archived={Boolean(d.archivedAt)} icon /><DeleteDocument id={d.id} personId={personId} icon /></span>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
