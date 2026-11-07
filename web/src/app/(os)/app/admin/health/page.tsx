import { InsightsView } from "@/components/analytics/insights"
import { StatusBadge } from "@/components/analytics/status-badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { buildInsights } from "@/lib/analytics"

export default function PlatformHealthPage() {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-xl font-medium tracking-tight">
            Health
          </h1>
          <p className="text-sm text-muted-foreground">
            Service health and audit signals.
          </p>
        </div>
        <StatusBadge tone={configured ? "positive" : "negative"}>
          {configured ? "Supabase connected" : "Supabase pending"}
        </StatusBadge>
      </div>
      <InsightsView data={buildInsights("Health", "platform")} />
      <Card>
        <CardHeader>
          <CardTitle>Data plane</CardTitle>
          <CardDescription>
            Free-tier Supabase holds auth, Postgres, and storage.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Paste the project URL and anon key into{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">
            web/.env.local
          </code>{" "}
          and restart the dev server.
        </CardContent>
      </Card>
    </div>
  )
}
