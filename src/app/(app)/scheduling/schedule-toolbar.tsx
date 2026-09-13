"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { cx } from "@/components/kit";

/**
 * The two control rows above the schedule, in the reference's order: title and date/view/mode on
 * the first, filters and the two actions on the second. Everything writes to the query string, so
 * a schedule someone is looking at can be linked to.
 */

export interface ToolbarState {
  mode: "clients" | "team";
  view: "daily" | "weekly" | "monthly";
  date: string;
  rangeLabel: string;
  prev: string;
  next: string;
  today: string;
  dept: string;
  q: string;
}

const VIEWS = [
  ["daily", "Daily"],
  ["weekly", "Weekly"],
  ["monthly", "Monthly"],
] as const;

export function ScheduleToolbar({
  state, departments, canManage, alerts,
}: {
  state: ToolbarState;
  departments: { id: string; name: string }[];
  canManage: boolean;
  alerts: number;
}) {
  const router = useRouter();
  const [q, setQ] = useState(state.q);
  const [showAlerts, setShowAlerts] = useState(true);

  const go = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ mode: state.mode, view: state.view, date: state.date, ...(state.dept ? { dept: state.dept } : {}), ...(state.q ? { q: state.q } : {}), ...patch });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    router.push(`/scheduling?${p}`);
  };

  return (
    <div className="shrink-0 px-6 pt-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-[32px] leading-none">{state.mode === "team" ? "Team schedule" : "Client schedule"}</h1>

        <div className="flex items-center rounded-lg border border-line">
          <Link href={state.prev} aria-label="Previous" className="flex h-9 w-10 items-center justify-center rounded-l-lg text-muted-foreground hover:bg-hover hover:text-text-strong">
            <Icon.chevronLeft size={16} />
          </Link>
          <Link href={state.today} className="flex h-9 items-center border-x border-line px-4 text-[14.5px] font-medium text-primary hover:bg-hover">Today</Link>
          <span className="flex h-9 items-center px-4 text-[14.5px] text-text-strong">{state.rangeLabel}</span>
          <Link href={state.next} aria-label="Next" className="flex h-9 w-10 items-center justify-center rounded-r-lg border-l border-line text-muted-foreground hover:bg-hover hover:text-text-strong">
            <Icon.chevronRight size={16} />
          </Link>
        </div>

        <label className="sr-only" htmlFor="sched-view">Calendar view</label>
        <select
          id="sched-view"
          value={state.view}
          onChange={(e) => go({ view: e.target.value })}
          className="h-9 rounded-lg border border-line bg-card px-3 text-[14.5px] font-medium text-text-strong"
        >
          {VIEWS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>

        <div className="flex items-center rounded-lg border border-line bg-panel p-0.5">
          {(["team", "clients"] as const).map((m) => (
            <Link
              key={m}
              href={`/scheduling?${new URLSearchParams({ mode: m, view: state.view, date: state.date })}`}
              className={cx("flex h-8 items-center rounded-md px-4 text-[14.5px] font-medium", state.mode === m ? "bg-card text-text-strong shadow-sm" : "text-muted-foreground hover:text-text-strong")}
            >
              {m === "team" ? "Team" : "Clients"}
            </Link>
          ))}
        </div>

        <Link href="/scheduling/settings" aria-label="Schedule settings" className="flex size-9 items-center justify-center rounded-lg border border-line text-muted-foreground hover:bg-hover hover:text-text-strong">
          <Icon.settings size={16} />
        </Link>
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-2.5 border-b border-line pb-3.5">
        <select
          value={state.dept}
          onChange={(e) => go({ dept: e.target.value })}
          aria-label="Departments"
          className="h-10 w-[320px] rounded-lg border border-line bg-card px-3 text-[14.5px] text-text"
        >
          <option value="">Select departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>

        <form
          onSubmit={(e) => { e.preventDefault(); go({ q }); }}
          className="flex h-10 w-[330px] items-center rounded-lg border border-line bg-card px-3"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search for event participants"
            aria-label="Search for event participants"
            className="min-w-0 flex-1 bg-transparent text-[14.5px] text-text outline-none placeholder:text-hint"
          />
          {q && (
            <button type="button" onClick={() => { setQ(""); go({ q: "" }); }} aria-label="Clear search" className="text-muted-foreground hover:text-text-strong">✕</button>
          )}
        </form>

        <Link
          href={`/scheduling?${new URLSearchParams({ mode: state.mode, view: state.view, date: state.date })}`}
          aria-label="Clear filters"
          className="flex size-10 items-center justify-center rounded-lg border border-line text-muted-foreground hover:bg-hover hover:text-text-strong"
        >
          <Icon.filter size={16} />
        </Link>

        <div className="ml-auto flex items-center gap-2.5">
          <span className="relative text-muted-foreground">
            <Icon.bell size={18} />
            {alerts > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[13px] font-semibold leading-none text-white">{alerts}</span>
            )}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={showAlerts}
            aria-label="Show action items"
            onClick={() => setShowAlerts((v) => !v)}
            className={cx("relative h-6 w-11 rounded-full transition-colors", showAlerts ? "bg-primary" : "bg-gray-300")}
          >
            <span className={cx("absolute top-0.5 size-5 rounded-full bg-white transition-all", showAlerts ? "left-[22px]" : "left-0.5")} />
          </button>

          {canManage && (
            <>
              <Link href="/scheduling/bulk" className="flex h-10 items-center gap-2 rounded-lg bg-primary-soft px-4 text-[14.5px] font-medium text-primary hover:bg-primary-soft/70">
                <Icon.edit size={15} />Bulk action
              </Link>
              <Link href={`/scheduling/new?date=${state.date}`} className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[14.5px] font-medium text-primary-foreground hover:bg-primary-hover">
                <Icon.plus size={15} />New event
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
