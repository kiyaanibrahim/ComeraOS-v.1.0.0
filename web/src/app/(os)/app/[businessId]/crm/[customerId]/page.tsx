import { Suspense } from "react"

import { CustomerProfile } from "@/components/crm/customer-profile"

export default function Page({
  params,
}: {
  params: Promise<{ businessId: string; customerId: string }>
}) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted" />}>
      <Screen params={params} />
    </Suspense>
  )
}

async function Screen({
  params,
}: {
  params: Promise<{ businessId: string; customerId: string }>
}) {
  const { businessId, customerId } = await params
  return <CustomerProfile businessKey={businessId} customerId={customerId} />
}
