import { Suspense } from "react"
import Link from "next/link"

import { InsightsView } from "@/components/analytics/insights"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { buildInsights } from "@/lib/analytics"
import { loadVisibleBusiness } from "@/lib/load-business"

export default function HomePage({
  params,
}: {
  params: Promise<{ businessId: string }>
}) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted" />}>
      <HomeContent params={params} />
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

async function HomeContent({
  params,
}: {
  params: Promise<{ businessId: string }>
}) {
  const { businessId } = await params
  const business = await loadVisibleBusiness(businessId)
  if (!business) return <BusinessMissing />
  const base = `/app/${business.id}`
  const shortcuts = [
    { label: "Open POS", href: `${base}/pos` },
    { label: "Orders", href: `${base}/orders` },
    { label: "Inventory", href: `${base}/inventory` },
    { label: "CRM", href: `${base}/crm` },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-medium tracking-tight">Home</h1>
        <p className="text-sm text-muted-foreground">
          Sales, stock, and orders for {business.name}.
        </p>
      </div>

      <InsightsView data={buildInsights("Home", business.id)} />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Getting started</CardTitle>
            <CardDescription>
              Connect Supabase, then staff and catalog.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-2 pl-4 text-sm text-muted-foreground">
              <li>
                Add the project URL and anon key to{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">
                  web/.env.local
                </code>
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
              <Button
                key={item.href}
                variant="outline"
                nativeButton={false}
                render={<Link href={item.href} />}
              >
                {item.label}
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
