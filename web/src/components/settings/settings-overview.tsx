"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { settingsItems } from "@/lib/nav"
import { useBusiness } from "@/lib/flow/use-business"

const descriptions: Record<string, string> = {
  "Business config": "Name, locale, tax ID, and document prefixes.",
  Locations: "Stores, warehouses, and operating sites.",
  Registers: "Tills for each store, and the warehouse they sell from.",
  Staff: "People, roles, and access.",
  "Payment & billing": "Plan, renewal, and invoices.",
  Extensions: "Online store, accounting, and developer connections.",
}

export function SettingsOverview({ businessKey }: { businessKey: string }) {
  const { supabase, business, error } = useBusiness(businessKey)
  const [summary, setSummary] = useState("Loading organization settings…")

  useEffect(() => {
    if (!business) return
    let cancelled = false
    void Promise.all([
      supabase.from("locations").select("id", { count: "exact", head: true }).eq("business_id", business.id),
      supabase.from("business_members").select("id", { count: "exact", head: true }).eq("business_id", business.id),
      supabase
        .from("subscriptions")
        .select("plan_id, plans(name)")
        .eq("business_id", business.id)
        .order("created_at", { ascending: false })
        .limit(1),
    ]).then(([locations, members, subscription]) => {
      if (cancelled) return
      if (locations.error || members.error || subscription.error) {
        setSummary(locations.error?.message ?? members.error?.message ?? subscription.error?.message ?? "Couldn't load the summary.")
        return
      }
      const plan = subscription.data?.[0]?.plans
      const planName = plan && typeof plan === "object" && "name" in plan && typeof plan.name === "string" ? plan.name : "No plan"
      const locationCount = locations.count ?? 0
      const memberCount = members.count ?? 0
      setSummary(`${locationCount} locations · ${memberCount} staff · ${planName}`)
    })
    return () => {
      cancelled = true
    }
  }, [business, supabase])

  const links = business ? settingsItems(business.slug).filter((item) => item.label !== "Overview") : []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-medium tracking-tight">Organization settings</h1>
        <p className="text-sm text-muted-foreground">
          {business ? `${business.name}. ${summary}` : summary}
        </p>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="grid gap-4 md:grid-cols-2">
        {links.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Card className="h-full transition-colors hover:bg-muted/40">
              <CardHeader>
                <CardTitle>{item.label}</CardTitle>
                <CardDescription>{descriptions[item.label]}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
