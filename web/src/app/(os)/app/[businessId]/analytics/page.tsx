import { Suspense } from "react"

import { RankedBarCard, SeriesAreaCard } from "@/components/analytics/stat-card"
import { loadVisibleBusiness } from "@/lib/load-business"
import { createClient } from "@/lib/supabase/server"

export default function Page({ params }: { params: Promise<{ businessId: string }> }) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted" />}>
      <Analytics params={params} />
    </Suspense>
  )
}

function zonedDay(value: string | number, timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(value))
  } catch {
    return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value))
  }
}

function shiftDay(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

async function Analytics({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params
  const business = await loadVisibleBusiness(businessId)
  if (!business) {
    return <p className="text-sm text-muted-foreground">This business isn't available on your account.</p>
  }

  const supabase = await createClient()
  const lookup = await supabase.from("businesses").select("id, currency, timezone").eq("slug", business.id).maybeSingle()
  const row = lookup.data
  const zone = row?.timezone || "UTC"
  const currency = row?.currency || "USD"
  const today = zonedDay(Date.now(), zone)
  const start = shiftDay(today, -13)
  const since = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString()
  const days = Array.from({ length: 14 }, (_, index) => shiftDay(today, index - 13))
  const orders = row
    ? await supabase
        .from("orders")
        .select("id, total, created_at")
        .eq("business_id", row.id)
        .eq("status", "completed")
        .gte("created_at", since)
        .limit(2000)
    : { data: [] }
  const sales = orders.data ?? []
  const dayOf = (createdAt: string) => zonedDay(createdAt, zone)
  const series = days.map((day) => ({
    day,
    total: sales.filter((order) => dayOf(order.created_at) === day).reduce((sum, order) => sum + Number(order.total), 0),
  }))
  const recentIds = sales.filter((order) => dayOf(order.created_at) >= start).map((order) => order.id).slice(0, 200)
  const lines = row && recentIds.length
    ? await supabase
        .from("order_lines")
        .select("description, quantity, line_total, unit_cost, product_id")
        .eq("business_id", row.id)
        .in("order_id", recentIds)
    : { data: [] }
  const catalog =
    row && (lines.data?.length ?? 0) > 0
      ? await supabase
          .from("products")
          .select("id, name, parent_id, product_type")
          .eq("business_id", row.id)
          .in(
            "id",
            [...new Set((lines.data ?? []).map((line) => line.product_id).filter(Boolean) as string[])],
          )
      : { data: [] }
  const catalogById = new Map((catalog.data ?? []).map((product) => [product.id, product]))
  const parentIds = [...new Set(
    (catalog.data ?? [])
      .map((product) => product.parent_id)
      .filter(Boolean) as string[],
  )]
  const parents =
    row && parentIds.length
      ? await supabase.from("products").select("id, name").eq("business_id", row.id).in("id", parentIds)
      : { data: [] }
  const parentName = new Map((parents.data ?? []).map((product) => [product.id, product.name]))
  const products = new Map<string, { quantity: number; total: number; cost: number }>()
  for (const line of lines.data ?? []) {
    const product = line.product_id ? catalogById.get(line.product_id) : null
    const name = product?.parent_id
      ? parentName.get(product.parent_id) || product.name
      : product?.name || line.description || "Product"
    const current = products.get(name) ?? { quantity: 0, total: 0, cost: 0 }
    current.quantity += Number(line.quantity)
    current.total += Number(line.line_total)
    current.cost += Number(line.quantity) * Number(line.unit_cost ?? 0)
    products.set(name, current)
  }
  const top = [...products.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 8)
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 })
  const chartPoints = series.map((item) => ({
    label: new Date(`${item.day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    value: item.total,
  }))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-medium tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">Completed sales for {business.name} over the last 14 days.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <SeriesAreaCard label="Sales" description="Completed sales, by day." points={chartPoints} />
        <RankedBarCard
          label="Top products"
          description="By sales in this range."
          items={top.map(([name, figures]) => ({
            label: name,
            value: figures.total,
            display: `${figures.quantity} · ${money.format(figures.total)} · margin ${money.format(figures.total - figures.cost)}`,
          }))}
          empty="No completed sales in this range."
        />
      </div>
    </div>
  )
}
