"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
  const [message, setMessage] = useState<string | null>(null)

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
      setMessage(shipmentRes.error?.message || locationRes.error?.message || "Could not load shipments")
    }
    setRows(shipmentRes.data ?? [])
    setLocations(Object.fromEntries((locationRes.data ?? []).map((location) => [location.id, location.name])))
  }, [business.id, supabase])

  useEffect(() => {
    void load()
  }, [load])

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
        {message ? <p className="text-sm text-destructive">{message}</p> : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Shipment</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead>Landing cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-16 text-center text-muted-foreground">
                  No shipments yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link
                      className="underline-offset-4 hover:underline"
                      href={`/app/${businessKey}/procurement/${row.id}`}
                    >
                      {row.name || row.reference || "Shipment"}
                    </Link>
                    <div className="text-muted-foreground">{row.reference}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.status === "delivered" ? "positive" : "secondary"}>
                      {statusLabel(row.status)}
                    </Badge>
                    <div className="text-muted-foreground">{stageLabel(row.stage)}</div>
                  </TableCell>
                  <TableCell>{row.location_id ? locations[row.location_id] : "—"}</TableCell>
                  <TableCell>{money(Number(row.landing_total), business.currency)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
