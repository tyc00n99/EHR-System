"use client";

import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { DataTable, TwoLine } from "@/components/data-table";
import { DateRangePill, FilterPill, type PillOption } from "@/components/filter-pill";
import { Badge, type Tone } from "@/components/kit";
import { resubmitAction, reviewVisitAction } from "./actions";

export interface QueueRow {
  id: string; day: string; time: string; dateIso: string; client: string; caregiver: string; serviceLabel: string; serviceKey: string;
  compliance: { label: string; tone: Tone }; submission: { label: string; tone: Tone } | null; due: string; dueIso: string; overdue: boolean; evvRequired: boolean;
  openExceptions: number; flags: string[];
}

const SHOW: PillOption[] = [
  { value: "", label: "All visits" }, { value: "exceptions", label: "Open exceptions" }, { value: "noncompliant", label: "Noncompliant" }, { value: "review", label: "Needs review" },
  { value: "manual", label: "Manual or corrected" }, { value: "rejected", label: "Rejected by aggregator" }, { value: "deadline", label: "Deadline approaching" },
];
const SHOW_PARAMS: Record<string, Record<string, string>> = { "": {}, exceptions: { openExceptionsOnly: "true" }, noncompliant: { complianceStatus: "NONCOMPLIANT" }, review: { complianceStatus: "PENDING_REVIEW" }, manual: { manualOrCorrected: "true" }, rejected: { rejected: "true" }, deadline: { approachingDeadline: "true" } };
const SHOW_KEYS = ["openExceptionsOnly", "complianceStatus", "manualOrCorrected", "rejected", "approachingDeadline"];

