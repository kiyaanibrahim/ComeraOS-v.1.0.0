"use client"

import Link from "next/link"

import { type BusinessRecord, type FlowClient, useBusiness } from "@/lib/flow/use-business"

const steps = [
  ["Products", "products"],
  ["Buying", "procurement"],
  ["Inventory", "inventory"],
  ["POS", "pos"],
] as const

export function Chain({ businessKey }: { businessKey: string }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
      {steps.map(([label, path], index) => (
        <span key={path} className="inline-flex items-center gap-2">
          {index > 0 ? <span aria-hidden="true">→</span> : null}
          <Link className="underline-offset-4 hover:underline" href={`/app/${businessKey}/${path}`}>
            {label}
          </Link>
        </span>
      ))}
    </p>
  )
}

export function FlowFrame({
  businessKey,
  title,
  description,
  children,
}: {
  businessKey: string
  title: string
  description: string
  children: (ctx: { business: BusinessRecord; supabase: FlowClient }) => React.ReactNode
}) {
  const flow = useBusiness(businessKey)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-xl font-medium tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
        <Chain businessKey={businessKey} />
      </div>
      {!flow.ready ? <div className="h-40 animate-pulse rounded-xl bg-muted" /> : null}
      {flow.ready && flow.error ? (
        <p className="text-sm text-destructive">{flow.error}</p>
      ) : null}
      {flow.ready && flow.business
        ? children({ business: flow.business, supabase: flow.supabase })
        : null}
    </div>
  )
}
