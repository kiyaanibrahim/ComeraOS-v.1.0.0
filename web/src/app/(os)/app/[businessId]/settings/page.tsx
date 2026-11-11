import { Suspense } from "react"

import { SettingsOverview } from "@/components/settings/settings-overview"

export default function SettingsPage({
  params,
}: {
  params: Promise<{ businessId: string }>
}) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted" />}>
      <Overview params={params} />
    </Suspense>
  )
}

async function Overview({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params
  return <SettingsOverview businessKey={businessId} />
}
