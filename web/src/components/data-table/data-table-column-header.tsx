"use client"

import type { Column, RowData } from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react"

import { Button } from "@/components/ui/button"

import type { DataTableFeatures } from "./data-table-features"

export function DataTableColumnHeader<TData extends RowData>({
  column,
  title,
  className,
}: {
  column: Column<DataTableFeatures, TData, unknown>
  title: string
  className?: string
}) {
  if (!column.getCanSort()) return <span className={className}>{title}</span>
  const sorted = column.getIsSorted()
  return (
    <Button variant="ghost" size="sm" className={className ?? "-ml-2"} onClick={() => column.toggleSorting(sorted === "asc")}>
      {title}
      {sorted === "asc" ? <ArrowUp /> : sorted === "desc" ? <ArrowDown /> : <ChevronsUpDown />}
    </Button>
  )
}
