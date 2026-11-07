import { Suspense } from "react"

import { ShipmentDetail } from "@/components/procurement/shipment-detail"

export default function Page({
  params,
}: {
  params: Promise<{ businessId: string; shipmentId: string }>
}) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted" />}>
      <Desk params={params} />
    </Suspense>
  )
}

async function Desk({
  params,
}: {
  params: Promise<{ businessId: string; shipmentId: string }>
}) {
  const { businessId, shipmentId } = await params
  return <ShipmentDetail businessKey={businessId} shipmentId={shipmentId} />
}
