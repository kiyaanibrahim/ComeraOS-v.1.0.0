"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"

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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { margin, suggestedPackages } from "@/lib/flow/cost"
import { money, quantity, statusLabel } from "@/lib/flow/format"
import { nextStage, shipmentStages, stageDetail, stageIndex, stageLabel } from "@/lib/flow/procurement"
import { callRpc } from "@/lib/flow/rpc"
import type { BusinessRecord, FlowClient } from "@/lib/flow/use-business"

type Shipment = {
  id: string
  reference: string | null
  name: string | null
  status: string
  stage: string
  carrier: string | null
  tracking_number: string | null
  location_id: string | null
  supplier_id: string | null
  origin_country: string | null
  expected_on: string | null
  merchandise_total: number
  charge_total: number
  landing_total: number
  allocation_method: string
  discount_percent: number
  origin_currency: string
  origin_to_usd_rate: number
  usd_to_business_rate: number
  freight_per_kg: number
  declared_value: number
  chargeable_weight_kg: number | null
  package_count_actual: number | null
  actuals_locked: boolean
}

type Line = {
  id: string
  product_id: string
  sku: string
  name: string
  quantity: number
  unit_cost: number
  sell_price: number
  quantity_received: number
  allocated_charge: number
  unit_landing_cost: number
  line_landing_total: number
  unit_weight_grams: number
  batch_reference: string | null
  position: number
}

type Charge = {
  id: string
  kind: string
  amount: number
  recoverable: boolean
  description: string | null
  cost_group: string
  source: string
}

type EventRow = { id: string; status: string; stage: string | null; note: string | null; occurred_at: string }

export function ShipmentDetail({
  businessKey,
  shipmentId,
}: {
  businessKey: string
  shipmentId: string
}) {
  return (
    <FlowFrame
      businessKey={businessKey}
      title="Shipment"
      description="Track the stage, record actual charges, then confirm to post inventory."
    >
      {({ business, supabase }) => (
        <Detail business={business} businessKey={businessKey} shipmentId={shipmentId} supabase={supabase} />
      )}
    </FlowFrame>
  )
}

