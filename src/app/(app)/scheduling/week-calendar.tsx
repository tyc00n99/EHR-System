"use client";

import Link from "next/link";
import { cx } from "@/components/kit";

export interface CalShift { id: string; date: string; start: string; end: string; status: string; client: string; staff: string; staffId: string; service: string; code: string }

const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 6am – 9pm
const ROW = 48;
const fmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
const hourOf = (iso: string) => { const p = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "numeric", hour12: false, timeZone: "America/Chicago" }).formatToParts(new Date(iso)); const h = Number(p.find((x) => x.type === "hour")?.value ?? 0) % 24; const m = Number(p.find((x) => x.type === "minute")?.value ?? 0); return h + m / 60; };
/* One color per caregiver, assigned in name order so the legend and the blocks always agree. Translucent tint + solid left edge. */
const STAFF_PALETTE = [
  { block: "bg-blue-500/20 border-blue-500", dot: "bg-blue-500" },
  { block: "bg-violet-500/20 border-violet-500", dot: "bg-violet-500" },
  { block: "bg-teal-500/20 border-teal-500", dot: "bg-teal-500" },
  { block: "bg-amber-500/25 border-amber-500", dot: "bg-amber-500" },
  { block: "bg-pink-500/20 border-pink-500", dot: "bg-pink-500" },
  { block: "bg-emerald-500/20 border-emerald-500", dot: "bg-emerald-500" },
  { block: "bg-sky-500/20 border-sky-500", dot: "bg-sky-500" },
  { block: "bg-orange-500/20 border-orange-500", dot: "bg-orange-500" },
  { block: "bg-indigo-500/20 border-indigo-500", dot: "bg-indigo-500" },
  { block: "bg-rose-500/20 border-rose-500", dot: "bg-rose-500" },
];

/** Stable caregiver → color map for the week: sorted by name, wraps after ten. */
function staffColors(shifts: CalShift[]) {
  const seen = new Map<string, string>();
  for (const s of shifts) seen.set(s.staffId, s.staff);
  const ordered = [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  return new Map(ordered.map(([id, name], i) => [id, { name, ...STAFF_PALETTE[i % STAFF_PALETTE.length] }]));
}

export function WeekCalendar({ start, today, shifts, baseHref, canCreate }: { start: string; today: string; shifts: CalShift[]; baseHref: string; canCreate: boolean }) {
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10); });
  const dayName = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });
  const colors = staffColors(shifts);
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-card shadow-[var(--shadow-sm)]">
      {colors.size > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-line-soft bg-sidebar px-4 py-2 text-[12.5px]">
          <span className="text-muted-foreground">Caregivers</span>
          {[...colors.entries()].map(([id, c]) => <span key={id} className="inline-flex items-center gap-1.5 text-text"><span className={cx("h-2.5 w-2.5 rounded-sm", c.dot)} />{c.name}</span>)}
        </div>
      )}
      <div className="grid border-b border-line" style={{ gridTemplateColumns: "56px repeat(7, minmax(0, 1fr))" }}>
        <div className="border-r border-line-soft" />
        {days.map((d) => { const isToday = d === today; const count = shifts.filter((s) => s.date === d && s.status !== "cancelled").length; return (
          <div key={d} className={cx("border-r border-line-soft px-2 py-2 text-center last:border-r-0", isToday && "bg-primary-soft/50")}>
            <div className={cx("text-[11px] font-medium uppercase tracking-wide", isToday ? "text-primary" : "text-muted-foreground")}>{dayName.format(new Date(d + "T12:00:00Z"))}</div>
            <div className={cx("text-[18px] font-semibold tabular-nums", isToday ? "text-primary" : "text-text-strong")}>{Number(d.slice(8))}</div>
            <div className="text-[11px] text-muted-foreground">{count ? `${count} shift${count === 1 ? "" : "s"}` : "—"}</div>
          </div>
        ); })}
      </div>
      <div className="relative grid overflow-y-auto" style={{ gridTemplateColumns: "56px repeat(7, minmax(0, 1fr))", maxHeight: 640 }}>
        <div className="border-r border-line-soft">{HOURS.map((h) => <div key={h} className="pr-2 text-right text-[11px] text-muted-foreground" style={{ height: ROW }}><span className="relative -top-2">{h === 12 ? "12 pm" : h > 12 ? `${h - 12} pm` : `${h} am`}</span></div>)}</div>
        {days.map((d) => (
          <div key={d} className="relative border-r border-line-soft last:border-r-0">
            {HOURS.map((h) => canCreate ? <Link key={h} href={`${baseHref}&new=1&date=${d}`} className="block border-b border-line-soft hover:bg-hover" style={{ height: ROW }} /> : <div key={h} className="border-b border-line-soft" style={{ height: ROW }} />)}
            {shifts.filter((s) => s.date === d).map((s) => {
              const top = (hourOf(s.start) - HOURS[0]) * ROW, height = Math.max(24, (hourOf(s.end) - hourOf(s.start)) * ROW - 2);
              const cancelled = s.status === "cancelled", done = s.status === "completed", missed = s.status === "missed";
              return (
                <Link key={s.id} href={`${baseHref}&shift=${s.id}`} scroll={false} className={cx("absolute left-1 right-1 overflow-hidden rounded-md border-l-[3px] px-2 py-1 text-text-strong hover:brightness-110", colors.get(s.staffId)?.block ?? "bg-gray-500/20 border-gray-500", cancelled && "opacity-40 line-through", missed && "ring-2 ring-danger", done && "opacity-80")} style={{ top, height }}>
                  <div className="truncate text-[11px] font-semibold leading-4">{fmt.format(new Date(s.start))} · {s.client}</div>
                  <div className="truncate text-[11px] leading-4 text-muted-foreground">{s.staff}</div>
                  {height > 44 && <div className="truncate text-[10.5px] leading-4 text-muted-foreground">{s.service}</div>}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
