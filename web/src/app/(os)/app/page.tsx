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
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-medium tracking-tight">
          Business portfolio
        </h1>
        <p className="text-sm text-muted-foreground">
          Every organization you own. Open a business on its card to enter that business.
        </p>
      </div>

      <BusinessPortfolio />
    </div>
  )
}
