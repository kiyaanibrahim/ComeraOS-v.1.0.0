"use client"

import * as React from "react"
import {
  useTable,
  type CellContext,
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnVisibilityState,
  type PaginationState,
  type RowData,
  type SortingState,
} from "@tanstack/react-table"
import { cn } from "cn"
import { ChevronDown, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { DataTablePagination } from "./data-table-pagination"
import { DataTableViewOptions } from "./data-table-view-options"
import { features, type DataTableFeatures } from "./data-table-features"

const ACTION_COLUMN_IDS = new Set(["actions", "open", "confirm", "adjust"])

function isActionColumn(column: { id: string; columnDef: { header?: unknown } }) {
  return ACTION_COLUMN_IDS.has(column.id) || column.columnDef.header === ""
}

function columnClassName<TData extends RowData>(column: Column<DataTableFeatures, TData>, kind: "head" | "cell") {
  const meta = column.columnDef.meta
  const action = isActionColumn(column)
  return cn(
    meta?.align === "right" && "text-right",
    kind === "cell" && meta?.cellClassName,
    action && "w-px text-right",
    column.id === "expander" && "w-px px-1",
  )
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  filterColumn,
  filterPlaceholder = "Search…",
  empty = "No results.",
  emptySubRows = "Nothing else in this row.",
  getRowId,
  getSubRows,
  toolbar,
}: {
  columns: ColumnDef<DataTableFeatures, TData>[]
  data: TData[]
  filterColumn?: string
  filterPlaceholder?: string
  empty?: string
  emptySubRows?: string
  getRowId?: (row: TData) => string
  /** Return null when the row cannot expand. Return a list (possibly empty) when it can. */
  getSubRows?: (row: TData) => TData[] | null
  toolbar?: React.ReactNode
}) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = React.useState<ColumnVisibilityState>({})
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: 10 })
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({})

  const expandable = getSubRows != null
  const tableColumns = React.useMemo<ColumnDef<DataTableFeatures, TData>[]>(() => {
    if (!expandable) return columns
    const expander: ColumnDef<DataTableFeatures, TData> = {
      id: "expander",
      enableHiding: false,
      enableSorting: false,
      header: () => <span className="sr-only">Expand</span>,
      cell: () => null,
    }
    return [expander, ...columns]
  }, [columns, expandable])

  const table = useTable({
    features,
    data,
    columns: tableColumns,
    getRowId,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      pagination,
    },
  })

  const filterValue = filterColumn ? ((table.getColumn(filterColumn)?.getFilterValue() as string) ?? "") : ""
  const columnCount = table.getVisibleLeafColumns().length

  function renderLooseCell(column: Column<DataTableFeatures, TData>, original: TData) {
    const definition = column.columnDef
    const value = column.accessorFn?.(original, 0)
    if (typeof definition.cell === "function") {
      return definition.cell({
        getValue: () => value,
        renderValue: () => value ?? null,
        column,
        table,
        row: { original },
        cell: { getValue: () => value },
      } as unknown as CellContext<DataTableFeatures, TData>)
    }
    if (definition.cell != null) return definition.cell
    return value == null ? null : String(value)
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 py-4">
        {filterColumn ? (
          <Input
            placeholder={filterPlaceholder}
            value={filterValue}
            onValueChange={(value) => table.getColumn(filterColumn)?.setFilterValue(value)}
            className="max-w-sm"
          />
        ) : null}
        {toolbar}
        <DataTableViewOptions table={table} />
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className={columnClassName(header.column, "head")}>
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => {
                const subItems = getSubRows?.(row.original)
                const canExpand = subItems != null
                const open = Boolean(expanded[row.id])
                return (
                  <React.Fragment key={row.id}>
                    <TableRow>
                      {row.getVisibleCells().map((cell) => {
                        const action = isActionColumn(cell.column)
                        const content =
                          cell.column.id === "expander" ? (
                            canExpand ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-expanded={open}
                                aria-label={open ? "Collapse row" : "Expand row"}
                                onClick={() => setExpanded((current) => ({ ...current, [row.id]: !open }))}
                              >
                                {open ? <ChevronDown /> : <ChevronRight />}
                              </Button>
                            ) : null
                          ) : (
                            <table.FlexRender cell={cell} />
                          )
                        return (
                          <TableCell key={cell.id} className={columnClassName(cell.column, "cell")}>
                            {action ? <div className="flex justify-end gap-1">{content}</div> : content}
                          </TableCell>
                        )
                      })}
                    </TableRow>
                    {open && canExpand ? (
                      subItems.length ? (
                        subItems.map((child, index) => {
                          const childId = getRowId?.(child) ?? `${row.id}:${index}`
                          return (
                            <TableRow key={childId} className="bg-muted/30 hover:bg-muted/40">
                              {row.getVisibleCells().map((cell) => {
                                const action = isActionColumn(cell.column)
                                const content =
                                  cell.column.id === "expander" || action ? null : renderLooseCell(cell.column, child)
                                return (
                                  <TableCell
                                    key={`${childId}-${cell.column.id}`}
                                    className={columnClassName(cell.column, "cell")}
                                  >
                                    {action ? <div className="flex justify-end gap-1">{content}</div> : content}
                                  </TableCell>
                                )
                              })}
                            </TableRow>
                          )
                        })
                      ) : (
                        <TableRow>
                          <TableCell colSpan={columnCount} className="bg-muted/30 text-muted-foreground">
                            {emptySubRows}
                          </TableCell>
                        </TableRow>
                      )
                    ) : null}
                  </React.Fragment>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={columnCount} className="h-24 text-center text-muted-foreground">
                  {empty}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination table={table} />
    </div>
  )
}
