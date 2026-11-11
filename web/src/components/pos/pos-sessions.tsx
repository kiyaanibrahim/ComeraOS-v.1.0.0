"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"

import { PosScreen, statusVariant } from "@/components/pos/pos-screen"
import { DataTable } from "@/components/data-table/data-table"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import type { DataTableFeatures } from "@/components/data-table/data-table-features"
import { Badge } from "@/components/ui/badge"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "@/components/ui/sonner"
import { money } from "@/lib/flow/format"
import { callRpc } from "@/lib/flow/rpc"
import type { BusinessRecord, FlowClient } from "@/lib/flow/use-business"

type SessionRow = {
  id: string
  register_id: string
  opened_at: string
  opened_by: string | null
  closed_at: string | null
  status: string
  opening_cash: number
  expected_cash: number | null
  counted_cash: number | null
  cash_difference: number | null
}
type SaleRow = { id: string; number: string; total: number; status: string }
type RegisterRow = { id: string; name: string; location_id: string }
type LocationRow = { id: string; name: string }
type PaymentRow = { register_session_id: string | null; method: string; amount: number; status: string }
type Person = { id: string; display_name: string; email: string | null }
type AuditRow = { entity_id: string | null; actor_id: string | null }

type View = {
  id: string
  shortId: string
  location: string
  register: string
  openedBy: string
  closedBy: string
  openedAt: string
  closedAt: string
  duration: string
  sales: number
  cash: number
  bank: number
  card: number
  status: string
  opening: number
  expected: number | null
  counted: number | null
  difference: number | null
}

const statusItems = { all: "All sessions", open: "Open", closed: "Closed" }

