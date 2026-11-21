"use client"

import { useEffect, useState } from "react"

import { PosScreen } from "@/components/pos/pos-screen"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { money } from "@/lib/flow/format"
import type { BusinessRecord, FlowClient } from "@/lib/flow/use-business"

type OrderRow = {
  id: string
  number: string
  status: string
  total: number
  created_at: string
}

const filters = [
  { id: "pending", label: "Pending", statuses: ["draft"] },
  { id: "progress", label: "In progress", statuses: ["open"] },
  { id: "finished", label: "Finished", statuses: ["completed"] },
] as const

export function OnlineOrders({ businessKey }: { businessKey: string }) {
  return (
    <PosScreen businessKey={businessKey} title="Online orders" description="Orders that arrived with source online.">
      {({ business, supabase }) => <List business={business} supabase={supabase} />}
    </PosScreen>
  )
}

function List({ business, supabase }: { business: BusinessRecord; supabase: FlowClient }) {
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("pending")
  const [rows, setRows] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const current = filters.find((item) => item.id === filter) ?? filters[0]

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void supabase
      .from("orders")
      .select("id, number, status, total, created_at")
      .eq("business_id", business.id)
      .eq("source", "online")
      .in("status", [...current.statuses])
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        if (cancelled) return
        setRows((data ?? []) as OrderRow[])
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [business.id, current.statuses, supabase])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {filters.map((item) => (
          <Button key={item.id} type="button" size="sm" variant={filter === item.id ? "default" : "outline"} onClick={() => setFilter(item.id)}>
            {item.label}
          </Button>
        ))}
      </div>
      <Card>
        <CardContent className="flex flex-col gap-3 px-4">
          {loading ? <div className="h-24 animate-pulse rounded-xl bg-muted" /> : null}
          {!loading && rows.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No online orders</EmptyTitle>
                <EmptyDescription>Orders stored with source online show up here.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
          {rows.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-3 text-sm">
              <div>
                <p className="font-medium">{row.number}</p>
                <p className="text-muted-foreground">{new Date(row.created_at).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="capitalize">{row.status}</Badge>
                <span className="tabular-nums">{money(Number(row.total), business.currency)}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
