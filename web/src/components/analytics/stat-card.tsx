"use client"

import { useId } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  XAxis,
  YAxis,
} from "recharts"

import { TrendBadge, trendTone } from "@/components/analytics/status-badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { cn } from "@/lib/utils"

export type StatSeriesPoint = { label: string; value: number }

export type StatChart =
  | { kind: "area"; values: number[] }
  | { kind: "line"; values: number[] }
  | { kind: "bar"; items: { label: string; value: number; display?: string }[] }
  | { kind: "pie"; items: { label: string; value: number }[] }
  | { kind: "radial"; value: number; total: number; label?: string }

/** Keep the fill seated on the bottom edge of the card; pad only above. */
function sparkDomain(values: number[]): [number, number] {
  const low = Math.min(...values)
  const high = Math.max(...values)
  const span = Math.max(high - low, Math.abs(high) * 0.08, 1)
  return [low, high + span * 0.28]
}

function MiniArea({ values, tone }: { values: number[]; tone: ReturnType<typeof trendTone> }) {
  const fillId = `stat-area-${useId().replace(/:/g, "")}`
  const config = {
    value: {
      label: "Value",
      color: tone === "negative" ? "var(--destructive)" : "var(--chart-1)",
    },
  } satisfies ChartConfig
  const data = values.map((value, index) => ({ index, value }))
  return (
    <ChartContainer config={config} className="aspect-auto h-full min-h-20 w-full">
      <AreaChart data={data} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-value)" stopOpacity={0.45} />
            <stop offset="100%" stopColor="var(--color-value)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <YAxis hide domain={sparkDomain(values)} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
        <Area
          dataKey="value"
          type="monotone"
          fill={`url(#${fillId})`}
          stroke="var(--color-value)"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  )
}

