"use client"

import { useId, useState } from "react"
import {
  Area,
  AreaChart as RechartsAreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts"

import { StatusBadge, type Tone } from "@/components/analytics/status-badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type ChartFormat = "money" | "count" | "percent"

type SeriesTone = "positive" | "negative" | "muted" | "default"

export type ChartSeries = {
  name: string
  values: number[]
  tone?: SeriesTone
}

function roundPoint(value: number, format: ChartFormat) {
  if (format === "percent") return Math.round(value * 10) / 10
  return Math.round(value)
}

function shares(values: number[]) {
  const total = values.reduce((sum, value) => sum + Math.max(value, 0), 0)
  if (total <= 0) return values.map(() => 0)
  const raw = values.map((value) => (Math.max(value, 0) / total) * 100)
  const floors = raw.map((value) => Math.floor(value))
  let left = 100 - floors.reduce((sum, value) => sum + value, 0)
  const order = raw
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac)
  for (let step = 0; step < left; step += 1) {
    floors[order[step % order.length].index] += 1
  }
  return floors
}

function chartKey(label: string, index: number) {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  return slug || `item-${index}`
}

const chartPalette = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

function sliceColor(index: number) {
  return chartPalette[index % chartPalette.length]
}

const rangeCopy = {
  "1y": "the last 12 months",
  "90d": "the last 3 months",
  "30d": "the last 30 days",
  "7d": "the last 7 days",
} as const

const rangeDays = {
  "1y": 365,
  "90d": 90,
  "30d": 30,
  "7d": 7,
} as const

type TimeRange = keyof typeof rangeCopy

function formatChartDate(value: string) {
  const date = new Date(`${value}T00:00:00`)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

function sparkDomain(values: number[]): [number, number] {
  const low = Math.min(...values)
  const high = Math.max(...values)
  const span = high - low
  const pad = span > 0 ? span * 0.35 : Math.abs(high) * 0.12 || 1
  return [low - pad, high + pad]
}

export function Sparkline({
  values,
  tone,
}: {
  values: number[]
  tone: Tone
}) {
  const config = {
    value: {
      label: "Value",
      color: "var(--chart-1)",
    },
  } satisfies ChartConfig
  const data = values.map((value, index) => ({ index, value }))
  const fillId = `spark-${useId().replace(/:/g, "")}`

  return (
    <ChartContainer config={config} className="aspect-auto h-12 w-full">
      <RechartsAreaChart data={data} margin={{ top: 4, right: 2, left: 2, bottom: 4 }}>
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.8} />
            <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0.1} />
          </linearGradient>
        </defs>
        <YAxis hide domain={sparkDomain(values)} />
        <Area
          dataKey="value"
          type="monotone"
          fill={`url(#${fillId})`}
          stroke="var(--color-value)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </RechartsAreaChart>
    </ChartContainer>
  )
}

