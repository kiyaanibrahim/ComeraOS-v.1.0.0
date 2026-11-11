import { Suspense } from "react"

import { StaffDesk } from "@/components/settings/staff-desk"

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
  return <StaffDesk businessKey={businessId} />
}
