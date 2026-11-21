"use client"

import { useCallback, useEffect, useId, useState } from "react"
import { Building2Icon, Trash2Icon } from "lucide-react"
import Link from "next/link"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/sonner"
import { formatMoney } from "@/lib/businesses"
import { pushIslandConfirm, pushIslandToast } from "@/lib/island-toast"
import { createClient } from "@/lib/supabase/client"

type BusinessRow = {
  id: string
  name: string
  slug: string
  stores: number
  warehouses: number
  registers: number
  openRegisters: number
  sales: number
  openOrders: number
  staff: number
}

type OrganizationCard = {
  id: string
  name: string
  ownerId: string
  businesses: BusinessRow[]
}

type Place = {
  id: string
  business_id: string
  name: string
  kind: string
  fulfillment_warehouse_id: string | null
}

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`
}

function registerDetail(business: BusinessRow) {
  if (business.registers === 0) return "None yet"
  if (business.openRegisters === 0) return "None open"
  return countLabel(business.openRegisters, "open", "open")
}

function registerTone(business: BusinessRow) {
  if (business.registers === 0) return "text-muted-foreground"
  if (business.openRegisters === 0) return "text-amber-400"
  return "text-positive"
}

function PlaceCards({ business }: { business: BusinessRow }) {
  const cards = [
    { label: "Locations", value: business.stores, detail: "", tone: "text-muted-foreground" },
    { label: "Warehouses", value: business.warehouses, detail: "", tone: "text-muted-foreground" },
    { label: "Registers", value: business.registers, detail: registerDetail(business), tone: registerTone(business) },
  ]
  return (
    <div className="grid grid-cols-3 items-stretch gap-2">
      {cards.map((card) => (
        <Card key={card.label} size="sm" className="h-full">
          <CardHeader>
            <CardDescription>{card.label}</CardDescription>
            <CardTitle>{card.value}</CardTitle>
          </CardHeader>
          <CardContent className={`min-h-4 text-xs ${card.tone}`}>{card.detail}</CardContent>
        </Card>
      ))}
    </div>
  )
}

type CompletedSale = {
  business_id: string
  location_id: string | null
  register_id: string | null
  total: number
  created_at: string
  customer_id: string | null
}

type Period = "today" | "week" | "month"

const salesChartConfig = {
  sales: { label: "Sales", color: "var(--chart-1)" },
} satisfies ChartConfig

const sliceColors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]

function MetricSpark({ values, color }: { values: number[]; color: string }) {
  const config = { value: { label: "Value", color } } satisfies ChartConfig
  const data = values.map((value, index) => ({ index, value }))
  const fillId = `spark-${useId().replace(/:/g, "")}`
  const low = Math.min(...values, 0)
  const high = Math.max(...values, 0)
  const span = high - low
  const pad = span > 0 ? span * 0.35 : Math.abs(high) * 0.12 || 1
  return (
    <ChartContainer config={config} className="aspect-auto h-12 w-24 shrink-0">
      <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.45} />
            <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis hide domain={[low - pad, high + pad]} />
        <Area dataKey="value" type="monotone" fill={`url(#${fillId})`} stroke="var(--color-value)" strokeWidth={2} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ChartContainer>
  )
}

function TrendBadge({ trend }: { trend: { label: string; tone: TrendTone } | null }) {
  if (!trend) return null
  if (trend.tone === "positive") return <Badge variant="positive">{trend.label}</Badge>
  if (trend.tone === "problem") return <Badge variant="destructive">{trend.label}</Badge>
  return <Badge variant="outline" className="border-transparent bg-amber-400/15 text-amber-400">{trend.label}</Badge>
}

function localDayKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

function startOfLocalDay(date = new Date()) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function periodStart(period: Period) {
  const start = startOfLocalDay()
  if (period === "week") start.setDate(start.getDate() - 6)
  if (period === "month") start.setDate(start.getDate() - 29)
  return start
}

