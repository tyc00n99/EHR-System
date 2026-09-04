"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cx } from "@/components/kit";

/**
 * Today's shifts laid on a clock, with a line at the current time that ticks every minute.
 * A shift still showing as scheduled to the left of the line is someone who has not clocked in.
 */

export interface BoardShift {
  id: string;
  staff: string;
  client: string;
  service: string;
  /** Minutes past midnight, America/Chicago. */
  startMin: number;
  endMin: number;
  startLabel: string;
  endLabel: string;
  status: "scheduled" | "in_progress" | "completed" | "missed" | "cancelled";
}

const TONE: Record<BoardShift["status"], { block: string; dot: string; label: string }> = {
  scheduled: { block: "bg-primary text-primary-foreground", dot: "bg-primary", label: "Scheduled" },
  in_progress: { block: "bg-ok text-white", dot: "bg-ok", label: "Clocked in" },
  completed: { block: "bg-gray-400 text-white", dot: "bg-gray-400", label: "Finished" },
  missed: { block: "bg-danger text-white", dot: "bg-danger", label: "Missed" },
  cancelled: { block: "bg-panel text-muted-foreground line-through", dot: "bg-gray-300", label: "Cancelled" },
};

/** Minutes past midnight in Chicago, read once on mount and again every minute. */
function nowMinutes() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "numeric", hour12: false }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

export function TodayBoard({ shifts }: { shifts: BoardShift[] }) {
  const [now, setNow] = useState(nowMinutes);
  useEffect(() => {
    const t = setInterval(() => setNow(nowMinutes()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Window: the working day, widened only for shifts that fall outside it. The clock line is
  // hidden when the current time sits outside the window, so an early morning does not squash the day.
  const from = Math.min(6 * 60, ...shifts.map((s) => s.startMin));
  const to = Math.max(21 * 60, ...shifts.map((s) => s.endMin));
  const span = Math.max(60, to - from);
  const pct = (min: number) => ((min - from) / span) * 100;
  const hours: number[] = [];
  for (let h = Math.ceil(from / 60); h * 60 <= to; h += span > 10 * 60 ? 2 : 1) hours.push(h);
  const nowVisible = now >= from && now <= to;
  const late = shifts.filter((s) => s.status === "scheduled" && s.startMin < now);

  return (
    <div>
      {shifts.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-[13.5px] text-muted-foreground">Nothing is on the calendar today.</p>
          <Link href="/scheduling" className="mt-2 inline-block text-[13px] font-medium text-primary hover:underline">Open scheduling</Link>
        </div>
      ) : (
        <>
          <div className="divide-y divide-line-soft">
            {shifts.map((s) => {
              const t = TONE[s.status];
              const isLate = s.status === "scheduled" && s.startMin < now;
              return (
                <Link key={s.id} href={`/scheduling?shift=${s.id}`} scroll={false} className="grid grid-cols-[minmax(0,172px)_104px_1fr] items-center gap-4 px-5 py-2.5 hover:bg-hover">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[13.5px] font-medium text-text-strong">{s.staff}</span>
                      {isLate && <span className="rounded bg-danger-soft px-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-danger">late</span>}
                    </div>
                    <div className="truncate text-[12px] text-muted-foreground">{s.client} · {s.service}</div>
                  </div>
                  <div className="font-mono text-[11.5px] text-muted-foreground">{s.startLabel} – {s.endLabel}</div>
                  <div className="relative h-8 rounded-md border border-line-soft bg-sidebar">
                    <div className={cx("absolute inset-y-1 rounded", t.block)} style={{ left: `${pct(s.startMin)}%`, width: `${Math.max(2, pct(s.endMin) - pct(s.startMin))}%` }} title={`${s.startLabel} – ${s.endLabel} · ${t.label}`} />
                    {nowVisible && <div className="absolute -inset-y-0.5 w-0.5 bg-danger" style={{ left: `${pct(now)}%` }} aria-hidden />}
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="grid grid-cols-[minmax(0,172px)_104px_1fr] gap-4 px-5 pt-1">
            <div />
            <div />
            <div className="relative h-4">
              {hours.map((h) => (
                <span key={h} className="absolute -translate-x-1/2 font-mono text-[10.5px] text-muted-foreground" style={{ left: `${pct(h * 60)}%` }}>
                  {h === 12 ? "12p" : h > 12 ? `${h - 12}p` : `${h}a`}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line-soft px-5 py-2.5 text-[12px] text-muted-foreground">
            {(["scheduled", "in_progress", "completed"] as const).map((k) => (
              <span key={k} className="flex items-center gap-1.5"><span className={cx("h-2.5 w-2.5 rounded-sm", TONE[k].dot)} />{TONE[k].label}</span>
            ))}
            {nowVisible && <span className="flex items-center gap-1.5"><span className="h-3 w-0.5 bg-danger" />Now</span>}
            {late.length > 0 && <span className="ml-auto font-medium text-danger">{late.length} shift{late.length === 1 ? "" : "s"} started without a clock-in</span>}
          </div>
        </>
      )}
    </div>
  );
}
