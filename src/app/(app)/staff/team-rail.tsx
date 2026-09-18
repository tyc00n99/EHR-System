"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { cx } from "@/components/kit";
import { useModulePanel } from "@/components/module-panel";

export interface RailMember {
  id: string;
  name: string;
  title: string | null;
  active: boolean;
  /** Overdue compliance items. The one red dot a row can carry. */
  overdue: number;
}

/**
 * The Team module panel — the roster pinned beside the icon rail, built the same way as the
 * Clients panel and for the same reason: the panel is the list, so it shows on the Team screen and
 * steps aside the moment a member's record is open. The rail's Team icon is the way back.
 */
export function TeamRail({ members, canAdd }: { members: RailMember[]; canAdd: boolean }) {
  const pathname = usePathname();
  const panel = useModulePanel();
  const [q, setQ] = useState("");
  const [filtering, setFiltering] = useState(false);
  const [status, setStatus] = useState<"all" | "active" | "inactive" | "overdue">("all");
  const segment = pathname.startsWith("/staff/") ? pathname.split("/")[2] : null;
  const openId = segment && segment !== "new" ? segment : null;

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return members.filter((m) => {
      if (status === "active" && !m.active) return false;
      if (status === "inactive" && m.active) return false;
      if (status === "overdue" && m.overdue === 0) return false;
      return !t || m.name.toLowerCase().includes(t) || (m.title ?? "").toLowerCase().includes(t);
    });
  }, [members, q, status]);
  const count = (k: typeof status) =>
    k === "all" ? members.length : k === "active" ? members.filter((m) => m.active).length : k === "inactive" ? members.filter((m) => !m.active).length : members.filter((m) => m.overdue > 0).length;

  // A record is open: it gets the full width — until the rail asks for the list, which then
  // slides in over the record (the reference's behaviour) and closes as soon as a row is picked.
  const over = Boolean(openId) && panel.open === "team";
  if (openId && !over) return null;
  const close = () => panel.setOpen(null);

  return (<>
    {/* While the list sits over a record, the record blurs and dims so the eye stays on the list;
        clicking the dimmed record closes the list (Sept 18, 2026, user's request). */}
    {over && <button type="button" aria-label="Close the list" onClick={close} className="absolute inset-0 z-20 hidden cursor-default bg-white/40 backdrop-blur-[2px] md:block" />}
    <aside aria-label="Team" className={cx("hidden w-[248px] shrink-0 border-r border-line bg-sidebar md:block", over && "absolute inset-y-0 left-0 z-30 shadow-[8px_0_24px_rgba(0,0,0,0.08)]")}>
      <div className="flex h-full flex-col">
        <div className="flex h-11 shrink-0 items-center gap-2 px-3">
          <Icon.team size={15} className="shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-text-strong">Team</span>
          {over && <button type="button" onClick={close} aria-label="Close" className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-hover hover:text-text-strong"><Icon.plus size={16} className="rotate-45" /></button>}
        </div>

        <div className="mx-3 mb-2 flex shrink-0 items-center gap-1.5">
          <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-line bg-card px-2.5">
            <Icon.search size={14} className="shrink-0 text-hint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search"
              aria-label="Search team"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-text outline-none placeholder:text-hint"
            />
          </div>
          <button
            type="button"
            onClick={() => setFiltering((v) => !v)}
            aria-pressed={filtering}
            aria-label="Filter team"
            className={cx("flex size-8 shrink-0 items-center justify-center rounded-md border transition-colors",
              status !== "all" || filtering ? "border-primary bg-primary-soft text-primary" : "border-line bg-card text-muted-foreground hover:bg-hover")}
          >
            <Icon.filter size={14} />
          </button>
        </div>
        {filtering && (
          <div className="mx-3 mb-2 flex shrink-0 flex-wrap gap-1">
            {([["all", "All"], ["active", "Active"], ["inactive", "Inactive"], ["overdue", "Out of compliance"]] as const).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setStatus(k)}
                aria-pressed={status === k}
                className={cx("rounded-full border px-2 py-0.5 text-[13px] transition-colors",
                  status === k ? "border-primary bg-primary-soft font-medium text-primary" : "border-line bg-card text-muted-foreground hover:bg-hover")}
              >
                {l} {count(k)}
              </button>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto border-t border-line">
          {shown.length === 0 ? (
            <p className="px-3 py-4 text-[13px] italic text-muted-foreground">{members.length === 0 ? "No team members yet." : `Nobody matches “${q}”.`}</p>
          ) : shown.map((m) => {
            const on = m.id === openId;
            return (
              <Link
                key={m.id}
                href={`/staff/${m.id}`}
                aria-current={on ? "page" : undefined}
                onClick={close}
                className={cx("flex items-center gap-2.5 border-b border-line-soft px-3 py-2.5 transition-colors", on ? "bg-tab-hover shadow-[inset_3px_0_0_var(--primary)]" : "hover:bg-tab-hover")}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-panel text-[13px] font-semibold text-text-strong">
                  {m.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className={cx("min-w-0 truncate text-[14.5px]", on ? "font-medium text-text-strong" : "text-text")}>{m.name}</span>
                  {!m.active && <span className="shrink-0 rounded bg-panel px-1.5 text-[13px] text-muted-foreground">inactive</span>}
                </span>
                {m.overdue > 0 && <span className="size-1.5 shrink-0 rounded-full bg-danger" title={`${m.overdue} overdue compliance item${m.overdue === 1 ? "" : "s"}`} />}
              </Link>
            );
          })}
        </div>

        {canAdd && (
          <div className="shrink-0 border-t border-line p-2.5">
            <Link
              href="/staff/new"
              onClick={close}
              className="flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary text-[13px] font-medium text-primary-foreground hover:bg-primary-hover"
            >
              <Icon.plus size={15} /> Add team member
            </Link>
          </div>
        )}
      </div>
    </aside>
  </>);
}
