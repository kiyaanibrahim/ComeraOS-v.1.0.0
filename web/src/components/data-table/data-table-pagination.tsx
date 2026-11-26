"use client"

import type { ReactTable, RowData } from "@tanstack/react-table"
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

import type { DataTableFeatures } from "./data-table-features"

const pageSizes = [10, 20, 25, 30, 40, 50]
const pageSizeItems = Object.fromEntries(pageSizes.map((size) => [String(size), String(size)]))

export function DataTablePagination<TData extends RowData>({ table }: { table: ReactTable<DataTableFeatures, TData> }) {
  const pages = Math.max(table.getPageCount(), 1)
  const count = table.getFilteredRowModel().rows.length
  return (
    <div className="flex flex-col gap-3 px-2 py-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        {count} row{count === 1 ? "" : "s"}
      </p>
      <div className="flex flex-wrap items-center gap-4 lg:gap-6">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">Rows per page</p>
          <Select
            value={`${table.state.pagination.pageSize}`}
            items={pageSizeItems}
            onValueChange={(next) => {
              if (next) table.setPageSize(Number(next))
            }}
          >
            <SelectTrigger size="sm" className="w-[4.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent side="top">
              {pageSizes.map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-sm font-medium">
          Page {table.state.pagination.pageIndex + 1} of {pages}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" className="hidden lg:inline-flex" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
            <span className="sr-only">Go to first page</span>
            <ChevronsLeft />
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            <span className="sr-only">Go to previous page</span>
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            <span className="sr-only">Go to next page</span>
            <ChevronRight />
          </Button>
          <Button variant="outline" size="icon-sm" className="hidden lg:inline-flex" onClick={() => table.setPageIndex(pages - 1)} disabled={!table.getCanNextPage()}>
            <span className="sr-only">Go to last page</span>
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </div>
  )
}