function periodDays(period: Period) {
  const count = period === "today" ? 1 : period === "week" ? 7 : 30
  const days: { day: string; label: string }[] = []
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = startOfLocalDay()
    date.setDate(date.getDate() - offset)
    days.push({
      day: localDayKey(date),
      label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    })
  }
  return days
}

function periodLength(period: Period) {
  return period === "today" ? 1 : period === "week" ? 7 : 30
}

function previousStart(period: Period) {
  const start = periodStart(period)
  start.setDate(start.getDate() - periodLength(period))
  return start
}

function salesInPeriod(sales: CompletedSale[], period: Period) {
  const start = periodStart(period).getTime()
  return sales.filter((sale) => new Date(sale.created_at).getTime() >= start)
}

function salesBetween(sales: CompletedSale[], start: Date, end: Date) {
  const from = start.getTime()
  const to = end.getTime()
  return sales.filter((sale) => {
    const time = new Date(sale.created_at).getTime()
    return time >= from && time < to
  })
}

function totalSales(sales: CompletedSale[]) {
  return sales.reduce((sum, sale) => sum + Number(sale.total), 0)
}

function customerCount(sales: CompletedSale[]) {
  return new Set(sales.map((sale) => sale.customer_id).filter((id) => id !== null)).size
}

type TrendTone = "positive" | "attention" | "problem"

function trendLine(current: number, previous: number) {
  if (current === 0 && previous === 0) return null
  if (previous <= 0) return { label: "Up", tone: "positive" as TrendTone }
  const ratio = (current - previous) / previous
  const percent = Math.abs(Math.round(ratio * 100))
  if (ratio >= 0) {
    return { label: percent === 0 ? "0%" : percent > 999 ? "Up" : `+${percent}%`, tone: "positive" as TrendTone }
  }
  return {
    label: percent > 999 ? "Down" : `-${percent}%`,
    tone: (ratio > -0.2 ? "attention" : "problem") as TrendTone,
  }
}

function greeting(displayName: string) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const hourText = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hourCycle: "h23",
    timeZone: zone,
  }).format(new Date())
  const hour = Number(hourText)
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
  const name = displayName.trim()
  return name ? `${hello}, ${name}` : hello
}

