"use client"

import { useCallback, useEffect, useId, useState } from "react"
import { Building2Icon, MoreHorizontal } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
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
import { formatMoney, slugFromName } from "@/lib/businesses"
import { pushIslandConfirm, pushIslandToast } from "@/lib/island-toast"
import { createClient } from "@/lib/supabase/client"

type BusinessRow = {
  id: string
  name: string
  slug: string
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
  is_active: boolean
}

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`
}

function sellingPlaces(places: Place[], businessId: string) {
  return places.filter((place) => place.business_id === businessId && (place.kind === "store" || place.kind === "site"))
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

const sliceColors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]

const compareChartConfig = {
  sales: { label: "Sales", color: "var(--chart-1)" },
} satisfies ChartConfig

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

function locationSpark(sales: CompletedSale[], locationId: string, period: Period) {
  const days = periodDays(period === "today" ? "week" : period)
  return days.map((day) =>
    totalSales(sales.filter((sale) => sale.location_id === locationId && localDayKey(new Date(sale.created_at)) === day.day)),
  )
}

function BusinessSnapshot({
  business,
  places,
  sales,
  period,
}: {
  business: BusinessRow
  places: Place[]
  sales: CompletedSale[]
  period: Period
}) {
  const locations = sellingPlaces(places, business.id)
  const windowSales = salesInPeriod(
    sales.filter((sale) => sale.business_id === business.id),
    period,
  )
  const tiles = [
    { label: "Sales", value: formatMoney(totalSales(windowSales)) },
    { label: "Orders", value: String(windowSales.length) },
    { label: "Customers", value: String(customerCount(windowSales)) },
  ]
  return (
    <li className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/app/${business.slug}`} className="font-medium hover:underline">
            {business.name}
          </Link>
          <p className="text-sm text-muted-foreground">{countLabel(locations.length, "Location", "Locations")}</p>
        </div>
        <Link href={`/app/${business.slug}/settings`} className="shrink-0 text-sm text-muted-foreground hover:text-foreground">
          Settings
        </Link>
      </div>
      {locations.length === 0 ? (
        <p className="text-sm text-muted-foreground">No locations yet.</p>
      ) : (
        <ul className="flex flex-col">
          {locations.map((place) => {
            const placeSales = windowSales.filter((sale) => sale.location_id === place.id)
            return (
              <li key={place.id} className="flex items-center justify-between gap-3 border-t py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{place.name}</span>
                    <Badge variant={place.is_active ? "positive" : "outline"}>{place.is_active ? "Active" : "Inactive"}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">Sales: {formatMoney(totalSales(placeSales))}</p>
                </div>
                <MetricSpark values={locationSpark(sales, place.id, period)} color="var(--chart-1)" />
              </li>
            )
          })}
        </ul>
      )}
      <div className="grid grid-cols-3 gap-2">
        {tiles.map((tile) => (
          <Card key={tile.label} size="sm">
            <CardHeader>
              <CardDescription>{tile.label}</CardDescription>
              <CardTitle className="tabular-nums">{tile.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
    </li>
  )
}

function PortfolioSummary({
  ready,
  displayName,
  organizations,
  sales,
  places,
  staffCount,
  period,
  onPeriod,
}: {
  ready: boolean
  displayName: string
  organizations: OrganizationCard[]
  sales: CompletedSale[]
  places: Place[]
  staffCount: number
  period: Period
  onPeriod: (period: Period) => void
}) {

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
  const businessCount = organizations.reduce((sum, organization) => sum + organization.businesses.length, 0)
  const locationCount = places.filter((place) => place.kind === "store" || place.kind === "site").length
  const overview = [
    { label: "Organizations", value: organizations.length },
    { label: "Businesses", value: businessCount },
    { label: "Locations", value: locationCount },
    { label: "Staff", value: staffCount },
  ]
  const windowSales = salesInPeriod(sales, period)
  const earlierSales = salesBetween(sales, previousStart(period), periodStart(period))
  const customers = customerCount(windowSales)
  const average = (rows: CompletedSale[]) => (rows.length === 0 ? 0 : totalSales(rows) / rows.length)
  const chartDays = periodDays(period === "today" ? "week" : period)
  const salesOnDay = (day: string) => sales.filter((sale) => localDayKey(new Date(sale.created_at)) === day)
  const daily = (pick: (rows: CompletedSale[]) => number) => chartDays.map((day) => pick(salesOnDay(day.day)))
  const companies = organizations.map((organization, index) => ({
    key: `c${index}`,
    name: organization.name,
    fill: sliceColors[index % sliceColors.length],
    ids: new Set(organization.businesses.map((business) => business.id)),
  }))
  const companyConfig = Object.fromEntries(
    companies.map((company) => [company.key, { label: company.name, color: company.fill }]),
  ) satisfies ChartConfig
  const chartDaySet = new Set(chartDays.map((day) => day.day))
  const chartSales = sales.filter((sale) => chartDaySet.has(localDayKey(new Date(sale.created_at))))
  const companyTotal = (rows: CompletedSale[], ids: Set<string>) =>
    rows.reduce((sum, sale) => (ids.has(sale.business_id) ? sum + Number(sale.total) : sum), 0)
  const comparison = companies
    .map((company) => ({ ...company, sales: companyTotal(chartSales, company.ids) }))
    .filter((company) => company.sales > 0)
    .sort((left, right) => right.sales - left.sales)
  const stacked = comparison.length === 0 ? [] : comparison
  const bars = chartDays.map((day) => {
    const daySales = salesOnDay(day.day)
    const row: Record<string, string | number> = { label: day.label }
    for (const company of stacked) row[company.key] = companyTotal(daySales, company.ids)
    return row
  })
  const chartSpan = period === "today" ? "The last 7 days, every company you own." : "Each day in this period, every company you own."
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
      <div className="flex flex-col gap-4 py-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-4xl font-medium tracking-tight">{greeting(displayName)}</h1>
          <p className="text-sm text-muted-foreground">
            {empty ? "There is nothing to report yet." : "Here's how your companies are doing."}
          </p>
        </div>
        {empty ? null : (
          <Tabs
            value={period}
            onValueChange={(value) => {
              if (value === "today" || value === "week" || value === "month") onPeriod(value)
            }}
          >
            <TabsList>
              <TabsTrigger value="today">Today</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {overview.map((item) => (
          <Card key={item.label}>
            <CardHeader>
              <CardDescription>{item.label}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{item.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
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
                <CardDescription>{chartSpan}</CardDescription>
              </CardHeader>
              <CardContent>
                {stacked.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No completed sales in this period.</p>
                ) : (
                  <ChartContainer config={companyConfig} className="aspect-auto h-56 w-full">
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
                      <ChartLegend content={<ChartLegendContent />} />
                      {stacked.map((company, index) => (
                        <Bar
                          key={company.key}
                          dataKey={company.key}
                          stackId="sales"
                          fill={`var(--color-${company.key})`}
                          radius={index === stacked.length - 1 ? [4, 4, 0, 0] : 0}
                        />
                      ))}
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>By company</CardTitle>
                <CardDescription>Completed sales for each organization.</CardDescription>
              </CardHeader>
              <CardContent>
                {comparison.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No completed sales in this period.</p>
                ) : (
                  <ChartContainer config={compareChartConfig} className="aspect-auto w-full" style={{ height: Math.max(160, comparison.length * 40) }}>
                    <BarChart data={comparison} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <XAxis type="number" hide />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={112}
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        tickFormatter={(value) => (String(value).length > 16 ? `${String(value).slice(0, 15)}…` : String(value))}
                      />
                      <ChartTooltip content={<ChartTooltipContent hideLabel formatter={(value) => formatMoney(Number(value))} />} />
                      <Bar dataKey="sales" radius={4}>
                        {comparison.map((company) => (
                          <Cell key={company.key} fill={company.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ChartContainer>
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
  const router = useRouter()
  const [organizations, setOrganizations] = useState<OrganizationCard[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [businessFor, setBusinessFor] = useState<OrganizationCard | null>(null)
  const [name, setName] = useState("")
  const [pending, setPending] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [displayName, setDisplayName] = useState("")
  const [completedSales, setCompletedSales] = useState<CompletedSale[]>([])
  const [places, setPlaces] = useState<Place[]>([])
  const [staffCount, setStaffCount] = useState(0)
  const [period, setPeriod] = useState<Period>("today")

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
      setPlaces([])
      setStaffCount(0)
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
      setPlaces([])
      setStaffCount(0)
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
    const [salesOrders, locationRows, memberRows] = await Promise.all([
      businessIds.length === 0
        ? Promise.resolve({ data: [] as CompletedSale[] })
        : supabase
            .from("orders")
            .select("business_id, location_id, register_id, total, created_at, customer_id")
            .in("business_id", businessIds)
            .eq("status", "completed")
            .gte("created_at", since),
      businessIds.length === 0
        ? Promise.resolve({ data: [] as Place[] })
        : supabase
            .from("locations")
            .select("id, business_id, name, kind, is_active")
            .in("business_id", businessIds)
            .order("name"),
      businessIds.length === 0
        ? Promise.resolve({ data: [] as { user_id: string }[] })
        : supabase.from("business_members").select("user_id, business_id").in("business_id", businessIds),
    ])
    const salesRows = salesOrders.data ?? []
    const locationList = locationRows.data ?? []
    setCompletedSales(salesRows)
    setPlaces(locationList)
    setStaffCount(new Set((memberRows.data ?? []).map((member) => member.user_id)).size)
    const next = organizationRows.map((organization) => {
      const owned = businesses.filter((business) => business.organization_id === organization.id)
      return {
        id: organization.id,
        name: organization.name,
        ownerId: organization.owner_id,
        businesses: owned.map((business) => ({
          id: business.id,
          name: business.name,
          slug: business.slug,
        })),
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
    setBusinessFor(null)
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
    if (businessFor) {
      const message = await insertBusiness(supabase, user.id, businessFor.id, trimmed)
      setPending(false)
      if (message) {
        toast.error(message)
        return
      }
      closeDialog()
      toast.success("Business added.")
      await load()
      return
    }
    const { error } = await supabase.from("organizations").insert({ name: trimmed, owner_id: user.id })
    if (error) {
      setPending(false)
      toast.error(error.message)
      return
    }
    const created = await supabase
      .from("organizations")
      .select("id")
      .eq("owner_id", user.id)
      .eq("name", trimmed)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    setPending(false)
    if (created.error || !created.data) {
      toast.error(created.error?.message ?? "Organization added, but setup could not be opened.")
      closeDialog()
      await load()
      return
    }
    closeDialog()
    toast.success("Organization added.")
    router.push(`/app/setup/${created.data.id}`)
  }

  async function insertBusiness(
    supabase: ReturnType<typeof createClient>,
    ownerId: string,
    organizationId: string,
    businessName: string,
  ) {
    const base = slugFromName(businessName)
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const slug = attempt === 0 ? base : `${base}-${attempt + 1}`
      const { error } = await supabase.from("businesses").insert({
        name: businessName,
        slug,
        owner_id: ownerId,
        organization_id: organizationId,
      })
      if (!error) return null
      if (error.code !== "23505") return error.message
    }
    return "That name is already in use."
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
        places={places}
        staffCount={staffCount}
        period={period}
        onPeriod={setPeriod}
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
                  <div className="flex flex-col items-start gap-2">
                    <CardTitle>{organization.name}</CardTitle>
                    <Button variant="outline" size="sm" render={<Link href={`/app/setup/${organization.id}`} />}>
                      Organization setup
                    </Button>
                  </div>
                  {owns ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button type="button" variant="ghost" size="icon-sm" aria-label={`${organization.name} actions`} />}
                      >
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem variant="destructive" onClick={() => askDelete(organization)}>
                          Delete organization
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent>
                {organization.businesses.length === 0 ? (
                  <div className="flex flex-col items-start gap-3">
                    <p className="text-sm text-muted-foreground">No businesses yet.</p>
                    {owns ? (
                      <Button
                        type="button"
                        onClick={() => {
                          setName("")
                          setBusinessFor(organization)
                        }}
                      >
                        Add business
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <ul className="flex flex-col gap-6">
                    {organization.businesses.map((business) => (
                      <BusinessSnapshot
                        key={business.id}
                        business={business}
                        places={places}
                        sales={completedSales}
                        period={period}
                      />
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
      <Dialog open={adding || businessFor !== null} onOpenChange={(open) => { if (!open) closeDialog() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{businessFor ? "Add a business" : "Add an organization"}</DialogTitle>
            <DialogDescription>
              {businessFor
                ? `This business operates under ${businessFor.name}. Locations and registers are added in Business settings.`
                : "This is the incorporated company. Businesses, locations, and warehouses are managed in Business settings."}
            </DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="portfolio-name">{businessFor ? "Business name" : "Organization name"}</Label>
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