function shortId(id: string) {
  return id.replaceAll("-", "").slice(0, 6).toUpperCase()
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

function duration(opened: string, closed: string | null) {
  if (!closed) return "In progress"
  const mins = Math.max(0, Math.round((new Date(closed).getTime() - new Date(opened).getTime()) / 60000))
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  const rest = mins % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

function personLabel(people: Map<string, Person>, id: string | null) {
  if (!id) return "—"
  const person = people.get(id)
  if (!person) return "—"
  return person.email || person.display_name || "—"
}

export function PosSessions({ businessKey }: { businessKey: string }) {
  return (
    <PosScreen
      businessKey={businessKey}
      title="Register Sessions"
      description="Audit trail for register open and close activity."
    >
      {({ business, supabase }) => <Sessions business={business} supabase={supabase} />}
    </PosScreen>
  )
}

function Sessions({ business, supabase }: { business: BusinessRecord; supabase: FlowClient }) {
  const [rows, setRows] = useState<View[]>([])
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("all")
  const [appliedQuery, setAppliedQuery] = useState("")
  const [appliedStatus, setAppliedStatus] = useState("all")
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState<View | null>(null)
  const [sales, setSales] = useState<SaleRow[]>([])
  const [voiding, setVoiding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const sessionRes = await supabase
      .from("register_sessions")
      .select("id, register_id, opened_at, opened_by, closed_at, status, opening_cash, expected_cash, counted_cash, cash_difference")
      .eq("business_id", business.id)
      .order("opened_at", { ascending: false })
      .limit(200)
    if (sessionRes.error) {
      toast.error(sessionRes.error.message)
      setLoading(false)
      return
    }
    const sessions = (sessionRes.data ?? []) as SessionRow[]
    const registerIds = [...new Set(sessions.map((row) => row.register_id))]
    const sessionIds = sessions.map((row) => row.id)
    const [registerRes, paymentRes, auditRes] = await Promise.all([
      registerIds.length
        ? supabase.from("registers").select("id, name, location_id").eq("business_id", business.id).in("id", registerIds)
        : Promise.resolve({ data: [], error: null }),
      sessionIds.length
        ? supabase
            .from("payments")
            .select("register_session_id, method, amount, status")
            .eq("business_id", business.id)
            .in("register_session_id", sessionIds)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("audit_events")
        .select("entity_id, actor_id")
        .eq("business_id", business.id)
        .eq("action", "pos.register.close")
        .eq("entity", "register_sessions")
        .order("created_at", { ascending: false })
        .limit(200),
    ])
    const error = registerRes.error || paymentRes.error || auditRes.error
    if (error) toast.error(error.message)

    const registers = (registerRes.data ?? []) as RegisterRow[]
    const locationIds = [...new Set(registers.map((row) => row.location_id))]
    const audits = (auditRes.data ?? []) as AuditRow[]
    const peopleIds = [
      ...new Set(
        [...sessions.map((row) => row.opened_by), ...audits.map((row) => row.actor_id)].filter((id): id is string => Boolean(id)),
      ),
    ]
    const [locationRes, profileRes] = await Promise.all([
      locationIds.length
        ? supabase.from("locations").select("id, name").eq("business_id", business.id).in("id", locationIds)
        : Promise.resolve({ data: [], error: null }),
      peopleIds.length
        ? supabase.from("profiles").select("id, display_name, email").in("id", peopleIds)
        : Promise.resolve({ data: [], error: null }),
    ])
    if (locationRes.error || profileRes.error) toast.error(locationRes.error?.message ?? profileRes.error?.message ?? "Couldn't load register sessions.")
    const people = new Map(((profileRes.data ?? []) as Person[]).map((person) => [person.id, person]))
    const closedBy = new Map<string, string | null>()
    for (const audit of audits) {
      if (audit.entity_id && !closedBy.has(audit.entity_id)) closedBy.set(audit.entity_id, audit.actor_id)
    }
    const registerMap = new Map(registers.map((row) => [row.id, row]))
    const locationMap = new Map(((locationRes.data ?? []) as LocationRow[]).map((row) => [row.id, row.name]))
    const splits = new Map<string, { cash: number; bank: number; card: number }>()
    for (const payment of (paymentRes.data ?? []) as PaymentRow[]) {
      if (!payment.register_session_id || payment.status !== "succeeded") continue
      const current = splits.get(payment.register_session_id) ?? { cash: 0, bank: 0, card: 0 }
      const amount = Number(payment.amount)
      if (payment.method === "cash") current.cash += amount
      else if (payment.method === "bank_transfer") current.bank += amount
      else if (payment.method === "card") current.card += amount
      splits.set(payment.register_session_id, current)
    }

    setRows(
      sessions.map((session) => {
        const register = registerMap.get(session.register_id)
        const split = splits.get(session.id) ?? { cash: 0, bank: 0, card: 0 }
        return {
          id: session.id,
          shortId: shortId(session.id),
          location: register ? locationMap.get(register.location_id) ?? "—" : "—",
          register: register?.name ?? "Register",
          openedBy: personLabel(people, session.opened_by),
          closedBy: personLabel(people, closedBy.get(session.id) ?? null),
          openedAt: stamp(session.opened_at),
          closedAt: stamp(session.closed_at),
          duration: duration(session.opened_at, session.closed_at),
          sales: split.cash + split.bank + split.card,
          cash: split.cash,
          bank: split.bank,
          card: split.card,
          status: session.status,
          opening: Number(session.opening_cash),
          expected: session.expected_cash === null ? null : Number(session.expected_cash),
          counted: session.counted_cash === null ? null : Number(session.counted_cash),
          difference: session.cash_difference === null ? null : Number(session.cash_difference),
        }
      }),
    )
    setLoading(false)
  }, [business.id, supabase])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(() => {
    const needle = appliedQuery.trim().toLowerCase()
    return rows.filter((row) => {
      if (appliedStatus !== "all" && row.status !== appliedStatus) return false
      if (!needle) return true
      return [row.shortId, row.location, row.register, row.openedBy, row.closedBy, row.status]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    })
  }, [appliedQuery, appliedStatus, rows])

  const totals = visible.reduce(
    (sum, row) => ({
      sales: sum.sales + row.sales,
      cash: sum.cash + row.cash,
      bank: sum.bank + row.bank,
      card: sum.card + row.card,
    }),
    { sales: 0, cash: 0, bank: 0, card: 0 },
  )
  async function openSession(row: View) {
    setActive(row)
    const saleRes = await supabase
      .from("orders")
      .select("id, number, total, status")
      .eq("business_id", business.id)
      .eq("register_session_id", row.id)
      .eq("source", "pos")
      .order("created_at", { ascending: true })
    if (saleRes.error) toast.error(saleRes.error.message)
    setSales((saleRes.data ?? []) as SaleRow[])
  }

  async function voidSale(orderId: string) {
    if (!active) return
    setVoiding(true)
    try {
      await callRpc(supabase, "void_pos_sale", { p_business_id: business.id, p_order_id: orderId })
      toast.success("Sale voided and stock restored.")
      await openSession(active)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not void the sale")
    } finally {
      setVoiding(false)
    }
  }

  const columns = useMemo<ColumnDef<DataTableFeatures, View>[]>(
    () => [
      { accessorKey: "shortId", header: ({ column }) => <DataTableColumnHeader column={column} title="Session" />, cell: ({ row }) => <span className="font-medium">{row.original.shortId}</span> },
      { accessorKey: "location", header: ({ column }) => <DataTableColumnHeader column={column} title="Location" /> },
      { accessorKey: "register", header: ({ column }) => <DataTableColumnHeader column={column} title="Register" /> },
      { accessorKey: "openedBy", header: ({ column }) => <DataTableColumnHeader column={column} title="Opened by" /> },
      { accessorKey: "closedBy", header: ({ column }) => <DataTableColumnHeader column={column} title="Closed by" /> },
      { accessorKey: "openedAt", header: ({ column }) => <DataTableColumnHeader column={column} title="Open time" /> },
      { accessorKey: "closedAt", header: ({ column }) => <DataTableColumnHeader column={column} title="Close time" /> },
      { accessorKey: "duration", header: ({ column }) => <DataTableColumnHeader column={column} title="Duration" /> },
      { accessorKey: "sales", header: ({ column }) => <DataTableColumnHeader column={column} title="Total sales" />, cell: ({ row }) => <div className="text-right tabular-nums">{money(row.original.sales, business.currency)}</div> },
      { accessorKey: "cash", header: ({ column }) => <DataTableColumnHeader column={column} title="Cash" />, cell: ({ row }) => <div className="text-right tabular-nums">{money(row.original.cash, business.currency)}</div> },
      { accessorKey: "bank", header: ({ column }) => <DataTableColumnHeader column={column} title="Bank" />, cell: ({ row }) => <div className="text-right tabular-nums">{money(row.original.bank, business.currency)}</div> },
      { accessorKey: "card", header: ({ column }) => <DataTableColumnHeader column={column} title="Card" />, cell: ({ row }) => <div className="text-right tabular-nums">{money(row.original.card, business.currency)}</div> },
      { accessorKey: "expected", header: ({ column }) => <DataTableColumnHeader column={column} title="Expected" />, cell: ({ row }) => <div className="text-right tabular-nums">{row.original.expected === null ? "—" : money(row.original.expected, business.currency)}</div> },
      { accessorKey: "counted", header: ({ column }) => <DataTableColumnHeader column={column} title="Counted" />, cell: ({ row }) => <div className="text-right tabular-nums">{row.original.counted === null ? "—" : money(row.original.counted, business.currency)}</div> },
      { accessorKey: "difference", header: ({ column }) => <DataTableColumnHeader column={column} title="Over / short" />, cell: ({ row }) => <div className="text-right tabular-nums">{row.original.difference === null ? "—" : row.original.difference === 0 ? "Even" : money(row.original.difference, business.currency)}</div> },
      { accessorKey: "status", header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />, cell: ({ row }) => <Badge variant={statusVariant(row.original.status)}>{row.original.status}</Badge> },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <Button type="button" size="sm" variant="outline" onClick={() => void openSession(row.original)}>
            Bills
          </Button>
        ),
      },
    ],
    [business.currency],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="w-full sm:max-w-xs"
          placeholder="Search by session or opener…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Select value={status} items={statusItems} onValueChange={(value) => setStatus(value ?? "all")}>
          <SelectTrigger className="w-full sm:w-44">
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
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setAppliedQuery(query)
            setAppliedStatus(status)
          }}
        >
          Apply
        </Button>
        <Button type="button" variant="ghost" className="sm:ml-auto" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Sessions", String(visible.length)],
          ["Total sales", money(totals.sales, business.currency)],
          ["Cash", money(totals.cash, business.currency)],
          ["Bank", money(totals.bank, business.currency)],
          ["Card", money(totals.card, business.currency)],
        ].map(([label, value]) => (
          <Card key={label} className="py-4">
            <CardContent className="px-4">
              <div className="text-xs tracking-wide text-muted-foreground uppercase">{label}</div>
              <div className="mt-1 text-lg font-medium tabular-nums">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="px-0">
          {loading ? (
            <div className="mx-4 h-40 animate-pulse rounded-xl bg-muted" />
          ) : visible.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No register sessions</EmptyTitle>
                <EmptyDescription>Open a register to start a session.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <DataTable columns={columns} data={visible} empty="No register sessions" getRowId={(row) => row.id} />
          )}
        </CardContent>
      </Card>
      <Dialog open={active !== null} onOpenChange={(open) => { if (!open) setActive(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Session {active?.shortId}</DialogTitle>
            <DialogDescription>
              {active?.status === "open" ? "Void a completed sale while this session is open." : "This session is closed. Return bills from Bill History."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex max-h-80 flex-col gap-2 overflow-auto text-sm">
            {sales.length === 0 ? <p className="text-muted-foreground">No counter sales in this session.</p> : null}
            {sales.map((sale) => (
              <div key={sale.id} className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{sale.number}</p>
                  <p className="text-muted-foreground capitalize">{sale.status}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums">{money(Number(sale.total), business.currency)}</span>
                  {active?.status === "open" && sale.status === "completed" ? (
                    <Button type="button" size="sm" variant="outline" disabled={voiding} onClick={() => void voidSale(sale.id)}>
                      Void
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
