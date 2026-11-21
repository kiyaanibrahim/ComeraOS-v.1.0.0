"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

import { CashCounter, countPayload, countTotal, emptyCount } from "@/components/pos/pos-cash"
import { PosScreen, statusVariant } from "@/components/pos/pos-screen"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
  opened_by: string | null
  status: string
}

function openDuration(opened: string, now: number) {
  const mins = Math.max(0, Math.round((now - new Date(opened).getTime()) / 60000))
  if (mins < 1) return "less than a minute"
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  const rest = mins % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

function businessZone(timeZone: string) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone })
    return timeZone
  } catch {
    return "UTC"
  }
}

function openedClock(opened: string, timeZone: string) {
  return new Date(opened).toLocaleString("en-US", {
    timeZone: businessZone(timeZone),
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
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
      description="Open and close the register."
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
  const [opener, setOpener] = useState<string | null>(null)
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [now, setNow] = useState(() => Date.now())
  const [registerId, setRegisterId] = useState("")
  const [mode, setMode] = useState<CountMode>("idle")
  const [summary, setSummary] = useState<CloseSummary | null>(null)
  const [cashCount, setCashCount] = useState(() => emptyCount(business.currency))
  const [userId, setUserId] = useState<string | null>(null)
  const [cashMoveNet, setCashMoveNet] = useState(0)
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

    const nextRegisterId = registerId && tills.some((row) => row.id === registerId) ? registerId : tills[0]?.id || ""
    setRegisterId(nextRegisterId)
    if (!nextRegisterId) {
      setSession(null)
      setOpener(null)
      setPayments([])
      return
    }

    const [{ data: auth }, sessionRes] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from("register_sessions")
        .select("id, register_id, opening_cash, opened_at, opened_by, status")
        .eq("business_id", business.id)
        .eq("status", "open"),
    ])
    setUserId(auth.user?.id ?? null)
    if (sessionRes.error) toast.error(sessionRes.error.message)
    const mapped = (sessionRes.data ?? []).map((row) => ({
      id: row.id,
      register_id: row.register_id,
      opening_cash: Number(row.opening_cash),
      opened_at: row.opened_at,
      opened_by: row.opened_by,
      status: row.status,
    }))
    const open = mapped.find((row) => row.register_id === nextRegisterId) ?? null
    setSession(
      open
        ? {
            id: open.id,
            register_id: open.register_id,
            opening_cash: Number(open.opening_cash),
            opened_at: open.opened_at,
            opened_by: open.opened_by,
            status: open.status,
          }
        : null,
    )
    if (!open) {
      setOpener(null)
      setPayments([])
      setCashMoveNet(0)
      return
    }
    const [paymentRes, profileRes, moveRes] = await Promise.all([
      supabase
        .from("payments")
        .select("method, amount, status")
        .eq("business_id", business.id)
        .eq("register_session_id", open.id),
      open.opened_by
        ? supabase.from("profiles").select("display_name, email").eq("id", open.opened_by).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase.from("register_cash_moves").select("kind, amount").eq("business_id", business.id).eq("register_session_id", open.id),
    ])
    if (paymentRes.error) toast.error(paymentRes.error.message)
    if (profileRes.error) toast.error(profileRes.error.message)
    if (moveRes.error) toast.error(moveRes.error.message)
    setPayments(paymentRes.data ?? [])
    const net = (moveRes.data ?? []).reduce((sum, row) => sum + (row.kind === "in" ? Number(row.amount) : -Number(row.amount)), 0)
    setCashMoveNet(net)
    const person = profileRes.data
    setOpener(person?.display_name || person?.email || null)
  }, [business.id, registerId, supabase])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!session) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [session?.id])

  const selected = registers.find((row) => row.id === registerId) ?? null
  const placeName = useMemo(() => {
    const map = new Map(locations.map((location) => [location.id, location.name]))
    return (id: string) => map.get(id) ?? "Location"
  }, [locations])
  const counted = countTotal(cashCount, business.currency)
  const sessionTotals = useMemo(() => {
    const succeeded = payments.filter((row) => row.status === "succeeded")
    const by = (want: string) => succeeded.filter((row) => row.method === want).reduce((sum, row) => sum + Number(row.amount), 0)
    const cashSales = by("cash")
    return {
      cashSales,
      cardSales: by("card"),
      bankSales: by("bank_transfer"),
      saleCount: succeeded.length,
      expectedCash: (session?.opening_cash ?? 0) + cashSales + cashMoveNet,
    }
  }, [cashMoveNet, payments, session?.opening_cash])
  const registerOpen = Boolean(session)
  const heldByMe = Boolean(session && userId && session.opened_by === userId)
  const heldByOther = Boolean(session && userId && session.opened_by !== userId)

  function setDenom(value: number, raw: string) {
    const qty = Math.max(0, Math.floor(Number(raw) || 0))
    setCashCount((current) => ({ ...current, [String(value)]: qty }))
  }

  async function openRegister() {
    if (!selected) return
    setBusy(true)
    try {
      await callRpc(supabase, "open_register_session", {
        p_business_id: business.id,
        p_register_id: selected.id,
        p_opening_cash: counted,
        p_opening_count: countPayload(cashCount, business.currency),
      })
      setCashCount(emptyCount(business.currency))
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
          p_closing_count: countPayload(cashCount, business.currency),
        },
      )
      setCashCount(emptyCount(business.currency))
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

  async function forceClose() {
    if (!session) return
    setBusy(true)
    try {
      await callRpc(supabase, "force_close_register_session", {
        p_business_id: business.id,
        p_session_id: session.id,
      })
      toast.success("Register force closed.")
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not force close the register")
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
            <div className="grid gap-2">
              {registers.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => {
                      setRegisterId(row.id)
                      setMode("idle")
                      setCashCount(emptyCount(business.currency))
                    }}
                    className={`rounded-xl border px-3 py-3 text-left ${registerId === row.id ? "ring-2 ring-ring" : ""}`}
                  >
                    <span className="font-medium">{row.name}</span>
                    <p className="text-sm text-muted-foreground">{placeName(row.location_id)}</p>
                  </button>
                ))}
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {registerOpen && session ? (
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-2xl font-medium tabular-nums">{openDuration(session.opened_at, now)}</p>
                <p className="text-sm text-muted-foreground">
                  Since {openedClock(session.opened_at, business.timezone)}
                  {opener ? ` · ${opener}` : ""}
                </p>
              </div>
              {heldByOther ? (
                <p className="text-sm text-muted-foreground">Held by {opener ?? "another login"}. You can view this register.</p>
              ) : null}
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">Opening</dt>
                  <dd className="tabular-nums">{money(session.opening_cash, business.currency)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Expected cash</dt>
                  <dd className="tabular-nums">{money(sessionTotals.expectedCash, business.currency)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Sales</dt>
                  <dd className="tabular-nums">{sessionTotals.saleCount}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Cash</dt>
                  <dd className="tabular-nums">{money(sessionTotals.cashSales, business.currency)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Card</dt>
                  <dd className="tabular-nums">{money(sessionTotals.cardSales, business.currency)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Bank transfer</dt>
                  <dd className="tabular-nums">{money(sessionTotals.bankSales, business.currency)}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {registers.length === 0 ? (
                <>
                  No register yet.{" "}
                  <Link href={`/app/${business.slug}/settings/registers`} className="text-foreground underline">
                    Add one in Business settings.
                  </Link>
                </>
              ) : (
                "Sell is locked until you open a register."
              )}
            </p>
          )}
          {selected && mode === "idle" && !heldByOther ? (
            <Button
              type="button"
              className="w-full"
              onClick={() => {
                setCashCount(emptyCount(business.currency))
                setMode(registerOpen ? "close" : "open")
              }}
            >
              {registerOpen ? "Close register" : "Open register"}
            </Button>
          ) : null}
          {heldByMe && mode === "idle" ? (
            <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => void forceClose()}>
              Force close
            </Button>
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
            setCashCount(emptyCount(business.currency))
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
