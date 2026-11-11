"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"

import { DataTable } from "@/components/data-table/data-table"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import type { DataTableFeatures } from "@/components/data-table/data-table-features"
import { DatePicker } from "@/components/date-picker"
import { PosScreen, statusVariant } from "@/components/pos/pos-screen"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "@/components/ui/sonner"
import { money } from "@/lib/flow/format"
import { callRpc } from "@/lib/flow/rpc"
import type { BusinessRecord, FlowClient } from "@/lib/flow/use-business"

type BillRow = {
  id: string
  number: string
  customer_id: string | null
  order_id: string | null
  status: string
  subtotal: number
  discount: number
  tax: number
  total: number
  created_at: string
  issued_at: string | null
}
type OrderLine = { id: string; order_id: string; description: string; quantity: number; unit_price: number }
type OrderMeta = { id: string; register_session_id: string | null; status: string }
type LineRow = { bill_id: string; description: string }
type PaymentRow = { bill_id: string | null; method: string; status: string }
type Customer = { id: string; name: string }

function localDay(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

function stamp(value: string | null) {
  if (!value) return "—"
  return new Date(value).toLocaleString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function PosBills({ businessKey }: { businessKey: string }) {
  return (
    <PosScreen businessKey={businessKey} title="Bill History" description="Finalized sales transactions.">
      {({ business, supabase }) => <Bills business={business} supabase={supabase} />}
    </PosScreen>
  )
}

function Bills({ business, supabase }: { business: BusinessRecord; supabase: FlowClient }) {
  const [bills, setBills] = useState<BillRow[]>([])
  const [lines, setLines] = useState<LineRow[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [query, setQuery] = useState("")
  const [customerId, setCustomerId] = useState("all")
  const [date, setDate] = useState<Date | undefined>()
  const [applied, setApplied] = useState({ query: "", customerId: "all", day: "" })
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<OrderMeta[]>([])
  const [sessions, setSessions] = useState<{ id: string; status: string }[]>([])
  const [receipt, setReceipt] = useState<BillRow | null>(null)
  const [receiptLines, setReceiptLines] = useState<OrderLine[]>([])
  const [returning, setReturning] = useState<BillRow | null>(null)
  const [returnLines, setReturnLines] = useState<{ id: string; description: string; quantity: number; unitPrice: number; qty: string }[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const billRes = await supabase
      .from("bills")
      .select("id, number, customer_id, order_id, status, subtotal, discount, tax, total, created_at, issued_at")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(250)
    if (billRes.error) {
      toast.error(billRes.error.message)
      setLoading(false)
      return
    }
    const billRows = (billRes.data ?? []) as BillRow[]
    const billIds = billRows.map((row) => row.id)
    const orderIds = [...new Set(billRows.map((row) => row.order_id).filter((id): id is string => Boolean(id)))]
    const [orderRes, lineRes, paymentRes, customerRes] = await Promise.all([
      orderIds.length
        ? supabase.from("orders").select("id, register_session_id, status").eq("business_id", business.id).in("id", orderIds)
        : Promise.resolve({ data: [], error: null }),
      billIds.length
        ? supabase.from("bill_lines").select("bill_id, description").eq("business_id", business.id).in("bill_id", billIds)
        : Promise.resolve({ data: [], error: null }),
      billIds.length
        ? supabase.from("payments").select("bill_id, method, status").eq("business_id", business.id).in("bill_id", billIds)
        : Promise.resolve({ data: [], error: null }),
      supabase.from("customers").select("id, name").eq("business_id", business.id).order("name").limit(200),
    ])
    if (orderRes.error) toast.error(orderRes.error.message)
    const orderRows = (orderRes.data ?? []) as OrderMeta[]
    const sessionIds = [...new Set(orderRows.map((row) => row.register_session_id).filter((id): id is string => Boolean(id)))]
    const sessionRes = sessionIds.length
      ? await supabase.from("register_sessions").select("id, status").eq("business_id", business.id).in("id", sessionIds)
      : { data: [], error: null }
    if (sessionRes.error) toast.error(sessionRes.error.message)
    setOrders(orderRows)
    setSessions(sessionRes.data ?? [])
    const error = lineRes.error || paymentRes.error || customerRes.error
    if (error) toast.error(error.message)
    setBills(billRows)
    setLines((lineRes.data ?? []) as LineRow[])
    setPayments((paymentRes.data ?? []) as PaymentRow[])
    setCustomers((customerRes.data ?? []) as Customer[])
    setLoading(false)
  }, [business.id, supabase])

  useEffect(() => {
    void load()
  }, [load])

  const customerItems = { all: "All customers", ...Object.fromEntries(customers.map((customer) => [customer.id, customer.name])) }
  const customerMap = useMemo(() => new Map(customers.map((customer) => [customer.id, customer.name])), [customers])
  const lineMap = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const line of lines) map.set(line.bill_id, [...(map.get(line.bill_id) ?? []), line.description])
    return map
  }, [lines])
  const methodMap = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const payment of payments) {
      if (!payment.bill_id || payment.status === "failed") continue
      const label = payment.method.replaceAll("_", " ")
      const current = map.get(payment.bill_id) ?? []
      if (!current.includes(label)) map.set(payment.bill_id, [...current, label])
    }
    return map
  }, [payments])

  const visible = bills.filter((bill) => {
    if (applied.customerId !== "all" && bill.customer_id !== applied.customerId) return false
    if (applied.day && localDay(bill.issued_at ?? bill.created_at) !== applied.day) return false
    const needle = applied.query.trim().toLowerCase()
    if (!needle) return true
    const customer = bill.customer_id ? customerMap.get(bill.customer_id) ?? "" : ""
    const items = (lineMap.get(bill.id) ?? []).join(" ")
    return [bill.number, customer, items].join(" ").toLowerCase().includes(needle)
  })
  const orderMap = useMemo(() => new Map(orders.map((order) => [order.id, order])), [orders])
  const sessionMap = useMemo(() => new Map(sessions.map((session) => [session.id, session.status])), [sessions])

  function sessionOpen(bill: BillRow) {
    const order = bill.order_id ? orderMap.get(bill.order_id) : undefined
    if (!order?.register_session_id) return false
    return sessionMap.get(order.register_session_id) === "open"
  }

  async function openReceipt(bill: BillRow) {
    setReceipt(bill)
    if (!bill.order_id) {
      setReceiptLines([])
      return
    }
    const lineRes = await supabase
      .from("order_lines")
      .select("id, order_id, description, quantity, unit_price")
      .eq("business_id", business.id)
      .eq("order_id", bill.order_id)
    if (lineRes.error) toast.error(lineRes.error.message)
    setReceiptLines((lineRes.data ?? []) as OrderLine[])
  }

  async function openReturn(bill: BillRow) {
    if (!bill.order_id) return
    const lineRes = await supabase
      .from("order_lines")
      .select("id, order_id, description, quantity, unit_price")
      .eq("business_id", business.id)
      .eq("order_id", bill.order_id)
    if (lineRes.error) {
      toast.error(lineRes.error.message)
      return
    }
    setReturning(bill)
    setReturnLines(
      ((lineRes.data ?? []) as OrderLine[]).map((line) => ({
        id: line.id,
        description: line.description,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unit_price),
        qty: "",
      })),
    )
  }

  async function submitReturn() {
    if (!returning) return
    const lines = returnLines
      .map((line) => ({ order_line_id: line.id, quantity: Number(line.qty) }))
      .filter((line) => line.quantity > 0)
    if (lines.length === 0) {
      toast.error("Enter a quantity to return.")
      return
    }
    setBusy(true)
    try {
      const result = await callRpc<{ number: string; amount: number }>(supabase, "return_pos_sale", {
        p_business_id: business.id,
        p_bill_id: returning.id,
        p_lines: lines,
      })
      toast.success(`Return ${result.number} refunded ${money(Number(result.amount), business.currency)}.`)
      setReturning(null)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not return the bill")
    } finally {
      setBusy(false)
    }
  }

  const columns = useMemo<ColumnDef<DataTableFeatures, BillRow>[]>(
    () => [
      { accessorKey: "number", header: ({ column }) => <DataTableColumnHeader column={column} title="Bill ID" />, cell: ({ row }) => <span className="font-medium">{row.original.number}</span> },
      { id: "customer", header: "Customer", accessorFn: (row) => (row.customer_id ? customerMap.get(row.customer_id) ?? "Customer" : "Walk-in") },
      { id: "items", header: "Items", accessorFn: (row) => (lineMap.get(row.id) ?? []).join(", ") || "—", cell: ({ getValue }) => <span className="block max-w-64 truncate">{getValue<string>()}</span> },
      { id: "method", header: "Payment method", accessorFn: (row) => (methodMap.get(row.id) ?? []).join(", ") || "—", cell: ({ getValue }) => <span className="capitalize">{getValue<string>()}</span> },
      { accessorKey: "total", header: ({ column }) => <DataTableColumnHeader column={column} title="Total" />, cell: ({ row }) => <div className="text-right tabular-nums">{money(Number(row.original.total), business.currency)}</div> },
      { id: "when", header: "Timestamp", accessorFn: (row) => stamp(row.issued_at ?? row.created_at) },
      { accessorKey: "status", header: "Status", cell: ({ row }) => <Badge variant={statusVariant(row.original.status)}>{row.original.status}</Badge> },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => void openReceipt(row.original)}>
              Receipt
            </Button>
            {row.original.status !== "void" && row.original.order_id && !sessionOpen(row.original) ? (
              <Button type="button" size="sm" variant="outline" onClick={() => void openReturn(row.original)}>
                Return
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [business.currency, customerMap, lineMap, methodMap, orderMap, sessionMap],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="w-full sm:max-w-xs"
          placeholder="Search bill, customer, or items…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Select value={customerId} items={customerItems} onValueChange={(value) => setCustomerId(value ?? "all")}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder="Filter customer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All customers</SelectItem>
            {customers.map((customer) => (
              <SelectItem key={customer.id} value={customer.id}>
                {customer.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DatePicker value={date} onChange={setDate} placeholder="mm/dd/yyyy" className="w-full sm:w-44" />
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            setApplied({
              query,
              customerId,
              day: date ? localDay(date) : "",
            })
          }
        >
          Apply
        </Button>
        <Button type="button" variant="ghost" className="sm:ml-auto" onClick={() => void load()}>
          Refresh
        </Button>
      </div>
      <Card>
        <CardContent className="px-0">
          {loading ? (
            <div className="mx-4 h-40 animate-pulse rounded-xl bg-muted" />
          ) : visible.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No finalized bills found</EmptyTitle>
                <EmptyDescription>Bills appear here when a quote is converted or a sale is invoiced.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <DataTable columns={columns} data={visible} empty="No finalized bills found" getRowId={(row) => row.id} />
          )}
        </CardContent>
      </Card>
      <Dialog open={receipt !== null} onOpenChange={(open) => { if (!open) setReceipt(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Receipt {receipt?.number}</DialogTitle>
            <DialogDescription>
              {receipt?.customer_id ? customerMap.get(receipt.customer_id) ?? "Customer" : "Walk-in"}
            </DialogDescription>
          </DialogHeader>
          {receipt ? (
            <div className="flex flex-col gap-2 text-sm">
              {(receiptLines.length > 0 ? receiptLines : []).map((line) => (
                <div key={line.id} className="flex justify-between gap-3">
                  <span>{line.description} × {Number(line.quantity)}</span>
                  <span className="tabular-nums">{money(Number(line.unit_price) * Number(line.quantity), business.currency)}</span>
                </div>
              ))}
              <div className="space-y-1 border-t pt-2">
                <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{money(Number(receipt.subtotal), business.currency)}</span></div>
                <div className="flex justify-between"><span>Discount</span><span className="tabular-nums">{money(Number(receipt.discount), business.currency)}</span></div>
                <div className="flex justify-between"><span>Tax</span><span className="tabular-nums">{money(Number(receipt.tax), business.currency)}</span></div>
                <div className="flex justify-between font-medium"><span>Total</span><span className="tabular-nums">{money(Number(receipt.total), business.currency)}</span></div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => window.print()}>Print</Button>
            <Button type="button" onClick={() => setReceipt(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={returning !== null} onOpenChange={(open) => { if (!open) setReturning(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Return {returning?.number}</DialogTitle>
            <DialogDescription>Enter the quantity to return for each line. Stock goes back to the register warehouse.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {returnLines.map((line) => (
              <label key={line.id} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  {line.description}
                  <span className="block text-muted-foreground">Sold {line.quantity}</span>
                </span>
                <Input
                  className="w-24"
                  type="number"
                  min={0}
                  max={line.quantity}
                  step="1"
                  value={line.qty}
                  onChange={(event) =>
                    setReturnLines((current) => current.map((item) => (item.id === line.id ? { ...item, qty: event.target.value } : item)))
                  }
                />
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReturning(null)}>Cancel</Button>
            <Button type="button" disabled={busy} onClick={() => void submitReturn()}>
              {busy ? "Returning…" : "Refund"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
