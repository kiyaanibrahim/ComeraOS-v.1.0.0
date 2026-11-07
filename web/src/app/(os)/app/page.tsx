import Link from "next/link"

import { InsightsView } from "@/components/analytics/insights"
import { StatusBadge, TrendBadge } from "@/components/analytics/status-badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { buildInsights } from "@/lib/analytics"
import { businesses, formatMoney } from "@/lib/businesses"

export default function BusinessesPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-medium tracking-tight">
          Business portfolio
        </h1>
        <p className="text-sm text-muted-foreground">
          Every business you own, in one view. Open a card to enter that business.
        </p>
      </div>

      <InsightsView data={buildInsights("Business portfolio", "platform")} />

      <div className="grid gap-4 sm:grid-cols-2">
        {businesses.map((business) => {
          const salesTrend = buildInsights("Home", business.id).metrics[0]
          return (
          <Link
            key={business.id}
            href={`/app/${business.id}`}
            className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Card className="h-full transition-colors hover:bg-muted/40">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <CardTitle>{business.name}</CardTitle>
                    <CardDescription>{business.plan}</CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <TrendBadge delta={salesTrend?.delta ?? 0} />
                    <StatusBadge
                      tone={business.billingStatus === "Current" ? "positive" : "negative"}
                    >
                      {business.billingStatus}
                    </StatusBadge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-3">
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
              </CardContent>
            </Card>
          </Link>
          )
        })}
      </div>
    </div>
  )
}
