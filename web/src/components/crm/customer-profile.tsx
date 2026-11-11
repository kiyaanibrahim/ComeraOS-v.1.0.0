"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowLeft, Mail, MapPin, Phone } from "lucide-react"

import { CustomerFormDialog, type CustomerDraft } from "@/components/crm/customer-form"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/components/ui/sonner"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  averageCompletedOrder,
  blankText,
  customerTypeLabel,
  initials,
  lastOrder,
  lifetimeValue,
  lineSummary,
  openDealValue,
  orderStatusLabel,
  paymentMethods,
  refundedOrderIds,
  stamp,
  type CustomerRecord,
  type DealRecord,
  type OrderLineRecord,
  type OrderRecord,
  type PaymentRecord,
} from "@/lib/crm/lifetime"
import { money } from "@/lib/flow/format"
import { useBusiness } from "@/lib/flow/use-business"

type QuoteRecord = {
  id: string
  number: string
  status: string
  total: number
  created_at: string
}

type QuoteLine = { quotation_id: string; description: string; quantity: number }
type BillRecord = {
  id: string
  number: string
  status: string
  total: number
  created_at: string
}
type BillLine = { bill_id: string; description: string; quantity: number }
type NoteRecord = {
  id: string
  kind: string
  body: string
  occurred_at: string
}

type TimelineItem = {
  id: string
  at: string
  kind: string
  title: string
  detail: string
}

export function CustomerProfile({
  businessKey,
  customerId,
}: {
  businessKey: string
  customerId: string
}) {
  const flow = useBusiness(businessKey)

  return (
    <div className="flex flex-col gap-4">
      {!flow.ready ? <div className="h-40 animate-pulse rounded-xl bg-muted" /> : null}
      {flow.ready && flow.error ? <p className="text-sm text-destructive">{flow.error}</p> : null}
      {flow.ready && flow.business ? (
        <Profile
          businessKey={businessKey}
          businessId={flow.business.id}
          currency={flow.business.currency}
          customerId={customerId}
          supabase={flow.supabase}
        />
      ) : null}
    </div>
  )
}

