"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { cx } from "@/components/kit";

export interface RailPerson { id: string; name: string; pmi: string; status: "active" | "intake" | "discharged"; flagged: boolean; photo: string | null }

const KEY = "ehr.clients.panel";

/**
 * The Clients module panel: the caseload, pinned beside the icon rail.
 *
 * Working a queue of people means opening five records in a row, and a list that throws you back to
 * a full page between each one makes that five round trips instead of five clicks. Selection lives
 * in the URL, so the panel and the record can never disagree. Closing it leaves a thin strip rather
 * than nothing, because a control you cannot find again is not a control.
 */
export function ClientRail({ people, label, canAdd }: { people: RailPerson[]; label: string; canAdd: boolean }) {
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(true);
  // The status filters used to sit in a row above the page. They belong with the list they filter.
  const [filtering, setFiltering] = useState(false);
  const [status, setStatus] = useState<"all" | RailPerson["status"]>("all");
  const openId = pathname.startsWith("/clients/") ? pathname.split("/")[2] : null;

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try { setOpen(localStorage.getItem(KEY) !== "closed"); } catch { setOpen(true); }
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const set = (v: boolean) => { setOpen(v); try { localStorage.setItem(KEY, v ? "open" : "closed"); } catch {} };

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return people.filter((p) => {
      if (status !== "all" && p.status !== status) return false;
      return !t || p.name.toLowerCase().includes(t) || p.pmi.includes(t);
    });
  }, [people, q, status]);
  const countOf = (s: RailPerson["status"]) => people.filter((p) => p.status === s).length;

  if (!open) {
    return (
      <div className="hidden w-7 shrink-0 border-r border-line bg-sidebar md:block">
        <div className="sticky top-14 flex h-[calc(100vh-3.5rem)] justify-center pt-3">
          <button
            type="button"
            onClick={() => set(true)}
            aria-label={`Show ${label.toLowerCase()} list`}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-hover hover:text-text-strong"
          >
            <Icon.chevronRight size={15} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <aside aria-label={label} className="hidden w-[248px] shrink-0 border-r border-line bg-sidebar md:block">
      <div className="sticky top-14 flex h-[calc(100vh-3.5rem)] flex-col">
        <div className="flex h-11 shrink-0 items-center gap-2 px-3">
          <Icon.clients size={15} className="shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-text-strong">{label}</span>
          <button
            type="button"
            onClick={() => set(false)}
            aria-label={`Hide ${label.toLowerCase()} list`}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-hover hover:text-text-strong"
          >
            <Icon.plus size={15} className="rotate-45" />
          </button>
        </div>

        <div className="mx-3 mb-2 flex shrink-0 items-center gap-1.5">
          <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-line bg-card px-2.5">
            <Icon.search size={14} className="shrink-0 text-hint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search"
              aria-label={`Search ${label.toLowerCase()}`}
              className="min-w-0 flex-1 bg-transparent text-[12.5px] text-text outline-none placeholder:text-hint"
            />
          </div>
          <button
            type="button"
            onClick={() => setFiltering((v) => !v)}
            aria-pressed={filtering}
            aria-label="Filter by status"
            className={cx("flex size-8 shrink-0 items-center justify-center rounded-md border transition-colors",
              status !== "all" || filtering ? "border-primary bg-primary-soft text-primary" : "border-line bg-card text-muted-foreground hover:bg-hover")}
          >
            <Icon.filter size={14} />
          </button>
        </div>
        {filtering && (
          <div className="mx-3 mb-2 flex shrink-0 flex-wrap gap-1">
            {([["all", "All"], ["active", "Active"], ["intake", "Intake"], ["discharged", "Discharged"]] as const).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setStatus(k)}
                aria-pressed={status === k}
                className={cx("rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                  status === k ? "border-primary bg-primary-soft font-medium text-primary" : "border-line bg-card text-muted-foreground hover:bg-hover")}
              >
                {l} {k === "all" ? people.length : countOf(k)}
              </button>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto border-t border-line">
          {shown.length === 0 ? (
            <p className="px-3 py-4 text-[12.5px] italic text-muted-foreground">{people.length === 0 ? "None found." : `Nobody matches “${q}”.`}</p>
          ) : shown.map((p) => {
            const on = p.id === openId;
            return (
              <Link
                key={p.id}
                href={`/clients/${p.id}`}
                aria-current={on ? "page" : undefined}
                className={cx("flex items-center gap-2.5 border-b border-line-soft px-3 py-2.5 transition-colors", on ? "bg-card shadow-[inset_3px_0_0_var(--primary)]" : "hover:bg-hover")}
              >
                <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-panel text-[10px] font-semibold text-text-strong">
                  {p.photo
                    // eslint-disable-next-line @next/next/no-img-element -- auth-gated route
                    ? <img src={p.photo} alt="" width={28} height={28} className="size-full object-cover" />
                    : p.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className={cx("min-w-0 truncate text-[14.5px]", on ? "font-medium text-text-strong" : "text-text")}>{p.name}</span>
                  {p.status !== "active" && <span className="shrink-0 rounded bg-panel px-1.5 text-[10.5px] text-muted-foreground">{p.status}</span>}
                </span>
                {p.flagged && <span className="size-1.5 shrink-0 rounded-full bg-danger" title="Needs attention" />}
              </Link>
            );
          })}
        </div>

        {canAdd && (
          <div className="shrink-0 border-t border-line p-2.5">
            <Link
              href="/clients/new"
              className="flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary text-[13px] font-medium text-primary-foreground hover:bg-primary-hover"
            >
              <Icon.plus size={15} /> Add client
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}
