"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, MoreVertical, Search } from "lucide-react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** Per-column options read from `columnDef.meta`. */
export interface ColumnMeta { align?: "left" | "right"; /** Fixed pixel width. */ width?: number }

export interface RowMenuItem { label: string; onSelect: () => void; danger?: boolean }

export interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  /** Placeholder for the search box. Omit to hide search. */
  searchPlaceholder?: string;
  /** Grouped names offered under the search box on focus; picking one fills the search. */
  suggestions?: { label: string; items: string[] }[];
  /** Row click target. A query-only href updates the URL in place without a server render. */
  rowHref?: (row: T) => string | undefined;
  /** Rendered left of the count in the tool row (filter pills, chips). */
  chips?: ReactNode;
  /** Right-side tool-row actions. */
  actions?: ReactNode;
  emptyTitle?: string;
  emptyHint?: string;
  pageSize?: number;
  initialSorting?: SortingState;
  dense?: boolean;
  /** Stable id per row; needed for selection to survive sorting and filtering. */
  getRowId?: (row: T) => string;
  /** Adds a checkbox column. `bulk` renders the actions in the selection bar above the table. */
  selectable?: boolean;
  bulk?: (selected: T[], clear: () => void) => ReactNode;
  /** Called when the pointer enters a row; use it to warm whatever a click will open. */
  onRowHover?: (row: T) => void;
  /** A primary button at the end of every row. */
  rowAction?: { label: string; href: (row: T) => string };
  /** The ⋮ menu at the end of every row. */
  rowMenu?: (row: T) => RowMenuItem[];
}

const PAGE_SIZES = [10, 25, 50, 100];

/**
 * The records table, in the shape the user picked from DocuSign (Sept 18, 2026): a tool row with
 * search and filters, a selection bar that appears above the table while rows are ticked, sortable
 * headers you click (an arrow shows the direction), a checkbox on every row, a primary button and
 * a ⋮ menu at the row's end, tinted ticked rows, and a page-size and pager footer.
 */
