"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"

import { DataTable } from "@/components/data-table/data-table"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import type { DataTableFeatures } from "@/components/data-table/data-table-features"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { toast } from "@/components/ui/sonner"
import { useBusiness } from "@/lib/flow/use-business"

type Plan = {
  id: string
  name: string
  code: string
  price: number
  interval: string
}

type Invoice = {
  id: string
  number: string
  status: string
  amount: number
  due_on: string | null
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format(value)
}

function day(value: string | null) {
  if (!value) return "—"
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export function BillingDesk({ businessKey }: { businessKey: string }) {
  const { supabase, business, error: loadError } = useBusiness(businessKey)
  const [plans, setPlans] = useState<Plan[]>([])
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null)
  const [planId, setPlanId] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [periodEnd, setPeriodEnd] = useState<string | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [savingId, setSavingId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!business) return
    const [planResult, subscriptionResult, invoiceResult] = await Promise.all([
      supabase.from("plans").select("id, name, code, price, interval, active").eq("active", true).order("price"),
      supabase
        .from("subscriptions")
        .select("id, plan_id, status, current_period_end, created_at")
        .eq("business_id", business.id)
        .order("created_at", { ascending: false })
        .limit(1),
      supabase
        .from("platform_invoices")
        .select("id, number, status, amount, due_on")
        .eq("business_id", business.id)
        .order("due_on", { ascending: false }),
    ])
    if (planResult.error || subscriptionResult.error || invoiceResult.error) {
      toast.error(planResult.error?.message ?? subscriptionResult.error?.message ?? invoiceResult.error?.message ?? "Couldn't load billing.")
      return
    }
    setPlans(
      (planResult.data ?? []).map((plan) => ({
        id: plan.id,
        name: plan.name,
        code: plan.code,
        price: Number(plan.price),
        interval: plan.interval,
      })),
    )
    const current = subscriptionResult.data?.[0]
    setSubscriptionId(current?.id ?? null)
    setPlanId(current?.plan_id ?? null)
    setStatus(current?.status ?? null)
    setPeriodEnd(current?.current_period_end ?? null)
    setInvoices(
      (invoiceResult.data ?? []).map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        amount: Number(invoice.amount),
        due_on: invoice.due_on,
      })),
    )
  }, [business, supabase])

  useEffect(() => {
    void reload()
  }, [reload])

  async function choosePlan(nextPlanId: string) {
    if (!business || nextPlanId === planId) return
    setSavingId(nextPlanId)
    const period = new Date(Date.now() + 30 * 86400000).toISOString()
    const result = subscriptionId
      ? await supabase
          .from("subscriptions")
          .update({ plan_id: nextPlanId, status: "active", current_period_end: period })
          .eq("id", subscriptionId)
          .eq("business_id", business.id)
      : await supabase.from("subscriptions").insert({
          business_id: business.id,
          plan_id: nextPlanId,
          status: "active",
          current_period_end: period,
        })
    setSavingId(null)
    if (result.error) {
      toast.error(result.error.message)
      return
    }
    toast.success("Plan updated.")
    await reload()
  }

  const current = plans.find((plan) => plan.id === planId)
  const currency = business?.currency ?? "USD"
  const columns = useMemo<ColumnDef<DataTableFeatures, Invoice>[]>(
    () => [
      {
        accessorKey: "number",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Number" />,
        filterFn: "includesString",
      },
      {
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <span className="capitalize">{row.original.status.replaceAll("_", " ")}</span>,
      },
      {
        accessorKey: "amount",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
        cell: ({ row }) => money(row.original.amount, currency),
      },
      {
        accessorKey: "due_on",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Due" />,
        cell: ({ row }) => day(row.original.due_on),
      },
    ],
    [currency],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-medium tracking-tight">Payment & billing</h1>
        <p className="text-sm text-muted-foreground">
          Plan and invoices for {business?.name ?? "this business"}.
          {status ? ` Current status: ${status}.` : ""}
          {periodEnd ? ` Renews ${day(periodEnd)}.` : ""}
        </p>
      </div>
      {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
      <div className="grid gap-4 md:grid-cols-3">
        {plans.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No plans</CardTitle>
              <CardDescription>Plans appear here once they are published.</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          plans.map((plan) => {
            const selected = plan.id === planId
            return (
              <Card key={plan.id}>
                <CardHeader>
                  <CardTitle>{plan.name}</CardTitle>
                  <CardDescription>
                    {money(plan.price, business?.currency ?? "USD")} / {plan.interval}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{plan.code}</p>
                </CardContent>
                <CardFooter>
                  <Button
                    type="button"
                    variant={selected ? "secondary" : "default"}
                    disabled={!business || selected || savingId !== null}
                    onClick={() => void choosePlan(plan.id)}
                  >
                    {selected ? "Current plan" : savingId === plan.id ? "Saving…" : "Use this plan"}
                  </Button>
                </CardFooter>
              </Card>
            )
          })
        )}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
          <CardDescription>
            {current ? `${current.name} is the active plan.` : "No plan selected yet."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={invoices} filterColumn="number" filterPlaceholder="Search invoices…" empty="No invoices yet." getRowId={(row) => row.id} />
        </CardContent>
      </Card>
    </div>
  )
}
