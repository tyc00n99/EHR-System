"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { FilterChips } from "@/components/filter-chips";
import { Badge, LinkButton } from "@/components/kit";

export interface ClientRow { id: string; name: string; pmi: string; waiver: string; county: string; caseManager: string; serviceStart: string; status: "active" | "intake" | "discharged"; hasCode: boolean; team: string }

const tone = { active: "ok", intake: "accent", discharged: "neutral" } as const;

export function ClientsTable({ rows, manage }: { rows: ClientRow[]; manage: boolean }) {
  const [status, setStatus] = useState<"all" | ClientRow["status"]>("all");
  const data = useMemo(() => (status === "all" ? rows : rows.filter((r) => r.status === status)), [rows, status]);
  const count = (s: ClientRow["status"]) => rows.filter((r) => r.status === s).length;
  const columns: ColumnDef<ClientRow, unknown>[] = [
    { accessorKey: "name", header: "Client", cell: ({ row }) => <Link href={`/clients/${row.original.id}`} className="font-medium text-text-strong hover:underline" onClick={(e) => e.stopPropagation()}>{row.original.name}</Link> },
    { accessorKey: "pmi", header: "PMI #", cell: ({ getValue }) => <span className="tabular-nums">{String(getValue())}</span> },
    { accessorKey: "waiver", header: "Waiver" },
    { accessorKey: "county", header: "County" },
    { accessorKey: "caseManager", header: "Case manager" },
    { accessorKey: "team", header: "Care team", cell: ({ getValue }) => <span className="text-muted-foreground">{String(getValue()) || "—"}</span> },
    { accessorKey: "serviceStart", header: "Service start", cell: ({ getValue }) => <span className="text-muted-foreground">{String(getValue()) || "—"}</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <span className="flex gap-1"><Badge tone={tone[row.original.status]}>{row.original.status}</Badge>{row.original.status === "active" && !row.original.hasCode && <Badge tone="danger">no code</Badge>}</span> },
  ];
  return (
    <DataTable
      columns={columns}
      data={data}
      searchPlaceholder="Search name, PMI, county…"
      rowHref={(r) => `/clients/${r.id}`}
      chips={<FilterChips value={status} onChange={setStatus} options={[{ key: "all", label: "All", count: rows.length }, { key: "active", label: "Active", count: count("active") }, { key: "intake", label: "Intake", count: count("intake") }, { key: "discharged", label: "Discharged", count: count("discharged") }]} />}
      actions={manage && <LinkButton href="/clients/new" variant="primary">New client</LinkButton>}
      emptyTitle="No clients match"
      initialSorting={[{ id: "name", desc: false }]}
    />
  );
}
