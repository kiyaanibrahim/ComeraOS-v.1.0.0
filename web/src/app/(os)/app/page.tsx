import { Suspense } from "react"

import { BusinessPortfolio } from "@/components/business-portfolio"

export default function BusinessesPage() {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted" />}>
      <BusinessesContent />
    </Suspense>
  )
}

async function BusinessesContent() {
  return <BusinessPortfolio />
}
