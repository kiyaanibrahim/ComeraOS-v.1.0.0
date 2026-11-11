"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"

import { DataTable } from "@/components/data-table/data-table"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import type { DataTableFeatures } from "@/components/data-table/data-table-features"
import { PosScreen, statusVariant } from "@/components/pos/pos-screen"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { toast } from "@/components/ui/sonner"
import { money, statusLabel } from "@/lib/flow/format"
import type { BusinessRecord, FlowClient } from "@/lib/flow/use-business"

type OrderRow = {
  id: string
  number: string
  status: string
  source: string
  total: number
  customer_id: string | null
  location_id: string | null
  created_at: string
}

const listed = ["open", "completed", "cancelled", "void"]

const sourceLabel: Record<string, string> = {
  pos: "Counter",
  quote: "Quote",
  online: "Online",
  manual: "Manual",
}

function stamp(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function OrdersDesk({ businessKey }: { businessKey: string }) {
  return (
    <PosScreen
      businessKey={businessKey}
      title="Orders"
      description="Counter sales and accepted quotes. Held carts stay on the register."
    >
      {({ business, supabase }) => <OrderList businessKey={businessKey} business={business} supabase={supabase} />}
    </PosScreen>
  )
}

function OrderList({
  businessKey,
  business,
  supabase,
}: {
  businessKey: string
  business: BusinessRecord
  supabase: FlowClient
}) {
  const [rows, setRows] = useState<OrderRow[]>([])
  const [customers, setCustomers] = useState<Record<string, string>>({})
  const [locations, setLocations] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [orderRes, customerRes, locationRes] = await Promise.all([
      supabase
        .from("orders")
        .select("id, number, status, source, total, customer_id, location_id, created_at")
        .eq("business_id", business.id)
        .in("status", listed)
        .order("created_at", { ascending: false })
        .limit(250),
      supabase.from("customers").select("id, name").eq("business_id", business.id),
      supabase.from("locations").select("id, name").eq("business_id", business.id),
    ])
    const error = orderRes.error || customerRes.error || locationRes.error
    if (error) toast.error(error.message)
    setRows((orderRes.data ?? []) as OrderRow[])
    setCustomers(Object.fromEntries((customerRes.data ?? []).map((row) => [row.id, row.name])))
    setLocations(Object.fromEntries((locationRes.data ?? []).map((row) => [row.id, row.name])))
    setLoading(false)
  }, [business.id, supabase])

  useEffect(() => {
    void load()
  }, [load])

  const columns = useMemo<ColumnDef<DataTableFeatures, OrderRow>[]>(
    () => [
      {
        accessorKey: "number",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Order" />,
        filterFn: "includesString",
        cell: ({ row }) => (
          <Link className="underline-offset-4 hover:underline" href={`/app/${businessKey}/orders/${row.original.id}`}>
            {row.original.number}
          </Link>
        ),
      },
      {
        id: "customer",
        header: "Customer",
        accessorFn: (row) => (row.customer_id ? customers[row.customer_id] ?? "Customer" : "Walk-in"),
      },
      {
        id: "location",
        header: "Location",
        accessorFn: (row) => (row.location_id ? locations[row.location_id] ?? "Location" : "—"),
      },
      {
        accessorKey: "source",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Source" />,
        cell: ({ row }) => sourceLabel[row.original.source] ?? statusLabel(row.original.source),
      },
      {
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <Badge variant={statusVariant(row.original.status)}>{statusLabel(row.original.status)}</Badge>,
      },
      {
        accessorKey: "total",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Total" />,
        cell: ({ row }) => <div className="text-right tabular-nums">{money(Number(row.original.total), business.currency)}</div>,
      },
      {
        accessorKey: "created_at",
        header: ({ column }) => <DataTableColumnHeader column={column} title="When" />,
        cell: ({ row }) => stamp(row.original.created_at),
      },
    ],
    [business.currency, businessKey, customers, locations],
  )

  return (
    <Card>
      <CardContent className="px-0">
        {loading ? (
          <div className="mx-4 h-40 animate-pulse rounded-xl bg-muted" />
        ) : rows.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No orders yet</EmptyTitle>
              <EmptyDescription>A counter sale or an accepted quote creates the first order.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <DataTable columns={columns} data={rows} empty="No orders yet" getRowId={(row) => row.id} />
        )}
      </CardContent>
    </Card>
  )
}
