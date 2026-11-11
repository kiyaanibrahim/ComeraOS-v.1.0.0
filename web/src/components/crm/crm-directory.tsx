"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

import { CustomerFormDialog, emptyCustomer, type CustomerDraft } from "@/components/crm/customer-form"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/components/ui/sonner"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  blankText,
  customerTypeLabel,
  initials,
  lastOrder,
  lifetimeValue,
  stamp,
  type CustomerRecord,
  type DealRecord,
  type OrderRecord,
  type PaymentRecord,
} from "@/lib/crm/lifetime"
import { money } from "@/lib/flow/format"
import { useBusiness } from "@/lib/flow/use-business"

export function CrmDirectory({ businessKey }: { businessKey: string }) {
  const flow = useBusiness(businessKey)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-medium tracking-tight">CRM Overview</h1>
        <p className="text-sm text-muted-foreground">
          Manage customer identities, search the full customer domain, and open profiles.
        </p>
      </div>
      {!flow.ready ? <div className="h-40 animate-pulse rounded-xl bg-muted" /> : null}
      {flow.ready && flow.error ? <p className="text-sm text-destructive">{flow.error}</p> : null}
      {flow.ready && flow.business ? (
        <Directory
          businessKey={businessKey}
          businessId={flow.business.id}
          currency={flow.business.currency}
          supabase={flow.supabase}
        />
      ) : null}
    </div>
  )
}

function Directory({
  businessKey,
  businessId,
  currency,
  supabase,
}: {
  businessKey: string
  businessId: string
  currency: string
  supabase: ReturnType<typeof useBusiness>["supabase"]
}) {
  const [customers, setCustomers] = useState<CustomerRecord[]>([])
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [deals, setDeals] = useState<DealRecord[]>([])
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<CustomerDraft | null>(null)
  const [pending, setPending] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [customerRes, orderRes, dealRes] = await Promise.all([
      supabase
        .from("customers")
        .select("id, name, email, phone, notes, status, address, customer_type, created_at, updated_at")
        .eq("business_id", businessId)
        .order("name")
        .limit(1000),
      supabase
        .from("orders")
        .select("id, customer_id, number, status, source, total, notes, created_at")
        .eq("business_id", businessId)
        .not("customer_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase
        .from("deals")
        .select("id, customer_id, title, stage, amount, created_at")
        .eq("business_id", businessId)
        .limit(1000),
    ])
    const firstError = customerRes.error || orderRes.error || dealRes.error
    if (firstError) {
      toast.error(firstError.message)
      setLoading(false)
      return
    }
    const customerRows = (customerRes.data ?? []) as CustomerRecord[]
    const orderRows = (orderRes.data ?? []) as OrderRecord[]
    const orderIds = orderRows.map((order) => order.id)
    const paymentRes = orderIds.length
      ? await supabase
          .from("payments")
          .select("id, order_id, bill_id, amount, status, method, created_at")
          .eq("business_id", businessId)
          .in("order_id", orderIds)
      : { data: [], error: null }
    if (paymentRes.error) toast.error(paymentRes.error.message)
    setCustomers(customerRows)
    setOrders(orderRows)
    setPayments((paymentRes.data ?? []) as PaymentRecord[])
    setDeals((dealRes.data ?? []) as DealRecord[])
    setLoading(false)
  }, [businessId, supabase])

  useEffect(() => {
    void load()
  }, [load])

  const ordersByCustomer = useMemo(() => {
    const map = new Map<string, OrderRecord[]>()
    for (const order of orders) {
      if (!order.customer_id) continue
      map.set(order.customer_id, [...(map.get(order.customer_id) ?? []), order])
    }
    return map
  }, [orders])

  const paymentsByOrder = useMemo(() => {
    const map = new Map<string, PaymentRecord[]>()
    for (const payment of payments) {
      if (!payment.order_id) continue
      map.set(payment.order_id, [...(map.get(payment.order_id) ?? []), payment])
    }
    return map
  }, [payments])

  const visible = customers.filter((customer) => {
    const needle = query.trim().toLowerCase()
    if (!needle) return true
    return [customer.name, customer.phone, customer.email, customer.address]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(needle)
  })

  async function save(next: CustomerDraft) {
    setPending(true)
    setFormError(null)
    const payload = {
      name: next.name.trim(),
      customer_type: next.customer_type,
      phone: blankText(next.phone),
      email: blankText(next.email),
      address: blankText(next.address),
      notes: blankText(next.notes),
      status: next.status,
    }
    const result = next.id
      ? await supabase.from("customers").update(payload).eq("id", next.id).eq("business_id", businessId)
      : await supabase.from("customers").insert({ ...payload, business_id: businessId })
    setPending(false)
    if (result.error) {
      setFormError(result.error.message)
      toast.error(result.error.message)
      return
    }
    setDraft(null)
    toast.success(next.id ? "Customer updated." : "Customer added.")
    await load()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          className="w-full sm:max-w-xs"
          placeholder="Search customers…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">Total customers {customers.length}</p>
          <Button
            type="button"
            onClick={() => {
              setFormError(null)
              setDraft(emptyCustomer())
            }}
          >
            New customer
          </Button>
        </div>
      </div>
      <Card>
        <CardContent className="px-0">
          {loading ? <div className="mx-4 h-40 animate-pulse rounded-xl bg-muted" /> : null}
          {!loading && visible.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{customers.length === 0 ? "No customers yet" : "No matching customers"}</EmptyTitle>
                <EmptyDescription>
                  {customers.length === 0
                    ? "Add a customer to start a lifetime record."
                    : "Try a different name, phone, email, or address."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
          {!loading && visible.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Lifetime value</TableHead>
                  <TableHead>Last order</TableHead>
                  <TableHead className="text-right">Profile</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((customer) => {
                  const customerOrders = ordersByCustomer.get(customer.id) ?? []
                  const customerPayments = customerOrders.flatMap((order) => paymentsByOrder.get(order.id) ?? [])
                  const latest = lastOrder(customerOrders)
                  const value = lifetimeValue(customerOrders, customerPayments)
                  return (
                    <TableRow key={customer.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                            {initials(customer.name)}
                          </span>
                          <div className="flex flex-col gap-1">
                            <Link
                              href={`/app/${businessKey}/crm/${customer.id}`}
                              className="font-medium underline-offset-4 hover:underline"
                            >
                              {customer.name}
                            </Link>
                            <div className="flex flex-wrap items-center gap-1">
                              <Badge variant="secondary">{customerTypeLabel(customer.customer_type)}</Badge>
                              {customer.status === "inactive" ? <Badge variant="outline">Inactive</Badge> : null}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5 text-sm">
                          <span>{customer.phone || "—"}</span>
                          <span className="text-muted-foreground">{customer.address || "No address"}</span>
                          <span className="text-muted-foreground">{customer.email || "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{customerOrders.length}</TableCell>
                      <TableCell className="text-right font-medium text-positive">
                        {money(value, currency)}
                      </TableCell>
                      <TableCell>{latest ? stamp(latest.created_at) : "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
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
                            Edit
                          </Button>
                          <Link
                            href={`/app/${businessKey}/crm/${customer.id}`}
                            className={buttonVariants({ variant: "outline", size: "sm" })}
                          >
                            Open profile
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Open deals on file: {deals.filter((deal) => deal.stage !== "won" && deal.stage !== "lost").length}
      </p>
      <CustomerFormDialog
        open={draft !== null}
        draft={draft ?? emptyCustomer()}
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
