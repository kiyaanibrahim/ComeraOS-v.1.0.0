import { Suspense } from "react"

import { LandingCost } from "@/components/procurement/landing-cost"

export default function Page({
  params,
}: {
  params: Promise<{ businessId: string }>
}) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted" />}>
      <Desk params={params} />
    </Suspense>
  )
}

async function Desk({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params
  return <LandingCost businessKey={businessId} />
}
