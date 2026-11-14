"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { FlowFrame } from "@/components/flow/flow-frame"
import { chargesToDrafts, type ChargeDraft } from "@/components/procurement/charge-drafts"
import { FieldCard, FieldGrid, FormSection, ValueCard } from "@/components/procurement/form-row"
import { UnsavedChangesDialog, useUnsavedChanges } from "@/components/unsaved-changes"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/sonner"
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
import {
  Timeline,
  TimelineContent,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "@/components/reui/timeline"
import { autoBatchReference } from "@/lib/flow/codes"
import { margin, suggestedPackages } from "@/lib/flow/cost"
import { money, quantity, statusLabel } from "@/lib/flow/format"
import {
  chargeGroups,
  groupLabel,
  lifecycleMilestones,
  nextStage,
  stageIndex,
  stageLabel,
} from "@/lib/flow/procurement"
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

type EventRow = { id: string; status: string; stage: string | null; note: string | null; occurred_at: string }

const phases = [
  {
    title: "Supplier Phase",
    note: "Supplier planning to dispatch",
    duration: "Processing Duration",
    from: "order_placed",
    to: "at_forwarder",
    rows: [
      { label: "Date Order Placed", stage: "order_placed" },
      { label: "Date Confirmed", stage: "" },
      { label: "Date Shipped", stage: "" },
    ],
  },
  {
    title: "Forwarder Phase (Dubai)",
    note: "Forwarder warehouse handling",
    duration: "Warehouse Hold Duration",
    from: "at_forwarder",
    to: "handed_to_freight",
    rows: [
      { label: "Date Received", stage: "at_forwarder" },
      { label: "Date Forwarded", stage: "handed_to_freight" },
    ],
  },
  {
    title: "Freight Phase",
    note: "Air cargo movement",
    duration: "Transit Duration",
    from: "handed_to_freight",
    to: "arrived",
    rows: [
      { label: "Date Departed", stage: "handed_to_freight" },
      { label: "Date Arrived (Male)", stage: "arrived" },
    ],
  },
  {
    title: "Customs Phase",
    note: "Customs and clearing",
    duration: "Customs Duration",
    from: "customs",
    to: "cleared",
    rows: [
      { label: "Date Processing Started", stage: "customs" },
      { label: "Date Cleared", stage: "cleared" },
    ],
  },
  {
    title: "Final Delivery",
    note: "JUICIFY intake",
    duration: "Total End-to-End Duration",
    from: "order_placed",
    to: "stock_added",
    rows: [
      { label: "Date Received by JUICIFY", stage: "received" },
      { label: "Date Stock Added to Inventory", stage: "stock_added" },
    ],
  },
] as const

function chargeLabel(description: string) {
  const labels: Record<string, string> = {
    "Air cargo, delivery order, or bill of lading": "Air Cargo / D.O / B.L Charges",
    Handling: "Shipping Company Handling",
    "Clearance documentation": "Clearance Documentation",
    "Form filling": "Clearance Form Filling",
    "Clearance handling": "Clearance Handling",
  }
  return labels[description] ?? description
}

function figureStatus(source: string) {
  return source === "actual" ? "Actual" : "Projected"
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

function projectionHint(assumed: string, currency: string, count: number, status: string) {
  if (status === "Actual") return "Source: Entered on this shipment"
  const amount = money(Number(assumed) || 0, currency)
  if (count > 0) {
    const sample = count === 1 ? "the last shipment" : `the last ${count} shipments`
    return `Source: Projected from ${sample} (${amount})`
  }
  return `Source: Projected default (${amount})`
}

function packageStatus(value: string) {
  if (value.trim() === "" || Number.isNaN(Number(value)) || Number(value) < 0) return "Pending"
  return "Actual"
}

function StatusBadge({ status }: { status: string }) {
  if (status === "Actual") return <Badge variant="positive">{status}</Badge>
  return (
    <Badge variant="outline" className="text-muted-foreground">
      {status}
    </Badge>
  )
}

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
      title="Procurement"
      description="A shipment moves from the supplier through the forwarder, freight, customs, and final delivery before stock is added to inventory."
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
  const [events, setEvents] = useState<EventRow[]>([])
  const [locationName, setLocationName] = useState("")
  const [supplierName, setSupplierName] = useState("")
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({})
  const [batchRefs, setBatchRefs] = useState<Record<string, string>>({})
  const [packageCount, setPackageCount] = useState("")
  const [chargeable, setChargeable] = useState("")
  const [freightRate, setFreightRate] = useState("")
  const [freightSource, setFreightSource] = useState<"projected" | "actual">("projected")
  const [assumedFreight, setAssumedFreight] = useState("")
  const [projectionCount, setProjectionCount] = useState(0)
  const [draftCharges, setDraftCharges] = useState<ChargeDraft[]>(() => chargesToDrafts([]))
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [lifecycleOpen, setLifecycleOpen] = useState(false)
  const [compositionOpen, setCompositionOpen] = useState(true)
  const [pending, setPending] = useState(false)
  const savedSnapshot = useRef("")

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
      toast.error(shipmentRes.error.message)
      return
    }
    if (!shipmentRes.data) {
      setShipment(null)
      return
    }
    const row = shipmentRes.data
    const [lineRes, chargeRes, eventRes, locationRes, supplierRes] = await Promise.all([
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
      row.location_id
        ? supabase.from("locations").select("name").eq("id", row.location_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      row.supplier_id
        ? supabase.from("suppliers").select("name").eq("id", row.supplier_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])
    setShipment(row)
    setLines(lineRes.data ?? [])
    setEvents(eventRes.data ?? [])
    setLocationName(locationRes.data?.name ?? "")
    setSupplierName(supplierRes.data?.name ?? "")
    const previousRes = await supabase
      .from("shipments")
      .select("id, freight_per_kg, created_at")
      .eq("business_id", business.id)
      .eq("direction", "inbound")
      .neq("id", shipmentId)
      .order("created_at", { ascending: false })
      .limit(5)
    const previousRows = previousRes.data ?? []
    const previousCharges = previousRows.length
      ? (
          await supabase
            .from("shipment_charges")
            .select("id, shipment_id, kind, amount, recoverable, description, cost_group, source")
            .in(
              "shipment_id",
              previousRows.map((item) => item.id),
            )
        ).data ?? []
      : []
    const buckets = new Map<string, number[]>()
    for (const previous of previousRows) {
      const rows = previousCharges.filter((charge) => charge.shipment_id === previous.id)
      for (const line of chargesToDrafts(rows)) {
        if (line.amount.trim() === "" || Number.isNaN(Number(line.amount))) continue
        const values = buckets.get(line.key) ?? []
        values.push(Number(line.amount))
        buckets.set(line.key, values)
      }
    }
    const projected = new Map<string, string>()
    for (const [key, values] of buckets) {
      projected.set(key, String(roundMoney(values.reduce((sum, value) => sum + value, 0) / values.length)))
    }
    const rateSamples = previousRows.map((item) => Number(item.freight_per_kg)).filter((value) => value > 0)
    const assumedRate = rateSamples.length
      ? String(roundMoney(rateSamples.reduce((sum, value) => sum + value, 0) / rateSamples.length))
      : "0"
    setProjectionCount(previousRows.length)
    const ownCharges = chargeRes.data ?? []
    const drafts = chargesToDrafts(ownCharges).map((line) => {
      const assumed = projected.get(line.key) ?? "0"
      const savedActual = line.source === "actual" && line.amount.trim() !== ""
      if (savedActual) return { ...line, assumed, source: "actual" }
      return { ...line, amount: assumed, assumed, source: "projected" }
    })
    const nextPackages = row.package_count_actual === null ? "" : String(row.package_count_actual)
    const nextChargeable = row.chargeable_weight_kg === null ? "" : String(row.chargeable_weight_kg)
    const savedRate = Number(row.freight_per_kg)
    const rateIsProjected = savedRate === 0 || savedRate === Number(assumedRate)
    const nextFreight = rateIsProjected ? assumedRate : String(savedRate)
    const nextFreightSource = rateIsProjected ? "projected" : "actual"
    const nextBatches = Object.fromEntries(
      (lineRes.data ?? []).map((line) => [line.id, line.batch_reference?.trim() || autoBatchReference(line.id)]),
    )
    setPackageCount(nextPackages)
    setChargeable(nextChargeable)
    setAssumedFreight(assumedRate)
    setFreightRate(nextFreight)
    setFreightSource(nextFreightSource)
    setDraftCharges(drafts)
    setBatchRefs(nextBatches)
    savedSnapshot.current = JSON.stringify({
      packageCount: nextPackages,
      chargeable: nextChargeable,
      freightRate: nextFreight,
      charges: drafts,
      batches: nextBatches,
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

  const detailDirty =
    savedSnapshot.current !== "" &&
    savedSnapshot.current !==
      JSON.stringify({
        packageCount,
        chargeable,
        freightRate,
        charges: draftCharges,
        batches: batchRefs,
      })
  const unsaved = useUnsavedChanges(detailDirty)
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
    const missing: string[] = []
    if (packageStatus(packageCount) !== "Actual") missing.push("package count")
    const shippingActual = draftCharges.some(
      (charge) => charge.group === "shipping_company" && charge.source === "actual",
    )
    const clearanceActual = draftCharges.some(
      (charge) => charge.group === "clearance" && charge.source === "actual",
    )
    if (!shippingActual) missing.push("shipping company charges")
    if (!clearanceActual) missing.push("clearance actuals")
    if (missing.length) next.push(`Missing: ${missing.join(", ")}`)
    for (const charge of draftCharges) {
      if (charge.amount.trim() !== "" && (Number.isNaN(Number(charge.amount)) || Number(charge.amount) < 0)) {
        next.push(`${charge.description} needs a number. Zero is allowed.`)
      }
    }
    if (shipment.allocation_method === "weight" && lines.some((line) => Number(line.unit_weight_grams) <= 0)) {
      next.push("A line is missing unit weight.")
    }
    return next
  }, [draftCharges, lines, packageCount, shipment])

  async function run(action: () => Promise<void>, success = "Shipment updated.") {
    setPending(true)
    try {
      await action()
      toast.success(success)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the shipment")
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
        batch_reference: (batchRefs[line.id] || "").trim() || autoBatchReference(line.id),
      })),
      p_charges: draftCharges
        .filter((charge) => charge.amount.trim() !== "")
        .map((charge) => ({
          kind: charge.kind,
          amount: Number(charge.amount) || 0,
          cost_group: charge.group,
          source: charge.source === "actual" ? "actual" : "projected",
          recoverable: charge.recoverable,
          description: charge.description,
        })),
    }
  }

  if (!shipment) {
    return <p className="text-sm text-muted-foreground">This shipment is not in the business.</p>
  }

  const upcoming = nextStage(shipment.stage)
  const recorded = new Map<string, string>()
  for (const event of events) {
    if (event.stage && !recorded.has(event.stage)) recorded.set(event.stage, event.occurred_at)
  }
  const weightKg = chargeable.trim() === "" ? weightGrams / 1000 : Number(chargeable)
  const typedRate = Number(freightRate)
  const calculatedFreight =
    Number.isNaN(weightKg) || Number.isNaN(typedRate)
      ? 0
      : weightKg * typedRate * Number(shipment.usd_to_business_rate)
  const checkpoints = [
    recorded.has("order_placed"),
    false,
    false,
    recorded.has("at_forwarder"),
    recorded.has("handed_to_freight"),
    recorded.has("arrived"),
    recorded.has("customs"),
    recorded.has("cleared"),
    recorded.has("received"),
    recorded.has("stock_added"),
  ]
  const dated = checkpoints.filter(Boolean).length
  const currentStageIndex = stageIndex(shipment.stage)
  let checkpoint = "Complete"
  for (const phase of phases) {
    const waiting = phase.rows.find((row) => row.stage && !recorded.has(row.stage))
    if (waiting) {
      checkpoint = waiting.label
      break
    }
  }
  let completedMilestones = 0
  for (const [, stage] of lifecycleMilestones) {
    const done = recorded.has(stage) || currentStageIndex > stageIndex(stage)
    if (!done) break
    completedMilestones += 1
  }
  const groupBadge = (group: string) => {
    if (group === "freight" && freightSource === "actual") return "Actual"
    const rows = draftCharges.filter((charge) => charge.group === group)
    if (rows.some((charge) => charge.source === "actual")) return "Actual"
    return "Projected"
  }
  const entered = (group: string) =>
    draftCharges
      .filter((charge) => charge.group === group && charge.amount.trim() !== "" && !charge.recoverable)
      .reduce((sum, charge) => sum + (Number(charge.amount) || 0), 0)
  const freightFromCharge = draftCharges.some((charge) => charge.group === "freight" && charge.source === "actual")
  const freightFigure = freightFromCharge ? entered("freight") : calculatedFreight
  const previewLanding = freightFigure + entered("shipping_company") + entered("clearance")

  return (
    <div className="flex flex-col gap-4">
      <UnsavedChangesDialog open={unsaved.open} onStay={unsaved.stay} onLeave={unsaved.leave} />
      <Card>
        <CardHeader>
          <CardDescription>
            <Link className="underline-offset-4 hover:underline" href={`/app/${businessKey}/procurement`}>
              Back to Shipment Tracker
            </Link>
          </CardDescription>
          <CardTitle>Shipment Command Header</CardTitle>
          <CardDescription>{shipment.name || shipment.reference || "Shipment"}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{draft ? "Draft Order (Internal)" : stageLabel(shipment.stage)}</Badge>
            <Badge variant={shipment.status === "delivered" ? "positive" : "secondary"}>
              {statusLabel(shipment.status)}
            </Badge>
            {shipment.actuals_locked ? <Badge variant="positive">Actuals locked</Badge> : null}
          </div>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <Stat label="Shipment ID" value={shipment.reference || "No reference"} />
            <Stat label="Supplier" value={supplierName || "Pending Supplier"} />
            <Stat label="Origin Country" value={shipment.origin_country || "Not set"} />
            <Stat label="ETA" value={shipment.expected_on || "Pending"} />
          </dl>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Total Units" value={quantity(units)} />
            <Stat label="Pipeline Cost (Pre-Landed)" value={money(Number(shipment.merchandise_total), business.currency)} />
            <Stat label="Total SKUs" value={String(lines.length)} />
            <Stat label="Batch Apply Status" value={shipment.actuals_locked || shipment.status === "delivered" ? "Applied" : "Pending Apply"} />
          </dl>
          <div className="flex flex-wrap gap-2">
            {draft ? (
              <Button nativeButton={false} render={<Link href={`/app/${businessKey}/procurement/${shipment.id}/edit`} />}>
                Edit draft order
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
                Delete Shipment
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Collapsible open={lifecycleOpen} onOpenChange={setLifecycleOpen}>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground">Shipment progress</p>
              <CardTitle>Shipment Lifecycle</CardTitle>
              <CardDescription>
                {dated} / 10 · {checkpoint}
              </CardDescription>
            </div>
            <CollapsibleTrigger className="inline-flex shrink-0 items-center rounded-md border px-3 py-1.5 text-xs font-medium">
              {lifecycleOpen ? "Collapse" : "Expand"}
            </CollapsibleTrigger>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {lifecycleOpen ? null : (
            <Timeline orientation="horizontal" value={completedMilestones} className="w-full">
              {lifecycleMilestones.map(([label, stage], index) => {
                const when = recorded.get(stage)
                return (
                  <TimelineItem key={stage} step={index + 1}>
                    <TimelineHeader>
                      <TimelineTitle>{label}</TimelineTitle>
                    </TimelineHeader>
                    <TimelineIndicator />
                    <TimelineSeparator />
                    <TimelineContent>{when ? new Date(when).toLocaleDateString() : "Pending"}</TimelineContent>
                  </TimelineItem>
                )
              })}
            </Timeline>
          )}
          <CollapsibleContent className="flex flex-col">
            {phases.map((phase) => (
              <section key={phase.title} className="border-t py-4">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">{phase.title}</p>
                    <p className="font-medium">{phase.note}</p>
                  </div>
                  <Badge variant={recorded.has(phase.to) ? "positive" : "outline"}>
                    {recorded.has(phase.to) ? "Done" : "Pending"}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {phase.rows.map((row) => (
                    <div key={row.label}>
                      <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">{row.label}</p>
                      <p className="text-sm">
                        {row.stage && recorded.has(row.stage)
                          ? new Date(recorded.get(row.stage)!).toLocaleString()
                          : "Pending"}
                      </p>
                    </div>
                  ))}
                  <div>
                    <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">{phase.duration}</p>
                    <p className="text-sm">{spanLabel(recorded.get(phase.from), recorded.get(phase.to))}</p>
                  </div>
                </div>
              </section>
            ))}
          </CollapsibleContent>
        </CardContent>
      </Card>
      </Collapsible>

      <Collapsible open={compositionOpen} onOpenChange={setCompositionOpen}>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground">Shipment composition</p>
              <CardTitle>Shipment Lines</CardTitle>
              <CardDescription>
                {quantity(units)} units · {lines.length} SKUs · {quantity(weightGrams / 1000)} kg
              </CardDescription>
            </div>
            <CollapsibleTrigger className="inline-flex shrink-0 items-center rounded-md border px-3 py-1.5 text-xs font-medium">
              {compositionOpen ? "Collapse" : "Expand"}
            </CollapsibleTrigger>
          </div>
        </CardHeader>
        <CollapsibleContent>
        <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-medium">SKU / Product</th>
                    <th className="py-2 pr-3 font-medium">Flavor</th>
                    <th className="py-2 pr-3 font-medium">Qty</th>
                    <th className="py-2 pr-3 font-medium">Unit Weight</th>
                    <th className="py-2 pr-3 font-medium">Line Weight</th>
                    <th className="py-2 pr-3 font-medium">Landed Cost / Unit</th>
                    <th className="py-2 font-medium">Batch Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.id} className="border-t">
                      <td className="py-2 pr-3">
                        <div className="font-medium">{line.name}</div>
                        <div className="text-muted-foreground">{line.sku}</div>
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">—</td>
                      <td className="py-2 pr-3">{quantity(Number(line.quantity))}</td>
                      <td className="py-2 pr-3">{quantity(Number(line.unit_weight_grams))} g</td>
                      <td className="py-2 pr-3">
                        {quantity(Number(line.quantity) * Number(line.unit_weight_grams))} g
                      </td>
                      <td className="py-2 pr-3">{money(Number(line.unit_landing_cost), business.currency)}</td>
                      <td className="py-2">
                        <Input
                          className="w-36"
                          value={batchRefs[line.id] || autoBatchReference(line.id)}
                          disabled={locked || receivedAny}
                          onChange={(event) =>
                            setBatchRefs((current) => ({
                              ...current,
                              [line.id]:
                                event.target.value.trim() === ""
                                  ? autoBatchReference(line.id)
                                  : event.target.value,
                            }))
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        </CardContent>
        </CollapsibleContent>
      </Card>
      </Collapsible>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Pricing / Exchange</CardTitle>
          <CardDescription>Operational pricing context for this shipment. Carried over from the draft.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGrid>
            <ValueCard label="Discount %" value={`${Number(shipment.discount_percent).toFixed(2)}%`} badge={<Badge variant="secondary">Carried over</Badge>} />
            <ValueCard label="Origin -> USD Exchange Rate" value={String(shipment.origin_to_usd_rate)} badge={<Badge variant="secondary">Carried over</Badge>} />
            <ValueCard label={`USD -> ${business.currency} Exchange Rate`} value={String(shipment.usd_to_business_rate)} badge={<Badge variant="secondary">Carried over</Badge>} />
            <ValueCard label="Declared Value USD" value={money(Number(shipment.declared_value), "USD")} badge={<Badge variant="secondary">Auto</Badge>} />
          </FieldGrid>
        </CardContent>
      </Card>

      {(
        <Card>
          <CardHeader>
            <CardTitle>Actual Financial Truth Inputs</CardTitle>
            <CardDescription>
              Every figure starts as a projection from the last 5 shipments. Type a number and that figure, plus its
              summary line, turns Actual.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {chargeGroups
              .filter(([group]) => group !== "other" || draftCharges.some((charge) => charge.group === group))
              .map(([group]) => (
                <FormSection key={group} title={group === "shipping_company" ? "Shipping Company Charges" : group === "clearance" ? "Clearance" : groupLabel(group)}>
                  <div className="flex flex-col gap-2.5 py-3">
                    <FieldGrid>
                      {group === "freight" ? (
                        <>
                          <ValueCard label="Calculated Shipment Weight" value={`${quantity(weightGrams / 1000)} kg`} />
                          <ValueCard
                            label="Chargeable Weight Used"
                            value={`${quantity(chargeable.trim() === "" ? weightGrams / 1000 : Number(chargeable) || 0)} kg`}
                          />
                          <FieldCard
                            label="USD per kg"
                            badge={<StatusBadge status={figureStatus(freightSource)} />}
                            quiet={freightSource !== "actual"}
                            hint={projectionHint(assumedFreight, "USD", projectionCount, figureStatus(freightSource))}
                          >
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={freightRate}
                              disabled={locked || receivedAny}
                              onValueChange={(value) => {
                                setFreightRate(value)
                                setFreightSource("actual")
                              }}
                            />
                          </FieldCard>
                          <FieldCard label="Chargeable weight kg">
                            <Input
                              type="number"
                              min="0"
                              step="0.001"
                              value={chargeable}
                              disabled={locked || receivedAny}
                              onValueChange={setChargeable}
                            />
                          </FieldCard>
                          <FieldCard
                            label="Package Count"
                            badge={<StatusBadge status={packageStatus(packageCount)} />}
                            quiet={packageStatus(packageCount) !== "Actual"}
                            hint={packageStatus(packageCount) === "Actual" ? "Confirmed by forwarder" : `Pending. Suggested ${suggested}. Required before inventory is applied.`}
                          >
                            <div className="flex gap-2">
                              <Input
                                type="number"
                                min="0"
                                step="1"
                                value={packageCount}
                                disabled={locked || receivedAny}
                                onValueChange={setPackageCount}
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
                          </FieldCard>
                        </>
                      ) : null}
                      {draftCharges
                        .filter((charge) => charge.group === group)
                        .map((charge) => {
                          const status = figureStatus(charge.source)
                          return (
                          <FieldCard
                            key={charge.key}
                            label={chargeLabel(charge.description)}
                            badge={<StatusBadge status={status} />}
                            quiet={status !== "Actual"}
                            hint={projectionHint(charge.assumed, business.currency, projectionCount, status)}
                          >
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={charge.amount}
                              disabled={locked || receivedAny}
                              onValueChange={(value) =>
                                setDraftCharges((current) =>
                                  current.map((item) =>
                                    item.key === charge.key ? { ...item, amount: value, source: "actual" } : item,
                                  ),
                                )
                              }
                            />
                          </FieldCard>
                          )
                        })}
                    </FieldGrid>
                    {group === "freight" ? (
                      <>
                        <ValueCard
                          label="Freight Total"
                          badge={<StatusBadge status={groupBadge("freight")} />}
                          value={money(freightFigure, business.currency)}
                        />
                        <ValueCard
                          label="Actual Freight / Financial Truth"
                          badge={<StatusBadge status={groupBadge("freight")} />}
                          value={money(freightFigure, business.currency)}
                        />
                      </>
                    ) : (
                      <ValueCard
                        label={group === "clearance" ? "Clearance Total (Financial Truth Input Basis)" : `${group === "shipping_company" ? "Shipping Company" : groupLabel(group)} Total`}
                        badge={<StatusBadge status={groupBadge(group)} />}
                        value={money(entered(group), business.currency)}
                      />
                    )}
                  </div>
                </FormSection>
              ))}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
              <div>
                <div className="text-sm font-medium">
                  {issues.length > 0 ? "Not Ready - actuals required" : "Actuals are ready"}
                </div>
                <p className="text-sm text-muted-foreground">
                  {issues.length > 0 ? issues[0] : "Preview includes defaults until you change a projected value."}
                </p>
              </div>
              {open ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending || receivedAny}
                  onClick={() => void run(() => callRpc(supabase, "save_shipment_actuals", actualPayload()), "Shipment details saved.")}
                >
                  Save Shipment Details
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      )}
        </div>

      <Card>
        <CardHeader>
          <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground">Final accounting summary</p>
          <CardTitle>Total Cost Summary (Financial Truth)</CardTitle>
          <CardDescription>
            Primary totals use the same figures as the inputs. A line stays Projected until you type over it, then the
            summary badge turns Actual.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <ValueCard label="Purchase Cost (Products)" badge={<StatusBadge status="Projected" />} quiet value={money(Number(shipment.merchandise_total), business.currency)} />
          <ValueCard label="Freight Total" badge={<StatusBadge status={groupBadge("freight")} />} quiet={groupBadge("freight") !== "Actual"} value={money(freightFigure, business.currency)} />
          <ValueCard label="Shipping Company Total" badge={<StatusBadge status={groupBadge("shipping_company")} />} quiet={groupBadge("shipping_company") !== "Actual"} value={money(entered("shipping_company"), business.currency)} />
          <ValueCard label="Clearance Total" badge={<StatusBadge status={groupBadge("clearance")} />} quiet={groupBadge("clearance") !== "Actual"} value={money(entered("clearance"), business.currency)} />
          <Summary emphasis label="Landing Cost Total" value={money(previewLanding, business.currency)} />
          <Summary emphasis label="Total Shipment Cost" value={money(Number(shipment.merchandise_total) + previewLanding, business.currency)} />
          <div className="mt-2 flex items-center justify-between gap-3 border-t pt-3">
            <div>
              <div className="text-xs font-medium tracking-[0.14em] text-muted-foreground">Line-level batch cost</div>
              <p className="text-xs text-muted-foreground">Line costs allocate shared landing cost by shipment weight.</p>
            </div>
            <span className="text-xs text-muted-foreground">Weight-allocated</span>
          </div>
          {lines.map((line) => {
            const lineWeight = Number(line.quantity) * Number(line.unit_weight_grams)
            const share = weightGrams > 0 ? (lineWeight / weightGrams) * 100 : 0
            const purchase = Number(line.quantity) * Number(line.unit_cost)
            const allocated = weightGrams > 0 ? previewLanding * (lineWeight / weightGrams) : 0
            const finalLine = purchase + allocated
            const finalUnit = Number(line.quantity) > 0 ? finalLine / Number(line.quantity) : 0
            const lineMargin = margin(Number(line.sell_price), finalUnit)
            const left = Number(line.quantity) - Number(line.quantity_received)
            return (
              <div key={line.id} className="rounded-xl border px-4 py-3">
                <div className="font-medium">{line.name}</div>
                <div className="text-muted-foreground">
                  {line.sku} · Qty {quantity(Number(line.quantity))}
                </div>
                <div className="mt-2 flex flex-col gap-1">
                  <Summary quiet label="Purchase cost subtotal" value={money(purchase, business.currency)} />
                  <Summary quiet label="Allocated landing cost" value={money(allocated, business.currency)} />
                  <Summary quiet label="Weight share" value={`${share.toFixed(2)}%`} />
                  <Summary emphasis label="Final line batch cost" value={money(finalLine, business.currency)} />
                  <Summary emphasis label="Final landed unit" value={money(finalUnit, business.currency)} />
                  <Summary quiet label="Profit margin" value={lineMargin === null ? "—" : `${(lineMargin * 100).toFixed(2)}%`} />
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
          {open && !draft && issues.length > 0 ? (
            <ul className="list-disc pl-4 text-destructive">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : null}
          {open && !draft ? (
            <Button type="button" disabled={pending} onClick={() => setConfirmOpen(true)}>
              Confirm actuals and apply inventory
            </Button>
          ) : null}
        </CardContent>
      </Card>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirm actuals</DialogTitle>
            <DialogDescription>This locks the costs and posts the outstanding quantity.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 text-sm">
            <Summary label="Package count" value={packageCount || "Missing"} />
            <Summary label="Freight total" value={money(freightFigure, business.currency)} />
            <Summary label="Shipping company total" value={money(entered("shipping_company"), business.currency)} />
            <Summary label="Clearance total" value={money(entered("clearance"), business.currency)} />
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

function spanLabel(from: string | undefined, to: string | undefined) {
  if (!from || !to) return "Duration: pending"
  const days = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000)
  return `${days} days`
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function Summary({
  label,
  value,
  emphasis = false,
  quiet = false,
}: {
  label: string
  value: string
  emphasis?: boolean
  quiet?: boolean
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 ${emphasis ? "font-medium" : quiet ? "text-muted-foreground" : ""}`}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

