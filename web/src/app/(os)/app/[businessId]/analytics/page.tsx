import { Suspense } from "react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
  const peak = Math.max(...series.map((item) => item.total), 1)
  const recentIds = sales.filter((order) => dayOf(order.created_at) >= start).map((order) => order.id).slice(0, 200)
  const lines = row && recentIds.length
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
  const top = [...products.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 8)
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-medium tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">Completed sales for {business.name} over the last 14 days.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Sales</CardTitle>
            <CardDescription>Completed sales, by day.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-36 items-end gap-1">
              {series.map((item) => (
                <div key={item.day} className="flex h-full flex-1 flex-col justify-end" title={`${item.day} ${money.format(item.total)}`}>
                  <div
                    className="rounded-sm bg-foreground/80"
                    style={{ height: `${Math.max(4, Math.round((item.total / peak) * 100))}%` }}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top products</CardTitle>
            <CardDescription>By sales in this range.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {top.length ? (
              top.map(([name, figures]) => (
                <div key={name} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate">{name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {figures.quantity} · {money.format(figures.total)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No completed sales in this range.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
