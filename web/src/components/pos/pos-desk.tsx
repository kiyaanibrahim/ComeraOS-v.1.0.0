"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { FlowFrame } from "@/components/flow/flow-frame"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { money, quantity } from "@/lib/flow/format"
import { callRpc } from "@/lib/flow/rpc"
import type { BusinessRecord, FlowClient } from "@/lib/flow/use-business"

type ProductRow = {
  id: string
  sku: string
  name: string
  price: number
  status: string
}

type Balance = { product_id: string; location_id: string; quantity: number }
type LocationRow = { id: string; name: string; kind: string }
type CartLine = { productId: string; name: string; price: number; quantity: number; onHand: number }

export function PosDesk({ businessKey }: { businessKey: string }) {
  return (
    <FlowFrame
      businessKey={businessKey}
      title="POS"
      description="Sell active stock from the location that received the shipment."
    >
      {({ business, supabase }) => <Register business={business} supabase={supabase} />}
    </FlowFrame>
  )
}

function Register({ business, supabase }: { business: BusinessRecord; supabase: FlowClient }) {
  const [products, setProducts] = useState<ProductRow[]>([])
  const [balances, setBalances] = useState<Balance[]>([])
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [locationId, setLocationId] = useState("")
  const [cart, setCart] = useState<CartLine[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const load = useCallback(async () => {
    const [productRes, balanceRes, locationRes] = await Promise.all([
      supabase
        .from("products")
        .select("id, sku, name, price, status")
        .eq("business_id", business.id)
        .eq("status", "active")
        .order("name"),
      supabase
        .from("inventory_balances")
        .select("product_id, location_id, quantity")
        .eq("business_id", business.id),
      supabase.from("locations").select("id, name, kind").eq("business_id", business.id).order("name"),
    ])
    const error = productRes.error || balanceRes.error || locationRes.error
    if (error) setMessage(error.message)
    const places = locationRes.data ?? []
    const store = places.find((location) => location.kind === "store") ?? places[0]
    setProducts(productRes.data ?? [])
    setBalances(balanceRes.data ?? [])
    setLocations(places)
    setLocationId((current) => current || store?.id || "")
  }, [business.id, supabase])

  useEffect(() => {
    void load()
  }, [load])

  const stock = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of balances) {
      if (row.location_id === locationId) map.set(row.product_id, Number(row.quantity))
    }
    return map
  }, [balances, locationId])

  const sellable = products.filter((product) => (stock.get(product.id) ?? 0) > 0)
  const total = cart.reduce((sum, line) => sum + line.price * line.quantity, 0)
  const locationItems = Object.fromEntries(locations.map((location) => [location.id, location.name]))

  function add(product: ProductRow) {
    const onHand = stock.get(product.id) ?? 0
    setCart((current) => {
      const existing = current.find((line) => line.productId === product.id)
      if (existing) {
        if (existing.quantity + 1 > onHand) return current
        return current.map((line) =>
          line.productId === product.id ? { ...line, quantity: line.quantity + 1, onHand } : line,
        )
      }
      return [
        ...current,
        { productId: product.id, name: product.name, price: Number(product.price), quantity: 1, onHand },
      ]
    })
  }

  async function charge() {
    if (!locationId || cart.length === 0) return
    setPending(true)
    setMessage(null)
    try {
      const sale = await callRpc<{ number: string; total: number }>(supabase, "complete_pos_sale", {
        p_business_id: business.id,
        p_location_id: locationId,
        p_lines: cart.map((line) => ({ product_id: line.productId, quantity: line.quantity })),
      })
      setCart([])
      setMessage(`Sale ${sale.number} posted for ${money(Number(sale.total), business.currency)}.`)
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not complete the sale")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
      <Card>
        <CardHeader>
          <CardTitle>Active stock</CardTitle>
          <CardDescription>Only quantities on hand at the selling location are shown.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {locations.length > 0 ? (
            <Select
              value={locationId}
              items={locationItems}
              onValueChange={(value) => {
                setLocationId(value ?? "")
                setCart([])
              }}
            >
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue placeholder="Selling location" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-muted-foreground">Add a location on the shipment before selling.</p>
          )}
          {sellable.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No stock at this location. Deliver a shipment here, then come back.
            </p>
          ) : (
            sellable.map((product) => (
              <div key={product.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div>
                  <div className="font-medium">{product.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {product.sku} · {quantity(stock.get(product.id) ?? 0)} on hand ·{" "}
                    {money(Number(product.price), business.currency)}
                  </div>
                </div>
                <Button type="button" onClick={() => add(product)}>
                  Add
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>Ticket</CardDescription>
          <CardTitle className="text-3xl tabular-nums">{money(total, business.currency)}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {cart.length === 0 ? <p className="text-sm text-muted-foreground">No lines yet.</p> : null}
          {cart.map((line) => (
            <div key={line.productId} className="flex items-center justify-between gap-2">
              <div>
                <div className="font-medium">{line.name}</div>
                <div className="text-sm text-muted-foreground">{money(line.price, business.currency)} each</div>
              </div>
              <Input
                className="w-20"
                type="number"
                min="1"
                max={line.onHand}
                step="1"
                value={line.quantity}
                onChange={(event) => {
                  const next = Math.min(line.onHand, Math.max(1, Number(event.target.value) || 1))
                  setCart((current) =>
                    current.map((item) =>
                      item.productId === line.productId ? { ...item, quantity: next } : item,
                    ),
                  )
                }}
              />
            </div>
          ))}
          {message ? <p className="text-sm">{message}</p> : null}
          <Button type="button" disabled={pending || cart.length === 0} onClick={charge}>
            {pending ? "Charging…" : "Charge"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
