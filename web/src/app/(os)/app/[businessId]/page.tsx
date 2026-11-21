import { Suspense } from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { loadVisibleBusiness } from "@/lib/load-business"
import { createClient } from "@/lib/supabase/server"

export default function HomePage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>
  searchParams: Promise<{ location?: string }>
}) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted" />}>
      <HomeContent params={params} searchParams={searchParams} />
    </Suspense>
  )
}

function BusinessMissing() {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-heading text-xl font-medium tracking-tight">Business not found</h1>
      <p className="text-sm text-muted-foreground">This business isn't available on your account.</p>
      <Button nativeButton={false} render={<Link href="/app" />} className="w-fit">
        Back to portfolio
      </Button>
    </div>
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

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function salesHome(slug: string, locationId: string | null) {
  const supabase = await createClient()
  const lookup = await supabase.from("businesses").select("id, currency, timezone").eq("slug", slug).maybeSingle()
  const row = lookup.data
  if (!row) return null
  const zone = row.timezone || "UTC"
  const today = zonedDay(Date.now(), zone)
  const yesterday = shiftDay(today, -1)
  const monthStart = `${today.slice(0, 8)}01`
  const since = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString()
  const days = Array.from({ length: 14 }, (_, index) => shiftDay(today, index - 13))

  const places = await supabase
    .from("locations")
    .select("id, name")
    .eq("business_id", row.id)
    .eq("kind", "store")
    .eq("is_active", true)
    .order("name")

  let ordersQuery = supabase
    .from("orders")
    .select("id, total, created_at, location_id, customer_id")
    .eq("business_id", row.id)
    .eq("status", "completed")
    .gte("created_at", since)
    .limit(2000)
  if (locationId && places.data?.some((place) => place.id === locationId)) {
    ordersQuery = ordersQuery.eq("location_id", locationId)
  }
  const orders = await ordersQuery
  const rows = orders.data ?? []
  const dayOf = (createdAt: string) => zonedDay(createdAt, zone)
  const sumOn = (day: string) => rows.filter((order) => dayOf(order.created_at) === day).reduce((sum, order) => sum + Number(order.total), 0)
  const todaySales = sumOn(today)
  const yesterdaySales = sumOn(yesterday)
  const bills = rows.filter((order) => dayOf(order.created_at) === today).length
  const monthOrders = rows.filter((order) => dayOf(order.created_at) >= monthStart)
  const monthSales = monthOrders.reduce((sum, order) => sum + Number(order.total), 0)
  const customers = new Set(monthOrders.map((order) => order.customer_id).filter(Boolean)).size
  const series = days.map((day) => ({ day, total: sumOn(day) }))
  const peak = Math.max(...series.map((item) => item.total), 1)

  const recentIds = rows.filter((order) => dayOf(order.created_at) >= days[0]).map((order) => order.id).slice(0, 200)
  const lines = recentIds.length
    ? await supabase.from("order_lines").select("description, quantity, line_total").eq("business_id", row.id).in("order_id", recentIds)
    : { data: [] }
  const products = new Map<string, { quantity: number; total: number }>()
  for (const line of lines.data ?? []) {
    const name = line.description || "Product"
    const current = products.get(name) ?? { quantity: 0, total: 0 }
    current.quantity += Number(line.quantity)
    current.total += Number(line.line_total)
    products.set(name, current)
  }
  const top = [...products.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5)
    .map(([name, figures]) => ({ name, ...figures }))

  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: row.currency || "USD",
    maximumFractionDigits: 0,
  })
  const change = yesterdaySales === 0 ? null : Math.round(((todaySales - yesterdaySales) / yesterdaySales) * 100)

  return {
    places: places.data ?? [],
    todaySales: money.format(todaySales),
    yesterdaySales: money.format(yesterdaySales),
    change,
    bills,
    monthSales: money.format(monthSales),
    customers,
    series,
    peak,
    top,
    money,
  }
}

async function HomeContent({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>
  searchParams: Promise<{ location?: string }>
}) {
  const { businessId } = await params
  const { location } = await searchParams
  const business = await loadVisibleBusiness(businessId)
  if (!business) return <BusinessMissing />
  const selected = location && uuidPattern.test(location) ? location : null
  const sales = await salesHome(business.id, selected)
  const base = `/app/${business.id}`
  const shortcuts = [
    { label: "Open POS", href: `${base}/pos` },
    { label: "Orders", href: `${base}/orders` },
    { label: "Inventory", href: `${base}/inventory` },
    { label: "CRM", href: `${base}/crm` },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-xl font-medium tracking-tight">Home</h1>
          <p className="text-sm text-muted-foreground">Sales for {business.name}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={selected ? "outline" : "secondary"} nativeButton={false} render={<Link href={base} />}>
            All locations
          </Button>
          {sales?.places.map((place) => (
            <Button
              key={place.id}
              size="sm"
              variant={selected === place.id ? "secondary" : "outline"}
              nativeButton={false}
              render={<Link href={`${base}?location=${place.id}`} />}
            >
              {place.name}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Today</CardDescription>
            <CardTitle className="tabular-nums">{sales?.todaySales ?? "—"}</CardTitle>
            <CardDescription>
              {sales?.change == null ? `Yesterday ${sales?.yesterdaySales ?? "—"}` : `${sales.change > 0 ? "+" : ""}${sales.change}% vs yesterday`}
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Bills today</CardDescription>
            <CardTitle className="tabular-nums">{sales?.bills ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>This month</CardDescription>
            <CardTitle className="tabular-nums">{sales?.monthSales ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Customers this month</CardDescription>
            <CardTitle className="tabular-nums">{sales?.customers ?? 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Last 14 days</CardTitle>
            <CardDescription>Completed sales, by day.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-36 items-end gap-1">
              {(sales?.series ?? []).map((item) => (
                <div key={item.day} className="flex h-full flex-1 flex-col justify-end" title={`${item.day} ${sales?.money.format(item.total) ?? ""}`}>
                  <div
                    className="rounded-sm bg-foreground/80"
                    style={{ height: `${Math.max(4, Math.round((item.total / (sales?.peak || 1)) * 100))}%` }}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top products</CardTitle>
            <CardDescription>By sales in the last 14 days.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {sales?.top.length ? (
              sales.top.map((product) => (
                <div key={product.name} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate">{product.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {product.quantity} · {sales.money.format(product.total)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No completed sales in this range.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Getting started</CardTitle>
            <CardDescription>Connect Supabase, then staff and catalog.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-2 pl-4 text-sm text-muted-foreground">
              <li>
                Add the project URL and anon key to{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">web/.env.local</code>
              </li>
              <li>Invite staff from Settings</li>
              <li>Load products, then open POS</li>
            </ol>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Shortcuts</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {shortcuts.map((item) => (
              <Button key={item.href} variant="outline" nativeButton={false} render={<Link href={item.href} />}>
                {item.label}
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
