"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"

import { FlowFrame } from "@/components/flow/flow-frame"
import { ProcurementNav } from "@/components/procurement/procurement-nav"
import { Badge } from "@/components/ui/badge"
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
import { money, quantity, statusLabel } from "@/lib/flow/format"
import { shipmentStages, stageIndex, stageLabel } from "@/lib/flow/procurement"
import type { BusinessRecord, FlowClient } from "@/lib/flow/use-business"

type Row = {
  id: string
  reference: string | null
  name: string | null
  direction: string
  status: string
  stage: string
  location_id: string | null
  merchandise_total: number
  updated_at: string
}

type Line = { shipment_id: string; quantity: number; quantity_received: number; sell_price: number }

export function ShipmentTracker({ businessKey }: { businessKey: string }) {
  return (
    <FlowFrame
      businessKey={businessKey}
      title="Shipment tracker"
      description="Inbound shipments before they are received. Pipeline cost is the supplier total, before landing charges."
      aside={<ProcurementNav businessKey={businessKey} current="tracker" />}
    >
      {({ business, supabase }) => <Tracker business={business} businessKey={businessKey} supabase={supabase} />}
    </FlowFrame>
  )
}

function Tracker({
  business,
  businessKey,
  supabase,
}: {
  business: BusinessRecord
  businessKey: string
  supabase: FlowClient
}) {
  const [rows, setRows] = useState<Row[]>([])
  const [lines, setLines] = useState<Line[]>([])
  const [locations, setLocations] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [shipmentRes, locationRes] = await Promise.all([
      supabase
        .from("shipments")
        .select("id, reference, name, direction, status, stage, location_id, merchandise_total, updated_at")
        .eq("business_id", business.id)
        .eq("direction", "inbound")
        .order("updated_at", { ascending: false }),
      supabase.from("locations").select("id, name").eq("business_id", business.id),
    ])
    if (shipmentRes.error || locationRes.error) {
      setMessage(shipmentRes.error?.message || locationRes.error?.message || "Could not load shipments")
    }
    const data = shipmentRes.data ?? []
    setRows(data)
    setLocations(Object.fromEntries((locationRes.data ?? []).map((location) => [location.id, location.name])))
    if (data.length === 0) {
      setLines([])
      return
    }
    const lineRes = await supabase
      .from("shipment_lines")
      .select("shipment_id, quantity, quantity_received, sell_price")
      .in(
        "shipment_id",
        data.map((row) => row.id),
      )
    if (lineRes.error) setMessage(lineRes.error.message)
    setLines(lineRes.data ?? [])
  }, [business.id, supabase])

  useEffect(() => {
    void load()
  }, [load])

  const pipeline = rows.filter((row) => row.status !== "delivered" && row.status !== "cancelled" && row.stage !== "draft_order")
  const pipelineIds = new Set(pipeline.map((row) => row.id))
  const pipelineLines = lines.filter((line) => pipelineIds.has(line.shipment_id))
  const pipelineUnits = pipelineLines.reduce((sum, line) => sum + Number(line.quantity) - Number(line.quantity_received), 0)
  const pipelineCost = pipeline.reduce((sum, row) => sum + Number(row.merchandise_total), 0)
  const projectedRevenue = pipelineLines.reduce((sum, line) => sum + Number(line.sell_price) * Number(line.quantity), 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Active shipments" value={String(pipeline.length)} />
        <Metric label="In transit" value={String(rows.filter((row) => row.status === "in_transit").length)} />
        <Metric label="Pipeline units" value={quantity(pipelineUnits)} />
        <Metric label="Active pipeline cost" value={money(pipelineCost, business.currency)} />
        <Metric label="Projected revenue" value={money(projectedRevenue, business.currency)} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Shipments</CardTitle>
          <CardDescription>Open a row for the stage, actual costs, and inventory confirmation.</CardDescription>
        </CardHeader>
        <CardContent>
          {message ? <p className="mb-3 text-sm text-destructive">{message}</p> : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Shipment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Units</TableHead>
                <TableHead>Pipeline cost</TableHead>
                <TableHead>Progress</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-16 text-center text-muted-foreground">
                    No shipments yet.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const rowLines = lines.filter((line) => line.shipment_id === row.id)
                  const rowUnits = rowLines.reduce((sum, line) => sum + Number(line.quantity), 0)
                  const progress = (stageIndex(row.stage) / (shipmentStages.length - 1)) * 100
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Link
                          className="underline-offset-4 hover:underline"
                          href={`/app/${businessKey}/procurement/${row.id}`}
                        >
                          {row.name || row.reference || row.direction}
                        </Link>
                        <div className="text-muted-foreground">
                          {row.reference}
                          {row.location_id ? ` · ${locations[row.location_id]}` : ""}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.status === "delivered" ? "positive" : "secondary"}>
                          {statusLabel(row.status)}
                        </Badge>
                        <div className="text-muted-foreground">{stageLabel(row.stage)}</div>
                      </TableCell>
                      <TableCell>{quantity(rowUnits)}</TableCell>
                      <TableCell>{money(Number(row.merchandise_total), business.currency)}</TableCell>
                      <TableCell>
                        <div className="h-2 w-28 overflow-hidden rounded-full bg-muted">
                          <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle>{value}</CardTitle>
      </CardHeader>
    </Card>
  )
}
