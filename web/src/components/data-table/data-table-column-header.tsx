"use client"

import type { Column, RowData } from "@tanstack/react-table"
import { cn } from "cn"
import { ArrowDown, ArrowUp, ChevronsUpDown, EyeOff } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import type { DataTableFeatures } from "./data-table-features"

function sortedIcon(sorted: false | "asc" | "desc") {
  if (sorted === "desc") return <ArrowDown />
  if (sorted === "asc") return <ArrowUp />
  return <ChevronsUpDown />
}

export function DataTableColumnHeader<TData extends RowData>({
  column,
  title,
  className,
}: {
  column: Column<DataTableFeatures, TData, unknown>
  title: string
  className?: string
}) {
  const align = column.columnDef.meta?.align === "right" ? "right" : "left"
  if (!column.getCanSort()) {
    return <div className={cn(align === "right" && "text-right", className)}>{title}</div>
  }
  const icon = sortedIcon(column.getIsSorted())
  return (
    <div className={cn("flex items-center", align === "right" && "justify-end", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "px-2 data-[state=open]:bg-accent",
                align === "right" ? "-mr-2" : "-ml-2",
              )}
            >
              {align === "right" ? icon : null}
              <span>{title}</span>
              {align === "left" ? icon : null}
            </Button>
          }
        />
        <DropdownMenuContent align={align === "right" ? "end" : "start"}>
          <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
            <ArrowUp />
            Asc
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
            <ArrowDown />
            Desc
          </DropdownMenuItem>
          {column.getCanHide() ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
                <EyeOff />
                Hide
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
