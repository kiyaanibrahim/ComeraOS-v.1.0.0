import { Suspense } from "react"

import { ModuleInsights } from "@/components/analytics/module-insights"
import { RecordLedger } from "@/components/records/record-ledger"

type ModulePageProps = {
  title: string
  description: string
  section?: string
  children?: React.ReactNode
}

export function ModulePage({ title, description, children }: ModulePageProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-medium tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted" />}>
        <ModuleInsights title={title} />
        {children ?? <RecordLedger title={title} />}
      </Suspense>
    </div>
  )
}
