"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icons";
import { fmtDate } from "@/lib/format";
import { setDiagnosisArchived } from "./profile-actions";

/** The archive control on a diagnosis card, beside Edit and Remove. */
export function ArchiveDiagnosisButton({ personId, id }: { personId: string; id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => { const r = await setDiagnosisArchived(personId, id, true); if (r.error) toast.error(r.error); else toast.success(r.message ?? "Archived."); })}
      aria-label="Archive diagnosis"
      title="Archive: resolved or no longer relevant"
      className="flex size-10 items-center justify-center rounded-lg border border-line text-muted-foreground hover:bg-hover hover:text-text-strong disabled:opacity-50"
    >
      <Icon.archive size={20} />
    </button>
  );
}

export interface ArchivedDiagnosis { id: string; icdCode: string; description: string; archivedAt: Date }

/** Archived diagnoses fold under the list, each with Restore (user, Sept 29, 2026). */
export function ArchivedDiagnoses({ personId, items, manage }: { personId: string; items: ArchivedDiagnosis[]; manage: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  if (items.length === 0) return null;
  return (
    <div className="max-w-[680px]">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 text-[13.5px] font-medium text-text-strong hover:underline">
        <Icon.chevronRight size={15} className={open ? "rotate-90 transition-transform" : "transition-transform"} />
        {items.length} archived diagnos{items.length === 1 ? "is" : "es"}
      </button>
      {open && (
        <ul className="mt-2 divide-y divide-line-soft rounded-xl border border-line">
          {items.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="ident w-16 shrink-0 text-[14px] text-muted-foreground">{d.icdCode}</span>
              <span className="min-w-0 flex-1 text-[14px] text-text-strong">{d.description}</span>
              <span className="shrink-0 text-[13px] text-muted-foreground">Archived {fmtDate(d.archivedAt)}</span>
              {manage && (
                <button type="button" disabled={pending} onClick={() => start(async () => { const r = await setDiagnosisArchived(personId, d.id, false); if (r.error) toast.error(r.error); else toast.success(r.message ?? "Restored."); })} className="shrink-0 text-[13px] font-medium text-primary hover:underline disabled:opacity-50">Restore</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
