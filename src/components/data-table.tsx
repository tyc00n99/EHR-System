"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, Columns3, ListFilter, Search } from "lucide-react";
import {
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** Per-column options read from `columnDef.meta`. */
export interface ColumnMeta { align?: "left" | "right"; /** Offer the column's distinct values as a "show only" filter in its header menu. */ filter?: boolean }

export interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  /** Placeholder for the global search box. Omit to hide search. */
  searchPlaceholder?: string;
  /** Row click target. */
  rowHref?: (row: T) => string | undefined;
  /** Filter chips rendered left of the search. */
  chips?: ReactNode;
  /** Right-side toolbar actions. */
  actions?: ReactNode;
  emptyTitle?: string;
  emptyHint?: string;
  pageSize?: number;
  initialSorting?: SortingState;
  dense?: boolean;
  /** Stable id per row; needed for selection to survive sorting and filtering. */
  getRowId?: (row: T) => string;
  /** Adds a checkbox column. `bulk` renders the toolbar while rows are selected. */
  selectable?: boolean;
  bulk?: (selected: T[], clear: () => void) => ReactNode;
}

export function DataTable<T>({ columns, data, searchPlaceholder, rowHref, chips, actions, emptyTitle = "Nothing here yet", emptyHint, pageSize = 25, initialSorting = [], dense, getRowId, selectable, bulk }: DataTableProps<T>) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [globalFilter, setGlobalFilter] = useState("");
  // Columns that offer a value filter match any of the ticked values; the checkbox column sits first.
  const allColumns = useMemo<ColumnDef<T, unknown>[]>(() => {
    const cols = columns.map((c) => ((c.meta as ColumnMeta | undefined)?.filter && !c.filterFn ? { ...c, filterFn: "arrIncludesSome" as const } : c));
    if (!selectable) return cols;
    const select: ColumnDef<T, unknown> = {
      id: "__select", enableSorting: false, enableHiding: false, enableGlobalFilter: false, size: 36,
      header: ({ table }) => <Checkbox aria-label="Select all rows" checked={table.getIsAllRowsSelected()} indeterminate={table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()} onCheckedChange={(v) => table.toggleAllRowsSelected(Boolean(v))} />,
      cell: ({ row }) => <span onClick={(e) => e.stopPropagation()} className="flex"><Checkbox aria-label="Select row" checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(Boolean(v))} /></span>,
    };
    return [select, ...cols];
  }, [columns, selectable]);
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
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });
  const rows = table.getRowModel().rows;
  const total = table.getFilteredRowModel().rows.length;
  const { pageIndex } = table.getState().pagination;
  const pageCount = table.getPageCount();
  const selected = table.getSelectedRowModel().rows.map((r) => r.original);
  const activeFilters = columnFilters.length;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line-soft bg-sidebar px-3 py-2">
        {selected.length > 0 && bulk ? bulk(selected, () => table.resetRowSelection()) : (<>
          {searchPlaceholder && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-gray-400" />
              <Input value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} placeholder={searchPlaceholder} className="h-8 w-64 bg-page pl-8 text-[13px]" />
            </div>
          )}
          {chips}
          <span className="text-[13px] text-muted-foreground">{total === data.length ? `${total} row${total === 1 ? "" : "s"}` : `${total} of ${data.length}`}</span>
          {activeFilters > 0 && <button type="button" onClick={() => table.resetColumnFilters()} className="text-[13px] font-medium text-primary hover:underline">Clear {activeFilters === 1 ? "filter" : `${activeFilters} filters`}</button>}
        </>)}
        <div className="ml-auto flex items-center gap-2">
          {actions}
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="h-8 gap-1.5 text-[13px]" />}>
              <Columns3 className="size-3.5" /> Columns <ChevronDown className="size-3 text-gray-400" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {table.getAllLeafColumns().filter((c) => c.getCanHide()).map((c) => (
                <DropdownMenuCheckboxItem key={c.id} checked={c.getIsVisible()} onCheckedChange={(v) => c.toggleVisibility(Boolean(v))}>
                  {typeof c.columnDef.header === "string" ? c.columnDef.header : c.id}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-sidebar">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((h) => {
                  const meta = h.column.columnDef.meta as ColumnMeta | undefined;
                  const align = meta?.align;
                  const hasMenu = h.column.getCanSort() || Boolean(meta?.filter);
                  return (
                    <TableHead key={h.id} className={cn("h-9 whitespace-nowrap px-4 font-mono text-[13px] font-medium uppercase tracking-[0.06em] text-muted-foreground first:pl-5 last:pr-5", align === "right" && "text-right", h.column.id === "__select" && "w-9 pr-0")} style={{ width: h.getSize() !== 150 ? h.getSize() : undefined }}>
                      {h.isPlaceholder ? null : hasMenu ? (
                        <HeaderMenu column={h.column} align={align} label={flexRender(h.column.columnDef.header, h.getContext())} filterable={Boolean(meta?.filter)} />
                      ) : flexRender(h.column.columnDef.header, h.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent"><TableCell colSpan={allColumns.length} className="px-5 py-12 text-center"><div className="font-medium text-text-strong">{emptyTitle}</div>{emptyHint && <div className="mt-1 text-[13px] text-muted-foreground">{emptyHint}</div>}</TableCell></TableRow>
            ) : rows.map((row) => {
              const href = rowHref?.(row.original);
              return (
                <TableRow key={row.id} onClick={href ? () => router.push(href) : undefined} data-state={row.getIsSelected() ? "selected" : undefined} className={cn("border-line-soft", href && "cursor-pointer", row.getIsSelected() && "bg-primary-soft/40")}>
                  {row.getVisibleCells().map((cell) => {
                    const align = (cell.column.columnDef.meta as ColumnMeta | undefined)?.align;
                    return <TableCell key={cell.id} className={cn("px-4 align-middle first:pl-5 last:pr-5", dense ? "py-2" : "py-2.5", align === "right" && "text-right tabular-nums", cell.column.id === "__select" && "w-9 pr-0")}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>;
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between border-t border-line-soft px-4 py-2 text-[13px] text-muted-foreground">
          <span>Page {pageIndex + 1} of {pageCount}</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}><ChevronLeft className="size-3.5" /></Button>
            <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}><ChevronRight className="size-3.5" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A column header is a menu, not a toggle: sort either way, and for columns that carry a
 * `filter` meta, tick the values to show. The header shows an arrow while sorted and a funnel while
 * filtered, so the state of the table is readable from the header row alone.
 */
function HeaderMenu<T>({ column, label, align, filterable }: { column: Column<T, unknown>; label: ReactNode; align?: "left" | "right"; filterable: boolean }) {
  const dir = column.getIsSorted();
  const selected = (column.getFilterValue() as string[] | undefined) ?? [];
  const facets = filterable ? [...column.getFacetedUniqueValues().keys()].filter((v) => v != null && v !== "").map(String).sort((a, b) => a.localeCompare(b)) : [];
  const active = dir || selected.length > 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<button type="button" aria-label={`${typeof label === "string" ? label : column.id} options`} className={cn("inline-flex items-center gap-1 rounded-md py-0.5 hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30", active && "text-primary")} />}>
        {label}
        {dir === "asc" ? <ArrowUp className="size-3" /> : dir === "desc" ? <ArrowDown className="size-3" /> : selected.length > 0 ? <ListFilter className="size-3" /> : <ChevronDown className="size-3 opacity-40" />}
        {selected.length > 0 && <span className="rounded-full bg-primary-soft px-1 text-[11px] leading-4 text-primary">{selected.length}</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align === "right" ? "end" : "start"} className="w-auto min-w-52 max-w-80">
        {/* A column with a value list is a filter, nothing else; sorting stays on the date and number columns. */}
        {column.getCanSort() && !filterable && (<>
          <DropdownMenuItem onClick={() => column.toggleSorting(false)}><ArrowUp className="size-3.5" /> Sort ascending</DropdownMenuItem>
          <DropdownMenuItem onClick={() => column.toggleSorting(true)}><ArrowDown className="size-3.5" /> Sort descending</DropdownMenuItem>
          {dir && <DropdownMenuItem onClick={() => column.clearSorting()}>Clear sort</DropdownMenuItem>}
        </>)}
        {filterable && facets.length > 0 && (<>
          <DropdownMenuGroup>
          {facets.map((v) => (
            <DropdownMenuCheckboxItem key={v} closeOnClick={false} checked={selected.includes(v)} onCheckedChange={(on) => { const next = on ? [...selected, v] : selected.filter((x) => x !== v); column.setFilterValue(next.length ? next : undefined); }}>
              <span className="truncate">{v}</span>
            </DropdownMenuCheckboxItem>
          ))}
          </DropdownMenuGroup>
          {selected.length > 0 && <DropdownMenuItem onClick={() => column.setFilterValue(undefined)}>Clear filter</DropdownMenuItem>}
        </>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Convenience for a non-sortable, non-searchable column of actions. */
export const actionColumn = { id: "actions", enableSorting: false, enableHiding: false, enableGlobalFilter: false } as const;
