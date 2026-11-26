"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"

import { DataTable } from "@/components/data-table/data-table"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import type { DataTableFeatures } from "@/components/data-table/data-table-features"
import { PosScreen } from "@/components/pos/pos-screen"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
import type { BusinessRecord, FlowClient } from "@/lib/flow/use-business"

type PaymentRow = {
  id: string
  method: string
  amount: number
  status: string
  external_ref: string | null
  created_at: string
  bill_id: string | null
  order_id: string | null
}
type BillRow = { id: string; number: string; customer_id: string | null }
type OrderRow = { id: string; customer_id: string | null }
type Customer = { id: string; name: string }

const methodItems = {
  all: "All methods",
  bank_transfer: "Bank transfer",
  cash: "Cash",
  card: "Card",
}
const statusItems = {
  all: "All statuses",
  succeeded: "Succeeded",
  pending: "Pending",
  failed: "Failed",
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

export function PosPayments({ businessKey }: { businessKey: string }) {
  return (
    <PosScreen
      businessKey={businessKey}
      title="Online Payments"
      description="Bank transfer and gateway payment receipt archive."
    >
      {({ business, supabase }) => <Payments business={business} supabase={supabase} />}
    </PosScreen>
  )
}

function Payments({ business, supabase }: { business: BusinessRecord; supabase: FlowClient }) {
  const [rows, setRows] = useState<PaymentRow[]>([])
  const [bills, setBills] = useState<BillRow[]>([])
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [query, setQuery] = useState("")
  const [method, setMethod] = useState("all")
  const [status, setStatus] = useState("all")
  const [applied, setApplied] = useState({ query: "", method: "all", status: "all" })
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const paymentRes = await supabase
      .from("payments")
      .select("id, method, amount, status, external_ref, created_at, bill_id, order_id")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(250)
    if (paymentRes.error) {
      toast.error(paymentRes.error.message)
      setLoading(false)
      return
    }
    const payments = (paymentRes.data ?? []) as PaymentRow[]
    const billIds = [...new Set(payments.map((row) => row.bill_id).filter((id): id is string => Boolean(id)))]
    const orderIds = [...new Set(payments.map((row) => row.order_id).filter((id): id is string => Boolean(id)))]
    const [billRes, orderRes] = await Promise.all([
      billIds.length
        ? supabase.from("bills").select("id, number, customer_id").eq("business_id", business.id).in("id", billIds)
        : Promise.resolve({ data: [], error: null }),
      orderIds.length
        ? supabase.from("orders").select("id, customer_id").eq("business_id", business.id).in("id", orderIds)
        : Promise.resolve({ data: [], error: null }),
    ])
    if (billRes.error || orderRes.error) toast.error(billRes.error?.message ?? orderRes.error?.message ?? "Couldn't load payments.")
    const billRows = (billRes.data ?? []) as BillRow[]
    const orderRows = (orderRes.data ?? []) as OrderRow[]
    const customerIds = [
      ...new Set(
        [...billRows.map((row) => row.customer_id), ...orderRows.map((row) => row.customer_id)].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    ]
    const customerRes = customerIds.length
      ? await supabase.from("customers").select("id, name").eq("business_id", business.id).in("id", customerIds)
      : { data: [], error: null }
    if (customerRes.error) toast.error(customerRes.error.message)
    setRows(payments)
    setBills(billRows)
    setOrders(orderRows)
    setCustomers((customerRes.data ?? []) as Customer[])
    setLoading(false)
  }, [business.id, supabase])

  useEffect(() => {
    void load()
  }, [load])

  const billMap = useMemo(() => new Map(bills.map((bill) => [bill.id, bill])), [bills])
  const orderMap = useMemo(() => new Map(orders.map((order) => [order.id, order])), [orders])
  const customerMap = useMemo(() => new Map(customers.map((customer) => [customer.id, customer.name])), [customers])
  const visible = rows.filter((row) => {
    if (applied.method !== "all" && row.method !== applied.method) return false
    if (applied.status !== "all" && row.status !== applied.status) return false
    const needle = applied.query.trim().toLowerCase()
    if (!needle) return true
    const bill = row.bill_id ? billMap.get(row.bill_id) : undefined
    const order = row.order_id ? orderMap.get(row.order_id) : undefined
    const customerId = bill?.customer_id ?? order?.customer_id ?? null
    const customer = customerId ? customerMap.get(customerId) ?? "" : ""
    return [row.method, row.status, row.external_ref ?? "", bill?.number ?? "", customer].join(" ").toLowerCase().includes(needle)
  })
  const columns = useMemo<ColumnDef<DataTableFeatures, PaymentRow>[]>(
    () => [
      { accessorKey: "method", header: ({ column }) => <DataTableColumnHeader column={column} title="Method" />, cell: ({ row }) => <span className="capitalize">{row.original.method.replaceAll("_", " ")}</span> },
      {
        id: "customer",
        header: "Customer",
        accessorFn: (row) => {
          const bill = row.bill_id ? billMap.get(row.bill_id) : undefined
          const order = row.order_id ? orderMap.get(row.order_id) : undefined
          const customerId = bill?.customer_id ?? order?.customer_id ?? null
          return customerId ? customerMap.get(customerId) ?? "—" : "—"
        },
      },
      { id: "bill", header: "Linked bill", accessorFn: (row) => (row.bill_id ? billMap.get(row.bill_id)?.number ?? "—" : "—") },
      { accessorKey: "amount", meta: { align: "right" }, header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />, cell: ({ row }) => <div className="text-right tabular-nums">{money(Number(row.original.amount), business.currency)}</div> },
      { accessorKey: "external_ref", header: ({ column }) => <DataTableColumnHeader column={column} title="Receipt" />, cell: ({ row }) => row.original.external_ref || "—" },
      { accessorKey: "status", header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />, cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      { accessorKey: "created_at", header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />, cell: ({ row }) => stamp(row.original.created_at) },
    ],
    [billMap, business.currency, customerMap, orderMap],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="w-full sm:max-w-xs"
          placeholder="Search customer or bill…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Select value={method} items={methodItems} onValueChange={(value) => setMethod(value ?? "all")}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(methodItems).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} items={statusItems} onValueChange={(value) => setStatus(value ?? "all")}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(statusItems).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" onClick={() => setApplied({ query, method, status })}>
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
                <EmptyTitle>No online payment records found</EmptyTitle>
                <EmptyDescription>Payments appear here after a sale or settlement.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <DataTable columns={columns} data={visible} empty="No online payment records found" getRowId={(row) => row.id} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
