"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { cx } from "@/components/kit";

/**
 * Profile history, laid out like the reference: sortable Date / Team member / Event columns, a
 * count line, and a rows-per-page control. The sort arrows actually sort — a header that looks
 * clickable and is not is worse than a plain label.
 */

export interface HistoryRow { id: string; at: string; sortAt: number; actor: string; event: string }

type Column = "at" | "actor" | "event";

export function ProfileHistory({ rows }: { rows: HistoryRow[] }) {
  const [sort, setSort] = useState<{ col: Column; desc: boolean }>({ col: "at", desc: true });
  const [size, setSize] = useState(20);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const d = sort.col === "at" ? a.sortAt - b.sortAt : String(a[sort.col]).localeCompare(String(b[sort.col]));
      return sort.desc ? -d : d;
    });
    return copy;
  }, [rows, sort]);

  const shown = sorted.slice(0, size);
  const head = (col: Column, label: string) => {
    const on = sort.col === col;
    return (
      <th className="border-b border-line px-4 py-3 text-left font-medium">
        <button
          type="button"
          onClick={() => setSort((s) => ({ col, desc: s.col === col ? !s.desc : true }))}
          aria-sort={on ? (sort.desc ? "descending" : "ascending") : "none"}
          className={cx("inline-flex items-center gap-1.5 text-[14.5px] transition-colors", on ? "text-text-strong" : "text-muted-foreground hover:text-text-strong")}
        >
          {label}
          {on
            ? <Icon.chevronDown size={14} className={cx("transition-transform", !sort.desc && "rotate-180")} />
            : <Icon.sort size={14} className="text-hint" />}
        </button>
      </th>
    );
  };

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[620px] border-collapse text-[14.5px]">
          <thead className="bg-panel">
            <tr>{head("at", "Date")}{head("actor", "Team member")}{head("event", "Event")}</tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-b border-line-soft last:border-0 hover:bg-hover">
                <td className="whitespace-nowrap border-r border-line-soft px-4 py-3 font-semibold text-text-strong">{r.at}</td>
                <td className="whitespace-nowrap border-r border-line-soft px-4 py-3 text-text">{r.actor}</td>
                <td className="px-4 py-3 text-text">{r.event}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-center text-[14px] text-muted-foreground">
        1 — {shown.length} of {rows.length} event{rows.length === 1 ? "" : "s"}
      </p>

      <div className="mt-3 flex items-center gap-2">
        <label className="flex items-center gap-2 text-[14px] text-muted-foreground">
          Load
          <select
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="h-9 rounded-lg border border-line bg-card px-2 text-[14px] text-text"
          >
            {[10, 20, 50].map((n) => <option key={n} value={n}>{n} rows</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}
