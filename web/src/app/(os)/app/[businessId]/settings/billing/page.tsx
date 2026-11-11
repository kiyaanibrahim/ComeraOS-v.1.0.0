import { Suspense } from "react"

import { BillingDesk } from "@/components/settings/billing-desk"

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
  return <BillingDesk businessKey={businessId} />
}
