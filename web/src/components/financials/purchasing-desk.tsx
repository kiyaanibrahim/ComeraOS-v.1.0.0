"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"

import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import type { DataTableFeatures } from "@/components/data-table/data-table-features"
import { FinanceScreen, FinanceSelect, FinanceTable, FinanceTabs, MetricRow, TabsContent } from "@/components/financials/finance-shell"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/sonner"
import { money, statusLabel } from "@/lib/flow/format"
import { callRpc } from "@/lib/flow/rpc"
import type { BusinessRecord, FlowClient } from "@/lib/flow/use-business"
import { dayKey, seriesWithDelta } from "@/lib/stat-series"

type ShipmentRow = {
  id: string
  reference: string | null
  status: string
  landing_total: number
  location_id: string | null
  supplier_id: string | null
  updated_at: string
}

type PaymentRow = {
  id: string
  shipment_id: string
  amount: number
  paid_on: string
  method: string
}

type ReturnRow = {
  id: string
  shipment_id: string
  number: string
  status: string
  amount: number
  returned_on: string
}

export function PurchasingDesk({ businessKey }: { businessKey: string }) {
  return (
    <FinanceScreen
      businessKey={businessKey}
      title="Purchasing"
      description="Received shipments from procurement, supplier bills, and purchase returns."
    >
      {({ business, supabase }) => <PurchasingBody business={business} supabase={supabase} />}
    </FinanceScreen>
  )
}

