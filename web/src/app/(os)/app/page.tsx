import { BusinessPortfolio } from "@/components/business-portfolio"
import { InsightsView } from "@/components/analytics/insights"
import { buildInsights } from "@/lib/analytics"

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

      <BusinessPortfolio />
    </div>
  )
}
