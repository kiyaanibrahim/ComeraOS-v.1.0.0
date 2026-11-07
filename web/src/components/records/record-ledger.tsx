"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"

import { DatePicker } from "@/components/date-picker"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useBusiness, type FlowClient } from "@/lib/flow/use-business"

type LedgerRow = {
  id: string
  reference: string
  status: string
  amount: string
  when: string
}

const statuses = {
  all: "All statuses",
  open: "Open",
  closed: "Closed",
  draft: "Draft",
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format(value)
}

function day(value: string | null) {
  return value ? value.slice(0, 10) : ""
}

function showDay(value: string) {
  if (!value) return ""
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function showStatus(value: string) {
  return value.replaceAll("_", " ")
}

function bucket(status: string) {
  const value = status.toLowerCase()
  if (value === "draft") return "draft"
  if (
    ["completed", "paid", "delivered", "received", "approved", "won", "closed", "succeeded", "ok", "enabled"].includes(
      value,
    )
  ) {
    return "closed"
  }
  if (
    ["open", "issued", "sent", "pending", "in_transit", "submitted", "qualified", "proposal", "lead", "active", "trialing"].includes(
      value,
    )
  ) {
    return "open"
  }
  return "other"
}

function shape(
  rows: {
    id: string
    reference: string | null
    status: string | null
    amount: number | null
    when: string | null
  }[],
  currency: string,
): LedgerRow[] {
  return rows.map((row) => ({
    id: row.id,
    reference: row.reference || "Record",
    status: row.status || "open",
    amount: row.amount == null ? "—" : money(Number(row.amount), currency),
    when: day(row.when),
  }))
}

async function loadLedger(title: string, supabase: FlowClient, businessId: string | null, currency: string) {
  const business = businessId
  if (title === "Orders" && business) {
    const { data, error, count } = await supabase
      .from("orders")
      .select("id, number, status, total, created_at", { count: "exact" })
      .eq("business_id", business)
      .neq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(250)
    if (error) throw new Error(error.message)
    return {
      total: count ?? data?.length ?? 0,
      rows: shape(
        (data ?? []).map((row) => ({
          id: row.id,
          reference: row.number,
          status: row.status,
          amount: Number(row.total),
          when: row.created_at,
        })),
        currency,
      ),
    }
  }
  if (title === "Draft Orders" && business) {
    const { data, error, count } = await supabase
      .from("orders")
      .select("id, number, status, total, created_at", { count: "exact" })
      .eq("business_id", business)
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(100)
    if (error) throw new Error(error.message)
    return {
      total: count ?? 0,
      rows: shape(
        (data ?? []).map((row) => ({
          id: row.id,
          reference: row.number,
          status: row.status,
          amount: Number(row.total),
          when: row.created_at,
        })),
        currency,
      ),
    }
  }
  if (title === "Quotations" && business) {
    const { data, error, count } = await supabase
      .from("quotations")
      .select("id, number, status, total, created_at", { count: "exact" })
      .eq("business_id", business)
      .order("created_at", { ascending: false })
      .limit(100)
    if (error) throw new Error(error.message)
    return {
      total: count ?? 0,
      rows: shape(
        (data ?? []).map((row) => ({
          id: row.id,
          reference: row.number,
          status: row.status,
          amount: Number(row.total),
          when: row.created_at,
        })),
        currency,
      ),
    }
  }
  if (title === "Online Payments" && business) {
    const { data, error, count } = await supabase
      .from("payments")
      .select("id, external_ref, status, amount, created_at", { count: "exact" })
      .eq("business_id", business)
      .order("created_at", { ascending: false })
      .limit(250)
    if (error) throw new Error(error.message)
    return {
      total: count ?? 0,
      rows: shape(
        (data ?? []).map((row) => ({
          id: row.id,
          reference: row.external_ref,
          status: row.status,
          amount: Number(row.amount),
          when: row.created_at,
        })),
        currency,
      ),
    }
  }
  if (title === "Bill History" && business) {
    const { data, error, count } = await supabase
      .from("bills")
      .select("id, number, status, total, created_at", { count: "exact" })
      .eq("business_id", business)
      .order("created_at", { ascending: false })
      .limit(250)
    if (error) throw new Error(error.message)
    return {
      total: count ?? 0,
      rows: shape(
        (data ?? []).map((row) => ({
          id: row.id,
          reference: row.number,
          status: row.status,
          amount: Number(row.total),
          when: row.created_at,
        })),
        currency,
      ),
    }
  }
  if (title === "CRM" && business) {
    const { data, error, count } = await supabase
      .from("deals")
      .select("id, title, stage, amount, created_at", { count: "exact" })
      .eq("business_id", business)
      .order("created_at", { ascending: false })
      .limit(100)
    if (error) throw new Error(error.message)
    return {
      total: count ?? 0,
      rows: shape(
        (data ?? []).map((row) => ({
          id: row.id,
          reference: row.title,
          status: row.stage,
          amount: Number(row.amount),
          when: row.created_at,
        })),
        currency,
      ),
    }
  }
  if (title === "Locations" && business) {
    const { data, error, count } = await supabase
      .from("locations")
      .select("id, name, kind, created_at", { count: "exact" })
      .eq("business_id", business)
      .order("name")
    if (error) throw new Error(error.message)
    return {
      total: count ?? 0,
      rows: shape(
        (data ?? []).map((row) => ({
          id: row.id,
          reference: row.name,
          status: row.kind,
          amount: null,
          when: row.created_at,
        })),
        currency,
      ),
    }
  }
  if (title === "Categories" && business) {
    const { data, error, count } = await supabase
      .from("categories")
      .select("id, name, slug, created_at", { count: "exact" })
      .eq("business_id", business)
      .order("name")
    if (error) throw new Error(error.message)
    return {
      total: count ?? 0,
      rows: shape(
        (data ?? []).map((row) => ({
          id: row.id,
          reference: row.name,
          status: row.slug,
          amount: null,
          when: row.created_at,
        })),
        currency,
      ),
    }
  }
  if (title === "Product Catalog" && business) {
    const { data, error, count } = await supabase
      .from("catalog_entries")
      .select("id, product_id, is_visible, sort_order, created_at", { count: "exact" })
      .eq("business_id", business)
      .order("sort_order")
    if (error) throw new Error(error.message)
    const products = await supabase.from("products").select("id, name, price").eq("business_id", business)
    if (products.error) throw new Error(products.error.message)
    const names = new Map((products.data ?? []).map((product) => [product.id, product]))
    return {
      total: count ?? 0,
      rows: shape(
        (data ?? []).map((row) => ({
          id: row.id,
          reference: names.get(row.product_id)?.name ?? "Product",
          status: row.is_visible ? "active" : "archived",
          amount: Number(names.get(row.product_id)?.price ?? 0),
          when: row.created_at,
        })),
        currency,
      ),
    }
  }
  if (title === "Batches" && business) {
    const { data, error, count } = await supabase
      .from("batches")
      .select("id, lot_code, quantity, created_at", { count: "exact" })
      .eq("business_id", business)
      .order("created_at", { ascending: false })
      .limit(200)
    if (error) throw new Error(error.message)
    return {
      total: count ?? 0,
      rows: (data ?? []).map((row) => ({
        id: row.id,
        reference: row.lot_code,
        status: Number(row.quantity) > 0 ? "open" : "closed",
        amount: String(Number(row.quantity)),
        when: day(row.created_at),
      })),
    }
  }
  if (title === "Purchasing" && business) {
    const { data, error, count } = await supabase
      .from("purchase_orders")
      .select("id, number, status, total, created_at", { count: "exact" })
      .eq("business_id", business)
      .order("created_at", { ascending: false })
      .limit(100)
    if (error) throw new Error(error.message)
    return {
      total: count ?? 0,
      rows: shape(
        (data ?? []).map((row) => ({
          id: row.id,
          reference: row.number,
          status: row.status,
          amount: Number(row.total),
          when: row.created_at,
        })),
        currency,
      ),
    }
  }
  if (title === "Expenses" && business) {
    const { data, error, count } = await supabase
      .from("expenses")
      .select("id, vendor, category, status, amount, spent_on", { count: "exact" })
      .eq("business_id", business)
      .order("spent_on", { ascending: false })
      .limit(200)
    if (error) throw new Error(error.message)
    return {
      total: count ?? 0,
      rows: shape(
        (data ?? []).map((row) => ({
          id: row.id,
          reference: `${row.vendor} · ${row.category}`,
          status: row.status,
          amount: Number(row.amount),
          when: row.spent_on,
        })),
        currency,
      ),
    }
  }
  if (title === "Capital" && business) {
    const { data, error, count } = await supabase
      .from("capital_entries")
      .select("id, description, kind, amount, occurred_on", { count: "exact" })
      .eq("business_id", business)
      .order("occurred_on", { ascending: false })
    if (error) throw new Error(error.message)
    return {
      total: count ?? 0,
      rows: shape(
        (data ?? []).map((row) => ({
          id: row.id,
          reference: row.description,
          status: row.kind,
          amount: Number(row.amount),
          when: row.occurred_on,
        })),
        currency,
      ),
    }
  }
  if (title === "Accounting" && business) {
    const { data, error, count } = await supabase
      .from("journal_entries")
      .select("id, memo, posted, entry_date", { count: "exact" })
      .eq("business_id", business)
      .order("entry_date", { ascending: false })
      .limit(100)
    if (error) throw new Error(error.message)
    return {
      total: count ?? 0,
      rows: shape(
        (data ?? []).map((row) => ({
          id: row.id,
          reference: row.memo || "Journal entry",
          status: row.posted ? "closed" : "draft",
          amount: null,
          when: row.entry_date,
        })),
        currency,
      ),
    }
  }
  if (title === "Reporting" && business) {
    const { data, error, count } = await supabase
      .from("financial_reports")
      .select("id, kind, period_start, period_end, created_at", { count: "exact" })
      .eq("business_id", business)
      .order("period_end", { ascending: false })
    if (error) throw new Error(error.message)
    return {
      total: count ?? 0,
      rows: shape(
        (data ?? []).map((row) => ({
          id: row.id,
          reference: `${row.kind} ${row.period_start} – ${row.period_end}`,
          status: "closed",
          amount: null,
          when: row.created_at,
        })),
        currency,
      ),
    }
  }
  if (title === "Staff management" && business) {
    const { data, error, count } = await supabase
      .from("business_members")
      .select("id, role_key, status, created_at", { count: "exact" })
      .eq("business_id", business)
      .order("created_at")
    if (error) throw new Error(error.message)
    return {
      total: count ?? 0,
      rows: shape(
        (data ?? []).map((row) => ({
          id: row.id,
          reference: row.role_key,
          status: row.status,
          amount: null,
          when: row.created_at,
        })),
        currency,
      ),
    }
  }
  if (title === "Payment & billing" && business) {
    const { data, error, count } = await supabase
      .from("platform_invoices")
      .select("id, number, status, amount, due_on", { count: "exact" })
      .eq("business_id", business)
      .order("due_on", { ascending: false })
    if (error) throw new Error(error.message)
    return {
      total: count ?? 0,
      rows: shape(
        (data ?? []).map((row) => ({
          id: row.id,
          reference: row.number,
          status: row.status,
          amount: Number(row.amount),
          when: row.due_on,
        })),
        currency,
      ),
    }
  }
  if (title === "Business config" && business) {
    const { data, error } = await supabase
      .from("business_settings")
      .select("business_id, legal_name, tax_id, invoice_prefix, updated_at")
      .eq("business_id", business)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return { total: 0, rows: [] }
    return {
      total: 1,
      rows: shape(
        [
          {
            id: data.business_id,
            reference: data.legal_name,
            status: data.tax_id,
            amount: null,
            when: data.updated_at,
          },
        ],
        currency,
      ),
    }
  }
  if (title === "POS registers") {
    let query = supabase.from("registers").select("id, name, status, created_at", { count: "exact" }).order("name")
    if (business) query = query.eq("business_id", business)
    const { data, error, count } = await query
    if (error) throw new Error(error.message)
    return {
      total: count ?? 0,
      rows: shape(
        (data ?? []).map((row) => ({
          id: row.id,
          reference: row.name,
          status: row.status,
          amount: null,
          when: row.created_at,
        })),
        currency,
      ),
    }
  }
  if (title === "POS sessions") {
    let query = supabase
      .from("register_sessions")
      .select("id, status, opening_cash, opened_at", { count: "exact" })
      .order("opened_at", { ascending: false })
      .limit(200)
    if (business) query = query.eq("business_id", business)
    const { data, error, count } = await query
    if (error) throw new Error(error.message)
    return {
      total: count ?? 0,
      rows: shape(
        (data ?? []).map((row) => ({
          id: row.id,
          reference: "POS session",
          status: row.status,
          amount: Number(row.opening_cash),
          when: row.opened_at,
        })),
        currency,
      ),
    }
  }
  if (title === "Audit") {
    let query = supabase
      .from("audit_events")
      .select("id, action, entity, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(100)
    if (business) query = query.eq("business_id", business)
    const { data, error, count } = await query
    if (error) throw new Error(error.message)
    return {
      total: count ?? 0,
      rows: shape(
        (data ?? []).map((row) => ({
          id: row.id,
          reference: row.action,
          status: row.entity,
          amount: null,
          when: row.created_at,
        })),
        currency,
      ),
    }
  }
  if (title === "Health") {
    const { data, error, count } = await supabase
      .from("health_checks")
      .select("id, check_key, status, checked_at", { count: "exact" })
      .order("checked_at", { ascending: false })
      .limit(50)
    if (error) throw new Error(error.message)
    return {
      total: count ?? 0,
      rows: shape(
        (data ?? []).map((row) => ({
          id: row.id,
          reference: row.check_key,
          status: row.status,
          amount: null,
          when: row.checked_at,
        })),
        currency,
      ),
    }
  }
  if (title === "Enabled features") {
    let query = supabase
      .from("business_capabilities")
      .select("capability_key, enabled, business_id", { count: "exact" })
      .order("capability_key")
    if (business) query = query.eq("business_id", business)
    const { data, error, count } = await query
    if (error) throw new Error(error.message)
    return {
      total: count ?? 0,
      rows: (data ?? []).map((row) => ({
        id: `${row.business_id}-${row.capability_key}`,
        reference: row.capability_key,
        status: row.enabled ? "enabled" : "off",
        amount: "—",
        when: "",
      })),
    }
  }
  if (title === "Features") {
    const { data, error, count } = await supabase
      .from("capabilities")
      .select("key, name, module", { count: "exact" })
      .order("module")
    if (error) throw new Error(error.message)
    return {
      total: count ?? 0,
      rows: (data ?? []).map((row) => ({
        id: row.key,
        reference: row.name,
        status: row.module,
        amount: "—",
        when: "",
      })),
    }
  }
  if (title === "Plans") {
    const { data, error, count } = await supabase
      .from("plans")
      .select("id, name, code, price, active", { count: "exact" })
      .order("name")
    if (error) throw new Error(error.message)
    return {
      total: count ?? 0,
      rows: shape(
        (data ?? []).map((row) => ({
          id: row.id,
          reference: row.name,
          status: row.active ? "active" : "archived",
          amount: Number(row.price),
          when: null,
        })),
        currency,
      ),
    }
  }
  if (title === "Users") {
    const { data, error, count } = await supabase
      .from("profiles")
      .select("id, display_name, email, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
    if (error) throw new Error(error.message)
    return {
      total: count ?? 0,
      rows: shape(
        (data ?? []).map((row) => ({
          id: row.id,
          reference: row.display_name || row.email || "User",
          status: "active",
          amount: null,
          when: row.created_at,
        })),
        currency,
      ),
    }
  }
  if (title === "Admin") {
    const { data, error, count } = await supabase
      .from("businesses")
      .select("id, name, status, created_at", { count: "exact" })
      .order("name")
    if (error) throw new Error(error.message)
    return {
      total: count ?? 0,
      rows: shape(
        (data ?? []).map((row) => ({
          id: row.id,
          reference: row.name,
          status: row.status,
          amount: null,
          when: row.created_at,
        })),
        currency,
      ),
    }
  }
  return { total: 0, rows: [] }
}

export function RecordLedger({ title }: { title: string }) {
  const params = useParams()
  const businessKey = typeof params.businessId === "string" ? params.businessId : null
  const flow = useBusiness(businessKey ?? "demo")
  const [rows, setRows] = useState<LedgerRow[]>([])
  const [total, setTotal] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("all")
  const [from, setFrom] = useState<Date | undefined>()

  useEffect(() => {
    if (!flow.ready) return
    const businessId = businessKey ? flow.business?.id ?? null : null
    if (businessKey && !businessId) return
    let cancelled = false
    void loadLedger(title, flow.supabase, businessId, flow.business?.currency || "USD")
      .then((result) => {
        if (cancelled) return
        setRows(result.rows)
        setTotal(result.total)
        setMessage(null)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setMessage(error instanceof Error ? error.message : "Could not load records")
      })
    return () => {
      cancelled = true
    }
  }, [businessKey, flow.business?.currency, flow.business?.id, flow.ready, flow.supabase, title])

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const fromDay = from
      ? `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-${String(from.getDate()).padStart(2, "0")}`
      : ""
    return rows.filter((row) => {
      if (needle && !`${row.reference} ${row.status}`.toLowerCase().includes(needle)) return false
      if (status !== "all" && bucket(row.status) !== status) return false
      if (fromDay && row.when && row.when < fromDay) return false
      return true
    })
  }, [from, rows, search, status])

  const shown = visible.length === total ? `${total} records` : `Showing ${visible.length} of ${total}`

  return (
    <Card>
      <CardHeader>
        <CardTitle>Records</CardTitle>
        <CardDescription>
          {flow.ready ? shown : "Loading the year of history."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search records"
            className="sm:max-w-xs"
          />
          <Select
            value={status}
            onValueChange={(value) => {
              if (value) setStatus(value)
            }}
            items={statuses}
          >
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
            </SelectContent>
          </Select>
          <DatePicker placeholder="From date" value={from} onChange={setFrom} />
        </div>
        {message ? <p className="text-sm text-destructive">{message}</p> : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  No rows
                </TableCell>
              </TableRow>
            ) : (
              visible.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.reference}</TableCell>
                  <TableCell className="capitalize">{showStatus(row.status)}</TableCell>
                  <TableCell>{row.amount}</TableCell>
                  <TableCell>{showDay(row.when)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
