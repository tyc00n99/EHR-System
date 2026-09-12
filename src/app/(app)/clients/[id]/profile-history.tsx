"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { cx } from "@/components/kit";

/**
 * Profile history: a dense log, not a feature of the page. Small type and tight rows so a month of
 * changes fits on one screen, and never more than 25 rows at a time — past that it pages.
 */

export interface HistoryRow { id: string; at: string; sortAt: number; actor: string; event: string }

type Column = "at" | "actor" | "event";

const SIZES = [10, 25] as const;

export function ProfileHistory({ rows }: { rows: HistoryRow[] }) {
  const [sort, setSort] = useState<{ col: Column; desc: boolean }>({ col: "at", desc: true });
  const [size, setSize] = useState<number>(25);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const d = sort.col === "at" ? a.sortAt - b.sortAt : String(a[sort.col]).localeCompare(String(b[sort.col]));
      return sort.desc ? -d : d;
    });
    return copy;
  }, [rows, sort]);

  const pages = Math.max(1, Math.ceil(sorted.length / size));
  const current = Math.min(page, pages - 1);
  const from = current * size;
  const shown = sorted.slice(from, from + size);

  const head = (col: Column, label: string, className?: string) => {
    const on = sort.col === col;
    return (
      <th className={cx("border-b border-line px-2.5 py-2 text-left font-medium", className)}>
        <button
          type="button"
          onClick={() => { setSort((s) => ({ col, desc: s.col === col ? !s.desc : true })); setPage(0); }}
          aria-sort={on ? (sort.desc ? "descending" : "ascending") : "none"}
          className={cx("inline-flex items-center gap-1 text-[12px] transition-colors", on ? "text-text-strong" : "text-muted-foreground hover:text-text-strong")}
        >
          {label}
          {on
            ? <Icon.chevronDown size={11} className={cx("transition-transform", !sort.desc && "rotate-180")} />
            : <Icon.sort size={11} className="text-hint" />}
        </button>
      </th>
    );
  };

  return (
    <div className="max-w-[820px]">
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[520px] border-collapse text-[12.5px]">
          <thead className="bg-panel">
            <tr>{head("at", "Date", "w-[170px]")}{head("actor", "Team member", "w-[150px]")}{head("event", "Event")}</tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-b border-line-soft last:border-0 hover:bg-hover">
                <td className="ident whitespace-nowrap border-r border-line-soft px-2.5 py-1.5 text-text-strong">{r.at}</td>
                <td className="whitespace-nowrap border-r border-line-soft px-2.5 py-1.5 text-muted-foreground">{r.actor}</td>
                <td className="px-2.5 py-1.5 text-text">{r.event}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-center text-[12px] text-muted-foreground">
        {from + 1} — {from + shown.length} of {rows.length} event{rows.length === 1 ? "" : "s"}
      </p>

      <div className="mt-2 flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          Load
          <select
            value={size}
            onChange={(e) => { setSize(Number(e.target.value)); setPage(0); }}
            className="h-7 rounded-md border border-line bg-card px-1.5 text-[12px] text-text"
          >
            {SIZES.map((n) => <option key={n} value={n}>{n} rows</option>)}
          </select>
        </label>

        {pages > 1 && (
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={current === 0}
              aria-label="Previous page"
              className="flex size-7 items-center justify-center rounded-md border border-line text-muted-foreground disabled:opacity-40 enabled:hover:bg-hover enabled:hover:text-text-strong"
            >
              <Icon.chevronLeft size={13} />
            </button>
            <span className="ident min-w-[52px] text-center text-[12px] text-muted-foreground">{current + 1} / {pages}</span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
              disabled={current >= pages - 1}
              aria-label="Next page"
              className="flex size-7 items-center justify-center rounded-md border border-line text-muted-foreground disabled:opacity-40 enabled:hover:bg-hover enabled:hover:text-text-strong"
            >
              <Icon.chevronRight size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
