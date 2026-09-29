"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, Field, FormError, Input } from "@/components/kit";
import { DateInput } from "@/components/date-input";
import { Icon } from "@/components/icons";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DateRangePill, type DatePreset } from "@/components/filter-pill";
import { fmtDate, fmtMoney } from "@/lib/format";
import { addPayRate, deletePayRate, setOvertimeExempt } from "../pay-actions";
import type { ActionState } from "@/lib/validation";

const BLUR = "bg-black/20 supports-backdrop-filter:backdrop-blur-sm";

function Window({ title, onClose, width = "sm:max-w-[640px]", children }: { title: string; onClose: () => void; width?: string; children: React.ReactNode }) {
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent showCloseButton={false} overlayClassName={BLUR} className={`block max-h-[calc(100vh-3rem)] w-[calc(100%-2rem)] overflow-y-auto p-0 ${width}`}>
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <div className="flex items-center gap-3 border-b border-line px-6 py-4">
          <div className="text-[19px] font-semibold text-text-strong">{title}</div>
          <button type="button" onClick={onClose} aria-label="Close" className="ml-auto flex size-8 items-center justify-center rounded-lg border border-line text-muted-foreground hover:bg-hover hover:text-text-strong"><Icon.plus size={17} className="rotate-45" /></button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * ‹ dates › (Sept 29, 2026: "just do a calendar option where I can put the date I want to start and the
 * date I want to end"). The middle is the same two-month calendar the Notes list uses: pick a start and
 * an end, or a preset. The arrows step by the same number of days.
 */
export function PayRangePicker({ base, label, prev, next, presets, current }: { base: string; label: string; prev: string; next: string; presets: DatePreset[]; current: { from: string; to: string; param: string } }) {
  const router = useRouter();
  // The calendar hands back `from=…&to=…`; the Pay tab keeps its own names so it never clashes with the Notes filters.
  const go = (param: string) => router.push(`${base}&${param.replace(/^from=/, "payFrom=").replace("&to=", "&payTo=")}`);
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={() => go(prev)} aria-label="Earlier dates" className="flex size-9 items-center justify-center rounded-lg border border-line hover:bg-hover"><Icon.chevronLeft size={16} /></button>
      <DateRangePill label={label} presets={presets} current={current} onApply={go} />
      <button type="button" onClick={() => go(next)} aria-label="Later dates" className="flex size-9 items-center justify-center rounded-lg border border-line hover:bg-hover"><Icon.chevronRight size={16} /></button>
    </div>
  );
}

export function ExemptSwitch({ staffId, exempt, canEdit }: { staffId: string; exempt: boolean; canEdit: boolean }) {
  const [pending, start] = useTransition();
  if (!canEdit) return <span>{exempt ? "Exempt from overtime" : "Overtime applies"}</span>;
  return (
    <label className="inline-flex cursor-pointer items-center gap-2">
      <input type="checkbox" checked={exempt} disabled={pending} onChange={(e) => { const v = e.target.checked; start(async () => { const r = await setOvertimeExempt(staffId, v); if (r.error) toast.error(r.error); else toast.success(r.message ?? "Saved."); }); }} className="size-4 accent-[var(--primary)]" />
      Exempt from overtime
    </label>
  );
}

export interface RateView { id: string; rate: string; effectiveFrom: string; note: string | null }

/** Pay rate history, newest first, with a change dated when it takes effect. */
export function RateHistory({ staffId, rates, canEdit, today }: { staffId: string; rates: RateView[]; canEdit: boolean; today: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [state, action, saving] = useActionState(async (prev: ActionState, fd: FormData) => {
    const r = await addPayRate(staffId, prev, fd);
    if (r.ok) { toast.success(r.message ?? "Saved."); setOpen(false); }
    return r;
  }, {} as ActionState);
  const e = state.errors ?? {};
  const newest = [...rates].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  const inEffect = newest.find((r) => r.effectiveFrom <= today)?.id;
  return (
    <div>
      <ul className="divide-y divide-line-soft">
        {newest.map((r) => (
          <li key={r.id} className="flex items-center gap-3 py-2.5">
            <span className="w-24 shrink-0 text-[15px] font-semibold tabular-nums text-text-strong">{fmtMoney(r.rate)}<span className="text-[13px] font-normal text-muted-foreground">/hr</span></span>
            <span className="min-w-0 flex-1 text-[13.5px]">
              {r.effectiveFrom > today ? "Starts" : "From"} {fmtDate(r.effectiveFrom)}
              {r.id === inEffect && <span className="ml-2 rounded-md bg-ok-soft px-1.5 py-0.5 text-[12px] font-medium text-ok">In effect</span>}
              {r.note && <span className="block text-[13px] text-muted-foreground">{r.note}</span>}
            </span>
            {canEdit && rates.length > 1 && (
              <button type="button" disabled={pending} onClick={() => { if (confirm(`Remove ${fmtMoney(r.rate)}/hr from ${fmtDate(r.effectiveFrom)}? Use this only for a rate entered by mistake.`)) start(async () => { const x = await deletePayRate(staffId, r.id); if (x.error) toast.error(x.error); else toast.success(x.message ?? "Removed."); }); }} className="text-[13px] font-medium text-danger hover:underline disabled:opacity-50">Remove</button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && <button type="button" onClick={() => setOpen(true)} className="mt-2 text-[13px] font-medium text-primary hover:underline">Change pay rate →</button>}
      {open && (
        <Window title="Change pay rate" onClose={() => setOpen(false)} width="sm:max-w-[520px]">
          <form action={action} className="grid gap-4">
            <FormError message={state.errors ? state.message : state.error} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="New hourly rate" error={e.rate}><Input name="rate" inputMode="decimal" placeholder="18.50" required /></Field>
              <Field label="Takes effect" error={e.effectiveFrom} hint="Earlier dates re-price those days"><DateInput name="effectiveFrom" defaultValue={today} required /></Field>
            </div>
            <Field label="Note" hint="Optional, e.g. annual raise"><Input name="note" /></Field>
            <div className="flex gap-2"><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save rate"}</Button><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>
          </form>
        </Window>
      )}
    </div>
  );
}