function Profile({
  businessKey,
  businessId,
  currency,
  customerId,
  supabase,
}: {
  businessKey: string
  businessId: string
  currency: string
  customerId: string
  supabase: ReturnType<typeof useBusiness>["supabase"]
}) {
  const [customer, setCustomer] = useState<CustomerRecord | null>(null)
  const [missing, setMissing] = useState(false)
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [lines, setLines] = useState<OrderLineRecord[]>([])
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [quotes, setQuotes] = useState<QuoteRecord[]>([])
  const [quoteLines, setQuoteLines] = useState<QuoteLine[]>([])
  const [bills, setBills] = useState<BillRecord[]>([])
  const [billLines, setBillLines] = useState<BillLine[]>([])
  const [deals, setDeals] = useState<DealRecord[]>([])
  const [notes, setNotes] = useState<NoteRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [draft, setDraft] = useState<CustomerDraft | null>(null)
  const [pending, setPending] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const [notePending, setNotePending] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setMissing(false)
    const customerRes = await supabase
      .from("customers")
      .select("id, name, email, phone, notes, status, address, customer_type, created_at, updated_at")
      .eq("business_id", businessId)
      .eq("id", customerId)
      .maybeSingle()
    if (customerRes.error) {
      toast.error(customerRes.error.message)
      setLoading(false)
      return
    }
    if (!customerRes.data) {
      setCustomer(null)
      setMissing(true)
      setLoading(false)
      return
    }
    setCustomer(customerRes.data as CustomerRecord)
    const [orderRes, quoteRes, billRes, dealRes, noteRes] = await Promise.all([
      supabase
        .from("orders")
        .select("id, customer_id, number, status, source, total, notes, created_at")
        .eq("business_id", businessId)
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("quotations")
        .select("id, number, status, total, created_at")
        .eq("business_id", businessId)
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("bills")
        .select("id, number, status, total, created_at")
        .eq("business_id", businessId)
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("deals")
        .select("id, customer_id, title, stage, amount, created_at")
        .eq("business_id", businessId)
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("crm_activities")
        .select("id, kind, body, occurred_at")
        .eq("business_id", businessId)
        .eq("customer_id", customerId)
        .order("occurred_at", { ascending: false })
        .limit(200),
    ])
    const firstError = orderRes.error || quoteRes.error || billRes.error || dealRes.error || noteRes.error
    if (firstError) {
      toast.error(firstError.message)
      setLoading(false)
      return
    }
    const orderRows = (orderRes.data ?? []) as OrderRecord[]
    const quoteRows = (quoteRes.data ?? []) as QuoteRecord[]
    const billRows = (billRes.data ?? []) as BillRecord[]
    const orderIds = orderRows.map((order) => order.id)
    const quoteIds = quoteRows.map((quote) => quote.id)
    const billIds = billRows.map((bill) => bill.id)
    const [lineRes, paymentRes, quoteLineRes, billLineRes] = await Promise.all([
      orderIds.length
        ? supabase
            .from("order_lines")
            .select("id, order_id, description, quantity, line_total")
            .eq("business_id", businessId)
            .in("order_id", orderIds)
        : Promise.resolve({ data: [], error: null }),
      orderIds.length
        ? supabase
            .from("payments")
            .select("id, order_id, bill_id, amount, status, method, created_at")
            .eq("business_id", businessId)
            .in("order_id", orderIds)
        : Promise.resolve({ data: [], error: null }),
      quoteIds.length
        ? supabase
            .from("quotation_lines")
            .select("quotation_id, description, quantity")
            .eq("business_id", businessId)
            .in("quotation_id", quoteIds)
        : Promise.resolve({ data: [], error: null }),
      billIds.length
        ? supabase
            .from("bill_lines")
            .select("bill_id, description, quantity")
            .eq("business_id", businessId)
            .in("bill_id", billIds)
        : Promise.resolve({ data: [], error: null }),
    ])
    const childError = lineRes.error || paymentRes.error || quoteLineRes.error || billLineRes.error
    if (childError) toast.error(childError.message)
    setOrders(orderRows)
    setQuotes(quoteRows)
    setBills(billRows)
    setDeals((dealRes.data ?? []) as DealRecord[])
    setNotes((noteRes.data ?? []) as NoteRecord[])
    setLines((lineRes.data ?? []) as OrderLineRecord[])
    setPayments((paymentRes.data ?? []) as PaymentRecord[])
    setQuoteLines((quoteLineRes.data ?? []) as QuoteLine[])
    setBillLines((billLineRes.data ?? []) as BillLine[])
    setLoading(false)
  }, [businessId, customerId, supabase])

  useEffect(() => {
    void load()
  }, [load])

  const linesByOrder = useMemo(() => {
    const map = new Map<string, OrderLineRecord[]>()
    for (const line of lines) map.set(line.order_id, [...(map.get(line.order_id) ?? []), line])
    return map
  }, [lines])

  const paymentsByOrder = useMemo(() => {
    const map = new Map<string, PaymentRecord[]>()
    for (const payment of payments) {
      if (!payment.order_id) continue
      map.set(payment.order_id, [...(map.get(payment.order_id) ?? []), payment])
    }
    return map
  }, [payments])

  const timeline = useMemo(() => {
    const items: TimelineItem[] = []
    for (const order of orders) {
      items.push({
        id: `order-${order.id}`,
        at: order.created_at,
        kind: "Order",
        title: order.number,
        detail: `${lineSummary(linesByOrder.get(order.id) ?? [])} · ${money(Number(order.total), currency)} · ${orderStatusLabel(order, paymentsByOrder.get(order.id) ?? [])}`,
      })
    }
    for (const payment of payments) {
      items.push({
        id: `payment-${payment.id}`,
        at: payment.created_at,
        kind: "Payment",
        title: `${payment.method.replaceAll("_", " ")} · ${payment.status}`,
        detail: money(Number(payment.amount), currency),
      })
    }
    for (const quote of quotes) {
      const quoteItems = quoteLines.filter((line) => line.quotation_id === quote.id)
      items.push({
        id: `quote-${quote.id}`,
        at: quote.created_at,
        kind: "Quotation",
        title: quote.number,
        detail: `${lineSummary(quoteItems)} · ${money(Number(quote.total), currency)} · ${quote.status}`,
      })
    }
    for (const bill of bills) {
      const billItems = billLines.filter((line) => line.bill_id === bill.id)
      items.push({
        id: `bill-${bill.id}`,
        at: bill.created_at,
        kind: "Bill",
        title: bill.number,
        detail: `${lineSummary(billItems)} · ${money(Number(bill.total), currency)} · ${bill.status}`,
      })
    }
    for (const deal of deals) {
      items.push({
        id: `deal-${deal.id}`,
        at: deal.created_at,
        kind: "Deal",
        title: deal.title,
        detail: `${deal.stage} · ${money(Number(deal.amount), currency)}`,
      })
    }
    for (const activity of notes) {
      items.push({
        id: `note-${activity.id}`,
        at: activity.occurred_at,
        kind: activity.kind === "note" ? "Note" : activity.kind,
        title: activity.body,
        detail: "",
      })
    }
    return items.sort((a, b) => b.at.localeCompare(a.at))
  }, [bills, billLines, currency, deals, linesByOrder, notes, orders, payments, paymentsByOrder, quoteLines, quotes])

  const visibleOrders = orders.filter((order) => {
    const needle = query.trim().toLowerCase()
    if (!needle) return true
    const items = lineSummary(linesByOrder.get(order.id) ?? [])
    const methods = paymentMethods(paymentsByOrder.get(order.id) ?? []).join(" ")
    return [order.number, items, methods, order.status].join(" ").toLowerCase().includes(needle)
  })

  async function save(next: CustomerDraft) {
    if (!customer) return
    setPending(true)
    setFormError(null)
    const result = await supabase
      .from("customers")
      .update({
        name: next.name.trim(),
        customer_type: next.customer_type,
        phone: blankText(next.phone),
        email: blankText(next.email),
        address: blankText(next.address),
        notes: blankText(next.notes),
        status: next.status,
      })
      .eq("id", customer.id)
      .eq("business_id", businessId)
    setPending(false)
    if (result.error) {
      setFormError(result.error.message)
      toast.error(result.error.message)
      return
    }
    setDraft(null)
    toast.success("Customer saved.")
    await load()
  }

  async function addNote() {
    const body = note.trim()
    if (!body || !customer) return
    setNotePending(true)
    const result = await supabase.from("crm_activities").insert({
      business_id: businessId,
      customer_id: customer.id,
      kind: "note",
      body,
    })
    setNotePending(false)
    if (result.error) {
      toast.error(result.error.message)
      return
    }
    setNote("")
    toast.success("Note added.")
    await load()
  }

  if (loading) return <div className="h-40 animate-pulse rounded-xl bg-muted" />
  if (missing || !customer) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Customer not found</CardTitle>
          <CardDescription>This profile is not in the current business.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href={`/app/${businessKey}/crm`} className={buttonVariants({ variant: "outline" })}>
            Back to CRM
          </Link>
        </CardContent>
      </Card>
    )
  }

  const latest = lastOrder(orders)
  const value = lifetimeValue(orders, payments)
  const refunded = orders.filter((order) => refundedOrderIds(payments).has(order.id)).length
  const average = averageCompletedOrder(orders)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted text-sm font-medium">
            {initials(customer.name)}
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="font-heading text-xl font-medium tracking-tight">{customer.name}</h1>
            <p className="text-sm text-muted-foreground">Joined {stamp(customer.created_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setFormError(null)
              setDraft({
                id: customer.id,
                name: customer.name,
                customer_type: customer.customer_type === "business" ? "business" : "individual",
                phone: customer.phone ?? "",
                email: customer.email ?? "",
                address: customer.address ?? "",
                notes: customer.notes ?? "",
                status: customer.status === "inactive" ? "inactive" : "active",
              })
            }}
          >
            Edit profile
          </Button>
          <Link href={`/app/${businessKey}/crm`} className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft />
            Back to CRM
          </Link>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Metric label="Lifetime value" value={money(value, currency)} emphasis />
        <Metric label="Total orders" value={String(orders.length)} />
        <Metric label="Last order" value={latest ? stamp(latest.created_at) : "—"} hint={latest?.number} />
        <Metric label="Average completed order" value={money(average, currency)} />
        <Metric label="Refunded orders" value={String(refunded)} />
        <Metric label="Open deal value" value={money(openDealValue(deals), currency)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Contact</CardTitle>
            <CardDescription>{customerTypeLabel(customer.customer_type)}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ContactRow icon={Phone} value={customer.phone || "No phone"} />
            <ContactRow icon={Mail} value={customer.email || "No email"} />
            <ContactRow icon={MapPin} value={customer.address || "No address"} />
            <div className="flex flex-wrap gap-1">
              <Badge variant={customer.status === "active" ? "positive" : "secondary"}>{customer.status}</Badge>
              <Badge variant="outline">{customerTypeLabel(customer.customer_type)}</Badge>
            </div>
            {customer.notes ? <p className="text-sm text-muted-foreground">{customer.notes}</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Deals</CardTitle>
            <CardDescription>
              {deals.length === 0 ? "No deals for this customer." : `${deals.length} deals`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {deals.map((deal) => (
              <div key={deal.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex flex-col">
                  <span className="font-medium">{deal.title}</span>
                  <span className="text-muted-foreground">{stamp(deal.created_at)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{deal.stage}</Badge>
                  <span>{money(Number(deal.amount), currency)}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <CardTitle>Purchase history</CardTitle>
            <CardDescription>Orders, items, and payments for this customer.</CardDescription>
          </div>
          <Input
            className="w-full sm:max-w-xs"
            placeholder="Search orders…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </CardHeader>
        <CardContent className="px-0">
          {visibleOrders.length === 0 ? (
            <p className="px-4 text-sm text-muted-foreground">
              {orders.length === 0 ? "No orders yet." : "No orders match that search."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleOrders.map((order) => {
                  const orderPayments = paymentsByOrder.get(order.id) ?? []
                  const status = orderStatusLabel(order, orderPayments)
                  const methods = paymentMethods(orderPayments)
                  return (
                    <TableRow key={order.id}>
                      <TableCell>{stamp(order.created_at)}</TableCell>
                      <TableCell className="font-medium">{order.number}</TableCell>
                      <TableCell>{lineSummary(linesByOrder.get(order.id) ?? [])}</TableCell>
                      <TableCell className="text-right">{money(Number(order.total), currency)}</TableCell>
                      <TableCell className="capitalize">{methods.length > 0 ? methods.join(", ") : "—"}</TableCell>
                      <TableCell>
                        <Badge variant={status === "refunded" || status === "cancelled" ? "destructive" : status === "completed" ? "positive" : "secondary"}>
                          {status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Lifetime history</CardTitle>
          <CardDescription>Orders, payments, quotations, bills, deals, and notes, newest first.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            {timeline.length === 0 ? <p className="text-sm text-muted-foreground">No history yet.</p> : null}
            {timeline.map((item) => (
              <div key={item.id} className="flex gap-3 border-b pb-3 last:border-b-0 last:pb-0">
                <div className="w-24 shrink-0 text-xs text-muted-foreground">{stamp(item.at)}</div>
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{item.kind}</Badge>
                    <span className="font-medium">{item.title}</span>
                  </div>
                  {item.detail ? <p className="text-sm text-muted-foreground">{item.detail}</p> : null}
                </div>
              </div>
            ))}
          </div>
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void addNote()
            }}
          >
            <Label htmlFor="customer-note">Note</Label>
            <Textarea
              id="customer-note"
              value={note}
              placeholder="What happened with this customer?"
              onChange={(event) => setNote(event.target.value)}
            />
            <div>
              <Button type="submit" disabled={notePending || note.trim().length === 0}>
                {notePending ? "Saving…" : "Add note"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <CustomerFormDialog
        open={draft !== null}
        draft={draft ?? {
          id: customer.id,
          name: customer.name,
          customer_type: customer.customer_type === "business" ? "business" : "individual",
          phone: customer.phone ?? "",
          email: customer.email ?? "",
          address: customer.address ?? "",
          notes: customer.notes ?? "",
          status: customer.status === "inactive" ? "inactive" : "active",
        }}
        pending={pending}
        error={formError}
        onOpenChange={(open) => {
          if (!open) setDraft(null)
        }}
        onSubmit={(next) => void save(next)}
      />
    </div>
  )
}

function Metric({
  label,
  value,
  hint,
  emphasis = false,
}: {
  label: string
  value: string
  hint?: string
  emphasis?: boolean
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className={emphasis ? "text-positive" : undefined}>{value}</CardTitle>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardHeader>
    </Card>
  )
}

function ContactRow({ icon: Icon, value }: { icon: typeof Phone; value: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className="mt-0.5 size-4 text-muted-foreground" />
      <span>{value}</span>
    </div>
  )
}