export function AreaChart({
  labels,
  series,
  format,
  label,
}: {
  labels: string[]
  series: ChartSeries[]
  format: ChartFormat
  label: string
}) {
  const [timeRange, setTimeRange] = useState<TimeRange>("1y")
  const gradientId = useId().replace(/:/g, "")
  const config = {
    current: {
      label: series[0]?.name ?? label,
      color: "var(--chart-1)",
    },
    prior: {
      label: series[1]?.name ?? "Prior period",
      color: "var(--chart-2)",
    },
  } satisfies ChartConfig
  const data = labels.map((date, index) => ({
    date,
    current: roundPoint(series[0]?.values[index] ?? 0, format),
    prior: roundPoint(series[1]?.values[index] ?? 0, format),
  }))
  const referenceDate = new Date(`${data[data.length - 1]?.date ?? "2026-11-07"}T00:00:00`)
  const filteredData = data.filter((item) => {
    const date = new Date(`${item.date}T00:00:00`)
    const daysToSubtract = rangeDays[timeRange]
    const startDate = new Date(referenceDate)
    startDate.setDate(startDate.getDate() - daysToSubtract)
    return date >= startDate
  })

  return (
    <Card className="pt-0">
      <CardHeader className="flex items-center gap-2 border-b py-5 sm:flex-row">
        <div className="grid flex-1 gap-1">
          <CardTitle>{label}</CardTitle>
          <CardDescription>
            Showing {label.toLowerCase()} for {rangeCopy[timeRange]}
          </CardDescription>
        </div>
        <Select
          value={timeRange}
          onValueChange={(value) => {
            if (value === "1y" || value === "90d" || value === "30d" || value === "7d") {
              setTimeRange(value)
            }
          }}
          items={{
            "1y": "Last 12 months",
            "90d": "Last 3 months",
            "30d": "Last 30 days",
            "7d": "Last 7 days",
          }}
        >
          <SelectTrigger
            className="w-[160px] rounded-lg sm:ml-auto"
            aria-label="Select a value"
          >
            <SelectValue placeholder="Last 12 months" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="1y" className="rounded-lg">
              Last 12 months
            </SelectItem>
            <SelectItem value="90d" className="rounded-lg">
              Last 3 months
            </SelectItem>
            <SelectItem value="30d" className="rounded-lg">
              Last 30 days
            </SelectItem>
            <SelectItem value="7d" className="rounded-lg">
              Last 7 days
            </SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer config={config} className="aspect-auto h-[250px] w-full">
          <RechartsAreaChart data={filteredData}>
            <defs>
              <linearGradient id={`${gradientId}-current`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-current)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-current)" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id={`${gradientId}-prior`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-prior)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-prior)" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={formatChartDate}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => formatChartDate(String(value))}
                  indicator="dot"
                />
              }
            />
            <Area
              dataKey="prior"
              type="natural"
              fill={`url(#${gradientId}-prior)`}
              stroke="var(--color-prior)"
              stackId="a"
            />
            <Area
              dataKey="current"
              type="natural"
              fill={`url(#${gradientId}-current)`}
              stroke="var(--color-current)"
              stackId="a"
            />
            <ChartLegend content={<ChartLegendContent />} />
          </RechartsAreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export function DonutChart({
  items,
  label,
}: {
  items: { label: string; value: number; tone: Tone }[]
  label: string
}) {
  const portions = shares(items.map((item) => item.value))
  const rows = items.map((item, index) => {
    const key = chartKey(item.label, index)
    return { ...item, key, percent: portions[index] ?? 0 }
  })
  const config = Object.fromEntries(
    rows.map((item, index) => [
      item.key,
      { label: item.label, color: sliceColor(index) },
    ]),
  ) satisfies ChartConfig
  const data = rows.map((item) => ({
    key: item.key,
    value: item.percent,
    fill: `var(--color-${item.key})`,
  }))
  const top = rows.reduce(
    (best, item) => (item.percent > best.percent ? item : best),
    rows[0] ?? { label: "None", percent: 0, key: "none", tone: "neutral" as Tone, value: 0 },
  )

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div className="relative mx-auto w-full max-w-[220px] shrink-0">
        <ChartContainer
          config={config}
          className="aspect-square h-[220px] w-full"
          aria-label={label}
        >
          <PieChart>
            <ChartTooltip
              content={<ChartTooltipContent hideLabel nameKey="key" />}
            />
            <Pie
              data={data}
              dataKey="value"
              nameKey="key"
              innerRadius={62}
              outerRadius={84}
              stroke="var(--card)"
              strokeWidth={3}
              paddingAngle={2}
            />
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-medium tabular-nums">{top.percent}%</span>
          <span className="max-w-20 truncate text-xs text-muted-foreground">{top.label}</span>
        </div>
      </div>
      <ul className="flex w-full min-w-0 flex-col gap-2.5">
        {rows.map((item, index) => (
          <li key={item.key} className="flex items-center gap-2 text-sm">
            <span
              className="size-2 shrink-0 rounded-[2px]"
              style={{ background: sliceColor(index) }}
            />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.tone === "neutral" ? (
              <span className="tabular-nums text-muted-foreground">{item.percent}%</span>
            ) : (
              <StatusBadge tone={item.tone}>{item.percent}%</StatusBadge>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function BarList({
  items,
}: {
  items: { label: string; value: number; display: string }[]
}) {
  const config = {
    value: {
      label: "Amount",
      color: "var(--chart-1)",
    },
  } satisfies ChartConfig
  const data = items.map((item) => ({
    label: item.label,
    value: item.value,
  }))

  return (
    <ChartContainer
      config={config}
      className="aspect-auto w-full"
      style={{ height: Math.max(180, items.length * 44) }}
    >
      <BarChart
        accessibilityLayer
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 12, left: 0, bottom: 0 }}
      >
        <CartesianGrid horizontal={false} />
        <XAxis type="number" hide domain={[0, "dataMax"]} />
        <YAxis
          type="category"
          dataKey="label"
          tickLine={false}
          axisLine={false}
          width={128}
          tickFormatter={(value: string) =>
            value.length > 16 ? `${value.slice(0, 15)}…` : value
          }
        />
        <ChartTooltip
          content={<ChartTooltipContent hideLabel />}
        />
        <Bar dataKey="value" fill="var(--color-value)" radius={4} />
      </BarChart>
    </ChartContainer>
  )
}
