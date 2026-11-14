"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { toast } from "@/components/ui/sonner"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { landShipment, type AllocationMethod } from "@/lib/flow/cost"
import { money, quantity } from "@/lib/flow/format"
import type { BusinessRecord, FlowClient } from "@/lib/flow/use-business"

type Shipment = {
  id: string
  reference: string | null
  name: string | null
  allocation_method: string
  status: string
}

type Line = {
  id: string
  shipment_id: string
  sku: string
  name: string
  quantity: number
  unit_cost: number
  unit_weight_grams: number
  unit_landing_cost: number
}

type Charge = {
  shipment_id: string
  amount: number
  recoverable: boolean
  cost_group: string
}

export function LandingWorksheet({ business, supabase }: { business: BusinessRecord; supabase: FlowClient }) {
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [lines, setLines] = useState<Line[]>([])
  const [charges, setCharges] = useState<Charge[]>([])
  const [shipmentId, setShipmentId] = useState("all")

  const load = useCallback(async () => {
    const shipmentRes = await supabase
      .from("shipments")
      .select("id, reference, name, allocation_method, status")
      .eq("business_id", business.id)
      .eq("direction", "inbound")
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
    if (shipmentRes.error) {
      toast.error(shipmentRes.error.message)
      return
    }
    const ids = (shipmentRes.data ?? []).map((row) => row.id)
    setShipments(shipmentRes.data ?? [])
    if (ids.length === 0) {
      setLines([])
      setCharges([])
      return
    }
    const [lineRes, chargeRes] = await Promise.all([
      supabase
        .from("shipment_lines")
        .select("id, shipment_id, sku, name, quantity, unit_cost, unit_weight_grams, unit_landing_cost")
        .in("shipment_id", ids),
      supabase
        .from("shipment_charges")
        .select("shipment_id, amount, recoverable, cost_group")
        .in("shipment_id", ids),
    ])
    if (lineRes.error || chargeRes.error) {
      toast.error(lineRes.error?.message || chargeRes.error?.message || "Could not load landing cost")
    }
    setLines(lineRes.data ?? [])
    setCharges(chargeRes.data ?? [])
  }, [business.id, supabase])

  useEffect(() => {
    void load()
  }, [load])

  const visible = shipments.filter((shipment) => shipmentId === "all" || shipment.id === shipmentId)
  const items = Object.fromEntries([
    ["all", "All shipments"],
    ...shipments.map((shipment) => [shipment.id, shipment.name || shipment.reference || "Shipment"] as const),
  ])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex max-w-sm flex-col gap-1.5">
        <Label>Shipment</Label>
        <Select value={shipmentId} items={items} onValueChange={(value) => setShipmentId(value || "all")}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All shipments</SelectItem>
            {shipments.map((shipment) => (
              <SelectItem key={shipment.id} value={shipment.id}>
                {shipment.name || shipment.reference || "Shipment"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {visible.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No shipments</CardTitle>
            <CardDescription>Save a shipment to see its cost split.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        visible.map((shipment) => (
          <ShipmentSheet
            key={shipment.id}
            shipment={shipment}
            lines={lines.filter((line) => line.shipment_id === shipment.id)}
            charges={charges.filter((charge) => charge.shipment_id === shipment.id)}
            currency={business.currency}
          />
        ))
      )}
    </div>
  )
}

function ShipmentSheet({
  shipment,
  lines,
  charges,
  currency,
}: {
  shipment: Shipment
  lines: Line[]
  charges: Charge[]
  currency: string
}) {
  const method = (shipment.allocation_method as AllocationMethod) || "value"
  const sheet = useMemo(() => {
    const costLines = lines.map((line) => ({
      id: line.id,
      quantity: Number(line.quantity),
      unitCost: Number(line.unit_cost),
      weightGrams: Number(line.unit_weight_grams),
    }))
    const shipping = pool(charges, ["freight", "shipping_company"])
    const clearance = pool(charges, ["clearance"])
    const shippingLanded = landShipment(costLines, [{ amount: shipping, recoverable: false }], method)
    const clearanceLanded = landShipment(costLines, [{ amount: clearance, recoverable: false }], method)
    return { shipping, clearance, shippingLanded, clearanceLanded }
  }, [charges, lines, method])
  const weightGrams = lines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unit_weight_grams), 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{shipment.name || shipment.reference || "Shipment"}</CardTitle>
        <CardDescription>
          Total weight {quantity(weightGrams / 1000)} kg · shipping pool {money(sheet.shipping, currency)} · clearance
          pool {money(sheet.clearance, currency)}
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Weight</TableHead>
              <TableHead>Base cost</TableHead>
              <TableHead>Shipping allocation</TableHead>
              <TableHead>Clearance cost</TableHead>
              <TableHead>Final landed cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => {
              const shippingLine = sheet.shippingLanded.lines.find((item) => item.id === line.id)
              const clearanceLine = sheet.clearanceLanded.lines.find((item) => item.id === line.id)
              return (
                <TableRow key={line.id}>
                  <TableCell>
                    <div className="font-medium">{line.name}</div>
                    <div className="text-muted-foreground">{line.sku}</div>
                  </TableCell>
                  <TableCell>{quantity(Number(line.quantity))}</TableCell>
                  <TableCell>{quantity((Number(line.quantity) * Number(line.unit_weight_grams)) / 1000)} kg</TableCell>
                  <TableCell>{money(Number(line.quantity) * Number(line.unit_cost), currency)}</TableCell>
                  <TableCell>{money(shippingLine?.allocated ?? 0, currency)}</TableCell>
                  <TableCell>{money(clearanceLine?.allocated ?? 0, currency)}</TableCell>
                  <TableCell>{money(Number(line.unit_landing_cost), currency)} / unit</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function pool(charges: Charge[], groups: string[]) {
  return charges
    .filter((charge) => groups.includes(charge.cost_group) && !charge.recoverable)
    .reduce((sum, charge) => sum + Number(charge.amount), 0)
}
