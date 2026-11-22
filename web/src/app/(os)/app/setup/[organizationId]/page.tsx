import { Suspense } from "react"

import { OrganizationSetup } from "@/components/setup/organization-setup"

export default function Page({
  params,
}: {
  params: Promise<{ organizationId: string }>
}) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted" />}>
      <Setup params={params} />
    </Suspense>
  )
}

async function Setup({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params
  return <OrganizationSetup organizationId={organizationId} />
}
