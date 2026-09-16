"use client";

import { CalendarDays, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { RangeKind, VisitRange } from "@/lib/visit-range";

const KINDS: { value: RangeKind; label: string }[] = [{ value: "period", label: "Pay period" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }, { value: "custom", label: "Custom dates" }];

/**
 * The header's range control: what kind of window (pay period, week, month, any dates), arrows
 * to step through windows of that kind, and a "current" link. Custom dates open a small picker.
 * Everything is a link, so the URL is the state and the exports read the same range.
 */
export function RangeNav({ range, base, extra, kindParams }: { range: VisitRange; base: string; extra: string; kindParams: Record<RangeKind, string> }) {
  const router = useRouter();
  const [draft, setDraft] = useState({ from: range.from, to: range.to });
  const [open, setOpen] = useState(false);
  const href = (param: string) => `${base}?${param}${extra ? `&${extra}` : ""}`;
  const kindLabel = KINDS.find((k) => k.value === range.kind)?.label ?? "Pay period";
  const arrow = "flex size-6 items-center justify-center rounded-md hover:bg-tab-hover";
  return (<>
    <DropdownMenu>
      <DropdownMenuTrigger render={<button type="button" aria-label={`View by: ${kindLabel}`} className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-text-strong hover:bg-tab-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" />}>
        <CalendarDays size={15} aria-hidden className="text-muted-foreground" />{kindLabel}<ChevronDown size={14} aria-hidden className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-44">
        <DropdownMenuRadioGroup value={range.kind} onValueChange={(v) => { if (v === "custom") setOpen(true); else router.push(href(kindParams[v as RangeKind])); }}>
          {KINDS.map((k) => <DropdownMenuRadioItem key={k.value} value={k.value} aria-label={k.label} className="py-1.5 pr-9 pl-2.5 text-[14px]">{k.label}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
    <span className="inline-flex items-center gap-1">
      {range.prev && <Link href={href(range.prev)} aria-label={`Previous ${kindLabel.toLowerCase()}`} className={arrow}>‹</Link>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<button type="button" aria-label={`Dates: ${range.label}. Pick other dates`} className="rounded-md px-1 font-medium text-text-strong hover:bg-tab-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" />}>{range.label}</PopoverTrigger>
        <PopoverContent align="start" className="w-auto gap-3 p-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-[12px] font-medium uppercase tracking-[0.06em] text-muted-foreground">From<input type="date" aria-label="From date" value={draft.from} max={draft.to || undefined} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} className="mt-1 block h-9 w-full rounded-md border border-line bg-card px-2 text-[14px] normal-case tracking-normal text-text-strong" /></label>
            <label className="block text-[12px] font-medium uppercase tracking-[0.06em] text-muted-foreground">To<input type="date" aria-label="To date" value={draft.to} min={draft.from || undefined} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} className="mt-1 block h-9 w-full rounded-md border border-line bg-card px-2 text-[14px] normal-case tracking-normal text-text-strong" /></label>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="h-8 rounded-md px-3 text-[13.5px] font-medium hover:bg-hover">Cancel</button>
            <button type="button" disabled={!draft.from || !draft.to || draft.from > draft.to} onClick={() => { setOpen(false); router.push(href(`from=${draft.from}&to=${draft.to}`)); }} className="h-8 rounded-md bg-primary px-3 text-[13.5px] font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50">Show</button>
          </div>
        </PopoverContent>
      </Popover>
      {range.next && <Link href={href(range.next)} aria-label={`Next ${kindLabel.toLowerCase()}`} className={arrow}>›</Link>}
    </span>
    {range.isCurrent ? <span className="text-muted-foreground">· {range.kind === "period" ? "current pay period" : range.kind === "week" ? "this week" : range.kind === "month" ? "this month" : "includes today"}</span> : range.kind !== "custom" && <Link href={href(range.current)} className="text-primary hover:underline">Jump to current</Link>}
  </>);
}
