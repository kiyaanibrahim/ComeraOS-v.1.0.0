import { Suspense } from "react"

import { BusinessConfig } from "@/components/settings/business-config"

export default function Page({
  params,
}: {
  params: Promise<{ businessId: string }>
}) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted" />}>
      <Config params={params} />
    </Suspense>
  )
}

async function Config({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params
  return <BusinessConfig businessKey={businessId} />
}
