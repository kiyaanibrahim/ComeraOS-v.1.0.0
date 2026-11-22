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

type SetupSummary = {
  organizationId: string
  organization: string
  industry: string
  places: string[]
  stores: string[]
  warehouses: string[]
  registers: string[]
  staff: number
  plan: string
}

function addressLine(address: unknown) {
  if (!address || typeof address !== "object" || Array.isArray(address)) return ""
  const line = "line" in address && typeof address.line === "string" ? address.line.trim() : ""
  return line
}

export function SettingsOverview({ businessKey }: { businessKey: string }) {
  const { supabase, business, error } = useBusiness(businessKey)
  const [summary, setSummary] = useState("Loading business settings…")
  const [setup, setSetup] = useState<SetupSummary | null>(null)

  useEffect(() => {
    if (!business) return
    let cancelled = false
    void (async () => {
      const [businessRow, places, locations, registers, members, subscription] = await Promise.all([
        supabase.from("businesses").select("organization_id, industry_id, organizations(name)").eq("id", business.id).maybeSingle(),
        supabase.from("places").select("name, address").eq("business_id", business.id).order("name"),
        supabase.from("locations").select("name, kind, sales_channel").eq("business_id", business.id).order("name"),
        supabase.from("registers").select("name").eq("business_id", business.id).order("name"),
        supabase.from("business_members").select("id", { count: "exact", head: true }).eq("business_id", business.id),
        supabase.from("subscriptions").select("plan_id, plans(name)").eq("business_id", business.id).order("created_at", { ascending: false }).limit(1),
      ])
      if (cancelled) return
      const failed = businessRow.error ?? places.error ?? locations.error ?? registers.error ?? members.error ?? subscription.error
      if (failed) {
        setSummary(failed.message)
        setSetup(null)
        return
      }
      const organizationId = businessRow.data?.organization_id ?? ""
      const industryRow = businessRow.data?.industry_id
        ? await supabase.from("organization_industries").select("name").eq("id", businessRow.data.industry_id).maybeSingle()
        : { data: null, error: null }
      if (cancelled) return
      if (industryRow.error) {
        setSummary(industryRow.error.message)
        return
      }
      const organization = businessRow.data?.organizations
      const organizationName = organization && !Array.isArray(organization) ? organization.name : ""
      const plan = subscription.data?.[0]?.plans
      const planName = plan && typeof plan === "object" && "name" in plan && typeof plan.name === "string" ? plan.name : "No plan"
      const locationRows = locations.data ?? []
      const next = {
        organizationId,
        organization: organizationName,
        industry: industryRow.data?.name ?? "",
        places: (places.data ?? []).map((place) => {
          const line = addressLine(place.address)
          return line ? `${place.name} · ${line}` : place.name
        }),
        stores: locationRows.filter((row) => row.kind === "store" || row.kind === "site").map((row) => row.name),
        warehouses: locationRows.filter((row) => row.kind === "warehouse").map((row) => row.name),
        registers: (registers.data ?? []).map((row) => row.name),
        staff: members.count ?? 0,
        plan: planName,
      }
      setSetup(next)
      const parts = [
        next.organization,
        next.industry,
        `${next.stores.length + next.warehouses.length} location${next.stores.length + next.warehouses.length === 1 ? "" : "s"}`,
        `${next.registers.length} register${next.registers.length === 1 ? "" : "s"}`,
        `${next.staff} staff`,
        next.plan,
      ].filter(Boolean)
      setSummary(parts.join(" · "))
    })()
    return () => {
      cancelled = true
    }
  }, [business, supabase])

  const links = business ? settingsItems(business.slug).filter((item) => item.label !== "Overview") : []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-medium tracking-tight">Business settings</h1>
        <p className="text-sm text-muted-foreground">
          {business ? `${business.name}. ${summary}` : summary}
        </p>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {setup ? (
        <Card>
          <CardHeader>
            <CardTitle>{setup.organization || "Organization"}</CardTitle>
            <CardDescription>
              {setup.industry ? `${setup.industry}. ` : ""}
              This is the organization setup for {business?.name ?? "this business"}.
              {setup.organizationId ? (
                <>
                  {" "}
                  <Link href={`/app/setup/${setup.organizationId}`} className="text-foreground underline-offset-4 hover:underline">
                    Open the map
                  </Link>
                </>
              ) : null}
            </CardDescription>
          </CardHeader>
          <div className="grid gap-4 px-6 pb-6 text-sm sm:grid-cols-2">
            <SetupList title="Places" values={setup.places} empty="No place yet." />
            <SetupList title="Stores" values={setup.stores} empty="No store yet." />
            <SetupList title="Warehouses" values={setup.warehouses} empty="No warehouse yet." />
            <SetupList title="Registers" values={setup.registers} empty="No register yet." />
          </div>
        </Card>
      ) : null}
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

function SetupList({ title, values, empty }: { title: string; values: string[]; empty: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-medium">{title}</p>
      {values.length === 0 ? <p className="text-muted-foreground">{empty}</p> : null}
      {values.map((value) => (
        <p key={value} className="text-muted-foreground">{value}</p>
      ))}
    </div>
  )
}
