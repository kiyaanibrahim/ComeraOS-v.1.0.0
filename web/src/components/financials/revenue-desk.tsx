"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"

import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import type { DataTableFeatures } from "@/components/data-table/data-table-features"
import { DatePicker } from "@/components/date-picker"
import { FinanceScreen, FinanceSelect, FinanceTable, FinanceTabs, MetricRow, TabsContent } from "@/components/financials/finance-shell"
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
import { StatusBadge } from "@/components/status-badge"

type OrderRow = {
  id: string
  number: string
  status: string
  source: string
  total: number
  tax: number
  customer_id: string | null
  location_id: string | null
  created_at: string
}

type BillRow = {
  id: string
  number: string
  status: string
  total: number
  order_id: string | null
  customer_id: string | null
  issued_at: string | null
  created_at: string
}

type PaymentRow = {
  id: string
  order_id: string | null
  bill_id: string | null
  amount: number
  status: string
  method: string | null
  created_at: string
}

type RevenueRow = {
  id: string
  source: string
  category: string
  amount: number
  status: string
  recognized_on: string
}

const channelLabel: Record<string, string> = {
  pos: "Counter",
  online: "Online",
  quote: "Quote",
  manual: "Manual",
}

function day(value: string | null) {
  return value ? value.slice(0, 10) : ""
}

export function RevenueDesk({ businessKey }: { businessKey: string }) {
  return (
    <FinanceScreen
      businessKey={businessKey}
      title="Revenue"
      description="Sales, invoices, and other income from POS, orders, and the online store."
    >
      {({ business, supabase }) => <RevenueBody business={business} supabase={supabase} />}
    </FinanceScreen>
  )
}

