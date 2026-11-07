import { Suspense } from "react"
import Link from "next/link"

import { InsightsView } from "@/components/analytics/insights"
import { StatusBadge } from "@/components/analytics/status-badge"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { buildInsights } from "@/lib/analytics"
import { getBusiness } from "@/lib/businesses"

export default function SettingsPage({
  params,
}: {
  params: Promise<{ businessId: string }>
}) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted" />}>
      <SettingsContent params={params} />
    </Suspense>
  )
}

async function SettingsContent({
  params,
}: {
  params: Promise<{ businessId: string }>
}) {
  const { businessId } = await params
  const business = getBusiness(businessId)
  const base = `/app/${business.id}/settings`
  const links = [
    {
      href: `${base}/settings`,
      label: "Business config",
      description: "Identity, locale, and operating defaults.",
    },
    {
      href: `${base}/staff`,
      label: "Staff",
      description: "People, roles, and permission grants.",
    },
    {
      href: `${base}/billing`,
      label: "Payment & billing",
      description: "Plans, invoices, and renewals.",
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-xl font-medium tracking-tight">
            Settings
          </h1>
          <p className="text-sm text-muted-foreground">
            Business config, staff, and billing for {business.name}.
          </p>
        </div>
        <StatusBadge tone={business.billingStatus === "Current" ? "positive" : "negative"}>
          {business.billingStatus}
        </StatusBadge>
      </div>

      <InsightsView data={buildInsights("Settings", business.id)} />

      <div className="grid gap-4 md:grid-cols-3">
        {links.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Card className="h-full transition-colors hover:bg-muted/40">
              <CardHeader>
                <CardTitle>{item.label}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
