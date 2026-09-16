"use client";

import { ArrowUpDown, BarChart3, CalendarDays, ChevronDown, ChevronUp, FileText, Flag, PenLine, Wrench } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { DownloadButton } from "@/components/download-button";
import { cx } from "@/components/kit";
import { FilterMenu } from "@/components/filter-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { labelForCode } from "@/lib/hcpcs";
import { fmtDate } from "@/lib/format";

const TZ = "America/Chicago";
const time = new Intl.DateTimeFormat("en-US", { timeStyle: "short", timeZone: TZ });
const dayKey = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TZ });
const monthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: TZ });
const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: TZ });
const year = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: TZ });
const num = (n: number) => n.toLocaleString("en-US");
const shortDay = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(iso + "T12:00:00Z"));
const shortDayYear = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(iso + "T12:00:00Z"));
/** "Sep 1 – Sep 16, 2026", or the default window when no dates are set. */
function rangeLabel(from: string, to: string): string {
  if (!from && !to) return "Last 90 days";
  if (from && to) return from.slice(0, 4) === to.slice(0, 4) ? `${shortDay(from)} – ${shortDayYear(to)}` : `${shortDayYear(from)} – ${shortDayYear(to)}`;
  return from ? `From ${shortDayYear(from)}` : `Through ${shortDayYear(to)}`;
}

export interface NoteRow {
  id: string; clockInAt: Date; clockOutAt: Date | null; serviceCode: string; modifiers: string[]; units: number; status: string; returned: boolean;
  note: string | null; interaction: string | null; skills: string[]; activities: string[]; staff: string; staffSigned: boolean; clientSigned: boolean;
  approved: boolean; manual: boolean; edits: number; goalYes: number; goalNo: number;
}

export interface NoteFilters { service: string; from: string; to: string; staff: string; signed: "" | "unsigned"; sort: "newest" | "oldest" }

/** Days between two instants on the Chicago calendar, so an overnight shift says so. */
function daysApart(a: Date, b: Date): number {
  const ka = dayKey.format(a), kb = dayKey.format(b);
  return Math.round((Date.parse(kb + "T12:00:00Z") - Date.parse(ka + "T12:00:00Z")) / 86_400_000);
}

const unsigned = (r: NoteRow) => r.status === "completed" && !r.clientSigned;

const cell = "relative flex h-10 items-center gap-1.5 border-r border-line-soft px-3 text-[14px] text-text-strong";
const cellLabel = "text-[12px] font-medium uppercase tracking-[0.06em] text-muted-foreground";
const cellButton = "hover:bg-tab-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30";

/**
 * The client's Sessions tab: every visit in the range, grouped by the Chicago date it started,
 * newest day first. The narrative is always in view; interaction, skills, goals and activities
 * sit behind "Show details"; a card can also fold to its heading. Filters are a plain GET form
 * so the URL is the state and the PDF export sees the same service, staff and date selection.
 */
