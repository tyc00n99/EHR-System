"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { Icon } from "@/components/icons";
import { Badge, cx } from "@/components/kit";

export interface TeamRow { id: string; name: string; title: string | null; active: boolean; overdue: number }

type Filter = "active" | "inactive" | "overdue" | "all";

/**
 * The roster as a table (Sept 20, 2026): Team member, Role, Personnel file — nothing about shifts,
 * at the user's request; the schedule is where shifts live. Chips filter; the row opens the record.
 */
export function TeamTable({ rows, canAdd }: { rows: TeamRow[]; canAdd: boolean }) {
  const [filter, setFilter] = useState<Filter>("active");
  const pass = (r: TeamRow, f: Filter) => f === "all" || (f === "active" ? r.active : f === "inactive" ? !r.active : r.overdue > 0);
  const data = useMemo(() => rows.filter((r) => pass(r, filter)), [rows, filter]);
  const count = (f: Filter) => rows.filter((r) => pass(r, f)).length;

  const columns = useMemo<ColumnDef<TeamRow, unknown>[]>(() => [
    { accessorKey: "name", header: "Team member", cell: ({ row }) => (
      <span className="flex items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-panel text-[13px] font-semibold text-text-strong">{row.original.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
        <span className="font-medium text-text-strong">{row.original.name}</span>
        {!row.original.active && <Badge tone="neutral">inactive</Badge>}
      </span>
    ) },
    { accessorKey: "title", header: "Role", cell: ({ row }) => row.original.title ?? <span className="text-muted-foreground">—</span> },
    { accessorKey: "overdue", header: "Personnel file", cell: ({ row }) => row.original.overdue > 0
      ? <Badge tone="danger">{row.original.overdue} overdue</Badge>
      : <Badge tone="ok">Up to date</Badge> },
  ], []);

  const chip = (on: boolean) => cx("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[14px] transition-colors", on ? "border-transparent bg-primary-soft font-medium text-primary" : "border-line bg-card text-text hover:bg-tab-hover");
  const countPill = (n: number, on: boolean, hot?: boolean) => <span className={cx("inline-flex h-[18px] items-center rounded-full px-1.5 text-[13px] tabular-nums", on ? "bg-card text-primary" : hot && n > 0 ? "bg-danger-soft text-danger" : "bg-panel text-muted-foreground")}>{n}</span>;
  const FILTERS: { key: Filter; label: string; hot?: boolean }[] = [
    { key: "active", label: "Active" },
    { key: "inactive", label: "Inactive" },
    { key: "overdue", label: "Out of compliance", hot: true },
    { key: "all", label: "All" },
  ];

  return (
    <DataTable
      columns={columns}
      data={data}
      getRowId={(r) => r.id}
      rowHref={(r) => `/staff/${r.id}`}
      searchPlaceholder="Search team"
      chips={
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" onClick={() => setFilter(f.key)} aria-pressed={filter === f.key} className={chip(filter === f.key)}>
              {f.label} {countPill(count(f.key), filter === f.key, f.hot)}
            </button>
          ))}
        </div>
      }
      actions={canAdd && (
        <Link href="/staff/new" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[14px] font-medium text-primary-foreground hover:bg-primary-hover">
          <Icon.plus size={15} /> Add team member
        </Link>
      )}
      emptyTitle={rows.length === 0 ? "No team members yet" : "Nobody matches"}
      initialSorting={[{ id: "name", desc: false }]}
      dense
    />
  );
}
