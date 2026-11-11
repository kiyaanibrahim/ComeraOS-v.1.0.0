"use client"

import type { ReactTable, RowData } from "@tanstack/react-table"

import { Button } from "@/components/ui/button"

import type { DataTableFeatures } from "./data-table-features"

export function DataTablePagination<TData extends RowData>({ table }: { table: ReactTable<DataTableFeatures, TData> }) {
  const page = table.state.pagination.pageIndex + 1
  const pages = Math.max(table.getPageCount(), 1)
  return (
    <div className="flex items-center justify-between gap-2 py-4">
      <p className="text-sm text-muted-foreground">
        Page {page} of {pages}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
          Previous
        </Button>
        <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
          Next
        </Button>
      </div>
    </div>
  )
}
