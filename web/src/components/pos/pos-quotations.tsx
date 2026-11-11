"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"

import { DataTable } from "@/components/data-table/data-table"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import type { DataTableFeatures } from "@/components/data-table/data-table-features"
import { documentNumber, PosScreen, statusVariant } from "@/components/pos/pos-screen"
import { UnsavedChangesDialog, useUnsavedChanges } from "@/components/unsaved-changes"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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

type Customer = { id: string; name: string }
type Product = { id: string; name: string; price: number }
type DraftLine = { key: string; productId: string; description: string; quantity: number; unitPrice: number }
type QuoteRow = {
  id: string
  number: string
  status: string
  total: number
  customer_id: string | null
  items: number
}
type AcceptedOrder = { id: string; number: string; quotation_id: string | null }
type AcceptedQuote = { id: string; number: string; bill_number: string }

export function PosQuotations({ businessKey }: { businessKey: string }) {
  return (
    <PosScreen
      businessKey={businessKey}
      title="Quotes"
      description="Create a quote. Accepting it writes an order and a bill."
    >
      {({ business, supabase }) => <Quotes businessKey={businessKey} business={business} supabase={supabase} />}
    </PosScreen>
  )
}

function Quotes({
  businessKey,
  business,
  supabase,
}: {
  businessKey: string
  business: BusinessRecord
  supabase: FlowClient
}) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [quotes, setQuotes] = useState<QuoteRow[]>([])
  const [acceptedOrders, setAcceptedOrders] = useState<Record<string, AcceptedOrder>>({})
  const [taxRate, setTaxRate] = useState(0)
  const [customerId, setCustomerId] = useState("")
  const [productId, setProductId] = useState("")
  const [quantity, setQuantity] = useState("1")
  const [price, setPrice] = useState("")
  const [lines, setLines] = useState<DraftLine[]>([])
  const [busy, setBusy] = useState(false)
  const unsaved = useUnsavedChanges(lines.length > 0)

  const load = useCallback(async () => {
    const [customerRes, productRes, quoteRes, lineRes, settingsRes, orderRes] = await Promise.all([
      supabase.from("customers").select("id, name").eq("business_id", business.id).order("name").limit(200),
      supabase.from("products").select("id, name, price").eq("business_id", business.id).eq("status", "active").order("name"),
      supabase
        .from("quotations")
        .select("id, number, status, total, customer_id")
        .eq("business_id", business.id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.from("quotation_lines").select("quotation_id").eq("business_id", business.id),
      supabase.from("business_settings").select("tax_rate").eq("business_id", business.id).maybeSingle(),
      supabase.from("orders").select("id, number, quotation_id").eq("business_id", business.id).not("quotation_id", "is", null),
    ])
    const error = customerRes.error || productRes.error || quoteRes.error || lineRes.error || settingsRes.error || orderRes.error
    if (error) toast.error(error.message)
    const counts = new Map<string, number>()
    for (const line of lineRes.data ?? []) {
      counts.set(line.quotation_id, (counts.get(line.quotation_id) ?? 0) + 1)
    }
    setCustomers(customerRes.data ?? [])
    setProducts(productRes.data ?? [])
    setTaxRate(Number(settingsRes.data?.tax_rate ?? 0))
    setAcceptedOrders(
      Object.fromEntries(
        ((orderRes.data ?? []) as AcceptedOrder[])
          .filter((order) => order.quotation_id)
          .map((order) => [order.quotation_id as string, order]),
      ),
    )
    setQuotes(
      (quoteRes.data ?? []).map((quote) => ({
        id: quote.id,
        number: quote.number,
        status: quote.status,
        total: Number(quote.total),
        customer_id: quote.customer_id,
        items: counts.get(quote.id) ?? 0,
      })),
    )
  }, [business.id, supabase])

  useEffect(() => {
    void load()
  }, [load])

  const customerItems = Object.fromEntries(customers.map((customer) => [customer.id, customer.name]))
  const productItems = Object.fromEntries(products.map((product) => [product.id, product.name]))
  const customerName = new Map(customers.map((customer) => [customer.id, customer.name]))
  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)
  const tax = Math.round(((subtotal * taxRate) / 100) * 100) / 100
  const total = Math.round((subtotal + tax) * 100) / 100

  function chooseProduct(next: string) {
    setProductId(next)
    const product = products.find((item) => item.id === next)
    if (product) setPrice(String(product.price))
  }

  function addLine() {
    const product = products.find((item) => item.id === productId)
    const qty = Number(quantity)
    const unitPrice = Number(price)
    if (!product || qty <= 0 || Number.isNaN(unitPrice)) return
    setLines((current) => [
      ...current,
      { key: `${product.id}-${current.length}`, productId: product.id, description: product.name, quantity: qty, unitPrice },
    ])
    setProductId("")
    setQuantity("1")
    setPrice("")
  }

  async function createQuote() {
    if (lines.length === 0) return
    setBusy(true)
    const created = await supabase
      .from("quotations")
      .insert({
        business_id: business.id,
        customer_id: customerId || null,
        number: documentNumber("Q"),
        status: "draft",
        total,
      })
      .select("id")
      .single()
    if (created.error || !created.data) {
      toast.error(created.error?.message ?? "Could not create the quotation")
      setBusy(false)
      return
    }
    const inserted = await supabase.from("quotation_lines").insert(
      lines.map((line) => ({
        business_id: business.id,
        quotation_id: created.data.id,
        product_id: line.productId,
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unitPrice,
        line_total: Math.round(line.quantity * line.unitPrice * 100) / 100,
      })),
    )
    setBusy(false)
    if (inserted.error) {
      toast.error(inserted.error.message)
      return
    }
    setLines([])
    setCustomerId("")
    toast.success("Quotation created.")
    await load()
  }

  async function accept(quote: QuoteRow) {
    setBusy(true)
    try {
      const created = await callRpc<AcceptedQuote>(supabase, "accept_quotation", {
        p_business_id: business.id,
        p_quotation_id: quote.id,
      })
      toast.success(`Order ${created.number} and bill ${created.bill_number} created.`)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not accept the quote")
    } finally {
      setBusy(false)
    }
  }

  const quoteColumns: ColumnDef<DataTableFeatures, QuoteRow>[] = [
    { accessorKey: "number", header: ({ column }) => <DataTableColumnHeader column={column} title="Quote ID" />, cell: ({ row }) => <span className="font-medium">{row.original.number}</span> },
    {
      id: "customer",
      header: "Customer",
      accessorFn: (row) => (row.customer_id ? customerName.get(row.customer_id) ?? "Customer" : "Walk-in"),
      cell: ({ getValue }) => getValue<string>(),
    },
    { accessorKey: "items", header: ({ column }) => <DataTableColumnHeader column={column} title="Items" />, cell: ({ row }) => <div className="text-right tabular-nums">{row.original.items}</div> },
    { accessorKey: "total", header: ({ column }) => <DataTableColumnHeader column={column} title="Total" />, cell: ({ row }) => <div className="text-right tabular-nums">{money(row.original.total, business.currency)}</div> },
    { accessorKey: "status", header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />, cell: ({ row }) => <Badge variant={statusVariant(row.original.status)}>{row.original.status}</Badge> },
    {
      id: "actions",
      header: "Action",
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const order = acceptedOrders[row.original.id]
        if (row.original.status === "accepted") {
          return order ? (
            <Link className="text-sm underline-offset-4 hover:underline" href={`/app/${businessKey}/orders/${order.id}`}>
              {order.number}
            </Link>
          ) : (
            <span className="text-sm text-muted-foreground">Accepted</span>
          )
        }
        return (
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link href={`/app/${businessKey}/pos?quote=${row.original.id}`} />}
            >
              Send to Sell
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void accept(row.original)}>
              Accept
            </Button>
          </div>
        )
      },
    },
  ]

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <UnsavedChangesDialog open={unsaved.open} onStay={unsaved.stay} onLeave={unsaved.leave} />
      <Card>
        <CardHeader>
          <CardTitle>Create quotation</CardTitle>
          <CardDescription>Customer is optional. Totals come from the lines.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Select value={customerId} items={customerItems} onValueChange={(value) => setCustomerId(value ?? "")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Walk-in / company name" />
            </SelectTrigger>
            <SelectContent>
              {customers.map((customer) => (
                <SelectItem key={customer.id} value={customer.id}>
                  {customer.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="grid gap-2 sm:grid-cols-[1fr_5rem_7rem_auto]">
            <Select value={productId} items={productItems} onValueChange={(value) => chooseProduct(value ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select product" />
              </SelectTrigger>
              <SelectContent>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            <Input type="number" min="0" step="0.01" placeholder="Price" value={price} onChange={(event) => setPrice(event.target.value)} />
            <Button type="button" variant="outline" disabled={!productId} onClick={addLine}>
              Add
            </Button>
          </div>
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">No items in the draft.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {lines.map((line) => (
                <div key={line.key} className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    {line.description} · {line.quantity} × {money(line.unitPrice, business.currency)}
                  </span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-1 border-t pt-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{money(subtotal, business.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax {taxRate}%</span>
              <span className="tabular-nums">{money(tax, business.currency)}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Total</span>
              <span className="tabular-nums">{money(total, business.currency)}</span>
            </div>
          </div>
          <Button type="button" disabled={busy || lines.length === 0} onClick={() => void createQuote()}>
            {busy ? "Saving…" : "Create quotation"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Quotation list</CardTitle>
            <Button type="button" variant="ghost" onClick={() => void load()}>
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {quotes.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No quotations yet</EmptyTitle>
                <EmptyDescription>Create a quote, then accept it into an order and a bill.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <DataTable columns={quoteColumns} data={quotes} empty="No quotations yet" getRowId={(row) => row.id} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
