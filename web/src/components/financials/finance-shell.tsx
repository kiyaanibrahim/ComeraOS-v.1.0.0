"use client"

import type { ColumnDef, RowData } from "@tanstack/react-table"

import { StatCard, type StatChart } from "@/components/analytics/stat-card"
import { DataTable } from "@/components/data-table/data-table"
import type { DataTableFeatures } from "@/components/data-table/data-table-features"
import { PosScreen } from "@/components/pos/pos-screen"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

export function FinanceScreen({
  businessKey,
  title,
  description,
  action,
  children,
}: {
  businessKey: string
  title: string
  description: string
  action?: React.ReactNode
  children: Parameters<typeof PosScreen>[0]["children"]
}) {
  return (
    <PosScreen businessKey={businessKey} title={title} description={description} action={action}>
      {children}
    </PosScreen>
  )
}

export function MetricRow({
  items,
}: {
  items: {
    label: string
    value: string
    delta?: number | null
    invert?: boolean
    chart?: StatChart | null
  }[]
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <StatCard
          key={item.label}
          label={item.label}
          value={item.value}
          delta={item.delta}
          invert={item.invert}
          chart={item.chart}
        />
      ))}
    </div>
  )
}

export function FinanceTabs({
  value,
  onValueChange,
  tabs,
  children,
}: {
  value: string
  onValueChange: (value: string) => void
  tabs: { value: string; label: string }[]
  children: React.ReactNode
}) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        if (typeof next === "string") onValueChange(next)
      }}
    >
      <TabsList>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {children}
    </Tabs>
  )
}

export function FinanceSelect({
  id,
  value,
  onValueChange,
  items,
  placeholder,
  className,
}: {
  id?: string
  value: string
  onValueChange: (value: string) => void
  items: Record<string, string>
  placeholder?: string
  className?: string
}) {
  return (
    <Select
      value={value}
      items={items}
      onValueChange={(next) => {
        if (next) onValueChange(next)
      }}
    >
      <SelectTrigger id={id} className={cn("w-full sm:w-[180px]", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(items).map(([itemValue, label]) => (
          <SelectItem key={itemValue} value={itemValue}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function FinanceTable<TData extends RowData>({
  columns,
  data,
  filterColumn,
  filterPlaceholder,
  empty,
  getRowId,
}: {
  columns: ColumnDef<DataTableFeatures, TData>[]
  data: TData[]
  filterColumn: string
  filterPlaceholder?: string
  empty: string
  getRowId: (row: TData) => string
}) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="px-(--card-spacing) pt-0 pb-(--card-spacing)">
        <DataTable
          columns={columns}
          data={data}
          filterColumn={filterColumn}
          filterPlaceholder={filterPlaceholder}
          empty={empty}
          getRowId={getRowId}
        />
      </CardContent>
    </Card>
  )
}

export { TabsContent }
