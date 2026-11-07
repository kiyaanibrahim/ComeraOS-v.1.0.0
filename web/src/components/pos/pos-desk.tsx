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
import { Textarea } from "@/components/ui/textarea"
import { money, quantity } from "@/lib/flow/format"
import { callRpc } from "@/lib/flow/rpc"
import type { BusinessRecord, FlowClient } from "@/lib/flow/use-business"
import { cn } from "@/lib/utils"

type ProductRow = {
  id: string
  sku: string
  name: string
  price: number
  status: string
}

type Balance = { product_id: string; location_id: string; quantity: number }
type LocationRow = { id: string; name: string; kind: string }
type RegisterRow = {
  id: string
  name: string
  location_id: string
  warehouse_id: string
  status: string
}
type SessionRow = {
  id: string
  register_id: string
  opening_cash: number
  opened_at: string
  status: string
}
type PaymentRow = { method: string; amount: number; status: string }
type CartLine = { productId: string; name: string; price: number; quantity: number; onHand: number }
type PayMethod = "cash" | "card" | "bank_transfer"
type DeskMode = "sell" | "open" | "close"

const DENOMS = [100, 50, 20, 10, 5, 1, 0.5, 0.25, 0.1, 0.05, 0.01] as const
const PAY_METHODS: { id: PayMethod; label: string }[] = [
  { id: "bank_transfer", label: "Bank transfer" },
  { id: "cash", label: "Cash" },
  { id: "card", label: "Card" },
]

function emptyCount(): Record<string, number> {
  return Object.fromEntries(DENOMS.map((value) => [String(value), 0]))
}

function countTotal(count: Record<string, number>) {
  return DENOMS.reduce((sum, value) => sum + value * (Number(count[String(value)]) || 0), 0)
}

function countPayload(count: Record<string, number>) {
  const payload: Record<string, number> = {}
  for (const value of DENOMS) {
    const qty = Number(count[String(value)]) || 0
    if (qty > 0) payload[String(value)] = qty
  }
  return payload
}

export function PosDesk({ businessKey }: { businessKey: string }) {
  return (
    <FlowFrame
      businessKey={businessKey}
      title="POS"
      description="Open a register, sell from its warehouse, then close with a cash count."
    >
      {({ business, supabase }) => <Desk business={business} supabase={supabase} />}
    </FlowFrame>
  )
}

