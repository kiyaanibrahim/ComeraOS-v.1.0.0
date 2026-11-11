import { Suspense } from "react"

import { PosSessions } from "@/components/pos/pos-sessions"

export default function Page({
  params,
}: {
  params: Promise<{ businessId: string }>
}) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted" />}>
      <Screen params={params} />
    </Suspense>
  )
}

async function Screen({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params
  return <PosSessions businessKey={businessId} />
}
