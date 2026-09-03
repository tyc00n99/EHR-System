"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp, Columns3, Search } from "lucide-react";
import {
  type ColumnDef,
  type ColumnFiltersState,
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
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

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
}

export function DataTable<T>({ columns, data, searchPlaceholder, rowHref, chips, actions, emptyTitle = "Nothing here yet", emptyHint, pageSize = 25, initialSorting = [], dense }: DataTableProps<T>) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = useState("");
  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, columnVisibility, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });
  const rows = table.getRowModel().rows;
  const total = table.getFilteredRowModel().rows.length;
  const { pageIndex } = table.getState().pagination;
  const pageCount = table.getPageCount();

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line-soft bg-sidebar px-3 py-2">
        {searchPlaceholder && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-gray-400" />
            <Input value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} placeholder={searchPlaceholder} className="h-8 w-64 bg-page pl-8 text-[13px]" />
          </div>
        )}
        {chips}
        <span className="text-[12.5px] text-muted-foreground">{total === data.length ? `${total} row${total === 1 ? "" : "s"}` : `${total} of ${data.length}`}</span>
        <div className="ml-auto flex items-center gap-2">
          {actions}
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="h-8 gap-1.5 text-[12.5px]" />}>
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
                  const sortable = h.column.getCanSort();
                  const dir = h.column.getIsSorted();
                  const align = (h.column.columnDef.meta as { align?: string } | undefined)?.align;
                  return (
                    <TableHead key={h.id} className={cn("h-9 whitespace-nowrap px-4 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground first:pl-5 last:pr-5", align === "right" && "text-right")} style={{ width: h.getSize() !== 150 ? h.getSize() : undefined }}>
                      {h.isPlaceholder ? null : sortable ? (
                        <button onClick={h.column.getToggleSortingHandler()} className={cn("inline-flex items-center gap-1 hover:text-text-strong", align === "right" && "flex-row-reverse")}>
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {dir === "asc" ? <ChevronUp className="size-3" /> : dir === "desc" ? <ChevronDown className="size-3" /> : <ChevronsUpDown className="size-3 opacity-40" />}
                        </button>
                      ) : flexRender(h.column.columnDef.header, h.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent"><TableCell colSpan={columns.length} className="px-5 py-12 text-center"><div className="font-medium text-text-strong">{emptyTitle}</div>{emptyHint && <div className="mt-1 text-[13px] text-muted-foreground">{emptyHint}</div>}</TableCell></TableRow>
            ) : rows.map((row) => {
              const href = rowHref?.(row.original);
              return (
                <TableRow key={row.id} onClick={href ? () => router.push(href) : undefined} className={cn("border-line-soft", href && "cursor-pointer")}>
                  {row.getVisibleCells().map((cell) => {
                    const align = (cell.column.columnDef.meta as { align?: string } | undefined)?.align;
                    return <TableCell key={cell.id} className={cn("px-4 align-middle first:pl-5 last:pr-5", dense ? "py-2" : "py-2.5", align === "right" && "text-right tabular-nums")}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>;
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between border-t border-line-soft px-4 py-2 text-[12.5px] text-muted-foreground">
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

/** Convenience for a non-sortable, non-searchable column of actions. */
export const actionColumn = { id: "actions", enableSorting: false, enableHiding: false, enableGlobalFilter: false } as const;
