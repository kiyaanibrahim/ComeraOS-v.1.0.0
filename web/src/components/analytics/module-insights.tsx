"use client"

import { useParams } from "next/navigation"

import { InsightsView } from "@/components/analytics/insights"
import { buildInsights } from "@/lib/analytics"

export function ModuleInsights({ title }: { title: string }) {
  const params = useParams()
  const businessId = typeof params.businessId === "string" ? params.businessId : "platform"
  return <InsightsView data={buildInsights(title, businessId)} />
}