export function NotesTab({ personId, rows, codes, staffOptions, filters, base, totalNotes, capped }: {
  personId: string; rows: NoteRow[]; codes: { code: string; label: string }[]; staffOptions: { id: string; name: string }[];
  filters: NoteFilters; base: string; totalNotes: number; capped: boolean;
}) {
  const formId = `notes-filters-${personId}`;
  const formRef = useRef<HTMLFormElement>(null);
  const fromRef = useRef<HTMLInputElement>(null);
  const toRef = useRef<HTMLInputElement>(null);
  const submit = () => formRef.current?.requestSubmit();
  // The date picker lives in a popover outside the form, so it edits a draft and writes the two
  // hidden inputs on Apply; the other controls keep the chosen range because it is always in the form.
  const [draft, setDraft] = useState({ from: filters.from, to: filters.to });
  const applyRange = (from: string, to: string) => { if (fromRef.current) fromRef.current.value = from; if (toRef.current) toRef.current.value = to; submit(); };
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v && !(k === "sort" && v === "newest")) q.set(k, v);
  const exportQ = new URLSearchParams();
  // The PDF route still calls the service filter "code".
  if (filters.service) exportQ.set("code", filters.service);
  for (const k of ["from", "to", "staff"] as const) if (filters[k]) exportQ.set(k, filters[k]);
  const filtered = Boolean(filters.service || filters.from || filters.to || filters.staff || filters.signed);

  const units = rows.filter((r) => r.status === "completed").reduce((n, r) => n + r.units, 0);
  const groups = useMemo(() => {
    const dir = filters.sort === "oldest" ? 1 : -1;
    const byDay = new Map<string, NoteRow[]>();
    for (const r of rows) { const k = dayKey.format(r.clockInAt); byDay.set(k, [...(byDay.get(k) ?? []), r]); }
    return [...byDay.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0) * dir)
      .map(([key, items]) => ({ key, items: items.sort((a, b) => (a.clockInAt.getTime() - b.clockInAt.getTime()) * dir), units: items.filter((r) => r.status === "completed").reduce((n, r) => n + r.units, 0) }));
  }, [rows, filters.sort]);

  const toggle = "px-3.5 text-[14px] font-medium text-text transition-colors hover:bg-tab-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30";
  const toggleOn = "text-primary shadow-[inset_0_-2px_0_var(--primary)]";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="text-[24px] font-semibold leading-none tracking-[-0.01em] text-text-strong">Sessions</h2>
        <span className="text-[13.5px] tabular-nums">
          {num(rows.length)} {rows.length === 1 ? "session" : "sessions"} · {num(units)} units
          {(filtered || capped) && <span className="text-muted-foreground"> · {num(totalNotes)} notes on file</span>}
          {filtered && <> · <Link href={`${base}?tab=notes`} className="font-medium text-primary hover:underline">Clear filters</Link></>}
        </span>
        <div className="ml-auto"><DownloadButton href={`/clients/${personId}/notes.pdf?${exportQ}`} variant="outline">Download PDF</DownloadButton></div>
      </div>

      {/* One bar, hairline dividers, our own chevrons: the native select and date skins never show. */}
      <form id={formId} ref={formRef} action={base} className="mb-5 flex flex-wrap items-stretch rounded-[10px] border border-line bg-card text-[14px]">
        <input type="hidden" name="tab" value="notes" />
        <input ref={fromRef} type="hidden" name="from" defaultValue={filters.from} />
        <input ref={toRef} type="hidden" name="to" defaultValue={filters.to} />
        <FilterMenu variant="cell" submit label="Service" name="service" value={filters.service} options={[{ value: "", label: "All services" }, ...codes.map((c) => ({ value: c.code, label: c.label, hint: c.code }))]} />
        <Popover>
          <PopoverTrigger render={<button type="button" aria-label={`Dates: ${rangeLabel(filters.from, filters.to)}`} className={cx(cell, cellButton)} />}>
            <span className={cellLabel}>Dates</span>
            <CalendarDays size={15} aria-hidden className="text-muted-foreground" />
            <span className="whitespace-nowrap">{rangeLabel(filters.from, filters.to)}</span>
            <ChevronDown size={15} aria-hidden className="text-muted-foreground" />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto gap-3 p-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-[12px] font-medium uppercase tracking-[0.06em] text-muted-foreground">From<input type="date" aria-label="From date" value={draft.from} max={draft.to || undefined} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} className="mt-1 block h-9 w-full rounded-md border border-line bg-card px-2 text-[14px] normal-case tracking-normal text-text-strong" /></label>
              <label className="block text-[12px] font-medium uppercase tracking-[0.06em] text-muted-foreground">To<input type="date" aria-label="To date" value={draft.to} min={draft.from || undefined} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} className="mt-1 block h-9 w-full rounded-md border border-line bg-card px-2 text-[14px] normal-case tracking-normal text-text-strong" /></label>
            </div>
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={() => applyRange("", "")} className="text-[13.5px] font-medium text-primary hover:underline">Last 90 days</button>
              <button type="button" onClick={() => applyRange(draft.from, draft.to)} className="h-8 rounded-md bg-primary px-3 text-[13.5px] font-medium text-primary-foreground hover:bg-primary-hover">Apply</button>
            </div>
          </PopoverContent>
        </Popover>
        {staffOptions.length > 0 && <FilterMenu variant="cell" submit label="Staff" name="staff" value={filters.staff} options={[{ value: "", label: "All staff" }, ...staffOptions.map((o) => ({ value: o.id, label: o.name }))]} />}
        <div className="min-w-4 flex-1" />
        <div className="flex items-stretch border-l border-line-soft" role="group" aria-label="Signature">
          <button type="submit" name="signed" value="" aria-pressed={filters.signed === ""} className={cx(toggle, filters.signed === "" && toggleOn)}>All notes</button>
          <button type="submit" name="signed" value="unsigned" aria-pressed={filters.signed === "unsigned"} className={cx(toggle, filters.signed === "unsigned" && toggleOn)}>Unsigned</button>
        </div>
        <FilterMenu variant="cell" submit className="border-r-0" name="sort" value={filters.sort} icon={<ArrowUpDown size={15} aria-hidden className="text-muted-foreground" />} options={[{ value: "newest", label: "Newest first" }, { value: "oldest", label: "Oldest first" }]} />
      </form>

      {capped && <p className="mb-4 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-[13.5px] text-warn">Only the first {num(rows.length)} sessions in this range are shown. Narrow the dates to see the rest.</p>}

      {rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center text-[14px]">
          {filtered ? "No sessions match these filters." : "No sessions in this range yet."}
          {filtered && <> <Link href={`${base}?tab=notes`} className="font-medium text-primary hover:underline">Clear filters</Link></>}
        </div>
      )}

      {groups.map((g) => {
        const first = g.items[0].clockInAt;
        return (
          <section key={g.key} aria-labelledby={`day-${g.key}`} className="grid gap-3 md:grid-cols-[140px_minmax(0,1fr)] md:gap-0">
            <div className="md:sticky md:top-0 md:self-start md:bg-page md:pb-3 md:pr-4 md:pt-2">
              <h3 id={`day-${g.key}`} className="text-[22px] font-semibold leading-tight tracking-[-0.01em] text-text-strong">{monthDay.format(first)}</h3>
              <div className="text-[14px]">{weekday.format(first)}, {year.format(first)}</div>
              <div className="mt-0.5 text-[13px] tabular-nums text-muted-foreground">{g.items.length} {g.items.length === 1 ? "session" : "sessions"} · {num(g.units)} units</div>
            </div>
            <div className="relative space-y-3 pb-6 md:border-l md:border-line md:pl-7">
              <span aria-hidden className="absolute -left-[5.5px] top-3 hidden size-2.5 rounded-full bg-primary md:block" />
              {g.items.map((r) => <SessionCard key={r.id} r={r} href={`${base}?tab=notes&${q}${q.size ? "&" : ""}visit=${r.id}`} />)}
            </div>
          </section>
        );
      })}

      {rows.length > 0 && <p className="text-[13px] text-muted-foreground">{fmtDate(groups[groups.length - 1].items[0].clockInAt)} to {fmtDate(groups[0].items[0].clockInAt)}{filters.sort === "oldest" ? ", oldest first" : ", newest first"}.</p>}
    </div>
  );
}

