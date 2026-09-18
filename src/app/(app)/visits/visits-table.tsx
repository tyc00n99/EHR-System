"use client";

import { useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, TwoLine } from "@/components/data-table";
import { DateRangePill, FilterPill, type PillOption } from "@/components/filter-pill";
import { Badge } from "@/components/kit";

export interface VisitRow {
  id: string; clockIn: string; day: string; time: string; clockInIso: string; minutes: number | null;
  client: string; personId: string; staff: string; staffId: string;
  serviceLabel: string; serviceKey: string; serviceCode: string; units: number;
  status: "in_progress" | "completed" | "void"; manual: boolean; returned: boolean; edits: number; signed: boolean;
  evv: "pending" | "exported" | "accepted" | "rejected";
}

export interface VisitFilters { client: string[]; staff: string[]; service: string[]; state: string; rangeParam: string; rangeLabel: string; from: string; to: string }

const evvTone = { pending: "neutral", exported: "accent", accepted: "ok", rejected: "danger" } as const;
export const fmtHours = (minutes: number) => `${(minutes / 60).toFixed(1).replace(/\.0$/, "")} h`;
export const standingOf = (r: VisitRow) => (r.returned ? "returned" : r.status === "in_progress" ? "in progress" : r.status === "void" ? "void" : !r.signed ? "unsigned" : r.manual ? "manual" : "signed");
const STATES: PillOption[] = [{ value: "", label: "All notes" }, { value: "unsigned", label: "Awaiting signature" }, { value: "returned", label: "Returned" }, { value: "manual", label: "Manual entries" }, { value: "open", label: "In progress" }];

/**
 * The Notes list in the DocuSign shape: filter pills that open checklists, a selection bar, a
 * sortable table with a checkbox, Open and ⋮ on every row. Filters live in the URL, so the exports
 * see the same selection and a filtered list can be linked to.
 */
