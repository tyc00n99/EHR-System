"use client";

import { ChevronDown, Search } from "lucide-react";
import { useState } from "react";
import { cx } from "@/components/kit";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface PillOption { value: string; label: string; hint?: string; count?: number }

/**
 * A filter pill in the tool row. Clicking it opens a panel listing every option as a checkbox with
 * its count, a search box when the list is long, and Clear / Apply at the bottom. Nothing changes
 * until Apply (Sept 18, 2026, modelled on DocuSign at the user's request).
 */
export function FilterPill({ label, value, options, onApply, single, search, summary }: {
  label: string;
  value: string[];
  options: PillOption[];
  onApply: (values: string[]) => void;
  /** Radio behaviour: one choice, applied at once. */
  single?: boolean;
  /** Show a search box above the list. */
  search?: boolean;
  /** Text on the pill while something is chosen; defaults to the chosen labels. */
  summary?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(value);
  const [q, setQ] = useState("");
  const active = value.length > 0;
  const chosen = options.filter((o) => value.includes(o.value)).map((o) => o.label);
  const text = active ? (summary ?? (chosen.length <= 2 ? chosen.join(", ") : `${chosen.length} ${label.toLowerCase()}s`)) : label;
  const shown = options.filter((o) => !q.trim() || o.label.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (v: string) => {
    if (single) { onApply([v]); setOpen(false); return; }
    setDraft((d) => (d.includes(v) ? d.filter((x) => x !== v) : [...d, v]));
  };
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) { setDraft(value); setQ(""); } }}>
      <PopoverTrigger render={<button type="button" aria-label={`${label}: ${active ? chosen.join(", ") : "any"}`} className={cx("inline-flex h-9 max-w-[260px] items-center gap-1.5 rounded-lg border px-3 text-[14px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30", active || open ? "border-primary bg-primary-soft text-primary" : "border-line bg-card text-text hover:bg-tab-hover")} />}>
        <span className="truncate">{text}</span><ChevronDown size={14} aria-hidden className="shrink-0 opacity-70" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[300px] gap-0 p-0">
        <div className="px-3.5 pb-1.5 pt-3 text-[13px] font-semibold text-text-strong">{label}</div>
        {search && (
          <div className="relative mx-3 mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label={`Search ${label.toLowerCase()}`} className="h-8 w-full rounded-md border border-line bg-card pl-8 pr-2 text-[13.5px] outline-none focus:border-primary" />
          </div>
        )}
        <div className="max-h-72 overflow-y-auto">
          {shown.length === 0 && <p className="px-3.5 py-2 text-[13.5px] text-muted-foreground">Nothing matches.</p>}
          {shown.map((o) => {
            const on = single ? value.includes(o.value) : draft.includes(o.value);
            return (
              <label key={o.value} className={cx("flex cursor-pointer items-center gap-2.5 px-3.5 py-2 text-[14px]", on && "bg-tab-hover")}>
                <input type={single ? "radio" : "checkbox"} checked={on} onChange={() => toggle(o.value)} className="size-4 accent-[var(--primary)]" />
                <span className="min-w-0 flex-1 truncate">{o.label}{o.hint && <span className="text-muted-foreground"> · {o.hint}</span>}</span>
                {o.count != null && <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">{o.count}</span>}
              </label>
            );
          })}
        </div>
        {!single && (
          <div className="flex items-center gap-2 border-t border-line-soft px-3 py-2.5">
            <button type="button" onClick={() => { setDraft([]); }} className="text-[13.5px] font-medium text-primary hover:underline">Clear</button>
            <button type="button" onClick={() => { onApply(draft); setOpen(false); }} className="ml-auto h-8 rounded-md bg-primary px-3.5 text-[13.5px] font-medium text-primary-foreground hover:bg-primary-hover">Apply</button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * The date pill: a list of the ranges people reach for, plus custom dates. Each preset carries the
 * query fragment the page understands, so the pill needs no date logic of its own.
 */
export function DateRangePill({ label, presets, current, onApply }: { label: string; presets: { label: string; param: string }[]; current: { param: string; from: string; to: string }; onApply: (param: string) => void }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [from, setFrom] = useState(current.from);
  const [to, setTo] = useState(current.to);
  const field = "mt-1 block h-9 w-full rounded-md border border-line bg-card px-2 text-[14px] text-text-strong";
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) { setCustom(false); setFrom(current.from); setTo(current.to); } }}>
      <PopoverTrigger render={<button type="button" aria-label={`Dates: ${label}`} className={cx("inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[14px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30", open ? "border-primary bg-primary-soft text-primary" : "border-line bg-card text-text hover:bg-tab-hover")} />}>
        <span className="truncate">{label}</span><ChevronDown size={14} aria-hidden className="shrink-0 opacity-70" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[300px] gap-0 p-0">
        <div className="px-3.5 pb-1.5 pt-3 text-[13px] font-semibold text-text-strong">Dates</div>
        {!custom ? (<>
          {presets.map((p) => {
            const on = p.param === current.param;
            return <button key={p.param} type="button" onClick={() => { onApply(p.param); setOpen(false); }} className={cx("flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[14px] hover:bg-tab-hover", on && "bg-tab-hover font-medium text-primary")}>{p.label}</button>;
          })}
          <button type="button" onClick={() => setCustom(true)} className="flex w-full items-center gap-2.5 border-t border-line-soft px-3.5 py-2.5 text-left text-[14px] hover:bg-tab-hover">Custom dates…</button>
        </>) : (
          <div className="p-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-[12px] font-medium uppercase tracking-[0.06em] text-muted-foreground">From<input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={cx(field, "normal-case tracking-normal")} /></label>
              <label className="block text-[12px] font-medium uppercase tracking-[0.06em] text-muted-foreground">To<input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={cx(field, "normal-case tracking-normal")} /></label>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <button type="button" onClick={() => setCustom(false)} className="text-[13.5px] font-medium text-primary hover:underline">Back</button>
              <button type="button" disabled={!from || !to || from > to} onClick={() => { onApply(`from=${from}&to=${to}`); setOpen(false); }} className="h-8 rounded-md bg-primary px-3.5 text-[13.5px] font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50">Apply</button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
