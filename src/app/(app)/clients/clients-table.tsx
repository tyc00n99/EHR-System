"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { Icon } from "@/components/icons";
import { Badge, cx } from "@/components/kit";

export type ClientStatus = "intake" | "active" | "discharged";
export interface ClientRow { id: string; name: string; pmi: string; status: ClientStatus; photo: string | null }

const STATUSES: { key: ClientStatus; label: string; tone: "ok" | "accent" | "neutral" }[] = [
  { key: "active", label: "Active", tone: "ok" },
  { key: "intake", label: "Intake", tone: "accent" },
  { key: "discharged", label: "Discharged", tone: "neutral" },
];

/**
 * The Clients list (Sept 20, 2026): a table again, now that no roster panel sits beside the page.
 * Three columns only — Client, PMI, Status — at the user's request; what a person needs next lives
 * on the record, not here. Status chips filter the rows; the row opens the record.
 */
export function ClientsTable({ rows, canAdd }: { rows: ClientRow[]; canAdd: boolean }) {
  const [status, setStatus] = useState<ClientStatus | "all">("active");
  const data = useMemo(() => (status === "all" ? rows : rows.filter((r) => r.status === status)), [rows, status]);
  const count = (s: ClientStatus) => rows.filter((r) => r.status === s).length;

  const columns = useMemo<ColumnDef<ClientRow, unknown>[]>(() => [
    { accessorKey: "name", header: "Client", cell: ({ row }) => (
      <span className="flex items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-panel text-[13px] font-semibold text-text-strong">
          {row.original.photo
            // eslint-disable-next-line @next/next/no-img-element -- auth-gated route
            ? <img src={row.original.photo} alt="" width={28} height={28} className="size-full object-cover" />
            : row.original.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
        </span>
        <span className="font-medium text-text-strong">{row.original.name}</span>
      </span>
    ) },
    { accessorKey: "pmi", header: "PMI", cell: ({ row }) => <span className="tabular-nums">{row.original.pmi}</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => { const s = STATUSES.find((x) => x.key === row.original.status)!; return <Badge tone={s.tone}>{s.label}</Badge>; } },
  ], []);

  const chip = (on: boolean) => cx("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[14px] transition-colors", on ? "border-transparent bg-primary-soft font-medium text-primary" : "border-line bg-card text-text hover:bg-tab-hover");
  const countPill = (n: number, on: boolean) => <span className={cx("inline-flex h-[18px] items-center rounded-full px-1.5 text-[13px] tabular-nums", on ? "bg-card text-primary" : "bg-panel text-muted-foreground")}>{n}</span>;

  return (
    <DataTable
      columns={columns}
      data={data}
      getRowId={(r) => r.id}
      rowHref={(r) => `/clients/${r.id}`}
      searchPlaceholder="Search clients"
      chips={
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUSES.map((s) => (
            <button key={s.key} type="button" onClick={() => setStatus(s.key)} aria-pressed={status === s.key} className={chip(status === s.key)}>
              {s.label} {countPill(count(s.key), status === s.key)}
            </button>
          ))}
          <button type="button" onClick={() => setStatus("all")} aria-pressed={status === "all"} className={chip(status === "all")}>
            All {countPill(rows.length, status === "all")}
          </button>
        </div>
      }
      actions={canAdd && (
        <Link href="/clients/new" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[14px] font-medium text-primary-foreground hover:bg-primary-hover">
          <Icon.plus size={15} /> Add client
        </Link>
      )}
      emptyTitle={rows.length === 0 ? "No clients yet" : "No clients match"}
      emptyHint={rows.length === 0 && canAdd ? "Add the first client to start a record." : undefined}
      initialSorting={[{ id: "name", desc: false }]}
      dense
    />
  );
}