function PortfolioSummary({
  ready,
  displayName,
  organizations,
  sales,
}: {
  ready: boolean
  displayName: string
  organizations: OrganizationCard[]
  sales: CompletedSale[]
}) {
  const [period, setPeriod] = useState<Period>("today")

  if (!ready) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  const empty = organizations.length === 0
  const windowSales = salesInPeriod(sales, period)
  const earlierSales = salesBetween(sales, previousStart(period), periodStart(period))
  const customers = customerCount(windowSales)
  const average = (rows: CompletedSale[]) => (rows.length === 0 ? 0 : totalSales(rows) / rows.length)
  const chartDays = periodDays(period === "today" ? "week" : period)
  const salesOnDay = (day: string) => sales.filter((sale) => localDayKey(new Date(sale.created_at)) === day)
  const daily = (pick: (rows: CompletedSale[]) => number) => chartDays.map((day) => pick(salesOnDay(day.day)))
  const distribution = organizations
    .map((organization, index) => {
      const ids = new Set(organization.businesses.map((business) => business.id))
      return {
        key: organization.id,
        name: organization.name,
        sales: windowSales.reduce((sum, sale) => (ids.has(sale.business_id) ? sum + Number(sale.total) : sum), 0),
        fill: sliceColors[index % sliceColors.length],
      }
    })
    .filter((row) => row.sales > 0)
    .sort((left, right) => right.sales - left.sales)
  const bars = chartDays.map((day) => ({ label: day.label, sales: totalSales(salesOnDay(day.day)) }))
  const metrics = [
    {
      label: "Sales",
      value: formatMoney(totalSales(windowSales)),
      trend: trendLine(totalSales(windowSales), totalSales(earlierSales)),
      spark: daily(totalSales),
      color: "var(--chart-1)",
    },
    {
      label: "Orders",
      value: String(windowSales.length),
      trend: trendLine(windowSales.length, earlierSales.length),
      spark: daily((rows) => rows.length),
      color: "var(--chart-2)",
    },
    {
      label: "Customers",
      value: String(customers),
      trend: trendLine(customers, customerCount(earlierSales)),
      spark: daily(customerCount),
      color: "var(--chart-3)",
    },
    {
      label: "Average order",
      value: formatMoney(average(windowSales)),
      trend: trendLine(average(windowSales), average(earlierSales)),
      spark: daily(average),
      color: "var(--chart-4)",
    },
  ]

  return (
    <section className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <CardTitle>{greeting(displayName)}</CardTitle>
            <CardDescription>
              {empty ? "There is nothing to report yet." : "Here's how your companies are doing."}
            </CardDescription>
          </div>
          {empty ? null : (
            <Tabs
              value={period}
              onValueChange={(value) => {
                if (value === "today" || value === "week" || value === "month") setPeriod(value)
              }}
            >
              <TabsList>
                <TabsTrigger value="today">Today</TabsTrigger>
                <TabsTrigger value="week">Week</TabsTrigger>
                <TabsTrigger value="month">Month</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </CardHeader>
      </Card>
      {empty ? null : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <Card key={metric.label}>
                <CardHeader className="flex flex-row items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <CardDescription>{metric.label}</CardDescription>
                    <CardTitle className="text-2xl tabular-nums">{metric.value}</CardTitle>
                    <TrendBadge trend={metric.trend} />
                  </div>
                  <MetricSpark values={metric.spark} color={metric.color} />
                </CardHeader>
              </Card>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Sales</CardTitle>
                <CardDescription>
                  {period === "today" ? "The last 7 days." : "Each day in this period."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={salesChartConfig} className="aspect-auto h-44 w-full">
                  <BarChart data={bars} margin={{ left: 8, right: 8, top: 8 }} barCategoryGap="28%">
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      minTickGap={24}
                      interval="equidistantPreserveStart"
                    />
                    <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatMoney(Number(value))} />} />
                    <Bar dataKey="sales" fill="var(--color-sales)" radius={4} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Distribution</CardTitle>
                <CardDescription>Completed sales by organization.</CardDescription>
              </CardHeader>
              <CardContent>
                {distribution.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No completed sales in this period.</p>
                ) : (
                  <div className="flex flex-col gap-4">
                    <ChartContainer config={salesChartConfig} className="mx-auto aspect-square h-44">
                      <PieChart>
                        <ChartTooltip content={<ChartTooltipContent hideLabel formatter={(value) => formatMoney(Number(value))} />} />
                        <Pie data={distribution} dataKey="sales" nameKey="name" innerRadius={52} outerRadius={72} paddingAngle={2} strokeWidth={0}>
                          {distribution.map((slice) => (
                            <Cell key={slice.key} fill={slice.fill} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ChartContainer>
                    <ul className="flex flex-col gap-2">
                      {distribution.map((slice) => (
                        <li key={slice.key} className="flex items-center justify-between gap-3 text-sm">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="size-2 shrink-0 rounded-full" style={{ background: slice.fill }} />
                            <span className="truncate">{slice.name}</span>
                          </span>
                          <span className="shrink-0 tabular-nums">{formatMoney(slice.sales)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </section>
  )
}

export function BusinessPortfolio() {
  const [organizations, setOrganizations] = useState<OrganizationCard[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState("")
  const [pending, setPending] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [displayName, setDisplayName] = useState("")
  const [completedSales, setCompletedSales] = useState<CompletedSale[]>([])

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: auth } = await supabase.auth.getUser()
    const signedIn = auth.user?.id ?? null
    setUserId(signedIn)
    const [organizationResult, profileResult] = await Promise.all([
      supabase.from("organizations").select("id, name, owner_id").order("name"),
      signedIn
        ? supabase.from("profiles").select("display_name").eq("id", signedIn).maybeSingle()
        : Promise.resolve({ data: null }),
    ])
    setDisplayName(profileResult.data?.display_name?.trim() ?? "")
    const { data: organizationRows, error } = organizationResult
    if (error || !organizationRows) {
      setOrganizations([])
      setCompletedSales([])
      setReady(true)
      const text = error?.message ?? "Couldn't load organizations."
      setLoadError(text)
      toast.error(text)
      return
    }
    setLoadError(null)
    const organizationIds = organizationRows.map((row) => row.id)
    if (organizationIds.length === 0) {
      setOrganizations([])
      setCompletedSales([])
      setReady(true)
      return
    }
    const { data: businessRows, error: businessError } = await supabase
      .from("businesses")
      .select("id, name, slug, organization_id")
      .in("organization_id", organizationIds)
      .order("name")
    if (businessError) {
      setReady(true)
      setLoadError(businessError.message)
      toast.error(businessError.message)
      return
    }
    const businesses = businessRows ?? []
    const businessIds = businesses.map((row) => row.id)
    const since = previousStart("month").toISOString()
    const [openOrders, salesOrders, members, locationRows, registerRows, openSessions] = await Promise.all([
      businessIds.length === 0
        ? Promise.resolve({ data: [] as { business_id: string }[] })
        : supabase.from("orders").select("business_id").in("business_id", businessIds).eq("status", "open"),
      businessIds.length === 0
        ? Promise.resolve({ data: [] as CompletedSale[] })
        : supabase
            .from("orders")
            .select("business_id, location_id, register_id, total, created_at, customer_id")
            .in("business_id", businessIds)
            .eq("status", "completed")
            .gte("created_at", since),
      businessIds.length === 0
        ? Promise.resolve({ data: [] as { business_id: string }[] })
        : supabase.from("business_members").select("business_id").in("business_id", businessIds),
      businessIds.length === 0
        ? Promise.resolve({ data: [] as Place[] })
        : supabase
            .from("locations")
            .select("id, business_id, name, kind, fulfillment_warehouse_id")
            .in("business_id", businessIds),
      businessIds.length === 0
        ? Promise.resolve({ data: [] as { business_id: string }[] })
        : supabase.from("registers").select("business_id").in("business_id", businessIds),
      businessIds.length === 0
        ? Promise.resolve({ data: [] as { business_id: string; register_id: string }[] })
        : supabase
            .from("register_sessions")
            .select("business_id, register_id")
            .in("business_id", businessIds)
            .eq("status", "open"),
    ])
    const today = localDayKey(new Date())
    const salesRows = salesOrders.data ?? []
    const locationList = locationRows.data ?? []
    setCompletedSales(salesRows)
    const next = organizationRows.map((organization) => {
      const owned = businesses.filter((business) => business.organization_id === organization.id)
      return {
        id: organization.id,
        name: organization.name,
        ownerId: organization.owner_id,
        businesses: owned.map((business) => {
          const businessPlaces = locationList.filter((place) => place.business_id === business.id)
          return {
            id: business.id,
            name: business.name,
            slug: business.slug,
            stores: businessPlaces.filter((place) => place.kind === "store" || place.kind === "site").length,
            warehouses: businessPlaces.filter((place) => place.kind === "warehouse").length,
            registers: (registerRows.data ?? []).filter((row) => row.business_id === business.id).length,
            openRegisters: new Set(
              (openSessions.data ?? [])
                .filter((row) => row.business_id === business.id)
                .map((row) => row.register_id),
            ).size,
            sales: salesRows.reduce((sum, order) => {
              if (order.business_id !== business.id || localDayKey(new Date(order.created_at)) !== today) return sum
              return sum + Number(order.total)
            }, 0),
            openOrders: (openOrders.data ?? []).filter((order) => order.business_id === business.id).length,
            staff: (members.data ?? []).filter((member) => member.business_id === business.id).length,
          }
        }),
      }
    })
    setOrganizations(next)
    setReady(true)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function closeDialog() {
    setAdding(false)
    setName("")
  }

  function askDelete(organization: OrganizationCard) {
    const title = organization.name
    if (organization.businesses.length > 0) {
      pushIslandToast(`${title} still has a business. Remove it first.`, "error")
      return
    }
    pushIslandConfirm(`Delete ${title}?`, () => {
      pushIslandConfirm(
        `${title} will be deleted for good.`,
        () => void removeOrganization(organization.id, title),
        { label: "Delete forever", destructive: true },
      )
    }, { label: "Continue" })
  }

  async function removeOrganization(id: string, title: string) {
    const supabase = createClient()
    const { data: remaining, error: checkError } = await supabase
      .from("businesses")
      .select("id")
      .eq("organization_id", id)
      .limit(1)
    if (checkError) {
      pushIslandToast(checkError.message, "error")
      return
    }
    if (remaining && remaining.length > 0) {
      pushIslandToast(`${title} still has a business. Remove it first.`, "error")
      return
    }
    const { error } = await supabase.from("organizations").delete().eq("id", id)
    if (error) {
      pushIslandToast(error.message, "error")
      return
    }
    pushIslandToast(`${title} deleted.`, "success")
    await load()
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    const supabase = createClient()
    const { data: auth } = await supabase.auth.getUser()
    const user = auth.user
    if (!user) {
      toast.error("Sign in before making changes.")
      return
    }
    setPending(true)
    const { error } = await supabase.from("organizations").insert({ name: trimmed, owner_id: user.id })
    setPending(false)
    if (error) {
      toast.error(error.message)
      return
    }
    closeDialog()
    toast.success("Organization added.")
    await load()
  }

  return (
    <>
      {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
      <div className="flex flex-col gap-10">
      <PortfolioSummary
        ready={ready}
        displayName={displayName}
        organizations={organizations}
        sales={completedSales}
      />
      <section className="flex flex-col gap-4">
      <h2 className="font-heading text-lg font-medium tracking-tight">Your organizations</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {organizations.map((organization) => {
          const owns = userId === organization.ownerId
          return (
            <Card key={organization.id} className="h-full">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <CardTitle>{organization.name}</CardTitle>
                  {owns ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${organization.name}`}
                      onClick={() => askDelete(organization)}
                    >
                      <Trash2Icon />
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {organization.businesses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No businesses yet.</p>
                ) : (
                  <ul className="flex flex-col gap-4">
                    {organization.businesses.map((business) => (
                      <li key={business.id} className="relative flex flex-col gap-2">
                        <Link
                          href={`/app/${business.slug}`}
                          aria-label={business.name}
                          className="absolute inset-0 z-0 rounded-lg focus-visible:ring-3 focus-visible:ring-ring/50"
                        />
                        <span className="pointer-events-none relative z-10 font-medium">{business.name}</span>
                        <div className="pointer-events-none relative z-10 flex flex-col gap-2">
                          <PlaceCards business={business} />
                          <div className="grid grid-cols-3 gap-3">
                            <div className="flex flex-col gap-1">
                              <span className="text-xs text-muted-foreground">Sales</span>
                              <span className="font-medium">{formatMoney(business.sales)}</span>
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="text-xs text-muted-foreground">Open orders</span>
                              <span className="font-medium">{business.openOrders}</span>
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="text-xs text-muted-foreground">Staff</span>
                              <span className="font-medium">{business.staff}</span>
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )
        })}
        <div
          role="button"
          tabIndex={0}
          className="rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          onClick={() => setAdding(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault()
              setAdding(true)
            }
          }}
        >
          <Empty className="h-full border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Building2Icon />
              </EmptyMedia>
              <EmptyTitle>Add an organization</EmptyTitle>
              <EmptyDescription>Create the incorporated company in this portfolio.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button type="button" tabIndex={-1}>
                Add organization
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      </div>
      </section>
      </div>
      <Dialog open={adding} onOpenChange={(open) => { if (!open) closeDialog() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add an organization</DialogTitle>
            <DialogDescription>This is the incorporated company. Businesses, locations, and warehouses are managed in Business settings.</DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="portfolio-name">Organization name</Label>
              <Input id="portfolio-name" value={name} required autoFocus onValueChange={setName} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending || name.trim() === ""}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
