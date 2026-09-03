"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { FilterChips } from "@/components/filter-chips";
import { Badge } from "@/components/kit";

export interface VisitRow { id: string; clockIn: string; clockInIso: string; minutes: number | null; client: string; personId: string; staff: string; service: string; units: number; status: "in_progress" | "completed" | "void"; manual: boolean; edits: number; signed: boolean; evv: "pending" | "exported" | "accepted" | "rejected" }

const evvTone = { pending: "neutral", exported: "accent", accepted: "ok", rejected: "danger" } as const;

export function VisitsTable({ rows, exportHref }: { rows: VisitRow[]; exportHref?: string }) {
  const [flag, setFlag] = useState<"all" | "unsigned" | "manual" | "open">("all");
  const data = useMemo(() => rows.filter((r) => (flag === "unsigned" ? r.status === "completed" && !r.signed : flag === "manual" ? r.manual : flag === "open" ? r.status === "in_progress" : true)), [rows, flag]);
  const columns: ColumnDef<VisitRow, unknown>[] = [
    { accessorKey: "clockInIso", header: "Clock in", cell: ({ row }) => <span className="font-medium text-text-strong">{row.original.clockIn}</span> },
    { accessorKey: "minutes", header: "Duration", cell: ({ row }) => row.original.minutes == null ? <span className="text-primary">in progress</span> : <span className="tabular-nums text-muted-foreground">{row.original.minutes} min</span> },
    { accessorKey: "client", header: "Client", cell: ({ row }) => <Link href={`/clients/${row.original.personId}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>{row.original.client}</Link> },
    { accessorKey: "staff", header: "Caregiver" },
    { accessorKey: "service", header: "Service", cell: ({ getValue }) => <span className="tabular-nums">{String(getValue())}</span> },
    { accessorKey: "units", header: "Units", meta: { align: "right" } },
    { id: "status", accessorFn: (r) => r.status, header: "Status", cell: ({ row }) => <span className="flex gap-1"><Badge tone={row.original.status === "completed" ? "ok" : row.original.status === "void" ? "neutral" : "accent"}>{row.original.status.replace("_", " ")}</Badge>{row.original.manual && <Badge tone="warn">manual</Badge>}{row.original.edits > 0 && <Badge tone="warn">{row.original.edits} edit{row.original.edits === 1 ? "" : "s"}</Badge>}{row.original.status === "completed" && !row.original.signed && <Badge tone="danger">unsigned</Badge>}</span> },
    { accessorKey: "evv", header: "EVV", cell: ({ row }) => <Badge tone={evvTone[row.original.evv]}>{row.original.evv}</Badge> },
  ];
  return (
    <DataTable
      columns={columns}
      data={data}
      searchPlaceholder="Search client, caregiver, code…"
      rowHref={(r) => `?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(typeof window === "undefined" ? "" : window.location.search)), visit: r.id })}`}
      chips={<FilterChips value={flag} onChange={setFlag} options={[{ key: "all", label: "All", count: rows.length }, { key: "unsigned", label: "Unsigned", count: rows.filter((r) => r.status === "completed" && !r.signed).length }, { key: "manual", label: "Manual", count: rows.filter((r) => r.manual).length }, { key: "open", label: "In progress", count: rows.filter((r) => r.status === "in_progress").length }]} />}
      actions={exportHref && <a href={exportHref} className="inline-flex h-8 items-center rounded-md border border-line bg-page px-3 text-[12.5px] font-medium hover:bg-hover">Export CSV</a>}
      emptyTitle="No visits match"
      initialSorting={[{ id: "clockInIso", desc: true }]}
      dense
    />
  );
}