function PurchasingBody({ business, supabase }: { business: BusinessRecord; supabase: FlowClient }) {
  const [tab, setTab] = useState("purchases")
  const [shipments, setShipments] = useState<ShipmentRow[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [returns, setReturns] = useState<ReturnRow[]>([])
  const [suppliers, setSuppliers] = useState<Record<string, string>>({})
  const [locations, setLocations] = useState<Record<string, string>>({})
  const [open, setOpen] = useState<ShipmentRow | null>(null)
  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState("bank_transfer")

  const load = useCallback(async () => {
    const [shipRes, payRes, returnRes, supplierRes, locationRes] = await Promise.all([
      supabase
        .from("shipments")
        .select("id, reference, status, landing_total, location_id, supplier_id, updated_at")
        .eq("business_id", business.id)
        .eq("direction", "inbound")
        .in("status", ["delivered", "in_transit"])
        .order("updated_at", { ascending: false })
        .limit(400),
      supabase.from("supplier_payments").select("id, shipment_id, amount, paid_on, method").eq("business_id", business.id),
      supabase.from("shipment_returns").select("id, shipment_id, number, status, amount, returned_on").eq("business_id", business.id),
      supabase.from("suppliers").select("id, name").eq("business_id", business.id),
      supabase.from("locations").select("id, name").eq("business_id", business.id),
    ])
    const error = shipRes.error || payRes.error || returnRes.error || supplierRes.error || locationRes.error
    if (error) toast.error(error.message)
    setShipments((shipRes.data ?? []) as ShipmentRow[])
    setPayments((payRes.data ?? []) as PaymentRow[])
    setReturns((returnRes.data ?? []) as ReturnRow[])
    setSuppliers(Object.fromEntries((supplierRes.data ?? []).map((row) => [row.id, row.name])))
    setLocations(Object.fromEntries((locationRes.data ?? []).map((row) => [row.id, row.name])))
  }, [business.id, supabase])

  useEffect(() => {
    void load()
  }, [load])

  const paidByShipment = useMemo(() => {
    const map = new Map<string, number>()
    for (const payment of payments) {
      map.set(payment.shipment_id, (map.get(payment.shipment_id) ?? 0) + Number(payment.amount))
    }
    return map
  }, [payments])

  const received = shipments.filter((row) => row.status === "delivered")
  const totalPurchases = received.reduce((sum, row) => sum + Number(row.landing_total), 0)
  const paid = received.reduce((sum, row) => sum + (paidByShipment.get(row.id) ?? 0), 0)
  const outstanding = Math.max(totalPurchases - paid, 0)
  const purchaseSeries = useMemo(
    () =>
      seriesWithDelta(received.map((row) => ({ day: dayKey(row.updated_at), amount: Number(row.landing_total) }))),
    [received],
  )
  const paidSeries = useMemo(
    () =>
      seriesWithDelta(payments.map((row) => ({ day: dayKey(row.paid_on), amount: Number(row.amount) }))),
    [payments],
  )

  const columns = useMemo<ColumnDef<DataTableFeatures, ShipmentRow>[]>(
    () => [
      {
        accessorKey: "reference",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Shipment" />,
        filterFn: "includesString",
        cell: ({ row }) => row.original.reference ?? row.original.id.slice(0, 8),
      },
      {
        id: "supplier",
        header: "Supplier",
        accessorFn: (row) => (row.supplier_id ? suppliers[row.supplier_id] ?? "Supplier" : "—"),
      },
      {
        id: "location",
        header: "Location",
        accessorFn: (row) => (row.location_id ? locations[row.location_id] ?? "Location" : "—"),
      },
      {
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        meta: { align: "right" },
        accessorKey: "landing_total",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Total" />,
        cell: ({ row }) => <div className="text-right tabular-nums">{money(Number(row.original.landing_total), business.currency)}</div>,
      },
      {
        meta: { align: "right" },
        id: "paid",
        header: "Paid",
        cell: ({ row }) => (
          <div className="text-right tabular-nums">{money(paidByShipment.get(row.original.id) ?? 0, business.currency)}</div>
        ),
      },
      {
        id: "open",
        header: "",
        cell: ({ row }) => (
          <Button size="sm" variant="outline" onClick={() => { setOpen(row.original); setAmount("") }}>
            Open
          </Button>
        ),
      },
    ],
    [business.currency, locations, paidByShipment, suppliers],
  )

  const returnColumns = useMemo<ColumnDef<DataTableFeatures, ReturnRow>[]>(
    () => [
      { accessorKey: "number", header: ({ column }) => <DataTableColumnHeader column={column} title="Return" />, filterFn: "includesString" },
      {
        id: "shipment",
        header: "Purchase",
        accessorFn: (row) => shipments.find((shipment) => shipment.id === row.shipment_id)?.reference ?? row.shipment_id.slice(0, 8),
      },
      {
        meta: { align: "right" },
        accessorKey: "amount",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
        cell: ({ row }) => <div className="text-right tabular-nums">{money(Number(row.original.amount), business.currency)}</div>,
      },
      { accessorKey: "returned_on", header: ({ column }) => <DataTableColumnHeader column={column} title="Date" /> },
    ],
    [business.currency, shipments],
  )

  async function pay() {
    if (!open) return
    try {
      await callRpc(supabase, "pay_supplier", {
        p_business_id: business.id,
        p_shipment_id: open.id,
        p_amount: Number(amount),
        p_method: method,
      })
      setAmount("")
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not record payment")
    }
  }

  const openPaid = open ? paidByShipment.get(open.id) ?? 0 : 0
  const openBalance = open ? Math.max(Number(open.landing_total) - openPaid, 0) : 0
  const openPays = payments.filter((row) => open && row.shipment_id === open.id)

  return (
    <div className="flex flex-col gap-4">
      <MetricRow
        items={[
          {
            label: "Total purchases",
            value: money(totalPurchases, business.currency),
            delta: purchaseSeries.delta,
            chart: { kind: "area", values: purchaseSeries.values },
          },
          {
            label: "Paid",
            value: money(paid, business.currency),
            delta: paidSeries.delta,
            chart: { kind: "radial", value: paid, total: totalPurchases || paid, label: "Paid" },
          },
          {
            label: "Outstanding",
            value: money(outstanding, business.currency),
            invert: true,
            chart: { kind: "radial", value: outstanding, total: totalPurchases || outstanding, label: "Outstanding" },
          },
        ]}
      />
      <FinanceTabs
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: "purchases", label: "Purchases" },
          { value: "returns", label: "Returns" },
        ]}
      >
        <TabsContent value="purchases" className="pt-4">
          <FinanceTable columns={columns} data={received} filterColumn="reference" filterPlaceholder="Search shipments…" empty="Receive a shipment in procurement to see it here." getRowId={(row) => row.id} />
        </TabsContent>
        <TabsContent value="returns" className="pt-4">
          <FinanceTable columns={returnColumns} data={returns} filterColumn="number" filterPlaceholder="Search returns…" empty="Purchase returns originate in procurement." getRowId={(row) => row.id} />
        </TabsContent>
      </FinanceTabs>

      <Dialog open={Boolean(open)} onOpenChange={(value) => !value && setOpen(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{open?.reference ?? "Purchase"}</DialogTitle>
          </DialogHeader>
          {open ? (
            <div className="grid gap-3 text-sm">
              <p>Supplier: {open.supplier_id ? suppliers[open.supplier_id] ?? "Supplier" : "—"}</p>
              <p>Total: {money(Number(open.landing_total), business.currency)}</p>
              <p>Paid: {money(openPaid, business.currency)}</p>
              <p>Outstanding: {money(openBalance, business.currency)}</p>
              {openPays.map((payment) => (
                <p key={payment.id}>
                  {money(Number(payment.amount), business.currency)} · {payment.method} · {payment.paid_on}
                </p>
              ))}
              {openBalance > 0 ? (
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="supplier-pay">Payment</FieldLabel>
                    <Input id="supplier-pay" type="number" value={amount} onValueChange={setAmount} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="supplier-method">Method</FieldLabel>
                    <FinanceSelect
                      id="supplier-method"
                      className="w-full"
                      value={method}
                      onValueChange={setMethod}
                      items={{ bank_transfer: "Bank transfer", cash: "Cash", card: "Card" }}
                    />
                  </Field>
                </FieldGroup>
              ) : null}
            </div>
          ) : null}
          {openBalance > 0 ? (
            <DialogFooter>
              <Button onClick={() => void pay()}>Record payment</Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