function RevenueBody({ business, supabase }: { business: BusinessRecord; supabase: FlowClient }) {
  const [tab, setTab] = useState("transactions")
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [bills, setBills] = useState<BillRow[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [returns, setReturns] = useState<{ order_id: string | null; amount: number }[]>([])
  const [other, setOther] = useState<RevenueRow[]>([])
  const [customers, setCustomers] = useState<Record<string, string>>({})
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([])
  const [channel, setChannel] = useState("all")
  const [locationId, setLocationId] = useState("all")
  const [from, setFrom] = useState<Date | undefined>()
  const [payStatus, setPayStatus] = useState("all")
  const [openOrder, setOpenOrder] = useState<OrderRow | null>(null)
  const [openBill, setOpenBill] = useState<BillRow | null>(null)
  const [incomeOpen, setIncomeOpen] = useState(false)
  const [income, setIncome] = useState({ source: "other", category: "Other", amount: "", method: "cash" })

  const load = useCallback(async () => {
    const [orderRes, billRes, payRes, returnRes, otherRes, customerRes, locationRes] = await Promise.all([
      supabase
        .from("orders")
        .select("id, number, status, source, total, tax, customer_id, location_id, created_at")
        .eq("business_id", business.id)
        .in("status", ["open", "completed", "cancelled", "void"])
        .order("created_at", { ascending: false })
        .limit(400),
      supabase
        .from("bills")
        .select("id, number, status, total, order_id, customer_id, issued_at, created_at")
        .eq("business_id", business.id)
        .order("created_at", { ascending: false })
        .limit(400),
      supabase
        .from("payments")
        .select("id, order_id, bill_id, amount, status, method, created_at")
        .eq("business_id", business.id)
        .limit(800),
      supabase.from("sale_returns").select("order_id, amount").eq("business_id", business.id),
      supabase
        .from("revenues")
        .select("id, source, category, amount, status, recognized_on")
        .eq("business_id", business.id)
        .order("recognized_on", { ascending: false }),
      supabase.from("customers").select("id, name").eq("business_id", business.id),
      supabase.from("locations").select("id, name").eq("business_id", business.id),
    ])
    const error =
      orderRes.error || billRes.error || payRes.error || returnRes.error || otherRes.error || customerRes.error || locationRes.error
    if (error) toast.error(error.message)
    setOrders((orderRes.data ?? []) as OrderRow[])
    setBills((billRes.data ?? []) as BillRow[])
    setPayments((payRes.data ?? []) as PaymentRow[])
    setReturns((returnRes.data ?? []) as { order_id: string | null; amount: number }[])
    setOther((otherRes.data ?? []) as RevenueRow[])
    setCustomers(Object.fromEntries((customerRes.data ?? []).map((row) => [row.id, row.name])))
    setLocations((locationRes.data ?? []) as { id: string; name: string }[])
  }, [business.id, supabase])

  useEffect(() => {
    void load()
  }, [load])

  const collectedByOrder = useMemo(() => {
    const map = new Map<string, number>()
    for (const payment of payments) {
      if (payment.status !== "succeeded" || !payment.order_id) continue
      map.set(payment.order_id, (map.get(payment.order_id) ?? 0) + Number(payment.amount))
    }
    return map
  }, [payments])

  const collectedByBill = useMemo(() => {
    const map = new Map<string, number>()
    for (const payment of payments) {
      if (payment.status !== "succeeded" || !payment.bill_id) continue
      map.set(payment.bill_id, (map.get(payment.bill_id) ?? 0) + Number(payment.amount))
    }
    return map
  }, [payments])

  const refundByOrder = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of returns) {
      if (!row.order_id) continue
      map.set(row.order_id, (map.get(row.order_id) ?? 0) + Number(row.amount))
    }
    return map
  }, [returns])

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (channel !== "all" && order.source !== channel) return false
      if (locationId !== "all" && order.location_id !== locationId) return false
      if (from && day(order.created_at) < day(from.toISOString())) return false
      const paid = collectedByOrder.get(order.id) ?? 0
      const refunded = refundByOrder.get(order.id) ?? 0
      const outstanding = Math.max(Number(order.total) - paid, 0)
      if (payStatus === "paid" && outstanding > 0) return false
      if (payStatus === "outstanding" && outstanding <= 0) return false
      if (payStatus === "refunded" && refunded <= 0) return false
      return true
    })
  }, [orders, channel, locationId, from, payStatus, collectedByOrder, refundByOrder])

  const filteredBills = useMemo(() => {
    return bills.filter((bill) => {
      const order = bill.order_id ? orders.find((row) => row.id === bill.order_id) : null
      if (channel !== "all" && order && order.source !== channel) return false
      if (locationId !== "all" && order && order.location_id !== locationId) return false
      if (from && day(bill.issued_at ?? bill.created_at) < day(from.toISOString())) return false
      const paid = collectedByBill.get(bill.id) ?? (bill.order_id ? collectedByOrder.get(bill.order_id) ?? 0 : 0)
      const outstanding = Math.max(Number(bill.total) - paid, 0)
      if (payStatus === "paid" && outstanding > 0) return false
      if (payStatus === "outstanding" && outstanding <= 0) return false
      return true
    })
  }, [bills, orders, channel, locationId, from, payStatus, collectedByBill, collectedByOrder])

  const totalRevenue = filteredOrders.filter((row) => row.status === "completed").reduce((sum, row) => sum + Number(row.total), 0)
    + other.filter((row) => row.status === "recognized").reduce((sum, row) => sum + Number(row.amount), 0)
  const collected = filteredOrders.reduce((sum, row) => sum + (collectedByOrder.get(row.id) ?? 0), 0)
    + other.filter((row) => row.status === "recognized").reduce((sum, row) => sum + Number(row.amount), 0)
  const outstanding = filteredOrders.reduce((sum, row) => sum + Math.max(Number(row.total) - (collectedByOrder.get(row.id) ?? 0), 0), 0)
    + filteredBills
      .filter((bill) => bill.status === "issued")
      .reduce((sum, bill) => sum + Math.max(Number(bill.total) - (collectedByBill.get(bill.id) ?? 0), 0), 0)

  const revenueSeries = useMemo(
    () =>
      seriesWithDelta([
        ...filteredOrders
          .filter((row) => row.status === "completed")
          .map((row) => ({ day: dayKey(row.created_at), amount: Number(row.total) })),
        ...other
          .filter((row) => row.status === "recognized")
          .map((row) => ({ day: dayKey(row.recognized_on), amount: Number(row.amount) })),
      ]),
    [filteredOrders, other],
  )
  const collectedSeries = useMemo(
    () =>
      seriesWithDelta(
        payments
          .filter((row) => row.status === "succeeded")
          .map((row) => ({ day: dayKey(row.created_at), amount: Number(row.amount) })),
      ),
    [payments],
  )

  const orderColumns = useMemo<ColumnDef<DataTableFeatures, OrderRow>[]>(
    () => [
      {
        accessorKey: "number",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Sale" />,
        filterFn: "includesString",
      },
      {
        id: "channel",
        header: "Channel",
        accessorFn: (row) => channelLabel[row.source] ?? row.source,
      },
      {
        id: "customer",
        header: "Customer",
        accessorFn: (row) => (row.customer_id ? customers[row.customer_id] ?? "Customer" : "Walk-in"),
      },
      {
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        meta: { align: "right" },
        accessorKey: "total",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
        cell: ({ row }) => <div className="text-right tabular-nums">{money(Number(row.original.total), business.currency)}</div>,
      },
      {
        meta: { align: "right" },
        id: "collected",
        header: "Collected",
        cell: ({ row }) => (
          <div className="text-right tabular-nums">{money(collectedByOrder.get(row.original.id) ?? 0, business.currency)}</div>
        ),
      },
      {
        id: "open",
        header: "",
        cell: ({ row }) => (
          <Button size="sm" variant="outline" onClick={() => setOpenOrder(row.original)}>
            Open
          </Button>
        ),
      },
    ],
    [business.currency, customers, collectedByOrder],
  )

  const billColumns = useMemo<ColumnDef<DataTableFeatures, BillRow>[]>(
    () => [
      {
        accessorKey: "number",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Invoice" />,
        filterFn: "includesString",
      },
      {
        id: "order",
        header: "Sale",
        accessorFn: (row) => orders.find((order) => order.id === row.order_id)?.number ?? "—",
      },
      {
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        meta: { align: "right" },
        accessorKey: "total",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
        cell: ({ row }) => <div className="text-right tabular-nums">{money(Number(row.original.total), business.currency)}</div>,
      },
      {
        id: "open",
        header: "",
        cell: ({ row }) => (
          <Button size="sm" variant="outline" onClick={() => setOpenBill(row.original)}>
            Open
          </Button>
        ),
      },
    ],
    [business.currency, orders],
  )

  const otherColumns = useMemo<ColumnDef<DataTableFeatures, RevenueRow>[]>(
    () => [
      { accessorKey: "source", header: ({ column }) => <DataTableColumnHeader column={column} title="Source" />, filterFn: "includesString" },
      { accessorKey: "category", header: ({ column }) => <DataTableColumnHeader column={column} title="Category" /> },
      {
        meta: { align: "right" },
        accessorKey: "amount",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
        cell: ({ row }) => <div className="text-right tabular-nums">{money(Number(row.original.amount), business.currency)}</div>,
      },
      { accessorKey: "recognized_on", header: ({ column }) => <DataTableColumnHeader column={column} title="Date" /> },
    ],
    [business.currency],
  )

  async function saveIncome() {
    try {
      await callRpc(supabase, "recognize_other_income", {
        p_business_id: business.id,
        p_source: income.source,
        p_category: income.category,
        p_amount: Number(income.amount),
        p_method: income.method,
      })
      setIncomeOpen(false)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not record income")
    }
  }

  const orderPayments = payments.filter((row) => openOrder && (row.order_id === openOrder.id))
  const billPayments = payments.filter((row) => openBill && row.bill_id === openBill.id)

  return (
    <div className="flex flex-col gap-4">
      <MetricRow
        items={[
          {
            label: "Total revenue",
            value: money(totalRevenue, business.currency),
            delta: revenueSeries.delta,
            chart: { kind: "area", values: revenueSeries.values },
          },
          {
            label: "Collected",
            value: money(collected, business.currency),
            delta: collectedSeries.delta,
            chart: { kind: "radial", value: collected, total: totalRevenue || collected, label: "Collected" },
          },
          {
            label: "Outstanding",
            value: money(outstanding, business.currency),
            invert: true,
            chart: { kind: "radial", value: outstanding, total: totalRevenue || outstanding, label: "Outstanding" },
          },
        ]}
      />
      <div className="flex flex-wrap gap-2">
        <FinanceSelect
          value={channel}
          onValueChange={setChannel}
          items={{ all: "All channels", pos: "Counter", online: "Online", quote: "Quote", manual: "Manual" }}
        />
        <FinanceSelect
          value={locationId}
          onValueChange={setLocationId}
          items={{ all: "All locations", ...Object.fromEntries(locations.map((location) => [location.id, location.name])) }}
        />
        <DatePicker placeholder="From date" value={from} onChange={setFrom} />
        <FinanceSelect
          value={payStatus}
          onValueChange={setPayStatus}
          items={{ all: "All payment statuses", paid: "Collected", outstanding: "Outstanding", refunded: "Refunded" }}
        />
      </div>
      <FinanceTabs
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: "transactions", label: "Transactions" },
          { value: "invoices", label: "Invoices" },
          { value: "other", label: "Other income" },
        ]}
      >
        <TabsContent value="transactions" className="pt-4">
          <FinanceTable columns={orderColumns} data={filteredOrders} filterColumn="number" filterPlaceholder="Search sales…" empty="No sales yet" getRowId={(row) => row.id} />
        </TabsContent>
        <TabsContent value="invoices" className="pt-4">
          <FinanceTable columns={billColumns} data={filteredBills} filterColumn="number" filterPlaceholder="Search invoices…" empty="No invoices yet. Invoices come from POS and accepted quotes." getRowId={(row) => row.id} />
        </TabsContent>
        <TabsContent value="other" className="pt-4">
          <div className="flex justify-end pb-3">
            <Button onClick={() => setIncomeOpen(true)}>New other income</Button>
          </div>
          <FinanceTable columns={otherColumns} data={other} filterColumn="source" filterPlaceholder="Search income…" empty="No other income" getRowId={(row) => row.id} />
        </TabsContent>
      </FinanceTabs>

      <Dialog open={Boolean(openOrder)} onOpenChange={(open) => !open && setOpenOrder(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{openOrder?.number}</DialogTitle>
          </DialogHeader>
          {openOrder ? (
            <div className="grid gap-2 text-sm">
              <p>Channel: {channelLabel[openOrder.source] ?? openOrder.source}</p>
              <p>Customer: {openOrder.customer_id ? customers[openOrder.customer_id] ?? "Customer" : "Walk-in"}</p>
              <p>Amount: {money(Number(openOrder.total), business.currency)}</p>
              <p>Refunded: {money(refundByOrder.get(openOrder.id) ?? 0, business.currency)}</p>
              <p className="font-medium">Payments</p>
              {orderPayments.length === 0 ? <p className="text-muted-foreground">No payments</p> : null}
              {orderPayments.map((payment) => (
                <p key={payment.id} className="flex flex-wrap items-center gap-2">
                  <span>
                    {money(Number(payment.amount), business.currency)} · {payment.method ?? "—"}
                  </span>
                  <StatusBadge status={payment.status} />
                </p>
              ))}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(openBill)} onOpenChange={(open) => !open && setOpenBill(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{openBill?.number}</DialogTitle>
          </DialogHeader>
          {openBill ? (
            <div className="grid gap-2 text-sm">
              <p>Sale: {orders.find((order) => order.id === openBill.order_id)?.number ?? "—"}</p>
              <p>Amount: {money(Number(openBill.total), business.currency)}</p>
              {billPayments.map((payment) => (
                <p key={payment.id} className="flex flex-wrap items-center gap-2">
                  <span>
                    {money(Number(payment.amount), business.currency)} · {payment.method ?? "—"}
                  </span>
                  <StatusBadge status={payment.status} />
                </p>
              ))}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={incomeOpen} onOpenChange={setIncomeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Other income</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="income-source">Source</FieldLabel>
              <Input id="income-source" value={income.source} onValueChange={(value) => setIncome({ ...income, source: value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="income-category">Category</FieldLabel>
              <Input id="income-category" value={income.category} onValueChange={(value) => setIncome({ ...income, category: value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="income-amount">Amount</FieldLabel>
              <Input id="income-amount" type="number" value={income.amount} onValueChange={(value) => setIncome({ ...income, amount: value })} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button onClick={() => void saveIncome()}>Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
