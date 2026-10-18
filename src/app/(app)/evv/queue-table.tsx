"use client";

import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { DataTable, TwoLine } from "@/components/data-table";
import { DateRangePill, FilterPill, type PillOption } from "@/components/filter-pill";
import { Badge, cx, type Tone } from "@/components/kit";
import { QUEUE_MORE, QUEUE_TABS, QUEUE_VIEW_KEYS, QUEUE_VIEW_LABEL, QUEUE_VIEWS, type QueueView } from "@/evv/labels";
import { ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { resubmitAction, reviewVisitAction } from "./actions";

export interface QueueRow {
  id: string; day: string; time: string; dateIso: string; client: string; caregiver: string; serviceLabel: string; serviceKey: string;
  compliance: { label: string; tone: Tone }; submission: { label: string; tone: Tone } | null; due: string; dueIso: string; overdue: boolean; evvRequired: boolean;
  openExceptions: number; flags: string[];
}

/** The EVV review queue as the same table the notes use, with the queue's own columns and filters. */
export function QueueTable({ rows, filter, counts, options, presets, rangeLabel }: { rows: QueueRow[]; filter: Record<string, string>; counts: Record<QueueView, number>; options: { people: PillOption[]; staff: PillOption[]; submission: PillOption[] }; presets: { label: string; param: string }[]; rangeLabel: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const show = (Object.entries(QUEUE_VIEWS) as [QueueView, Record<string, string>][]).find(([k, set]) => k && Object.entries(set).every(([p, v]) => filter[p] === v))?.[0] ?? "";
  const navigate = (patch: Record<string, string | undefined>, resetShow = false) => {
    const next: Record<string, string> = { ...filter };
    delete next.offset; delete next.visit;
    if (resetShow) for (const k of QUEUE_VIEW_KEYS) delete next[k];
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
    { accessorKey: "dateIso", header: "Date", cell: ({ row }) => <TwoLine top={row.original.day} bottom={row.original.time} /> },
    { accessorKey: "client", header: "Client" },
    { accessorKey: "caregiver", header: "Caregiver" },
    { accessorKey: "serviceLabel", header: "Service", cell: ({ row }) => <TwoLine top={row.original.serviceLabel} bottom={row.original.serviceKey} strong /> },
    { id: "compliance", accessorFn: (r) => r.compliance.label, header: "Compliance", enableSorting: false, cell: ({ row }) => <span className="flex flex-wrap gap-1"><Badge tone={row.original.compliance.tone}>{row.original.compliance.label}</Badge>{!row.original.evvRequired && <Badge>Not required</Badge>}{row.original.openExceptions > 0 && <Badge tone="warn">{row.original.openExceptions} open</Badge>}</span> },
    { id: "submission", accessorFn: (r) => r.submission?.label ?? "", header: "Submission", enableSorting: false, cell: ({ row }) => row.original.submission ? <Badge tone={row.original.submission.tone}>{row.original.submission.label}</Badge> : null },
    { accessorKey: "dueIso", header: "Due", cell: ({ row }) => <span className={row.original.overdue ? "font-medium text-danger" : ""}>{row.original.due}</span> },
  ], []);
  const more = QUEUE_MORE.includes(show);
  const tab = "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-md px-3 text-[15px] font-medium transition-colors hover:bg-tab-hover hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30";
  const tabOn = "bg-tab-hover text-text-strong shadow-[inset_0_-2px_0_var(--primary)]";
  const count = (k: QueueView) => <span className={cx("rounded-full px-1.5 text-[13px] leading-[18px] tabular-nums", k === "rejected" && counts[k] > 0 ? "bg-danger-soft text-danger" : "bg-panel text-text-strong")}>{counts[k]}</span>;
  const bulkBtn = "inline-flex h-8 items-center rounded-md px-3 text-[14px] font-medium text-text hover:bg-tab-hover disabled:opacity-50";

  return (<>
    <nav aria-label="Filter the queue" className="-mx-1 mb-3 flex gap-0.5 overflow-x-auto border-b border-line-soft px-1">
      {QUEUE_TABS.map((k) => (
        <button key={k || "all"} type="button" aria-current={show === k ? "true" : undefined} onClick={() => navigate({ ...QUEUE_VIEWS[k] }, true)} className={cx(tab, show === k ? tabOn : "text-muted-foreground")}>
          {QUEUE_VIEW_LABEL[k]}{count(k)}
        </button>
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger render={<button type="button" aria-current={more ? "true" : undefined} className={cx(tab, "data-[popup-open]:bg-tab-hover", more ? tabOn : "text-muted-foreground")} />}>
          {more ? <>{QUEUE_VIEW_LABEL[show]}{count(show)}</> : "More"}<ChevronDown size={15} aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-auto min-w-56">
          <DropdownMenuRadioGroup value={more ? show : ""} onValueChange={(v) => navigate({ ...QUEUE_VIEWS[v as QueueView] }, true)}>
            {QUEUE_MORE.map((k) => (
              <DropdownMenuRadioItem key={k} value={k} closeOnClick className="justify-between gap-6 pr-9">{QUEUE_VIEW_LABEL[k]}<span className="text-[13px] tabular-nums text-muted-foreground">{counts[k]}</span></DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
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
        {filtered && <button type="button" onClick={() => router.push("/evv")} className="text-[14px] font-medium text-primary hover:underline">Clear</button>}
      </>}
      rowHref={(r) => visitHref(r.id)}
      emptyTitle="Nothing matches"
      emptyHint="Visits appear here as caregivers clock in and out. Change the filters or pick another view."
      initialSorting={[{ id: "dateIso", desc: true }]}
      dense
    />
  </>);
}
