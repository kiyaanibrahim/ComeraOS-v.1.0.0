"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"

import { PosScreen, statusVariant } from "@/components/pos/pos-screen"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { toast } from "@/components/ui/sonner"
import { money, quantity, statusLabel } from "@/lib/flow/format"
import type { BusinessRecord, FlowClient } from "@/lib/flow/use-business"

type OrderRow = {
  id: string
  number: string
  status: string
  source: string
  customer_id: string | null
  location_id: string | null
  notes: string | null
  subtotal: number
  discount: number
  tax: number
  total: number
  created_at: string
}
type LineRow = { id: string; description: string; quantity: number; unit_price: number; line_total: number }
type BillRow = { id: string; number: string; status: string; subtotal: number; discount: number; tax: number; total: number }
type PaymentRow = { id: string; method: string; amount: number; status: string; created_at: string }

const sourceLabel: Record<string, string> = {
  pos: "Counter",
  quote: "Quote",
  online: "Online",
  manual: "Manual",
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

export function OrderDetail({ businessKey, orderId }: { businessKey: string; orderId: string }) {
  return (
    <PosScreen businessKey={businessKey} title="Order" description="Lines, bill, and payments for one sale.">
      {({ business, supabase }) => (
        <Detail businessKey={businessKey} business={business} supabase={supabase} orderId={orderId} />
      )}
    </PosScreen>
  )
}

function Detail({
  businessKey,
  business,
  supabase,
  orderId,
}: {
  businessKey: string
  business: BusinessRecord
  supabase: FlowClient
  orderId: string
}) {
  const [order, setOrder] = useState<OrderRow | null>(null)
  const [lines, setLines] = useState<LineRow[]>([])
  const [bill, setBill] = useState<BillRow | null>(null)
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [customer, setCustomer] = useState("Walk-in")
  const [location, setLocation] = useState("—")
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const orderRes = await supabase
      .from("orders")
      .select("id, number, status, source, customer_id, location_id, notes, subtotal, discount, tax, total, created_at")
      .eq("business_id", business.id)
      .eq("id", orderId)
      .maybeSingle()
    if (orderRes.error) {
      toast.error(orderRes.error.message)
      setLoading(false)
      return
    }
    if (!orderRes.data) {
      setMissing(true)
      setLoading(false)
      return
    }
    const row = orderRes.data as OrderRow
    const [lineRes, billRes, paymentRes, customerRes, locationRes] = await Promise.all([
      supabase
        .from("order_lines")
        .select("id, description, quantity, unit_price, line_total")
        .eq("business_id", business.id)
        .eq("order_id", row.id),
      supabase
        .from("bills")
        .select("id, number, status, subtotal, discount, tax, total")
        .eq("business_id", business.id)
        .eq("order_id", row.id)
        .maybeSingle(),
      supabase
        .from("payments")
        .select("id, method, amount, status, created_at")
        .eq("business_id", business.id)
        .eq("order_id", row.id)
        .order("created_at", { ascending: false }),
      row.customer_id
        ? supabase.from("customers").select("name").eq("business_id", business.id).eq("id", row.customer_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      row.location_id
        ? supabase.from("locations").select("name").eq("business_id", business.id).eq("id", row.location_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])
    const error = lineRes.error || billRes.error || paymentRes.error || customerRes.error || locationRes.error
    if (error) toast.error(error.message)
    setOrder(row)
    setLines((lineRes.data ?? []) as LineRow[])
    setBill((billRes.data as BillRow | null) ?? null)
    setPayments((paymentRes.data ?? []) as PaymentRow[])
    setCustomer(customerRes.data?.name ?? "Walk-in")
    setLocation(locationRes.data?.name ?? "—")
    setMissing(false)
    setLoading(false)
  }, [business.id, orderId, supabase])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) return <div className="h-40 animate-pulse rounded-xl bg-muted" />
  if (missing || !order) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Order not found</EmptyTitle>
          <EmptyDescription>This order is not in this business.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-lg font-medium">{order.number}</h2>
          <p className="text-sm text-muted-foreground">
            {customer} · {location} · {sourceLabel[order.source] ?? statusLabel(order.source)} · {stamp(order.created_at)}
          </p>
          {order.notes ? <p className="text-sm text-muted-foreground">{order.notes}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant(order.status)}>{statusLabel(order.status)}</Badge>
          <Button type="button" variant="outline" nativeButton={false} render={<Link href={`/app/${businessKey}/orders`} />}>
            All orders
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lines</CardTitle>
        </CardHeader>
        <CardContent>
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">This order has no lines.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 font-medium">Item</th>
                  <th className="py-2 text-right font-medium">Qty</th>
                  <th className="py-2 text-right font-medium">Price</th>
                  <th className="py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id} className="border-b last:border-0">
                    <td className="py-2">{line.description}</td>
                    <td className="py-2 text-right tabular-nums">{quantity(Number(line.quantity))}</td>
                    <td className="py-2 text-right tabular-nums">{money(Number(line.unit_price), business.currency)}</td>
                    <td className="py-2 text-right tabular-nums">{money(Number(line.line_total), business.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <dl className="mt-4 space-y-1 border-t pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tabular-nums">{money(Number(order.subtotal), business.currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Discount</dt>
              <dd className="tabular-nums">{money(Number(order.discount), business.currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Tax</dt>
              <dd className="tabular-nums">{money(Number(order.tax), business.currency)}</dd>
            </div>
            <div className="flex justify-between font-medium">
              <dt>Total</dt>
              <dd className="tabular-nums">{money(Number(order.total), business.currency)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Bill</CardTitle>
          </CardHeader>
          <CardContent>
            {bill ? (
              <div className="flex items-center justify-between gap-3 text-sm">
                <div>
                  <div className="font-medium">{bill.number}</div>
                  <div className="text-muted-foreground tabular-nums">{money(Number(bill.total), business.currency)}</div>
                </div>
                <Badge variant={statusVariant(bill.status)}>{statusLabel(bill.status)}</Badge>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">This order has no bill yet.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Payments</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payment has been recorded.</p>
            ) : (
              payments.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between gap-3 text-sm">
                  <div>
                    <div className="capitalize">{payment.method.replaceAll("_", " ")}</div>
                    <div className="text-muted-foreground">{stamp(payment.created_at)}</div>
                  </div>
                  <div className="text-right">
                    <div className="tabular-nums">{money(Number(payment.amount), business.currency)}</div>
                    <Badge variant={statusVariant(payment.status)}>{statusLabel(payment.status)}</Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