export function VisitsTable({ rows, filters, options, presets, base, showClient = true, exportCsv, exportPdf }: {
  rows: VisitRow[];
  filters: VisitFilters;
  options: { clients: PillOption[]; staff: PillOption[]; services: PillOption[] };
  presets: { label: string; param: string }[];
  /** The path filters navigate to, plus any params that must survive (e.g. person=). */
  base: { path: string; keep: Record<string, string> };
  showClient?: boolean;
  exportCsv?: string;
  exportPdf?: string;
}) {
  const router = useRouter();
  const warmed = useRef(new Set<string>());
  const warm = (r: VisitRow) => { if (warmed.current.has(r.id)) return; warmed.current.add(r.id); fetch(`/visits/${r.id}/note.pdf`, { priority: "low" }).catch(() => {}); };

  const navigate = (patch: Partial<{ client: string[]; staff: string[]; service: string[]; state: string; rangeParam: string }>) => {
    const next = { ...filters, ...patch };
    const p = new URLSearchParams(next.rangeParam);
    for (const [k, v] of Object.entries(base.keep)) if (v) p.set(k, v);
    if (next.client.length) p.set("client", next.client.join(","));
    if (next.staff.length) p.set("staff", next.staff.join(","));
    if (next.service.length) p.set("service", next.service.join(","));
    if (next.state) p.set("state", next.state);
    router.push(`${base.path}?${p}`);
  };
  const filtered = Boolean(filters.client.length || filters.staff.length || filters.service.length || filters.state);

  const columns: ColumnDef<VisitRow, unknown>[] = useMemo(() => [
    { accessorKey: "clockInIso", header: "Date", cell: ({ row }) => <TwoLine top={row.original.day} bottom={row.original.time} /> },
    ...(showClient ? [{ accessorKey: "client", header: "Client" } as ColumnDef<VisitRow, unknown>] : []),
    { accessorKey: "staff", header: "Caregiver" },
    { accessorKey: "serviceLabel", header: "Service", cell: ({ row }) => <TwoLine top={row.original.serviceLabel} bottom={row.original.serviceKey} strong /> },
    { accessorKey: "minutes", header: "Hours", enableSorting: false, meta: { align: "right" }, cell: ({ row }) => row.original.minutes == null ? <span className="text-primary">in progress</span> : <span className="tabular-nums">{fmtHours(row.original.minutes)}</span> },
    { accessorKey: "units", header: "Units", meta: { align: "right" } },
    { id: "status", accessorFn: standingOf, header: "Status", enableSorting: false, cell: ({ row }) => {
      const r = row.original; const st = standingOf(r);
      return (
        <span className="flex flex-wrap gap-1">
          {st === "signed" ? null : st === "returned" ? <Badge tone="warn">returned</Badge> : st === "in progress" ? <Badge tone="accent">in progress</Badge> : st === "void" ? <Badge tone="neutral">void</Badge> : st === "unsigned" ? <Badge tone="danger">Unsigned</Badge> : <Badge tone="warn">manual</Badge>}
          {r.manual && st !== "manual" && <Badge tone="warn">manual</Badge>}
          {r.edits > 0 && <Badge tone="neutral">{r.edits} edit{r.edits === 1 ? "" : "s"}</Badge>}
        </span>
      );
    } },
    { accessorKey: "evv", header: "EVV", enableSorting: false, cell: ({ row }) => <Badge tone={evvTone[row.original.evv]}>{row.original.evv}</Badge> },
  ], [showClient]);

  const withIds = (href: string, ids: string[]) => `${href}${href.includes("?") ? "&" : "?"}ids=${ids.join(",")}`;
  const bulkBtn = "inline-flex h-8 items-center rounded-md px-3 text-[14px] font-medium text-text hover:bg-tab-hover";
  const noteHref = (id: string) => `?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(typeof window === "undefined" ? "" : window.location.search)), note: id })}`;

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      selectable={Boolean(exportCsv || exportPdf)}
      bulk={(selected) => (<>
        {exportPdf && <a href={withIds(exportPdf, selected.map((r) => r.id))} className={bulkBtn}>Export PDF</a>}
        {exportCsv && <a href={withIds(exportCsv, selected.map((r) => r.id))} className={bulkBtn}>Export CSV</a>}
      </>)}
      searchPlaceholder="Search client, caregiver, service…"
      suggestions={[
        ...(showClient ? [{ label: "Clients", items: [...new Set(rows.map((r) => r.client))].sort() }] : []),
        { label: "Team Members", items: [...new Set(rows.map((r) => r.staff))].sort() },
        { label: "Services", items: [...new Set(rows.map((r) => r.serviceLabel))].sort() },
      ]}
      chips={<>
        <DateRangePill label={filters.rangeLabel} presets={presets} current={{ param: filters.rangeParam, from: filters.from, to: filters.to }} onApply={(param) => navigate({ rangeParam: param })} />
        {showClient && options.clients.length > 0 && <FilterPill label="Client" value={filters.client} options={options.clients} search={options.clients.length > 8} onApply={(v) => navigate({ client: v })} />}
        {options.staff.length > 0 && <FilterPill label="Caregiver" value={filters.staff} options={options.staff} search={options.staff.length > 8} onApply={(v) => navigate({ staff: v })} />}
        {options.services.length > 0 && <FilterPill label="Service" value={filters.service} options={options.services} search={options.services.length > 8} onApply={(v) => navigate({ service: v })} />}
        <FilterPill label="Status" value={filters.state ? [filters.state] : []} options={STATES} single onApply={(v) => navigate({ state: v[0] ?? "" })} />
        {filtered && <button type="button" onClick={() => navigate({ client: [], staff: [], service: [], state: "" })} className="text-[14px] font-medium text-primary hover:underline">Clear</button>}
      </>}
      actions={(exportCsv || exportPdf) && <>{exportPdf && <a href={exportPdf} className="inline-flex h-9 items-center rounded-lg border border-line bg-card px-3 text-[14px] font-medium hover:bg-tab-hover">Export PDF</a>}{exportCsv && <a href={exportCsv} className="inline-flex h-9 items-center rounded-lg border border-line bg-card px-3 text-[14px] font-medium hover:bg-tab-hover">Export CSV</a>}</>}
      rowHref={(r) => noteHref(r.id)}
      rowAction={{ label: "Open", href: (r) => noteHref(r.id) }}
      rowMenu={(r) => [
        { label: "Open note", onSelect: () => window.history.pushState(null, "", noteHref(r.id)) },
        { label: "Open record", onSelect: () => { const p = new URLSearchParams(window.location.search); for (const [k, v] of Object.entries(base.keep)) if (v) p.set(k, v); p.delete("note"); p.set("visit", r.id); router.push(`${base.path}?${p}`); } },
        { label: "Download PDF", onSelect: () => window.open(`/visits/${r.id}/note.pdf`, "_blank") },
      ]}
      onRowHover={warm}
      emptyTitle="No notes match"
      initialSorting={[{ id: "clockInIso", desc: true }]}
      dense
    />
  );
}