function Pill({ tone, icon, children }: { tone: "warn" | "neutral" | "accent"; icon?: ReactNode; children: ReactNode }) {
  const cls = { warn: "bg-warn-soft text-warn", neutral: "bg-panel text-text", accent: "bg-primary-soft text-primary" }[tone];
  return <span className={cx("inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-[13.5px] font-medium", cls)}>{icon}{children}</span>;
}

function SessionCard({ r, href }: { r: NoteRow; href: string }) {
  const [open, setOpen] = useState(false);
  const [folded, setFolded] = useState(false);
  const extra = r.clockOutAt ? daysApart(r.clockInAt, r.clockOutAt) : 0;
  const title = labelForCode(r.serviceCode, r.modifiers);
  const review = r.returned ? { tone: "warn" as const, label: "Returned" } : r.approved ? null : r.status === "in_progress" ? { tone: "accent" as const, label: "In progress" } : r.note ? { tone: "neutral" as const, label: "Draft" } : { tone: "neutral" as const, label: "No note" };
  const detailsId = `details-${r.id}`;
  const hasDetails = Boolean(r.interaction || r.skills.length || r.activities.length || r.goalYes + r.goalNo > 0 || r.manual || r.edits > 0);

  return (
    <article className="rounded-xl border border-line bg-card" aria-label={`${title}, ${time.format(r.clockInAt)}`}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2 px-5 pt-4">
        <button type="button" onClick={() => setFolded((v) => !v)} aria-expanded={!folded} aria-label={folded ? "Expand session" : "Collapse session"} className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-hover hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
          {folded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
        <div className="min-w-0 flex-1 basis-56">
          <h4 className="text-[18px] font-semibold leading-snug text-text-strong">{title}</h4>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[14px] tabular-nums">
            <span>{time.format(r.clockInAt)}{r.clockOutAt ? ` – ${time.format(r.clockOutAt)}` : ""}{extra > 0 && <span className="text-muted-foreground"> (+{extra} day{extra === 1 ? "" : "s"})</span>}</span>
            <span aria-hidden className="text-hint">·</span><span>{r.staff}</span>
            <span aria-hidden className="text-hint">·</span><span>{r.serviceCode}{r.modifiers.length ? ` ${r.modifiers.join(" ")}` : ""}</span>
            <span aria-hidden className="text-hint">·</span><span>{num(r.units)} units</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {review && <Pill tone={review.tone}>{review.label}</Pill>}
          {unsigned(r) && <Pill tone="warn" icon={<PenLine size={15} aria-hidden />}>Unsigned</Pill>}
          {r.manual && <Pill tone="warn">Manual</Pill>}
          {r.edits > 0 && <Pill tone="neutral">Edited</Pill>}
          {folded && <Link href={href} scroll={false} aria-label="Open note" className="flex size-7 items-center justify-center rounded-md text-primary hover:bg-hover"><FileText size={16} /></Link>}
        </div>
      </div>

      {!folded && (<>
        <div className="mx-5 mt-3 border-t border-line-soft pt-3">
          <div className="text-[13px] text-muted-foreground">Progress review</div>
          <p className={cx("mt-1 whitespace-pre-line text-[16px] leading-7", r.note ? "text-text-strong" : "italic text-muted-foreground")}>{r.note ?? "No note yet."}</p>
        </div>

        {open && hasDetails && (
          <div id={detailsId} className="mx-5 mt-3 border-t border-line-soft pt-3">
            <dl className="grid gap-4 sm:grid-cols-3">
              {r.interaction && <Detail icon={<BarChart3 size={18} aria-hidden />} label="Interaction"><span className="capitalize">{r.interaction}</span></Detail>}
              {r.skills.length > 0 && <Detail icon={<Wrench size={18} aria-hidden />} label="Skills">{r.skills.join(", ")}</Detail>}
              {r.goalYes + r.goalNo > 0 && <Detail icon={<Flag size={18} aria-hidden />} label="Goals">{r.goalYes} yes · {r.goalNo} no</Detail>}
            </dl>
            {r.activities.length > 0 && <div className="mt-3"><div className="text-[13px] text-muted-foreground">Daily activities</div><ul className="mt-1 list-disc space-y-0.5 pl-5 text-[14px]">{r.activities.map((a) => <li key={a}>{a}</li>)}</ul></div>}
            {(r.manual || r.edits > 0) && <p className="mt-3 text-[13px] text-muted-foreground">{[r.manual && "Entered manually rather than by clock-in.", r.edits > 0 && `Edited ${r.edits} time${r.edits === 1 ? "" : "s"} after it was written.`].filter(Boolean).join(" ")}</p>}
          </div>
        )}

        <div className="mx-5 mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line-soft py-3">
          {hasDetails ? (
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={detailsId} className="inline-flex items-center gap-1.5 rounded-md text-[14px] font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
              {open ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}{open ? "Hide details" : "Show details"}
            </button>
          ) : <span className="text-[13px] text-muted-foreground">No further details recorded.</span>}
          <Link href={href} scroll={false} className="inline-flex items-center gap-1.5 rounded-md text-[14px] font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"><FileText size={16} aria-hidden />Open note</Link>
        </div>
      </>)}
    </article>
  );
}

function Detail({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 sm:border-l sm:border-line-soft sm:pl-4 sm:first:border-l-0 sm:first:pl-0">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <div className="min-w-0"><dt className="text-[13px] text-muted-foreground">{label}</dt><dd className="text-[15px] text-text-strong">{children}</dd></div>
    </div>
  );
}