function MiniLine({ values, tone }: { values: number[]; tone: ReturnType<typeof trendTone> }) {
  const config = {
    value: {
      label: "Value",
      color: tone === "negative" ? "var(--destructive)" : "var(--chart-1)",
    },
  } satisfies ChartConfig
  const data = values.map((value, index) => ({ index, value }))
  return (
    <ChartContainer config={config} className="aspect-auto h-full min-h-20 w-full">
      <LineChart data={data} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
        <YAxis hide domain={sparkDomain(values)} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
        <Line
          dataKey="value"
          type="monotone"
          stroke="var(--color-value)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  )
}

function MiniBar({ values, tone }: { values: number[]; tone: ReturnType<typeof trendTone> }) {
  const config = {
    value: {
      label: "Value",
      color: tone === "negative" ? "var(--destructive)" : "var(--chart-1)",
    },
  } satisfies ChartConfig
  const data = values.map((value, index) => ({ index, value }))
  return (
    <ChartContainer config={config} className="aspect-auto h-full min-h-20 w-full">
      <BarChart data={data} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
        <YAxis hide domain={[0, "dataMax"]} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
        <Bar dataKey="value" fill="var(--color-value)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  )
}

function MiniRadial({ value, total, label }: { value: number; total: number; label?: string }) {
  const safeTotal = total > 0 ? total : 0
  const pct = safeTotal > 0 ? Math.min(100, Math.round((Math.max(value, 0) / safeTotal) * 100)) : 0
  const config = {
    value: { label: label ?? "Share", color: "var(--chart-1)" },
  } satisfies ChartConfig
  const data = [{ name: "value", value: pct, fill: "var(--color-value)" }]
  return (
    <ChartContainer config={config} className="mx-auto aspect-auto h-16 w-16">
      <RadialBarChart
        data={data}
        startAngle={90}
        endAngle={-270}
        innerRadius="68%"
        outerRadius="100%"
        margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
      >
        <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
        <RadialBar dataKey="value" background={{ fill: "var(--muted)" }} cornerRadius={8} isAnimationActive={false} />
        <Label
          content={({ viewBox }) => {
            if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null
            return (
              <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                <tspan className="fill-foreground text-[10px] font-semibold tabular-nums">{pct}%</tspan>
              </text>
            )
          }}
        />
      </RadialBarChart>
    </ChartContainer>
  )
}

function FullArea({ points }: { points: StatSeriesPoint[] }) {
  const fillId = `stat-full-area-${useId().replace(/:/g, "")}`
  const config = {
    value: { label: "Value", color: "var(--chart-1)" },
  } satisfies ChartConfig
  return (
    <div className="h-56 overflow-hidden">
      <ChartContainer config={config} className="aspect-auto h-full w-full">
        <AreaChart data={points} margin={{ left: 0, right: 12, top: 8, bottom: 4 }}>
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.7} />
              <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tick={{ fontSize: 11 }} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            tick={{ fontSize: 11 }}
            tickFormatter={(v) =>
              typeof v === "number" && Math.abs(v) >= 1000
                ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`
                : String(v)
            }
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Area
            dataKey="value"
            type="natural"
            fill={`url(#${fillId})`}
            stroke="var(--color-value)"
            strokeWidth={2}
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  )
}

function FullBar({ items }: { items: { label: string; value: number; display?: string }[] }) {
  const config = {
    value: { label: "Amount", color: "var(--chart-1)" },
  } satisfies ChartConfig
  const data = items.map((item) => ({ label: item.label, value: item.value, display: item.display }))
  const height = Math.max(180, Math.max(items.length, 1) * 36)
  return (
    <div className="overflow-hidden" style={{ height }}>
      <ChartContainer config={config} className="aspect-auto h-full w-full">
        <BarChart data={data} layout="vertical" margin={{ left: 4, right: 12, top: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} />
          <XAxis type="number" hide domain={[0, "dataMax"]} />
          <YAxis
            type="category"
            dataKey="label"
            width={112}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tick={{ fontSize: 11 }}
            tickFormatter={(value: string) => (value.length > 16 ? `${value.slice(0, 15)}…` : value)}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(value, _name, item) => {
                  const display = (item?.payload as { display?: string } | undefined)?.display
                  return display ?? String(value)
                }}
              />
            }
          />
          <Bar dataKey="value" fill="var(--color-value)" radius={[0, 4, 4, 0]} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
    </div>
  )
}

function FullPie({ items }: { items: { label: string; value: number }[] }) {
  const palette = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]
  const config = Object.fromEntries(
    items.map((item, index) => [
      `item-${index}`,
      { label: item.label, color: palette[index % palette.length] },
    ]),
  ) satisfies ChartConfig
  const data = items.map((item, index) => ({
    key: `item-${index}`,
    label: item.label,
    value: item.value,
    fill: `var(--color-item-${index})`,
  }))
  return (
    <ChartContainer config={config} className="mx-auto aspect-auto h-56 w-full max-w-[240px]">
      <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <ChartTooltip content={<ChartTooltipContent nameKey="label" hideLabel />} />
        <Pie data={data} dataKey="value" nameKey="label" innerRadius={48} outerRadius={78} strokeWidth={2} isAnimationActive={false}>
          {data.map((item) => (
            <Cell key={item.key} fill={item.fill} />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  )
}

function isFlushSpark(chart: StatChart) {
  return chart.kind === "area" || chart.kind === "line"
}

/** Compact metric card — spark charts sit flush to the card edges (blocks.so /stats). */
export function StatCard({
  label,
  value,
  delta,
  invert = false,
  chart,
  size = "compact",
  className,
  description,
}: {
  label: string
  value: string
  delta?: number | null
  invert?: boolean
  chart?: StatChart | null
  size?: "compact" | "full"
  className?: string
  description?: string
}) {
  const tone = delta == null || !Number.isFinite(delta) ? "neutral" : trendTone(delta, invert)
  const showDelta = delta != null && Number.isFinite(delta)
  const flush = Boolean(chart && size === "compact" && isFlushSpark(chart))
  const radial = Boolean(chart && size === "compact" && chart.kind === "radial")

  return (
    <Card
      size={size === "compact" ? "sm" : "default"}
      className={cn(
        "gap-0 overflow-hidden py-0",
        size === "compact" ? "min-w-0" : undefined,
        className,
      )}
    >
      {radial && chart?.kind === "radial" ? (
        <CardHeader className="grid grid-cols-[1fr_auto] items-center gap-3 py-(--card-spacing)">
          <div className="min-w-0 space-y-1">
            <CardDescription>{label}</CardDescription>
            <CardTitle className="text-2xl tabular-nums tracking-tight">{value}</CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
            {showDelta ? <TrendBadge delta={delta!} invert={invert} /> : null}
          </div>
          <MiniRadial value={chart.value} total={chart.total} label={chart.label} />
        </CardHeader>
      ) : (
        <>
          <CardHeader className={cn("gap-2 pt-(--card-spacing)", flush ? "pb-0" : undefined)}>
            <CardDescription>{label}</CardDescription>
            <CardTitle className={cn("tabular-nums tracking-tight", size === "compact" ? "text-2xl" : undefined)}>
              {value}
            </CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
            {showDelta ? (
              <CardAction>
                <TrendBadge delta={delta} invert={invert} />
              </CardAction>
            ) : null}
          </CardHeader>
          {chart ? (
            flush ? (
              <CardContent className="mt-auto flex min-h-20 flex-1 flex-col justify-end px-0 pb-0 pt-3">
                <div className="min-h-20 flex-1 overflow-hidden">
                  {chart.kind === "area" ? <MiniArea values={chart.values} tone={tone} /> : null}
                  {chart.kind === "line" ? <MiniLine values={chart.values} tone={tone} /> : null}
                </div>
              </CardContent>
            ) : (
              <CardContent className={cn("pb-(--card-spacing)", size === "compact" ? "pt-2" : "pt-(--card-spacing)")}>
                {chart.kind === "area" ? (
                  size === "full" ? (
                    <FullArea points={chart.values.map((point, index) => ({ label: String(index + 1), value: point }))} />
                  ) : (
                    <div className="h-20 overflow-hidden">
                      <MiniArea values={chart.values} tone={tone} />
                    </div>
                  )
                ) : null}
                {chart.kind === "line" ? (
                  <div className="h-20 overflow-hidden">
                    <MiniLine values={chart.values} tone={tone} />
                  </div>
                ) : null}
                {chart.kind === "bar" ? (
                  size === "compact" && chart.items.length <= 14 ? (
                    <div className="h-20 overflow-hidden">
                      <MiniBar values={chart.items.map((item) => item.value)} tone={tone} />
                    </div>
                  ) : (
                    <FullBar items={chart.items} />
                  )
                ) : null}
                {chart.kind === "pie" ? <FullPie items={chart.items} /> : null}
              </CardContent>
            )
          ) : (
            <div className="pb-(--card-spacing)" />
          )}
        </>
      )}
    </Card>
  )
}

export function SeriesAreaCard({
  label,
  description,
  points,
  value,
  delta,
  invert,
  className,
}: {
  label: string
  description?: string
  points: StatSeriesPoint[]
  value?: string
  delta?: number | null
  invert?: boolean
  className?: string
}) {
  return (
    <Card className={cn("gap-0 overflow-hidden py-0", className)}>
      <CardHeader className="gap-1 pt-(--card-spacing) pb-0">
        <CardTitle>{label}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {value ? <CardTitle className="text-2xl tabular-nums">{value}</CardTitle> : null}
        {delta != null && Number.isFinite(delta) ? (
          <CardAction>
            <TrendBadge delta={delta} invert={invert} />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="px-0 pt-4 pb-0">
        {points.length === 0 ? (
          <p className="px-(--card-spacing) pb-(--card-spacing) text-sm text-muted-foreground">No data in this range.</p>
        ) : (
          <FullArea points={points} />
        )}
      </CardContent>
    </Card>
  )
}

export function RankedBarCard({
  label,
  description,
  items,
  empty = "No data in this range.",
  className,
}: {
  label: string
  description?: string
  items: { label: string; value: number; display?: string }[]
  empty?: string
  className?: string
}) {
  return (
    <Card className={cn("gap-0 overflow-hidden py-0", className)}>
      <CardHeader className="gap-1 pt-(--card-spacing) pb-0">
        <CardTitle>{label}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="px-0 pt-4 pb-0">
        {items.length === 0 ? (
          <p className="px-(--card-spacing) pb-(--card-spacing) text-sm text-muted-foreground">{empty}</p>
        ) : (
          <FullBar items={items} />
        )}
      </CardContent>
    </Card>
  )
}