function Detail({
  business,
  businessKey,
  shipmentId,
  supabase,
}: {
  business: BusinessRecord
  businessKey: string
  shipmentId: string
  supabase: FlowClient
}) {
  const router = useRouter()
  const [shipment, setShipment] = useState<Shipment | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [charges, setCharges] = useState<Charge[]>([])
  const [events, setEvents] = useState<EventRow[]>([])
  const [locationName, setLocationName] = useState("")
  const [supplierName, setSupplierName] = useState("")
  const [tracked, setTracked] = useState<Record<string, boolean>>({})
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({})
  const [batchRefs, setBatchRefs] = useState<Record<string, string>>({})
  const [packageCount, setPackageCount] = useState("")
  const [chargeable, setChargeable] = useState("")
  const [freightRate, setFreightRate] = useState("")
  const [freightTotal, setFreightTotal] = useState("")
  const [shippingTotal, setShippingTotal] = useState("")
  const [clearanceTotal, setClearanceTotal] = useState("")
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [timelineOpen, setTimelineOpen] = useState(false)
  const [compositionOpen, setCompositionOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const load = useCallback(async () => {
    const shipmentRes = await supabase
      .from("shipments")
      .select(
        "id, reference, name, status, stage, carrier, tracking_number, location_id, supplier_id, origin_country, expected_on, merchandise_total, charge_total, landing_total, allocation_method, discount_percent, origin_currency, origin_to_usd_rate, usd_to_business_rate, freight_per_kg, declared_value, chargeable_weight_kg, package_count_actual, actuals_locked",
      )
      .eq("id", shipmentId)
      .eq("business_id", business.id)
      .maybeSingle()
    if (shipmentRes.error) {
      setMessage(shipmentRes.error.message)
      return
    }
    if (!shipmentRes.data) {
      setShipment(null)
      return
    }
    const row = shipmentRes.data
    const [lineRes, chargeRes, eventRes, productRes, locationRes, supplierRes] = await Promise.all([
      supabase
        .from("shipment_lines")
        .select(
          "id, product_id, sku, name, quantity, unit_cost, sell_price, quantity_received, allocated_charge, unit_landing_cost, line_landing_total, unit_weight_grams, batch_reference, position",
        )
        .eq("shipment_id", shipmentId)
        .order("position"),
      supabase
        .from("shipment_charges")
        .select("id, kind, amount, recoverable, description, cost_group, source")
        .eq("shipment_id", shipmentId),
      supabase
        .from("shipment_events")
        .select("id, status, stage, note, occurred_at")
        .eq("shipment_id", shipmentId)
        .order("occurred_at"),
      supabase.from("products").select("id, track_inventory").eq("business_id", business.id),
      row.location_id
        ? supabase.from("locations").select("name").eq("id", row.location_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      row.supplier_id
        ? supabase.from("suppliers").select("name").eq("id", row.supplier_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])
    setShipment(row)
    setLines(lineRes.data ?? [])
    setCharges(chargeRes.data ?? [])
    setEvents(eventRes.data ?? [])
    setLocationName(locationRes.data?.name ?? "")
    setSupplierName(supplierRes.data?.name ?? "")
    setTracked(Object.fromEntries((productRes.data ?? []).map((product) => [product.id, product.track_inventory])))
    setPackageCount(row.package_count_actual === null ? "" : String(row.package_count_actual))
    setChargeable(row.chargeable_weight_kg === null ? "" : String(row.chargeable_weight_kg))
    setFreightRate(String(row.freight_per_kg ?? 0))
    const actuals = chargeRes.data ?? []
    setFreightTotal(String(sumGroup(actuals, "freight")))
    setShippingTotal(String(sumGroup(actuals, "shipping_company")))
    setClearanceTotal(String(sumGroup(actuals, "clearance")))
    setBatchRefs((current) => {
      const next = { ...current }
      for (const line of lineRes.data ?? []) {
        if (next[line.id] === undefined) next[line.id] = line.batch_reference ?? ""
      }
      return next
    })
    setReceiveQty((current) => {
      const next = { ...current }
      for (const line of lineRes.data ?? []) {
        const outstanding = Number(line.quantity) - Number(line.quantity_received)
        if (next[line.id] === undefined) next[line.id] = String(outstanding)
      }
      return next
    })
  }, [business.id, shipmentId, supabase])

  useEffect(() => {
    void load()
  }, [load])

  const weightGrams = lines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unit_weight_grams), 0)
  const units = lines.reduce((sum, line) => sum + Number(line.quantity), 0)
  const suggested = suggestedPackages(weightGrams)
  const receivedAny = lines.some((line) => Number(line.quantity_received) > 0)
  const open = shipment ? shipment.status !== "delivered" && shipment.status !== "cancelled" : false
  const draft = shipment?.stage === "draft_order"
  const locked = Boolean(shipment?.actuals_locked) || Boolean(shipment && shipment.status === "delivered")

  const issues = useMemo(() => {
    if (!shipment) return []
    const next: string[] = []
    if (packageCount.trim() === "" || Number(packageCount) < 0 || Number.isNaN(Number(packageCount))) {
      next.push("Package count is missing.")
    }
    for (const [label, value] of [
      ["Freight total", freightTotal],
      ["Shipping company total", shippingTotal],
      ["Clearance total", clearanceTotal],
    ] as const) {
      if (value.trim() === "" || Number.isNaN(Number(value)) || Number(value) < 0) next.push(`${label} needs a saved amount. Zero is allowed.`)
    }
    if (shipment.allocation_method === "weight" && lines.some((line) => Number(line.unit_weight_grams) <= 0)) {
      next.push("A line is missing unit weight.")
    }
    for (const line of lines) {
      if (tracked[line.product_id] && !(batchRefs[line.id] || "").trim()) {
        next.push(`Batch reference is missing for ${line.name}.`)
      }
    }
    return next
  }, [batchRefs, clearanceTotal, freightTotal, lines, packageCount, shipment, shippingTotal, tracked])

  async function run(action: () => Promise<void>) {
    setPending(true)
    setMessage(null)
    try {
      await action()
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update the shipment")
    } finally {
      setPending(false)
    }
  }

  function actualPayload() {
    return {
      p_shipment_id: shipmentId,
      p_package_count: Number(packageCount),
      p_chargeable_weight_kg: chargeable.trim() === "" ? null : Number(chargeable),
      p_freight_per_kg: freightRate.trim() === "" ? null : Number(freightRate),
      p_batch_references: lines.map((line) => ({
        line_id: line.id,
        batch_reference: (batchRefs[line.id] || "").trim(),
      })),
      p_charges: [
        { kind: "freight", amount: Number(freightTotal) || 0, cost_group: "freight", source: "actual", recoverable: false },
        {
          kind: "other",
          amount: Number(shippingTotal) || 0,
          cost_group: "shipping_company",
          source: "actual",
          recoverable: false,
          description: "Shipping company",
        },
        {
          kind: "duty",
          amount: Number(clearanceTotal) || 0,
          cost_group: "clearance",
          source: "actual",
          recoverable: false,
          description: "Clearance",
        },
      ],
    }
  }

  if (!shipment) {
    return <p className="text-sm text-muted-foreground">This shipment is not in the business.</p>
  }

  const progress = (stageIndex(shipment.stage) / (shipmentStages.length - 1)) * 100
  const upcoming = nextStage(shipment.stage)
  const groupTotals = {
    freight: sumGroup(charges, "freight"),
    shipping: sumGroup(charges, "shipping_company"),
    clearance: sumGroup(charges, "clearance"),
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{shipment.name || shipment.reference || "Shipment"}</CardTitle>
          <CardDescription>
            {shipment.reference} · {supplierName || "No supplier"} · {shipment.origin_country || "No origin"} ·{" "}
            {shipment.expected_on || "No ETA"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant={shipment.status === "delivered" ? "positive" : "secondary"}>
              {statusLabel(shipment.status)}
            </Badge>
            <Badge variant="outline">{stageLabel(shipment.stage)}</Badge>
            {shipment.actuals_locked ? <Badge variant="positive">Actuals locked</Badge> : null}
          </div>
          <dl className="grid gap-2 text-sm sm:grid-cols-4">
            <Stat label="Total units" value={quantity(units)} />
            <Stat label="Total SKUs" value={String(lines.length)} />
            <Stat label="Pipeline cost" value={money(Number(shipment.merchandise_total), business.currency)} />
            <Stat label="Destination" value={locationName || "No destination"} />
          </dl>
          <div className="flex flex-wrap gap-2">
            {draft ? (
              <Button nativeButton={false} render={<Link href={`/app/${businessKey}/procurement/${shipment.id}/edit`} />}>
                Edit draft
              </Button>
            ) : null}
            {open && !draft && upcoming !== "stock_added" ? (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  void run(() =>
                    callRpc(supabase, "set_shipment_stage", {
                      p_shipment_id: shipment.id,
                      p_stage: upcoming,
                      p_note: stageLabel(upcoming),
                    }),
                  )
                }
              >
                Advance to {stageLabel(upcoming)}
              </Button>
            ) : null}
            {shipment.status === "pending" && !draft ? (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  void run(() =>
                    callRpc(supabase, "set_shipment_status", {
                      p_shipment_id: shipment.id,
                      p_status: "in_transit",
                      p_note: "Marked in transit",
                    }),
                  )
                }
              >
                Mark in transit
              </Button>
            ) : null}
            {open && !draft && !receivedAny ? (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  void run(() =>
                    callRpc(supabase, "set_shipment_status", {
                      p_shipment_id: shipment.id,
                      p_status: "cancelled",
                      p_note: "Cancelled",
                    }),
                  )
                }
              >
                Cancel
              </Button>
            ) : null}
            {draft ? (
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  void run(async () => {
                    await callRpc(supabase, "delete_shipment_draft", { p_shipment_id: shipment.id })
                    router.push(`/app/${businessKey}/procurement/drafts`)
                  })
                }
              >
                Delete draft
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shipment progress</CardTitle>
          <CardDescription>
            {shipment.stage === "stock_added"
              ? "Inventory has been applied."
              : shipment.stage === "received"
                ? "Confirm actuals and apply inventory."
                : stageDetail(upcoming)}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex flex-wrap gap-2">
            {shipmentStages.map(([key, label]) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={key === shipment.stage ? "default" : "outline"}
                disabled={pending || draft || locked || key === "draft_order" || key === "stock_added" || key === shipment.stage}
                onClick={() =>
                  void run(() =>
                    callRpc(supabase, "set_shipment_stage", {
                      p_shipment_id: shipment.id,
                      p_stage: key,
                      p_note: label,
                    }),
                  )
                }
              >
                {label}
              </Button>
            ))}
          </div>
          <Collapsible open={timelineOpen} onOpenChange={setTimelineOpen}>
            <CollapsibleTrigger className="text-sm underline-offset-4 hover:underline">
              {timelineOpen ? "Hide timeline" : "Show timeline"}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 flex flex-col gap-3">
              {events.map((event) => (
                <div key={event.id} className="flex items-start justify-between gap-3 text-sm">
                  <div>
                    <div className="font-medium">
                      {event.stage ? stageLabel(event.stage) : statusLabel(event.status)}
                    </div>
                    {event.note ? <div className="text-muted-foreground">{event.note}</div> : null}
                  </div>
                  <time className="text-muted-foreground">{new Date(event.occurred_at).toLocaleString()}</time>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shipment composition</CardTitle>
          <CardDescription>
            {quantity(units)} units · {lines.length} SKUs · {quantity(weightGrams / 1000)} kg
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Collapsible open={compositionOpen} onOpenChange={setCompositionOpen}>
            <CollapsibleTrigger className="text-sm underline-offset-4 hover:underline">
              {compositionOpen ? "Hide lines" : "Show lines"}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Product / SKU</th>
                    <th className="py-2 pr-3 font-medium">Quantity</th>
                    <th className="py-2 pr-3 font-medium">Unit weight</th>
                    <th className="py-2 pr-3 font-medium">Line weight</th>
                    <th className="py-2 pr-3 font-medium">Landed cost / unit</th>
                    <th className="py-2 font-medium">Batch reference</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.id} className="border-t">
                      <td className="py-2 pr-3">
                        <div className="font-medium">{line.name}</div>
                        <div className="text-muted-foreground">{line.sku}</div>
                      </td>
                      <td className="py-2 pr-3">{quantity(Number(line.quantity))}</td>
                      <td className="py-2 pr-3">{quantity(Number(line.unit_weight_grams))} g</td>
                      <td className="py-2 pr-3">
                        {quantity(Number(line.quantity) * Number(line.unit_weight_grams))} g
                      </td>
                      <td className="py-2 pr-3">{money(Number(line.unit_landing_cost), business.currency)}</td>
                      <td className="py-2">
                        <Input
                          className="w-36"
                          value={batchRefs[line.id] ?? ""}
                          disabled={locked || receivedAny}
                          onChange={(event) =>
                            setBatchRefs((current) => ({ ...current, [line.id]: event.target.value }))
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
          <CardDescription>Saved with the draft. Reviewing the shipment does not change these rates.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-4">
          <Stat label="Discount" value={`${Number(shipment.discount_percent)}%`} />
          <Stat label="Origin to USD" value={String(shipment.origin_to_usd_rate)} />
          <Stat label={`USD to ${business.currency}`} value={String(shipment.usd_to_business_rate)} />
          <Stat label="Declared value USD" value={money(Number(shipment.declared_value), "USD")} />
        </CardContent>
      </Card>

      {draft ? null : (
        <Card>
          <CardHeader>
            <CardTitle>Actual costs</CardTitle>
            <CardDescription>
              Calculated weight {quantity(weightGrams / 1000)} kg. A blank amount is incomplete. Zero is a confirmed
              actual. Costs lock after the first receipt.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <Field label="Chargeable weight kg">
              <Input
                type="number"
                min="0"
                step="0.001"
                value={chargeable}
                disabled={locked || receivedAny}
                onChange={(event) => setChargeable(event.target.value)}
              />
            </Field>
            <Field label="Freight USD per kg">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={freightRate}
                disabled={locked || receivedAny}
                onChange={(event) => setFreightRate(event.target.value)}
              />
            </Field>
            <Field label="Freight total">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={freightTotal}
                disabled={locked || receivedAny}
                onChange={(event) => setFreightTotal(event.target.value)}
              />
            </Field>
            <Field label="Package count actual">
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={packageCount}
                  disabled={locked || receivedAny}
                  onChange={(event) => setPackageCount(event.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={locked || receivedAny}
                  onClick={() => setPackageCount(String(suggested))}
                >
                  Use {suggested}
                </Button>
              </div>
            </Field>
            <Field label="Shipping company total">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={shippingTotal}
                disabled={locked || receivedAny}
                onChange={(event) => setShippingTotal(event.target.value)}
              />
            </Field>
            <Field label="Clearance total">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={clearanceTotal}
                disabled={locked || receivedAny}
                onChange={(event) => setClearanceTotal(event.target.value)}
              />
            </Field>
            {open ? (
              <div className="md:col-span-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending || receivedAny}
                  onClick={() => void run(() => callRpc(supabase, "save_shipment_actuals", actualPayload()))}
                >
                  Save actuals
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Final accounting</CardTitle>
          <CardDescription>
            Allocation {shipment.allocation_method}. Landing charges {money(Number(shipment.charge_total), business.currency)}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <Summary label="Purchase cost" value={money(Number(shipment.merchandise_total), business.currency)} />
          <Summary label="Freight total" value={money(groupTotals.freight, business.currency)} />
          <Summary label="Shipping company total" value={money(groupTotals.shipping, business.currency)} />
          <Summary label="Clearance total" value={money(groupTotals.clearance, business.currency)} />
          <Summary label="Landing cost total" value={money(Number(shipment.charge_total), business.currency)} />
          <Summary label="Total shipment cost" value={money(Number(shipment.landing_total), business.currency)} />
          {lines.map((line) => {
            const lineWeight = Number(line.quantity) * Number(line.unit_weight_grams)
            const share = weightGrams > 0 ? (lineWeight / weightGrams) * 100 : 0
            const lineMargin = margin(Number(line.sell_price), Number(line.unit_landing_cost))
            const left = Number(line.quantity) - Number(line.quantity_received)
            return (
              <div key={line.id} className="border-t pt-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{line.name}</div>
                    <div className="text-muted-foreground">
                      Purchase {money(Number(line.quantity) * Number(line.unit_cost), business.currency)} · allocated{" "}
                      {money(Number(line.allocated_charge), business.currency)} · {share.toFixed(1)}% of weight
                      {lineMargin === null ? "" : ` · margin ${(lineMargin * 100).toFixed(1)}%`}
                    </div>
                  </div>
                  <div className="text-right tabular-nums">
                    <div>{money(Number(line.line_landing_total), business.currency)}</div>
                    <div className="text-muted-foreground">
                      {money(Number(line.unit_landing_cost), business.currency)} each
                    </div>
                  </div>
                </div>
                {open && left > 0 && !draft ? (
                  <div className="mt-2 flex items-center gap-2">
                    <Input
                      className="w-28"
                      type="number"
                      min="0.001"
                      step="0.001"
                      max={left}
                      value={receiveQty[line.id] ?? String(left)}
                      onChange={(event) =>
                        setReceiveQty((current) => ({ ...current, [line.id]: event.target.value }))
                      }
                    />
                    <span className="text-muted-foreground">{quantity(left)} outstanding</span>
                  </div>
                ) : null}
              </div>
            )
          })}
          {open && !draft && lines.some((line) => Number(line.quantity_received) < Number(line.quantity)) ? (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() =>
                void run(async () => {
                  const payload = lines
                    .map((line) => ({
                      line_id: line.id,
                      quantity: Number(receiveQty[line.id] || 0),
                      outstanding: Number(line.quantity) - Number(line.quantity_received),
                    }))
                    .filter((line) => line.quantity > 0 && line.quantity < line.outstanding)
                    .map(({ line_id, quantity: qty }) => ({ line_id, quantity: qty }))
                  if (payload.length === 0) {
                    throw new Error("Enter a partial quantity. The final units are applied when you confirm actuals.")
                  }
                  await callRpc(supabase, "receive_shipment", { p_shipment_id: shipment.id, p_lines: payload })
                })
              }
            >
              Receive partial quantities
            </Button>
          ) : null}
          {message ? <p className="text-destructive">{message}</p> : null}
          {open && !draft ? (
            <Button type="button" disabled={pending} onClick={() => setConfirmOpen(true)}>
              Confirm actuals and apply inventory
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirm actuals</DialogTitle>
            <DialogDescription>This locks the costs and posts the outstanding quantity.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 text-sm">
            <Summary label="Package count" value={packageCount || "Missing"} />
            <Summary label="Freight total" value={money(Number(freightTotal) || 0, business.currency)} />
            <Summary label="Shipping company total" value={money(Number(shippingTotal) || 0, business.currency)} />
            <Summary label="Clearance total" value={money(Number(clearanceTotal) || 0, business.currency)} />
            <Summary label="Actual landed cost" value={money(Number(shipment.landing_total), business.currency)} />
            {lines.map((line) => (
              <Summary
                key={line.id}
                label={`${line.sku} cost / unit`}
                value={money(Number(line.unit_landing_cost), business.currency)}
              />
            ))}
            {issues.length > 0 ? (
              <ul className="list-disc pl-4 text-destructive">
                {issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">Required actuals are present.</p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              disabled={pending || issues.length > 0}
              onClick={() =>
                void run(async () => {
                  await callRpc(supabase, "confirm_shipment_actuals", actualPayload())
                  setConfirmOpen(false)
                })
              }
            >
              Apply inventory
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function sumGroup(charges: { cost_group: string; amount: number; recoverable: boolean }[], group: string) {
  return charges
    .filter((charge) => charge.cost_group === group && !charge.recoverable)
    .reduce((sum, charge) => sum + Number(charge.amount), 0)
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
