import { AreaChart, BarList, DonutChart, Sparkline } from "@/components/analytics/charts"
import { TrendBadge, trendTone } from "@/components/analytics/status-badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { Insights } from "@/lib/analytics"

export function MetricGrid({ metrics }: { metrics: Insights["metrics"] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <Card key={metric.label} size="sm" className="min-w-0 overflow-visible">
          <CardHeader>
            <CardDescription>{metric.label}</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{metric.display}</CardTitle>
            <CardAction>
              <TrendBadge delta={metric.delta} invert={metric.invert} />
            </CardAction>
          </CardHeader>
          <CardContent>
            <Sparkline
              values={metric.values.slice(-7)}
              tone={trendTone(metric.delta, metric.invert)}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function InsightsView({
  data,
  variant = "full",
}: {
  data: Insights
  variant?: "full" | "compact"
}) {
  return (
    <div className="flex flex-col gap-4">
      <MetricGrid metrics={data.metrics} />
      <div className={variant === "full" ? "grid gap-4 lg:grid-cols-5" : "grid gap-4"}>
        <div className={variant === "full" ? "min-w-0 lg:col-span-3" : "min-w-0"}>
          <AreaChart
            labels={data.trend.labels}
            series={data.trend.series}
            format={data.trend.format}
            label={data.trend.title}
          />
        </div>
        {variant === "full" ? (
          <Card className="min-w-0 overflow-visible lg:col-span-2">
            <CardHeader>
              <CardTitle>{data.split.title}</CardTitle>
              <CardDescription>{data.split.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <DonutChart items={data.split.items} label={data.split.title} />
            </CardContent>
          </Card>
        ) : null}
      </div>
      {variant === "full" ? (
        <Card className="min-w-0 overflow-visible">
          <CardHeader>
            <CardTitle>{data.bars.title}</CardTitle>
            <CardDescription>{data.bars.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList items={data.bars.items} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
