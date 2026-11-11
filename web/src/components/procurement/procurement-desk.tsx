"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"

import { DataTable } from "@/components/data-table/data-table"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import type { DataTableFeatures } from "@/components/data-table/data-table-features"
import { FlowFrame } from "@/components/flow/flow-frame"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { toast } from "@/components/ui/sonner"
import { money, statusLabel } from "@/lib/flow/format"
import { stageLabel } from "@/lib/flow/procurement"
import type { BusinessRecord, FlowClient } from "@/lib/flow/use-business"

type ShipmentRow = {
  id: string
  reference: string | null
  name: string | null
  status: string
  stage: string
  landing_total: number
  expected_on: string | null
  location_id: string | null
  created_at: string
}

export function ProcurementDesk({ businessKey }: { businessKey: string }) {
  return (
    <FlowFrame
      businessKey={businessKey}
      title="Inbound shipments"
      description="Build an inbound shipment from products. Delivering it posts stock for POS."
    >
      {({ business, supabase }) => (
        <ShipmentList business={business} businessKey={businessKey} supabase={supabase} />
      )}
    </FlowFrame>
  )
}

function ShipmentList({
  business,
  businessKey,
  supabase,
}: {
  business: BusinessRecord
  businessKey: string
  supabase: FlowClient
}) {
  const [rows, setRows] = useState<ShipmentRow[]>([])
  const [locations, setLocations] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const [shipmentRes, locationRes] = await Promise.all([
      supabase
        .from("shipments")
        .select("id, reference, name, status, stage, landing_total, expected_on, location_id, created_at")
        .eq("business_id", business.id)
        .eq("direction", "inbound")
        .order("created_at", { ascending: false }),
      supabase.from("locations").select("id, name").eq("business_id", business.id),
    ])
    if (shipmentRes.error || locationRes.error) {
      toast.error(shipmentRes.error?.message || locationRes.error?.message || "Could not load shipments")
    }
    setRows(shipmentRes.data ?? [])
    setLocations(Object.fromEntries((locationRes.data ?? []).map((location) => [location.id, location.name])))
  }, [business.id, supabase])

  useEffect(() => {
    void load()
  }, [load])

  const view = useMemo(
    () =>
      rows.map((row) => ({
        ...row,
        label: row.name || row.reference || "Shipment",
        destination: row.location_id ? locations[row.location_id] : "—",
      })),
    [locations, rows],
  )
  const columns = useMemo<ColumnDef<DataTableFeatures, (typeof view)[number]>[]>(
    () => [
      {
        accessorKey: "label",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Shipment" />,
        filterFn: "includesString",
        cell: ({ row }) => (
          <div>
            <Link className="underline-offset-4 hover:underline" href={`/app/${businessKey}/procurement/${row.original.id}`}>
              {row.original.label}
            </Link>
            <div className="text-muted-foreground">{row.original.reference}</div>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => (
          <div>
            <Badge variant={row.original.status === "delivered" ? "positive" : "secondary"}>{statusLabel(row.original.status)}</Badge>
            <div className="text-muted-foreground">{stageLabel(row.original.stage)}</div>
          </div>
        ),
      },
      {
        accessorKey: "destination",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Destination" />,
      },
      {
        accessorKey: "landing_total",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Landing cost" />,
        cell: ({ row }) => money(Number(row.original.landing_total), business.currency),
      },
    ],
    [business.currency, businessKey],
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inbound shipments</CardTitle>
        <CardDescription>Each shipment is a cart of products plus its landing cost.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Button nativeButton={false} render={<Link href={`/app/${businessKey}/procurement/new`} />}>
            New draft
          </Button>
          <Button nativeButton={false} variant="outline" render={<Link href={`/app/${businessKey}/procurement/drafts`} />}>
            Draft shipments
          </Button>
          <Button nativeButton={false} variant="outline" render={<Link href={`/app/${businessKey}/procurement/landing`} />}>
            Landing cost
          </Button>
        </div>
        <DataTable columns={columns} data={view} filterColumn="label" filterPlaceholder="Search shipments…" empty="No shipments yet." getRowId={(row) => row.id} />
      </CardContent>
    </Card>
  )
}
