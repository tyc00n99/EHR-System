"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { FilterChips } from "@/components/filter-chips";
import { Badge, LinkButton } from "@/components/kit";

export interface StaffRow { id: string; name: string; title: string; overdue: number; dueSoon: number; renderingId: string; hired: string; contact: string; active: boolean; clients: number }

export function StaffTable({ rows, admin }: { rows: StaffRow[]; admin: boolean }) {
  const [filter, setFilter] = useState<"all" | "active" | "late" | "inactive">("all");
  const data = useMemo(() => rows.filter((r) => (filter === "late" ? r.overdue > 0 : filter === "inactive" ? !r.active : filter === "active" ? r.active : true)), [rows, filter]);
  const columns: ColumnDef<StaffRow, unknown>[] = [
    { accessorKey: "name", header: "Staff", cell: ({ row }) => <Link href={`/staff/${row.original.id}`} className="font-medium text-text-strong hover:underline" onClick={(e) => e.stopPropagation()}>{row.original.name}</Link> },
    { accessorKey: "title", header: "Title" },
    { id: "compliance", accessorFn: (r) => r.overdue * 100 + r.dueSoon, header: "Compliance", cell: ({ row }) => !row.original.active ? <span className="text-hint">—</span> : row.original.overdue > 0 ? <Badge tone="danger">{row.original.overdue} overdue</Badge> : row.original.dueSoon > 0 ? <Badge tone="warn">{row.original.dueSoon} due soon</Badge> : <Badge tone="ok">compliant</Badge> },
    { accessorKey: "clients", header: "Clients", meta: { align: "right" } },
    { accessorKey: "renderingId", header: "Rendering ID", cell: ({ getValue }) => <span className="tabular-nums">{String(getValue())}</span> },
    { accessorKey: "hired", header: "Hired", cell: ({ getValue }) => <span className="text-muted-foreground">{String(getValue())}</span> },
    { accessorKey: "contact", header: "Contact", cell: ({ getValue }) => <span className="text-muted-foreground">{String(getValue()) || "—"}</span> },
    { accessorKey: "active", header: "Status", cell: ({ row }) => <Badge tone={row.original.active ? "ok" : "neutral"}>{row.original.active ? "active" : "inactive"}</Badge> },
  ];
  return (
    <DataTable
      columns={columns}
      data={data}
      searchPlaceholder="Search name, title, NPI, UMPI…"
      rowHref={(r) => `/staff/${r.id}`}
      chips={<FilterChips value={filter} onChange={setFilter} options={[{ key: "all", label: "All", count: rows.length }, { key: "active", label: "Active", count: rows.filter((r) => r.active).length }, { key: "late", label: "Out of compliance", count: rows.filter((r) => r.overdue > 0).length }, { key: "inactive", label: "Inactive", count: rows.filter((r) => !r.active).length }]} />}
      actions={admin && <LinkButton href="/staff/new" variant="primary">New staff member</LinkButton>}
      emptyTitle="No staff match"
      initialSorting={[{ id: "name", desc: false }]}
    />
  );
}
