"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { cx } from "@/components/kit";

export interface RailPerson { id: string; name: string; pmi: string; status: "active" | "intake" | "discharged"; flagged: boolean }

/**
 * The caseload, pinned. Working a queue of people means opening five records in a row, and a list
 * that throws you back to a full page between each one makes that five round trips instead of five
 * clicks. Selection lives in the URL, so the rail and the record can never disagree.
 */
export function ClientRail({ people, label }: { people: RailPerson[]; label: string }) {
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const openId = pathname.startsWith("/clients/") ? pathname.split("/")[2] : null;
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? people.filter((p) => p.name.toLowerCase().includes(t) || p.pmi.includes(t)) : people;
  }, [people, q]);

  // On the list itself the rail would be a second copy of the same five people, with a second
  // search box. The rail exists for moving between records, so that is where it appears.
  if (pathname === "/clients") return null;

  return (
    <aside aria-label={label} className="hidden w-[248px] shrink-0 border-r border-line bg-sidebar md:block">
      <div className="sticky top-14 flex h-[calc(100vh-3.5rem)] flex-col">
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
          <Icon.search size={14} className="shrink-0 text-hint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Filter ${people.length} ${people.length === 1 ? "client" : "clients"}`}
            aria-label="Filter clients"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-text outline-none placeholder:text-hint"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {shown.length === 0 ? (
            <p className="px-3 py-4 text-[12.5px] text-muted-foreground">Nobody matches “{q}”.</p>
          ) : shown.map((p) => {
            const on = p.id === openId;
            return (
              <Link
                key={p.id}
                href={`/clients/${p.id}`}
                aria-current={on ? "page" : undefined}
                className={cx("flex items-center gap-2.5 border-b border-line-soft px-3 py-2 transition-colors", on ? "bg-card shadow-[inset_3px_0_0_var(--primary)]" : "hover:bg-hover")}
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[9.5px] font-medium text-primary-foreground">
                  {p.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cx("block truncate text-[12.5px]", on ? "font-medium text-text-strong" : "text-text")}>{p.name}</span>
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="ident">{p.pmi}</span>
                    {p.status !== "active" && <span className="rounded bg-panel px-1 text-[10px]">{p.status}</span>}
                  </span>
                </span>
                {p.flagged && <span className="size-1.5 shrink-0 rounded-full bg-danger" title="Needs attention" />}
              </Link>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