/** The EVV review queue as the same table the notes use, with the queue's own columns and filters. */
export function QueueTable({ rows, filter, options, presets, rangeLabel }: { rows: QueueRow[]; filter: Record<string, string>; options: { people: PillOption[]; staff: PillOption[]; submission: PillOption[] }; presets: { label: string; param: string }[]; rangeLabel: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const show = Object.entries(SHOW_PARAMS).find(([k, set]) => k && Object.entries(set).every(([p, v]) => filter[p] === v))?.[0] ?? "";
  const navigate = (patch: Record<string, string | undefined>, resetShow = false) => {
    const next: Record<string, string> = { ...filter };
    delete next.offset; delete next.visit;
    if (resetShow) for (const k of SHOW_KEYS) delete next[k];
    for (const [k, v] of Object.entries(patch)) { if (v) next[k] = v; else delete next[k]; }
    const q = new URLSearchParams(next);
    router.push(`/evv${q.toString() ? `?${q}` : ""}`);
  };
  const filtered = Boolean(filter.personId || filter.staffId || filter.submissionStatus || show || filter.from || filter.to);
  // The drawer is server-rendered from ?visit=, so this must be a real navigation, not pushState.
  const visitHref = (id: string) => `/evv?${new URLSearchParams({ ...filter, visit: id })}`;
  const run = (label: string, ids: string[], fn: (id: string) => Promise<{ message?: string; errors?: unknown }>, clear: () => void) => start(async () => {
    let ok = 0; for (const id of ids) { const r = await fn(id); if (!r.errors) ok++; }
    toast[ok === ids.length ? "success" : "error"](`${label}: ${ok} of ${ids.length} done.`); clear(); router.refresh();
  });

  const columns: ColumnDef<QueueRow, unknown>[] = useMemo(() => [
    { accessorKey: "dateIso", header: "Date", meta: { width: 150 }, cell: ({ row }) => <TwoLine top={row.original.day} bottom={row.original.time} /> },
    { accessorKey: "client", header: "Client" },
    { accessorKey: "caregiver", header: "Caregiver" },
    { accessorKey: "serviceLabel", header: "Service", cell: ({ row }) => <span className="block max-w-[240px]"><TwoLine top={<span className="block truncate" title={row.original.serviceLabel}>{row.original.serviceLabel}</span>} bottom={row.original.serviceKey} strong /></span> },
    { id: "compliance", accessorFn: (r) => r.compliance.label, header: "Compliance", enableSorting: false, cell: ({ row }) => <span className="flex flex-wrap gap-1"><Badge tone={row.original.compliance.tone}>{row.original.compliance.label}</Badge>{!row.original.evvRequired && <Badge>Not required</Badge>}{row.original.openExceptions > 0 && <Badge tone="warn">{row.original.openExceptions} open</Badge>}</span> },
    { id: "submission", accessorFn: (r) => r.submission?.label ?? "", header: "Submission", enableSorting: false, cell: ({ row }) => row.original.submission ? <Badge tone={row.original.submission.tone}>{row.original.submission.label}</Badge> : null },
    { accessorKey: "dueIso", header: "Due", meta: { width: 96 }, cell: ({ row }) => <span className={row.original.overdue ? "font-medium text-danger" : ""}>{row.original.due}</span> },
  ], []);
  const bulkBtn = "inline-flex h-8 items-center rounded-md px-3 text-[14px] font-medium text-text hover:bg-tab-hover disabled:opacity-50";

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      selectable
      bulk={(selected, clear) => (<>
        <button type="button" disabled={pending} onClick={() => run("Resubmit", selected.map((r) => r.id), resubmitAction, clear)} className={bulkBtn}>Resubmit</button>
        <button type="button" disabled={pending} onClick={() => run("Mark reviewed", selected.map((r) => r.id), (id) => reviewVisitAction(id), clear)} className={bulkBtn}>Mark reviewed</button>
      </>)}
      searchPlaceholder="Search client, caregiver, service…"
      suggestions={[{ label: "Clients", items: [...new Set(rows.map((r) => r.client))].sort() }, { label: "Team Members", items: [...new Set(rows.map((r) => r.caregiver))].sort() }, { label: "Services", items: [...new Set(rows.map((r) => r.serviceLabel))].sort() }]}
      chips={<>
        <DateRangePill label={rangeLabel} presets={presets} current={{ param: filter.from && filter.to ? `from=${filter.from}&to=${filter.to}` : "", from: filter.from ?? "", to: filter.to ?? "" }} onApply={(param) => { const p = new URLSearchParams(param); navigate({ from: p.get("from") ?? undefined, to: p.get("to") ?? undefined }); }} />
        <FilterPill label="Client" value={filter.personId ? [filter.personId] : []} options={[{ value: "", label: "Any client" }, ...options.people]} single onApply={(v) => navigate({ personId: v[0] })} />
        <FilterPill label="Caregiver" value={filter.staffId ? [filter.staffId] : []} options={[{ value: "", label: "Any caregiver" }, ...options.staff]} single onApply={(v) => navigate({ staffId: v[0] })} />
        <FilterPill label="Submission" value={filter.submissionStatus ? [filter.submissionStatus] : []} options={[{ value: "", label: "Any status" }, ...options.submission]} single onApply={(v) => navigate({ submissionStatus: v[0] })} />
        <FilterPill label="Show" value={show ? [show] : []} options={SHOW} single onApply={(v) => navigate(SHOW_PARAMS[v[0] ?? ""], true)} />
        {filtered && <button type="button" onClick={() => router.push("/evv")} className="text-[14px] font-medium text-primary hover:underline">Clear</button>}
      </>}
      rowHref={(r) => visitHref(r.id)}
      rowAction={{ label: "Open", href: (r) => visitHref(r.id) }}
      rowMenu={(r) => [
        { label: "Open", onSelect: () => router.push(visitHref(r.id)) },
        { label: "Resubmit", onSelect: () => run("Resubmit", [r.id], resubmitAction, () => {}) },
        { label: "Mark reviewed", onSelect: () => run("Mark reviewed", [r.id], (id) => reviewVisitAction(id), () => {}) },
      ]}
      emptyTitle="Nothing matches"
      emptyHint="Visits appear here as caregivers clock in and out. Change the filters or pick another view."
      initialSorting={[{ id: "dateIso", desc: true }]}
      dense
    />
  );
}
