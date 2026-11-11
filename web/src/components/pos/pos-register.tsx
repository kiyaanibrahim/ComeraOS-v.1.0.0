"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

import { CashCounter, countPayload, countTotal, emptyCount } from "@/components/pos/pos-cash"
import { PosScreen, statusVariant } from "@/components/pos/pos-screen"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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

type LocationRow = {
  id: string
  name: string
  kind: string
  fulfillment_warehouse_id: string | null
  is_active: boolean
}
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
type CountMode = "idle" | "open" | "close"
type CloseSummary = {
  opening_cash: number
  cash_sales: number
  card_sales: number
  bank_transfer_sales: number
  sale_count: number
  expected_cash: number
  counted_cash: number
  cash_difference: number
}

export function PosRegister({ businessKey }: { businessKey: string }) {
  return (
    <PosScreen
      businessKey={businessKey}
      title="Register"
      description="Register allocation and open/close control."
      action={
        <Button nativeButton={false} variant="outline" render={<Link href={`/app/${businessKey}/pos`} />}>
          Go to Sell
        </Button>
      }
    >
      {({ business, supabase }) => <RegisterDesk business={business} supabase={supabase} />}
    </PosScreen>
  )
}

function RegisterDesk({ business, supabase }: { business: BusinessRecord; supabase: FlowClient }) {
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [registers, setRegisters] = useState<RegisterRow[]>([])
  const [session, setSession] = useState<SessionRow | null>(null)
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [registerId, setRegisterId] = useState("")
  const [adding, setAdding] = useState(false)
  const [registerName, setRegisterName] = useState("")
  const [storeId, setStoreId] = useState("")
  const [mode, setMode] = useState<CountMode>("idle")
  const [summary, setSummary] = useState<CloseSummary | null>(null)
  const [cashCount, setCashCount] = useState(emptyCount)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [locationRes, registerRes] = await Promise.all([
      supabase
        .from("locations")
        .select("id, name, kind, fulfillment_warehouse_id, is_active")
        .eq("business_id", business.id)
        .order("name"),
      supabase
        .from("registers")
        .select("id, name, location_id, warehouse_id, status")
        .eq("business_id", business.id)
        .eq("status", "active")
        .order("name"),
    ])
    const error = locationRes.error || registerRes.error
    if (error) toast.error(error.message)

    const places = locationRes.data ?? []
    const tills = (registerRes.data ?? []).filter(
      (row): row is RegisterRow => Boolean(row.location_id && row.warehouse_id),
    )
    setLocations(places)
    setRegisters(tills)
    setStoreId(
      (current) =>
        current ||
        places.find((place) => (place.kind === "store" || place.kind === "site") && place.fulfillment_warehouse_id)?.id ||
        "",
    )

    const nextRegisterId = registerId && tills.some((row) => row.id === registerId) ? registerId : tills[0]?.id || ""
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
    if (sessionRes.error) toast.error(sessionRes.error.message)
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
    if (!open) {
      setPayments([])
      return
    }
    const paymentRes = await supabase
      .from("payments")
      .select("method, amount, status")
      .eq("business_id", business.id)
      .eq("register_session_id", open.id)
    if (paymentRes.error) toast.error(paymentRes.error.message)
    setPayments(paymentRes.data ?? [])
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
  const storeItems = Object.fromEntries(stores.map((location) => [location.id, location.name]))
  const selectedStore = stores.find((location) => location.id === storeId) ?? null
  const warehouseId = selectedStore?.fulfillment_warehouse_id ?? ""
  const registerItems = Object.fromEntries(registers.map((row) => [row.id, `${row.name} · ${placeName(row.location_id)}`]))
  const counted = countTotal(cashCount)
  const sessionTotals = useMemo(() => {
    const succeeded = payments.filter((row) => row.status === "succeeded")
    const by = (want: string) => succeeded.filter((row) => row.method === want).reduce((sum, row) => sum + Number(row.amount), 0)
    const cashSales = by("cash")
    return {
      cashSales,
      cardSales: by("card"),
      bankSales: by("bank_transfer"),
      saleCount: succeeded.length,
      expectedCash: (session?.opening_cash ?? 0) + cashSales,
    }
  }, [payments, session?.opening_cash])
  const registerOpen = Boolean(session)
  const showForm = registers.length === 0 || adding

  function setDenom(value: number, raw: string) {
    const qty = Math.max(0, Math.floor(Number(raw) || 0))
    setCashCount((current) => ({ ...current, [String(value)]: qty }))
  }

  async function saveRegister() {
    const name = registerName.trim()
    if (!name || !storeId || !warehouseId) return
    setSaving(true)
    const { data, error } = await supabase
      .from("registers")
      .insert({ business_id: business.id, name, location_id: storeId, warehouse_id: warehouseId })
      .select("id")
      .single()
    setSaving(false)
    if (error || !data) {
      toast.error(error?.message ?? "Could not save the register")
      return
    }
    setRegisterName("")
    setAdding(false)
    setRegisterId(data.id)
    toast.success("Register saved.")
  }

  async function openRegister() {
    if (!selected) return
    setBusy(true)
    try {
      await callRpc(supabase, "open_register_session", {
        p_business_id: business.id,
        p_register_id: selected.id,
        p_opening_cash: counted,
        p_opening_count: countPayload(cashCount),
      })
      setCashCount(emptyCount())
      setMode("idle")
      toast.success(`Register opened with ${money(counted, business.currency)} in the drawer.`)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open the register")
    } finally {
      setBusy(false)
    }
  }

  async function closeRegister() {
    if (!session) return
    setBusy(true)
    try {
      const result = await callRpc<CloseSummary>(
        supabase,
        "close_register_session",
        {
          p_business_id: business.id,
          p_session_id: session.id,
          p_counted_cash: counted,
          p_closing_count: countPayload(cashCount),
        },
      )
      setCashCount(emptyCount())
      setMode("idle")
      setSummary({
        opening_cash: Number(result.opening_cash),
        cash_sales: Number(result.cash_sales),
        card_sales: Number(result.card_sales),
        bank_transfer_sales: Number(result.bank_transfer_sales),
        sale_count: Number(result.sale_count),
        expected_cash: Number(result.expected_cash),
        counted_cash: Number(result.counted_cash),
        cash_difference: Number(result.cash_difference),
      })
      const diff = Number(result.cash_difference)
      toast.success(
        `Register closed. Expected ${money(Number(result.expected_cash), business.currency)}, counted ${money(Number(result.counted_cash), business.currency)} (${diff === 0 ? "even" : money(diff, business.currency)}).`,
      )
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not close the register")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      {summary ? (
        <Card>
          <CardHeader>
            <CardTitle>Close summary</CardTitle>
            <CardDescription>
              {summary.sale_count} sale{summary.sale_count === 1 ? "" : "s"}. Expected {money(summary.expected_cash, business.currency)}, counted {money(summary.counted_cash, business.currency)}.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Opening cash</span><span className="tabular-nums">{money(summary.opening_cash, business.currency)}</span></div>
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Cash sales</span><span className="tabular-nums">{money(summary.cash_sales, business.currency)}</span></div>
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Card sales</span><span className="tabular-nums">{money(summary.card_sales, business.currency)}</span></div>
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Bank transfer</span><span className="tabular-nums">{money(summary.bank_transfer_sales, business.currency)}</span></div>
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Expected</span><span className="tabular-nums">{money(summary.expected_cash, business.currency)}</span></div>
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">Counted</span><span className="tabular-nums">{money(summary.counted_cash, business.currency)}</span></div>
            <div className="flex justify-between gap-3 sm:col-span-2">
              <span className="text-muted-foreground">Over / short</span>
              <span className="tabular-nums">{summary.cash_difference === 0 ? "Even" : money(summary.cash_difference, business.currency)}</span>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader className="gap-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Current state</CardTitle>
              <CardDescription>
                {selected
                  ? `${selected.name} · ${placeName(selected.location_id)} · stock from ${placeName(selected.warehouse_id)}`
                  : "No register yet."}
              </CardDescription>
            </div>
            <Badge variant={registerOpen ? statusVariant("open") : statusVariant("closed")}>
              {registerOpen ? "Open" : "Closed"}
            </Badge>
          </div>
          {registers.length > 0 ? (
            <Select
              value={registerId}
              items={registerItems}
              onValueChange={(value) => {
                setRegisterId(value ?? "")
                setMode("idle")
                setCashCount(emptyCount())
              }}
            >
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
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {registerOpen
              ? `Open with ${money(session?.opening_cash ?? 0, business.currency)}. Expected cash is ${money(sessionTotals.expectedCash, business.currency)}.`
              : "Sell is locked until you open an on-site location register."}
          </p>
          {selected && mode === "idle" ? (
            <Button
              type="button"
              className="w-fit"
              onClick={() => {
                setCashCount(emptyCount())
                setMode(registerOpen ? "close" : "open")
              }}
            >
              {registerOpen ? "Close register" : "Open register"}
            </Button>
          ) : null}
          {registers.length > 0 && !adding ? (
            <Button type="button" variant="outline" className="w-fit" onClick={() => setAdding(true)}>
              Add register
            </Button>
          ) : null}
          {showForm ? (
            stores.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add a store and a warehouse in Locations before opening a register.</p>
            ) : (
              <div className="flex flex-col gap-3 rounded-lg border p-3">
                <Input placeholder="Register name" value={registerName} onChange={(event) => setRegisterName(event.target.value)} />
                <Select value={storeId} items={storeItems} onValueChange={(value) => setStoreId(value ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Store" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((location) => (
                      <SelectItem key={location.id} value={location.id}>
                        {location.name}
                        {location.fulfillment_warehouse_id ? "" : " · no warehouse"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  {warehouseId
                    ? `Stock comes from ${placeName(warehouseId)}.`
                    : "This store has no warehouse. Link one in Locations before it can sell."}
                </p>
                <div className="flex gap-2">
                  <Button type="button" disabled={saving || !registerName.trim() || !storeId || !warehouseId} onClick={() => void saveRegister()}>
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
        </CardContent>
      </Card>

      {mode === "open" || mode === "close" ? (
        <CashCounter
          title={mode === "open" ? "Opening cash count" : "Closing cash count"}
          description={
            mode === "open" ? "Count the notes and coins already in the drawer." : "Count the cash left in the drawer, then close."
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
            setMode("idle")
          }}
          actionLabel={mode === "open" ? (busy ? "Opening…" : "Open register") : busy ? "Closing…" : "Close register"}
          actionDisabled={busy || !selected}
          onAction={() => void (mode === "open" ? openRegister() : closeRegister())}
        />
      ) : null}
    </div>
  )
}
