"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { cx } from "@/components/kit";
import { serviceColor } from "@/components/chart";

/**
 * The schedule grid: one row per participant, one column per day, exactly as the reference draws it.
 * The row axis is the only thing that changes between the two modes — clients down the side in
 * "Clients", caregivers in "Team" — so both come through the same component.
 */

export interface GridEvent {
  id: string;
  date: string;                 // yyyy-mm-dd in Chicago
  rowId: string;
  time: string;                 // "9:00a – 1:00p"
  title: string;                // the other participant
  service: string;
  code: string;
  status: "scheduled" | "in_progress" | "completed" | "cancelled" | "missed";
}

export interface GridRow {
  id: string;
  name: string;
  meta?: string;
  href: string;
  /** yyyy-mm-dd the person cannot work or be seen. Drawn as the reference's grey "Unavailable". */
  unavailable?: string[];
}

export interface GridDay {
  date: string;
  label: string;   // "Sun 6"
  today: boolean;
}

const STATUS: Record<GridEvent["status"], { chip: string; note?: string }> = {
  scheduled: { chip: "border-line bg-card" },
  in_progress: { chip: "border-ok bg-ok-soft", note: "In progress" },
  completed: { chip: "border-line bg-panel", note: "Completed" },
  cancelled: { chip: "border-danger bg-danger-soft", note: "Cancelled" },
  missed: { chip: "border-warn bg-warn-soft", note: "Missed" },
};

export function ScheduleGrid({
  rows, days, events, axisLabel, emptyLabel, canCreate,
}: {
  rows: GridRow[];
  days: GridDay[];
  events: GridEvent[];
  axisLabel: string;
  emptyLabel: string;
  canCreate: boolean;
}) {
  const [menu, setMenu] = useState<string | null>(null);
  const cols = `256px repeat(${days.length}, minmax(150px, 1fr))`;

  return (
    <div className="min-w-0 flex-1 overflow-auto">
      <div className="min-w-[980px]">
        {/* Column headings. The reference tints today's column from the header down. */}
        <div className="sticky top-0 z-10 grid border-b border-line bg-panel" style={{ gridTemplateColumns: cols }}>
          <div className="flex items-center gap-2 border-r border-line px-4 py-2">
            <span className="text-[14.5px] font-semibold text-text-strong">{axisLabel}</span>
            <span className="rounded bg-primary-soft px-1.5 text-[13px] font-medium text-primary">{rows.length} total</span>
          </div>
          {days.map((d) => (
            <div
              key={d.date}
              className={cx("border-r border-line px-4 py-2 text-[14px] last:border-r-0", d.today ? "bg-primary-soft font-semibold text-primary" : "text-muted-foreground")}
            >
              {d.label}
            </div>
          ))}
        </div>

        {rows.length === 0 && <p className="px-4 py-10 text-center text-[14px] text-muted-foreground">{emptyLabel}</p>}

        {rows.map((r) => (
          <div key={r.id} className="grid border-b border-line" style={{ gridTemplateColumns: cols }}>
            <div className="relative border-r border-line px-4 py-3">
              <div className="flex items-start gap-1.5">
                <Link href={r.href} className="min-w-0 flex-1 text-[14.5px] font-semibold text-text-strong hover:underline">
                  {r.name}
                </Link>
                <button
                  type="button"
                  onClick={() => setMenu((m) => (m === r.id ? null : r.id))}
                  aria-label={`Actions for ${r.name}`}
                  className="-mr-1 flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-hover hover:text-text-strong"
                >
                  ⋮
                </button>
              </div>
              {r.meta && <div className="mt-0.5 text-[13px] text-muted-foreground">{r.meta}</div>}

              {menu === r.id && (
                <div className="absolute left-4 top-10 z-20 w-52 rounded-lg border border-line bg-card py-1 shadow-lg">
                  {[
                    { label: "Availability", href: `${r.href}?tab=profile&section=availability` },
                    { label: "Authorized hours", href: `${r.href}?tab=profile&section=authorizations` },
                    { label: "Bulk cancel", href: `/scheduling/bulk?row=${r.id}` },
                  ].map((a) => (
                    <Link
                      key={a.label}
                      href={a.href}
                      onClick={() => setMenu(null)}
                      className="block px-3 py-1.5 text-[14px] text-text hover:bg-hover"
                    >
                      {a.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {days.map((d) => {
              const cell = events.filter((e) => e.rowId === r.id && e.date === d.date);
              const off = r.unavailable?.includes(d.date);
              return (
                <div key={d.date} className={cx("group/cell relative min-h-[116px] border-r border-line p-1.5 last:border-r-0", d.today && "bg-primary-soft/40")}>
                  {off && cell.length === 0 && (
                    <div className="rounded-md bg-panel px-2 py-1.5 text-[13px] text-muted-foreground">Unavailable</div>
                  )}
                  {cell.map((e) => {
                    const s = STATUS[e.status];
                    return (
                      <Link
                        key={e.id}
                        href={`/scheduling?shift=${e.id}`}
                        scroll={false}
                        className={cx("mb-1.5 block rounded-md border px-2 py-1.5 transition-colors hover:border-primary", s.chip)}
                      >
                        <span className="flex items-center gap-1.5">
                          <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: serviceColor(e.code) }} />
                          <span className="ident truncate text-[13px] text-muted-foreground">{e.time}</span>
                        </span>
                        <span className={cx("mt-0.5 block truncate text-[14px] font-medium text-text-strong", e.status === "cancelled" && "line-through")}>
                          {e.title}
                        </span>
                        <span className="block truncate text-[13px] text-muted-foreground">{s.note ?? e.service}</span>
                      </Link>
                    );
                  })}
                  {canCreate && (
                    <Link
                      href={`/scheduling/new?date=${d.date}&row=${r.id}`}
                      aria-label={`Add an event for ${r.name} on ${d.label}`}
                      className="absolute inset-x-1.5 bottom-1.5 hidden items-center justify-center rounded-md border border-dashed border-line py-1 text-[13px] text-muted-foreground group-hover/cell:flex hover:border-primary hover:text-primary"
                    >
                      <Icon.plus size={13} />
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
