"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { MarginSection } from "@/components/chart";
import { FilterMenu } from "@/components/filter-menu";
import { Icon } from "@/components/icons";
import { Button, FormError, Input, cx } from "@/components/kit";
import type { DocumentType } from "@/db/schema";
import { RENEW_OPTIONS } from "@/lib/client-documents";
import { saveDocumentTypes } from "./actions";

interface Row { id?: string; label: string; required: boolean; locked: boolean; renewMonths: number | null; remove?: boolean; tmp: string; /** The row is on the "Custom…" choice: a typed number of months (Sept 24, 2026). */ custom?: boolean }

/**
 * The agency's list of client document types: which are required on every client's checklist and
 * how often each renews. Drag to set the order the checklist shows them in. One Save writes it all.
 */
export function DocumentTypesEditor({ types }: { types: DocumentType[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => types.filter((t) => t.active).map((t) => ({ id: t.id, label: t.label, required: t.required, locked: t.locked, renewMonths: t.renewMonths, tmp: t.id, custom: t.renewMonths != null && !RENEW_OPTIONS.some((o) => o.months === t.renewMonths) })));
  const [state, submit, pending] = useActionState(saveDocumentTypes, {});
  useEffect(() => { if (state.ok) { toast.success("Document list saved."); router.refresh(); } else if (state.message && !state.errors) toast.error(state.message); }, [state, router]);

  const patch = (tmp: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.tmp === tmp ? { ...r, ...p } : r)));
  const add = () => setRows((rs) => [...rs, { label: "", required: true, locked: false, renewMonths: 12, tmp: `new-${Date.now()}` }]);
  const live = rows.filter((r) => !r.remove);

  // Reorder by dragging the handle; the drop target takes the dragged row's place.
  const [drag, setDrag] = useState<string | null>(null);
  const onDrop = (e: DragEvent, target: string) => {
    e.preventDefault();
    if (!drag || drag === target) return;
    setRows((rs) => { const from = rs.findIndex((r) => r.tmp === drag), to = rs.findIndex((r) => r.tmp === target); if (from < 0 || to < 0) return rs; const next = [...rs]; const [m] = next.splice(from, 1); next.splice(to, 0, m); return next; });
    setDrag(null);
  };

  return (
    <form action={submit}>
      <input type="hidden" name="types" value={JSON.stringify(rows.map(({ id, label, required, renewMonths, remove }) => ({ id, label: label.trim(), required, renewMonths, remove: Boolean(remove) })))} />
      <FormError message={state.errors ? (state.message ?? "Check the list.") : undefined} />
      <MarginSection label="Required for every client" note="Ticked types appear on each client's Documents checklist and count toward on file. Unticked ones are still available under Other files. Drag to set the order." action={<button type="button" onClick={add} className="hover:underline">+ Add a document type</button>}>
        <div className="grid grid-cols-[22px_minmax(0,1fr)_220px_28px_28px] items-center gap-x-5 pb-1.5 text-[12.5px] text-muted-foreground"><span /><span>Document</span><span>Renews</span><span /><span /></div>
        {live.map((r) => (
          <div key={r.tmp} draggable onDragStart={() => setDrag(r.tmp)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(e, r.tmp)} className={cx("grid grid-cols-[22px_minmax(0,1fr)_220px_28px_28px] items-center gap-x-5 border-t border-line-soft py-2.5", drag === r.tmp && "opacity-40")}>
            <button type="button" disabled={r.locked} onClick={() => patch(r.tmp, { required: !r.required })} aria-pressed={r.required} aria-label={r.required ? "Required" : "Not required"} title={r.locked ? "Part of the Minnesota 245D minimum" : undefined} className={cx("inline-flex size-[22px] items-center justify-center rounded-md border-[1.5px]", r.required ? "border-text-strong bg-text-strong" : "border-line", r.locked ? "cursor-default" : "hover:border-text-strong")}>{r.required && <Icon.check size={14} className="text-white" />}</button>
            <input value={r.label} onChange={(e) => patch(r.tmp, { label: e.target.value })} placeholder="Name the document" aria-label="Document name" className="h-9 w-full rounded-md border border-transparent bg-transparent px-2 text-[15px] font-medium text-text-strong placeholder:font-normal placeholder:text-hint hover:border-line focus:border-line focus:outline-none" />
            <span className="flex items-center gap-2">
              <FilterMenu aria-label="How often it renews" value={r.custom ? "custom" : r.renewMonths == null ? "once" : String(r.renewMonths)} className={cx("h-9", r.custom ? "w-[124px]" : "w-full")} onChange={(v) => patch(r.tmp, v === "custom" ? { custom: true, renewMonths: r.renewMonths ?? 24 } : { custom: false, renewMonths: v === "once" ? null : Number(v) })} options={[...RENEW_OPTIONS.map((o) => ({ value: o.months == null ? "once" : String(o.months), label: o.label })), { value: "custom", label: "Custom…" }]} />
              {r.custom && <label className="flex items-center gap-1.5 text-[13px] text-muted-foreground">every <Input type="number" min={1} max={120} value={r.renewMonths ?? ""} onChange={(e) => patch(r.tmp, { renewMonths: e.target.value ? Math.max(1, Math.min(120, Number(e.target.value))) : null })} aria-label="Months between renewals" className="h-9 w-16 px-2 text-center" required /> mo</label>}
            </span>
            <span>{!r.locked && <button type="button" onClick={() => (r.id ? patch(r.tmp, { remove: true }) : setRows((rs) => rs.filter((x) => x.tmp !== r.tmp)))} aria-label="Remove" title="Remove from the list" className="flex size-7 items-center justify-center rounded-md text-hint hover:bg-hover hover:text-text-strong"><Icon.plus size={15} className="rotate-45" /></button>}</span>
            <span className="cursor-grab select-none text-center text-[15px] leading-none tracking-[-2px] text-hint" aria-hidden>⋮⋮</span>
          </div>
        ))}
        <p className="pt-4 text-[13px] text-muted-foreground">The five Minnesota 245D items stay required. Removing a type keeps the files already filed under it.</p>
      </MarginSection>
      <div className="flex gap-2 border-t border-line pt-5"><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button><Button type="button" variant="ghost" onClick={() => router.refresh()}>Cancel</Button></div>
    </form>
  );
}
