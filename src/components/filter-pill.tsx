"use client";

import { ChevronDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
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

export interface DatePreset { label: string; param: string; hint?: string; group?: string }

const DAY = 86_400_000;
const utc = (iso: string) => Date.parse(iso + "T00:00:00Z");
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => toIso(utc(iso) + n * DAY);
const monthKey = (iso: string) => iso.slice(0, 7);
const shiftMonth = (ym: string, n: number) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); };
const longMonth = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const shortDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const chicagoToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/** One month of the picker. Days between `from` and `to` are tinted; the ends are filled. */
function Month({ ym, from, to, today, onPick, onPrev, onNext }: { ym: string; from: string; to: string; today: string; onPick: (iso: string) => void; onPrev?: () => void; onNext?: () => void }) {
  const first = `${ym}-01`;
  const gridStart = addDays(first, -new Date(utc(first)).getUTCDay());
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const nav = "flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-tab-hover hover:text-text-strong";
  return (
    <div className="w-[252px]">
      <div className="mb-2 flex h-7 items-center justify-between px-1 text-[14.5px] font-medium text-text-strong">
        {onPrev ? <button type="button" onClick={onPrev} aria-label="Previous month" className={nav}><ChevronLeft size={15} /></button> : <span className="size-7" />}
        <span>{longMonth.format(new Date(utc(first)))}</span>
        {onNext ? <button type="button" onClick={onNext} aria-label="Next month" className={nav}><ChevronRight size={15} /></button> : <span className="size-7" />}
      </div>
      <div className="grid grid-cols-7">
        {DOW.map((d) => <div key={d} className="flex h-6 items-center justify-center text-[13px] font-medium text-muted-foreground">{d}</div>)}
        {cells.map((d) => {
          const out = monthKey(d) !== ym;
          const inRange = d >= from && d <= to, isStart = d === from, isEnd = d === to;
          const band = !out && inRange && !(isStart && isEnd) ? (isStart ? "bg-[linear-gradient(to_right,transparent_50%,var(--primary-soft)_50%)]" : isEnd ? "bg-[linear-gradient(to_left,transparent_50%,var(--primary-soft)_50%)]" : "bg-primary-soft") : "";
          return (
            <button
              key={d}
              type="button"
              onClick={() => onPick(d)}
              aria-label={shortDay.format(new Date(utc(d)))}
              aria-pressed={!out && (isStart || isEnd)}
              className={cx("group flex h-9 items-center justify-center text-[13.5px]", out ? "text-hint" : "text-text", band)}
            >
              <span className={cx("flex size-8 items-center justify-center rounded-full", !out && (isStart || isEnd) ? "bg-primary font-medium text-primary-foreground" : "group-hover:bg-tab-hover", d === today && !(isStart || isEnd) && "shadow-[inset_0_0_0_1.5px_var(--primary)]")}>{Number(d.slice(8))}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The date pill (Sept 21, 2026, the user's pick "A" of three pickers): a rail of the ranges people
 * reach for — pay periods first, because that is how notes are billed — beside two months you
 * click across: first day, then last. Presets carry the query fragment the page understands, so
 * the pill needs no knowledge of pay periods; the calendar only ever emits `from=…&to=…`. No
 * native date input and no OS calendar anywhere in it.
 */
export function DateRangePill({ label, presets, current, onApply }: { label: string; presets: DatePreset[]; current: { param: string; from: string; to: string }; onApply: (param: string) => void }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(current.from);
  const [to, setTo] = useState(current.to);
  const [pending, setPending] = useState(false);
  const [left, setLeft] = useState(shiftMonth(monthKey(current.to || chicagoToday()), -1));
  const today = chicagoToday();
  const reset = () => { setFrom(current.from); setTo(current.to); setPending(false); setLeft(shiftMonth(monthKey(current.to || today), -1)); };
  const pick = (d: string) => {
    if (!pending) { setFrom(d); setTo(d); setPending(true); return; }
    const a = d < from ? d : from, b = d < from ? from : d;
    setFrom(a); setTo(b); setPending(false);
  };
  const dirty = from !== current.from || to !== current.to;
  const days = from && to && !pending ? Math.round((utc(to) - utc(from)) / DAY) + 1 : 0;
  const groups: { name?: string; items: DatePreset[] }[] = [];
  for (const p of presets) { const g = groups.find((x) => x.name === p.group); if (g) g.items.push(p); else groups.push({ name: p.group, items: [p] }); }
  const field = (text: string, on: boolean, name: string) => <span className={cx("flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border px-2.5 text-[14px] text-text-strong", on ? "border-primary ring-[3px] ring-primary-soft" : "border-line")}><span className="text-[13px] text-muted-foreground">{name}</span><span className="truncate">{text}</span></span>;
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) reset(); }}>
      <PopoverTrigger render={<button type="button" aria-label={`Dates: ${label}`} className={cx("inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[14px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30", open ? "border-primary bg-primary-soft text-primary" : "border-line bg-card text-text hover:bg-tab-hover")} />}>
        <span className="truncate">{label}</span><ChevronDown size={14} aria-hidden className="shrink-0 opacity-70" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[780px] max-w-[calc(100vw-24px)] gap-0 p-0">
        <div className="flex">
          {presets.length > 0 && (
            <div className="w-[212px] shrink-0 border-r border-line p-2">
              {groups.map((g, gi) => (
                <div key={g.name ?? gi}>
                  {g.name && <div className="px-2.5 pb-1 pt-2.5 text-[13px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{g.name}</div>}
                  {g.items.map((p) => {
                    const on = !dirty && p.param === current.param;
                    return (
                      <button key={p.param} type="button" onClick={() => { onApply(p.param); setOpen(false); }} className={cx("block w-full rounded-lg px-2.5 py-1.5 text-left text-[14px] leading-tight hover:bg-tab-hover", on && "bg-primary-soft font-medium text-primary")}>
                        {p.label}
                        {p.hint && <span className="mt-0.5 block text-[13px] font-normal text-muted-foreground">{p.hint}</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 px-4 pb-3 pt-4">
              {field(from ? shortDay.format(new Date(utc(from))) : "—", !pending, "From")}
              <span aria-hidden className="text-hint">→</span>
              {field(pending ? "…" : to ? shortDay.format(new Date(utc(to))) : "—", pending, "To")}
            </div>
            <div className="flex flex-wrap gap-5 px-4 pb-2">
              <Month ym={left} from={from} to={to} today={today} onPick={pick} onPrev={() => setLeft(shiftMonth(left, -1))} />
              <Month ym={shiftMonth(left, 1)} from={from} to={to} today={today} onPick={pick} onNext={() => setLeft(shiftMonth(left, 1))} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-line px-4 py-3 text-[14px] text-muted-foreground">
          <span>{pending ? "Now pick the last day" : days > 0 ? <><span className="font-medium text-text-strong">{days} {days === 1 ? "day" : "days"}</span> · {shortDay.format(new Date(utc(from)))} – {shortDay.format(new Date(utc(to)))}</> : "Pick the first day"}</span>
          <span className="flex-1" />
          {presets[0] && <button type="button" onClick={() => { onApply(presets[0].param); setOpen(false); }} className="rounded-md px-2 py-1.5 text-[13.5px] font-medium text-primary hover:bg-tab-hover">Reset</button>}
          <button type="button" disabled={pending || !from || !to} onClick={() => { onApply(`from=${from}&to=${to}`); setOpen(false); }} className="h-9 rounded-lg bg-primary px-4 text-[14px] font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50">Apply</button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
