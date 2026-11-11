import { Suspense } from "react"

import { OrderDetail } from "@/components/sales/order-detail"

export default function Page({
  params,
}: {
  params: Promise<{ businessId: string; orderId: string }>
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
  params: Promise<{ businessId: string; orderId: string }>
}) {
  const { businessId, orderId } = await params
  return <OrderDetail businessKey={businessId} orderId={orderId} />
}
