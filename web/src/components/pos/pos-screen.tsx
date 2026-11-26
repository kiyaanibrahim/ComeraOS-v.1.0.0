"use client"

import { statusVariant } from "@/components/status-badge"
import { useBusiness, type BusinessRecord, type FlowClient } from "@/lib/flow/use-business"
import { randomUUID } from "@/lib/utils"

export { statusVariant }

export function documentNumber(prefix: string) {
  const token = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()
  return `${prefix}-${token}`
}

export function PosScreen({
  businessKey,
  title,
  description,
  action,
  children,
}: {
  businessKey: string
  title: string
  description: string
  action?: React.ReactNode
  children: (ctx: { business: BusinessRecord; supabase: FlowClient }) => React.ReactNode
}) {
  const flow = useBusiness(businessKey)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-xl font-medium tracking-tight">{title}</h1>
          <p className="text-xs tracking-wide text-muted-foreground uppercase">{description}</p>
        </div>
        {action}
      </div>
      {!flow.ready ? <div className="h-40 animate-pulse rounded-xl bg-muted" /> : null}
      {flow.ready && flow.error ? <p className="text-sm text-destructive">{flow.error}</p> : null}
      {flow.ready && flow.business
        ? children({ business: flow.business, supabase: flow.supabase })
        : null}
    </div>
  )
}
