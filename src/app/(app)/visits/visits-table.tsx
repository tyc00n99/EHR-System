"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { FilterChips } from "@/components/filter-chips";
import { Badge } from "@/components/kit";

export interface VisitRow { id: string; clockIn: string; clockInIso: string; minutes: number | null; client: string; personId: string; staff: string; service: string; units: number; status: "in_progress" | "completed" | "void"; manual: boolean; returned: boolean; edits: number; signed: boolean; evv: "pending" | "exported" | "accepted" | "rejected" }

const evvTone = { pending: "neutral", exported: "accent", accepted: "ok", rejected: "danger" } as const;

/** Whole hours and halves read at a glance; anything else keeps one decimal. */
export const fmtHours = (minutes: number) => `${(minutes / 60).toFixed(1).replace(/\.0$/, "")} h`;

/** The one word that says where a note stands; "signed" is the clean case and wears no badge. */
export const standingOf = (r: VisitRow) => (r.returned ? "returned" : r.status === "in_progress" ? "in progress" : r.status === "void" ? "void" : !r.signed ? "unsigned" : r.manual ? "manual" : "signed");

export function VisitsTable({ rows, exportCsv, exportPdf, state, showChips }: { rows: VisitRow[]; exportCsv?: string; exportPdf?: string; state?: string; showChips?: boolean }) {
  // The section row owns this filter when it is present; the chips are the fallback for phones
  // and for caregivers, who have no second row.
  const [chip, setChip] = useState<"all" | "unsigned" | "manual" | "open">("all");
  const flag = state ?? chip;
  const byDate = (a: VisitRow, b: VisitRow) => (a.clockInIso < b.clockInIso ? 1 : a.clockInIso > b.clockInIso ? -1 : 0);
  const data = useMemo(() => rows.filter((r) => (flag === "unsigned" ? r.status === "completed" && !r.signed : flag === "returned" ? r.returned : flag === "manual" ? r.manual : flag === "open" ? r.status === "in_progress" : true)).sort(byDate), [rows, flag]);
  const columns: ColumnDef<VisitRow, unknown>[] = [
    { accessorKey: "clockInIso", header: "Clock in", cell: ({ row }) => <span className="ident text-text-strong">{row.original.clockIn}</span> },
    { accessorKey: "minutes", header: "Duration", enableSorting: false, cell: ({ row }) => row.original.minutes == null ? <span className="text-primary">in progress</span> : <span className="ident">{fmtHours(row.original.minutes)}</span> },
    { accessorKey: "client", header: "Client", meta: { filter: true }, cell: ({ row }) => <Link href={`/clients/${row.original.personId}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>{row.original.client}</Link> },
    { accessorKey: "staff", header: "Caregiver", meta: { filter: true } },
    { accessorKey: "service", header: "Service", meta: { filter: true }, cell: ({ getValue }) => <span className="ident">{String(getValue())}</span> },
    { accessorKey: "units", header: "Units", enableSorting: false, meta: { align: "right" } },
    { id: "status", accessorFn: standingOf, header: "Status", meta: { filter: true }, cell: ({ row }) => {
      const r = row.original; const st = standingOf(r);
      return (
        <span className="flex flex-wrap gap-1">
          {st === "signed" ? null
            : st === "returned" ? <Badge tone="warn">returned</Badge>
            : st === "in progress" ? <Badge tone="accent">in progress</Badge>
            : st === "void" ? <Badge tone="neutral">void</Badge>
            : st === "unsigned" ? <Badge tone="danger">unsigned</Badge>
            : <Badge tone="warn">manual</Badge>}
          {r.manual && st !== "manual" && <Badge tone="warn">manual</Badge>}
          {r.edits > 0 && <Badge tone="warn">{r.edits} edit{r.edits === 1 ? "" : "s"}</Badge>}
        </span>
      );
    } },
    { accessorKey: "evv", header: "EVV", meta: { filter: true }, cell: ({ row }) => <Badge tone={evvTone[row.original.evv]}>{row.original.evv}</Badge> },
  ];
  const withIds = (href: string, ids: string[]) => `${href}${href.includes("?") ? "&" : "?"}ids=${ids.join(",")}`;
  const exportLink = "inline-flex h-8 items-center rounded-md border border-line bg-page px-3 text-[13px] font-medium hover:bg-hover";
  return (
    <DataTable
      columns={columns}
      data={data}
      getRowId={(r) => r.id}
      selectable={Boolean(exportCsv || exportPdf)}
      bulk={(selected, clear) => (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium text-text-strong">{selected.length} selected</span>
          {exportCsv && <a href={withIds(exportCsv, selected.map((r) => r.id))} className={exportLink}>Export CSV</a>}
          {exportPdf && <a href={withIds(exportPdf, selected.map((r) => r.id))} className={exportLink}>Export PDF</a>}
          <button type="button" onClick={clear} className="text-[13px] font-medium text-primary hover:underline">Clear selection</button>
        </div>
      )}
      searchPlaceholder="Search client, caregiver, code…"
      suggestions={[
        { label: "Clients", items: [...new Set(rows.map((r) => r.client))].sort() },
        { label: "Team Members", items: [...new Set(rows.map((r) => r.staff))].sort() },
        { label: "Services", items: [...new Set(rows.map((r) => r.service))].sort() },
      ]}
      rowHref={(r) => `?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(typeof window === "undefined" ? "" : window.location.search)), note: r.id })}`}
      chips={showChips && !state ? <FilterChips value={chip} onChange={setChip} options={[{ key: "all", label: "All", count: rows.length }, { key: "unsigned", label: "Unsigned", count: rows.filter((r) => r.status === "completed" && !r.signed).length }, { key: "manual", label: "Manual", count: rows.filter((r) => r.manual).length }, { key: "open", label: "In progress", count: rows.filter((r) => r.status === "in_progress").length }]} /> : undefined}
      actions={(exportCsv || exportPdf) && <>{exportCsv && <a href={exportCsv} className={exportLink}>Export CSV</a>}{exportPdf && <a href={exportPdf} className={exportLink}>Export PDF</a>}</>}
      emptyTitle="No notes match"
      initialSorting={[{ id: "clockInIso", desc: true }]}
      dense
    />
  );
}