function Desk({ business, supabase }: { business: BusinessRecord; supabase: FlowClient }) {
  const [products, setProducts] = useState<ProductRow[]>([])
  const [balances, setBalances] = useState<Balance[]>([])
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [registers, setRegisters] = useState<RegisterRow[]>([])
  const [session, setSession] = useState<SessionRow | null>(null)
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [registerId, setRegisterId] = useState("")
  const [adding, setAdding] = useState(false)
  const [registerName, setRegisterName] = useState("")
  const [storeId, setStoreId] = useState("")
  const [warehouseId, setWarehouseId] = useState("")
  const [mode, setMode] = useState<DeskMode>("sell")
  const [cashCount, setCashCount] = useState(emptyCount)
  const [search, setSearch] = useState("")
  const [cart, setCart] = useState<CartLine[]>([])
  const [notes, setNotes] = useState("")
  const [method, setMethod] = useState<PayMethod>("card")
  const [tendered, setTendered] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [productRes, balanceRes, locationRes, registerRes] = await Promise.all([
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
      supabase
        .from("registers")
        .select("id, name, location_id, warehouse_id, status")
        .eq("business_id", business.id)
        .eq("status", "active")
        .order("name"),
    ])
    const error = productRes.error || balanceRes.error || locationRes.error || registerRes.error
    if (error) setMessage(error.message)

    const places = locationRes.data ?? []
    const tills = (registerRes.data ?? []).filter(
      (row): row is RegisterRow => Boolean(row.location_id && row.warehouse_id),
    )
    setProducts(productRes.data ?? [])
    setBalances(balanceRes.data ?? [])
    setLocations(places)
    setRegisters(tills)
    setStoreId(
      (current) =>
        current || places.find((place) => place.kind === "store" || place.kind === "site")?.id || "",
    )
    setWarehouseId((current) => current || places.find((place) => place.kind === "warehouse")?.id || "")

    const nextRegisterId =
      registerId && tills.some((row) => row.id === registerId) ? registerId : tills[0]?.id || ""
    setRegisterId(nextRegisterId)

    if (!nextRegisterId) {
      setSession(null)
      setPayments([])
      return
    }

    const sessionRes = await supabase
      .from("register_sessions")
      .select("id, register_id, opening_cash, opened_at, status")
      .eq("business_id", business.id)
      .eq("register_id", nextRegisterId)
      .eq("status", "open")
      .maybeSingle()
    if (sessionRes.error) setMessage(sessionRes.error.message)
    const open = sessionRes.data
    setSession(
      open
        ? {
            id: open.id,
            register_id: open.register_id,
            opening_cash: Number(open.opening_cash),
            opened_at: open.opened_at,
            status: open.status,
          }
        : null,
    )

    if (open) {
      const paymentRes = await supabase
        .from("payments")
        .select("method, amount, status")
        .eq("business_id", business.id)
        .eq("register_session_id", open.id)
      if (paymentRes.error) setMessage(paymentRes.error.message)
      setPayments(paymentRes.data ?? [])
      setMode((current) => (current === "open" ? "sell" : current))
    } else {
      setPayments([])
      setMode((current) => (current === "close" ? "sell" : current))
    }
  }, [business.id, registerId, supabase])

  useEffect(() => {
    void load()
  }, [load])

  const selected = registers.find((row) => row.id === registerId) ?? null
  const placeName = useMemo(() => {
    const map = new Map(locations.map((location) => [location.id, location.name]))
    return (id: string) => map.get(id) ?? "Location"
  }, [locations])
  const stores = locations.filter((location) => location.kind === "store" || location.kind === "site")
  const warehouses = locations.filter((location) => location.kind === "warehouse")
  const storeItems = Object.fromEntries(stores.map((location) => [location.id, location.name]))
  const warehouseItems = Object.fromEntries(warehouses.map((location) => [location.id, location.name]))
  const registerItems = Object.fromEntries(
    registers.map((row) => [row.id, `${row.name} · ${placeName(row.location_id)}`]),
  )

  const stock = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of balances) {
      if (row.location_id === selected?.warehouse_id) map.set(row.product_id, Number(row.quantity))
    }
    return map
  }, [balances, selected?.warehouse_id])

  const query = search.trim().toLowerCase()
  const sellable = products.filter((product) => {
    if ((stock.get(product.id) ?? 0) <= 0) return false
    if (!query) return true
    return product.name.toLowerCase().includes(query) || product.sku.toLowerCase().includes(query)
  })

  const total = cart.reduce((sum, line) => sum + line.price * line.quantity, 0)
  const cashReceived = Number(tendered) || 0
  const changeDue = method === "cash" ? Math.max(0, cashReceived - total) : 0
  const counted = countTotal(cashCount)

  const sessionTotals = useMemo(() => {
    const succeeded = payments.filter((row) => row.status === "succeeded")
    const by = (want: PayMethod) =>
      succeeded.filter((row) => row.method === want).reduce((sum, row) => sum + Number(row.amount), 0)
    const cashSales = by("cash")
    const opening = session?.opening_cash ?? 0
    return {
      cashSales,
      cardSales: by("card"),
      bankSales: by("bank_transfer"),
      saleCount: succeeded.length,
      expectedCash: opening + cashSales,
    }
  }, [payments, session?.opening_cash])

  const registerOpen = Boolean(session)

  function chooseRegister(next: string) {
    setRegisterId(next)
    setCart([])
    setNotes("")
    setMessage(null)
    setMode("sell")
    setCashCount(emptyCount())
  }

  function add(product: ProductRow) {
    if (!registerOpen) return
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

  function setDenom(value: number, raw: string) {
    const qty = Math.max(0, Math.floor(Number(raw) || 0))
    setCashCount((current) => ({ ...current, [String(value)]: qty }))
  }

  async function saveRegister() {
    const name = registerName.trim()
    if (!name || !storeId || !warehouseId) return
    setSaving(true)
    setMessage(null)
    const { data, error } = await supabase
      .from("registers")
      .insert({
        business_id: business.id,
        name,
        location_id: storeId,
        warehouse_id: warehouseId,
      })
      .select("id")
      .single()
    setSaving(false)
    if (error) {
      setMessage(error.message)
      return
    }
    setRegisterName("")
    setAdding(false)
    setCart([])
    setRegisterId(data.id)
  }

  async function openRegister() {
    if (!selected) return
    setBusy(true)
    setMessage(null)
    try {
      await callRpc(supabase, "open_register_session", {
        p_business_id: business.id,
        p_register_id: selected.id,
        p_opening_cash: counted,
        p_opening_count: countPayload(cashCount),
      })
      setCashCount(emptyCount())
      setMode("sell")
      setMessage(`Register opened with ${money(counted, business.currency)} in the drawer.`)
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not open the register")
    } finally {
      setBusy(false)
    }
  }

  async function closeRegister() {
    if (!session) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await callRpc<{
        cash_difference: number
        expected_cash: number
        counted_cash: number
      }>(supabase, "close_register_session", {
        p_business_id: business.id,
        p_session_id: session.id,
        p_counted_cash: counted,
        p_closing_count: countPayload(cashCount),
      })
      setCashCount(emptyCount())
      setCart([])
      setNotes("")
      setMode("sell")
      const diff = Number(result.cash_difference)
      setMessage(
        `Register closed. Expected ${money(Number(result.expected_cash), business.currency)}, counted ${money(Number(result.counted_cash), business.currency)} (${diff === 0 ? "even" : money(diff, business.currency)}).`,
      )
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not close the register")
    } finally {
      setBusy(false)
    }
  }

  async function charge() {
    if (!selected || !registerOpen || cart.length === 0) return
    if (method === "cash" && cashReceived < total) {
      setMessage("Cash received is less than the total.")
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const sale = await callRpc<{ number: string; total: number; change: number; method: string }>(
        supabase,
        "complete_pos_sale",
        {
          p_business_id: business.id,
          p_register_id: selected.id,
          p_lines: cart.map((line) => ({ product_id: line.productId, quantity: line.quantity })),
          p_method: method,
          p_tendered: method === "cash" ? cashReceived : null,
          p_notes: notes.trim() || null,
        },
      )
      setCart([])
      setNotes("")
      setTendered("")
      const change = Number(sale.change)
      setMessage(
        change > 0
          ? `Sale ${sale.number} · ${money(Number(sale.total), business.currency)} · change ${money(change, business.currency)}`
          : `Sale ${sale.number} posted for ${money(Number(sale.total), business.currency)}.`,
      )
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not complete the sale")
    } finally {
      setBusy(false)
    }
  }

  const showForm = registers.length === 0 || adding

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Register</CardTitle>
                <CardDescription>
                  Belongs to a store and sells stock from the attached warehouse.
                </CardDescription>
              </div>
              {registerOpen && selected ? (
                <Button type="button" variant="outline" onClick={() => {
                  setCashCount(emptyCount())
                  setMode("close")
                }}>
                  Close register
                </Button>
              ) : null}
            </div>
            {registers.length > 0 ? (
              <Select value={registerId} items={registerItems} onValueChange={(value) => chooseRegister(value ?? "")}>
                <SelectTrigger className="w-full sm:w-80">
                  <SelectValue placeholder="Register" />
                </SelectTrigger>
                <SelectContent>
                  {registers.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name} · {placeName(row.location_id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {selected ? (
              <p className="text-sm text-muted-foreground">
                {placeName(selected.location_id)} · stock from {placeName(selected.warehouse_id)}
                {session
                  ? ` · open with ${money(session.opening_cash, business.currency)}`
                  : " · closed"}
              </p>
            ) : null}
            {registers.length > 0 && !adding ? (
              <Button type="button" variant="outline" className="w-fit" onClick={() => setAdding(true)}>
                Add register
              </Button>
            ) : null}
            {showForm ? (
              stores.length === 0 || warehouses.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Add a store and a warehouse before opening a register.
                </p>
              ) : (
                <div className="flex flex-col gap-3 rounded-lg border p-3">
                  <Input
                    placeholder="Register name"
                    value={registerName}
                    onChange={(event) => setRegisterName(event.target.value)}
                  />
                  <Select value={storeId} items={storeItems} onValueChange={(value) => setStoreId(value ?? "")}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Store" />
                    </SelectTrigger>
                    <SelectContent>
                      {stores.map((location) => (
                        <SelectItem key={location.id} value={location.id}>
                          {location.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={warehouseId}
                    items={warehouseItems}
                    onValueChange={(value) => setWarehouseId(value ?? "")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Warehouse" />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses.map((location) => (
                        <SelectItem key={location.id} value={location.id}>
                          {location.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      disabled={saving || !registerName.trim() || !storeId || !warehouseId}
                      onClick={() => void saveRegister()}
                    >
                      {saving ? "Saving…" : "Save register"}
                    </Button>
                    {registers.length > 0 ? (
                      <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                </div>
              )
            ) : null}
          </CardHeader>
        </Card>

        {!registerOpen && mode !== "open" ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
            Register closed. Open a register to begin selling.
          </div>
        ) : null}

        {registerOpen ? (
          <div className="grid gap-2 rounded-lg border px-4 py-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="text-muted-foreground">Opening</div>
              <div className="font-medium tabular-nums">{money(session?.opening_cash ?? 0, business.currency)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Cash sales</div>
              <div className="font-medium tabular-nums">{money(sessionTotals.cashSales, business.currency)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Card / bank</div>
              <div className="font-medium tabular-nums">
                {money(sessionTotals.cardSales + sessionTotals.bankSales, business.currency)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Expected cash</div>
              <div className="font-medium tabular-nums">{money(sessionTotals.expectedCash, business.currency)}</div>
            </div>
          </div>
        ) : null}

        {mode === "open" || mode === "close" ? (
          <CashCounter
            title={mode === "open" ? "Opening cash count" : "Closing cash count"}
            description={
              mode === "open"
                ? "Count the notes and coins already in the drawer."
                : "Count the cash left in the drawer, then close."
            }
            currency={business.currency}
            count={cashCount}
            total={counted}
            onChange={setDenom}
            breakdown={
              mode === "close" && session
                ? [
                    ["Opening cash", session.opening_cash],
                    ["Cash sales", sessionTotals.cashSales],
                    ["Expected cash", sessionTotals.expectedCash],
                    ["Counted cash", counted],
                    ["Over / short", counted - sessionTotals.expectedCash],
                    ["Card", sessionTotals.cardSales],
                    ["Bank transfer", sessionTotals.bankSales],
                    ["Sales", sessionTotals.saleCount],
                  ]
                : null
            }
            onCancel={() => {
              setCashCount(emptyCount())
              setMode("sell")
            }}
            actionLabel={mode === "open" ? (busy ? "Opening…" : "Open register") : busy ? "Closing…" : "Close register"}
            actionDisabled={busy || !selected}
            onAction={() => void (mode === "open" ? openRegister() : closeRegister())}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Catalog</CardTitle>
              <CardDescription>
                {registerOpen
                  ? "Search and add stock from the attached warehouse."
                  : "Open the register first, then sell."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Input
                placeholder="Search products…"
                value={search}
                disabled={!registerOpen}
                onChange={(event) => setSearch(event.target.value)}
              />
              {!selected ? (
                <p className="text-sm text-muted-foreground">Add a register to start.</p>
              ) : !registerOpen ? (
                <p className="text-sm text-muted-foreground">
                  Software is ready. Open the register to begin selling.
                </p>
              ) : sellable.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No stock in {placeName(selected.warehouse_id)}. Deliver a shipment there, then come back.
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
        )}
      </div>

      <Card className="h-fit">
        <CardHeader>
          <CardDescription>Current order</CardDescription>
          <CardTitle className="text-3xl tabular-nums">{money(total, business.currency)}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {cart.length === 0 ? (
            <p className="text-sm text-muted-foreground">Scan or tap items to build the cart.</p>
          ) : (
            cart.map((line) => (
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
                  disabled={!registerOpen}
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
            ))
          )}

          <Textarea
            placeholder="Notes"
            value={notes}
            disabled={!registerOpen}
            onChange={(event) => setNotes(event.target.value)}
          />

          <div className="space-y-2">
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Select payment method
            </div>
            <div className="grid grid-cols-3 gap-2">
              {PAY_METHODS.map((option) => (
                <Button
                  key={option.id}
                  type="button"
                  variant={method === option.id ? "default" : "outline"}
                  disabled={!registerOpen}
                  className={cn("h-auto px-2 py-2 text-xs whitespace-normal")}
                  onClick={() => setMethod(option.id)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          {method === "cash" && registerOpen ? (
            <div className="space-y-2">
              <Input
                type="number"
                min={total}
                step="0.01"
                placeholder="Cash received"
                value={tendered}
                onChange={(event) => setTendered(event.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                Change {money(changeDue, business.currency)}
              </p>
            </div>
          ) : null}

          <div className="space-y-1 border-t pt-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{money(total, business.currency)}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Total due</span>
              <span className="tabular-nums">{money(total, business.currency)}</span>
            </div>
          </div>

          {message ? <p className="text-sm">{message}</p> : null}

          {!registerOpen ? (
            <Button
              type="button"
              size="lg"
              disabled={!selected || mode === "open"}
              onClick={() => {
                setCashCount(emptyCount())
                setMode("open")
              }}
            >
              Open register to sell
            </Button>
          ) : (
            <Button
              type="button"
              size="lg"
              disabled={
                busy ||
                cart.length === 0 ||
                mode !== "sell" ||
                (method === "cash" && cashReceived < total)
              }
              onClick={() => void charge()}
            >
              {busy ? "Charging…" : "Charge"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function CashCounter({
  title,
  description,
  currency,
  count,
  total,
  onChange,
  breakdown,
  onCancel,
  actionLabel,
  actionDisabled,
  onAction,
}: {
  title: string
  description: string
  currency: string
  count: Record<string, number>
  total: number
  onChange: (value: number, raw: string) => void
  breakdown: [string, number][] | null
  onCancel: () => void
  actionLabel: string
  actionDisabled: boolean
  onAction: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {DENOMS.map((value) => (
            <div key={value} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <div className="text-sm font-medium tabular-nums">{money(value, currency)}</div>
              <Input
                className="w-24"
                type="number"
                min="0"
                step="1"
                value={count[String(value)] || 0}
                onChange={(event) => onChange(value, event.target.value)}
              />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between rounded-lg border px-3 py-3">
          <span className="text-sm text-muted-foreground">Counted total</span>
          <span className="text-xl font-medium tabular-nums">{money(total, currency)}</span>
        </div>
        {breakdown ? (
          <div className="space-y-2 rounded-lg border p-3 text-sm">
            {breakdown.map(([label, amount]) => (
              <div key={label} className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{label}</span>
                <span className="tabular-nums">
                  {label === "Sales" ? amount : money(amount, currency)}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        <div className="flex gap-2">
          <Button type="button" disabled={actionDisabled} onClick={onAction}>
            {actionLabel}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