export function DataTable<T>({ columns, data, searchPlaceholder, suggestions, rowHref, chips, actions, emptyTitle = "Nothing here yet", emptyHint, pageSize = 25, initialSorting = [], dense, getRowId, selectable, bulk, onRowHover, rowAction, rowMenu }: DataTableProps<T>) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [globalFilter, setGlobalFilter] = useState("");
  const go = (href: string) => { if (href.startsWith("?")) window.history.pushState(null, "", href); else router.push(href); };

  const allColumns = useMemo<ColumnDef<T, unknown>[]>(() => {
    const cols = [...columns];
    if (rowAction || rowMenu) {
      cols.push({
        id: "__actions", enableSorting: false, enableHiding: false, enableGlobalFilter: false, size: 120, header: "",
        cell: ({ row }) => (
          <span className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {rowAction && <button type="button" onClick={() => go(rowAction.href(row.original))} className="inline-flex h-8 items-center rounded-md bg-primary px-3.5 text-[13.5px] font-medium text-primary-foreground hover:bg-primary-hover">{rowAction.label}</button>}
            {rowMenu && (
              <DropdownMenu>
                <DropdownMenuTrigger render={<button type="button" aria-label="More" className="flex size-8 items-center justify-center rounded-md text-text hover:bg-hover" />}><MoreVertical className="size-4" /></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-44">
                  {rowMenu(row.original).map((m) => <DropdownMenuItem key={m.label} variant={m.danger ? "destructive" : "default"} onClick={m.onSelect}>{m.label}</DropdownMenuItem>)}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </span>
        ),
      });
    }
    if (!selectable) return cols;
    const select: ColumnDef<T, unknown> = {
      id: "__select", enableSorting: false, enableHiding: false, enableGlobalFilter: false, size: 36,
      header: ({ table }) => <Checkbox aria-label="Select all rows" checked={table.getIsAllRowsSelected()} indeterminate={table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()} onCheckedChange={(v) => table.toggleAllRowsSelected(Boolean(v))} />,
      cell: ({ row }) => <span onClick={(e) => e.stopPropagation()} className="flex"><Checkbox aria-label="Select row" checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(Boolean(v))} /></span>,
    };
    return [select, ...cols];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `go` is stable enough; the columns rarely change
  }, [columns, selectable, rowAction, rowMenu]);

  const table = useReactTable({
    data,
    columns: allColumns,
    state: { sorting, columnFilters, columnVisibility, globalFilter, rowSelection },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: Boolean(selectable),
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });
  const rows = table.getRowModel().rows;
  const total = table.getFilteredRowModel().rows.length;
  const { pageIndex, pageSize: size } = table.getState().pagination;
  const pageCount = Math.max(1, table.getPageCount());
  const selected = table.getSelectedRowModel().rows.map((r) => r.original);
  const hasTools = Boolean(searchPlaceholder || chips || actions);

  return (
    <div>
      {hasTools && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {searchPlaceholder && <SearchBox value={globalFilter} onChange={setGlobalFilter} placeholder={searchPlaceholder} suggestions={suggestions} />}
          {chips}
          {total !== data.length && <span className="text-[13.5px] text-muted-foreground">{total} of {data.length}</span>}
          <div className="ml-auto flex items-center gap-2">
            {actions}
          </div>
        </div>
      )}

      {selectable && selected.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1 rounded-[10px] border border-line bg-card py-1.5 pl-4 pr-2 text-[14px] shadow-[var(--shadow-sm)]">
          <span className="mr-2 font-medium text-text-strong">{selected.length} selected</span>
          {bulk?.(selected, () => table.resetRowSelection())}
          <button type="button" onClick={() => table.resetRowSelection()} className="ml-auto rounded-md px-3 py-1.5 text-[14px] font-medium text-primary hover:bg-tab-hover">Clear</button>
        </div>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((h) => {
                  const meta = h.column.columnDef.meta as ColumnMeta | undefined;
                  const align = meta?.align;
                  return (
                    <TableHead key={h.id} className={cn("h-11 whitespace-nowrap border-b border-line px-3 text-[13.5px] font-medium text-text-strong first:pl-1 last:pr-1", align === "right" && "text-right", h.column.id === "__select" && "w-9 pr-0")} style={{ width: meta?.width ?? (h.getSize() !== 150 ? h.getSize() : undefined) }}>
                      {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent"><TableCell colSpan={allColumns.length} className="px-5 py-12 text-center"><div className="font-medium text-text-strong">{emptyTitle}</div>{emptyHint && <div className="mt-1 text-[13.5px] text-muted-foreground">{emptyHint}</div>}</TableCell></TableRow>
            ) : rows.map((row) => {
              const href = rowHref?.(row.original);
              return (
                <TableRow key={row.id} onMouseEnter={onRowHover ? () => onRowHover(row.original) : undefined} onClick={href ? () => go(href) : undefined} data-state={row.getIsSelected() ? "selected" : undefined} className={cn("border-line-soft transition-colors", href && "cursor-pointer", row.getIsSelected() ? "bg-tab-hover hover:bg-tab-hover" : "hover:bg-sidebar")}>
                  {row.getVisibleCells().map((cell) => {
                    const align = (cell.column.columnDef.meta as ColumnMeta | undefined)?.align;
                    return <TableCell key={cell.id} className={cn("px-3 align-middle text-[14px] first:pl-1 last:pr-1", dense ? "py-2" : "py-2.5", align === "right" && "text-right tabular-nums", cell.column.id === "__select" && "w-9 pr-0")}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>;
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="mt-3 flex items-center justify-between text-[14px]">
        <DropdownMenu>
          <DropdownMenuTrigger render={<button type="button" aria-label="Rows per page" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-[14px] hover:bg-tab-hover" />}>{size} / page <ChevronDown className="size-3.5 text-muted-foreground" /></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-auto min-w-32">
            <DropdownMenuRadioGroup value={String(size)} onValueChange={(v) => table.setPageSize(Number(v))}>
              {PAGE_SIZES.map((n) => <DropdownMenuRadioItem key={n} value={String(n)} className="py-1.5 pr-9 pl-2.5 text-[14px]">{n} / page</DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex items-center gap-2">
          <span>Page {pageIndex + 1}{pageCount > 1 ? ` of ${pageCount}` : ""}</span>
          <button type="button" aria-label="Previous page" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-tab-hover hover:text-text-strong disabled:opacity-40"><ChevronLeft className="size-4" /></button>
          <button type="button" aria-label="Next page" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-tab-hover hover:text-text-strong disabled:opacity-40"><ChevronRight className="size-4" /></button>
        </div>
      </div>
    </div>
  );
}

/**
 * The search box. With suggestions it behaves like the scheduler's participant search: focusing
 * it lists the names in groups, typing narrows them, and picking one fills the box.
 */
function SearchBox({ value, onChange, placeholder, suggestions }: { value: string; onChange: (v: string) => void; placeholder: string; suggestions?: { label: string; items: string[] }[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!suggestions) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [suggestions]);
  const needle = value.trim().toLowerCase();
  const groups = (suggestions ?? []).map((g) => ({ label: g.label, items: g.items.filter((n) => !needle || n.toLowerCase().includes(needle)) }));
  const any = groups.some((g) => g.items.length);
  return (
    <div ref={box} className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
      <Input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
        placeholder={placeholder}
        role={suggestions ? "combobox" : undefined}
        aria-expanded={suggestions ? open : undefined}
        className="h-9 w-56 rounded-lg bg-card pl-9 pr-7 text-[14px]"
      />
      {value && <button type="button" onClick={() => { onChange(""); setOpen(false); }} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground hover:text-text-strong">✕</button>}
      {suggestions && open && (
        <div role="listbox" className="absolute left-0 top-full z-30 mt-1.5 max-h-80 w-72 overflow-y-auto rounded-lg border border-line bg-card py-2 shadow-lg">
          {!any && <p className="px-4 py-2 text-[14px] text-muted-foreground">Nothing matches.</p>}
          {groups.map((g) => g.items.length > 0 && (
            <div key={g.label} className="px-2 pb-1">
              <div className="flex items-center gap-3 px-2 pb-1 pt-1.5"><span className="shrink-0 text-[13.5px] text-hint">{g.label}</span><span className="h-px flex-1 bg-line" /></div>
              {g.items.map((n) => (
                <button key={n} type="button" role="option" aria-selected={value === n} onClick={() => { onChange(n); setOpen(false); }} className="block w-full rounded-md px-2 py-1.5 text-left text-[14.5px] text-text-strong hover:bg-hover">{n}</button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Convenience for a non-sortable, non-searchable column of actions. */
export const actionColumn = { id: "actions", enableSorting: false, enableHiding: false, enableGlobalFilter: false } as const;

/** A two-line cell: the main text over a smaller, quieter line. */
export function TwoLine({ top, bottom, strong }: { top: ReactNode; bottom?: ReactNode; strong?: boolean }) {
  return <span className="block"><span className={cn("block leading-snug", strong ? "font-medium text-text-strong" : "text-text")}>{top}</span>{bottom && <span className="block text-[12.5px] leading-snug text-muted-foreground">{bottom}</span>}</span>;
}
