"use client"

import { useCallback, useEffect, useState } from "react"
import { Building2Icon } from "lucide-react"

import { StatusBadge } from "@/components/analytics/status-badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatMoney, presentBusiness, slugFromName, type Business } from "@/lib/businesses"
import { toast } from "@/components/ui/sonner"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"

export function BusinessPortfolio() {
  const [rows, setRows] = useState<Business[]>([])
  const [stats, setStats] = useState<Record<string, { sales: number; openOrders: number; staff: number; locations: number }>>({})
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [pending, setPending] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase.from("businesses").select("id, name, slug, currency").order("name")
    if (error || !data) {
      setRows([])
      const text = error?.message ?? "Couldn't load businesses."
      setLoadError(text)
      toast.error(text)
      return
    }
    setLoadError(null)
    setRows(data.map((row) => presentBusiness(row)))
    const ids = data.map((row) => row.id)
    if (ids.length === 0) {
      setStats({})
      return
    }
    const since = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString()
    const [openOrders, salesOrders, members, locations] = await Promise.all([
      supabase.from("orders").select("business_id").in("business_id", ids).eq("status", "open"),
      supabase.from("orders").select("business_id, total, created_at").in("business_id", ids).eq("status", "completed").gte("created_at", since),
      supabase.from("business_members").select("business_id").in("business_id", ids),
      supabase.from("locations").select("business_id").in("business_id", ids),
    ])
    const today = new Date().toISOString().slice(0, 10)
    const next: Record<string, { sales: number; openOrders: number; staff: number; locations: number }> = {}
    for (const row of data) next[row.slug] = { sales: 0, openOrders: 0, staff: 0, locations: 0 }
    for (const order of openOrders.data ?? []) {
      const slug = data.find((row) => row.id === order.business_id)?.slug
      if (slug && next[slug]) next[slug].openOrders += 1
    }
    for (const order of salesOrders.data ?? []) {
      const slug = data.find((row) => row.id === order.business_id)?.slug
      if (!slug || !next[slug]) continue
      if (order.created_at.slice(0, 10) === today) next[slug].sales += Number(order.total)
    }
    for (const member of members.data ?? []) {
      const slug = data.find((row) => row.id === member.business_id)?.slug
      if (slug && next[slug]) next[slug].staff += 1
    }
    for (const location of locations.data ?? []) {
      const slug = data.find((row) => row.id === location.business_id)?.slug
      if (slug && next[slug]) next[slug].locations += 1
    }
    setStats(next)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function createBusiness(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setPending(true)
    const supabase = createClient()
    const { data: auth } = await supabase.auth.getUser()
    const user = auth.user
    if (!user) {
      setPending(false)
      toast.error("Sign in before adding a business.")
      return
    }
    const slug = slugFromName(trimmed)
    const { error } = await supabase.from("businesses").insert({
      name: trimmed,
      slug,
      owner_id: user.id,
    })
    setPending(false)
    if (error) {
      toast.error(error.message)
      return
    }
    setName("")
    setOpen(false)
    toast.success("Business added.")
    await load()
  }

  return (
    <>
      {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {rows.map((business) => {
          const figures = stats[business.id] ?? { sales: business.sales, openOrders: business.openOrders, staff: business.staff, locations: 0 }
          return (
            <Link
              key={business.id}
              href={`/app/${business.id}`}
              className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Card className="h-full transition-colors hover:bg-muted/40">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <CardTitle>{business.name}</CardTitle>
                      <CardDescription>{business.plan}</CardDescription>
                    </div>
                    <StatusBadge tone={business.billingStatus === "Current" ? "positive" : "negative"}>
                      {business.billingStatus}
                    </StatusBadge>
                  </div>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Sales</span>
                    <span className="font-medium">{formatMoney(figures.sales)}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Open orders</span>
                    <span className="font-medium">{figures.openOrders}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Staff</span>
                    <span className="font-medium">{figures.staff}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
        <div
          role="button"
          tabIndex={0}
          className="rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          onClick={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault()
              setOpen(true)
            }
          }}
        >
          <Empty className="h-full border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Building2Icon />
              </EmptyMedia>
              <EmptyTitle>Add a business</EmptyTitle>
              <EmptyDescription>Create another business in this portfolio.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button type="button" tabIndex={-1}>
                Add business
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a business</DialogTitle>
            <DialogDescription>The business is added to this portfolio. You can open it as soon as it is created.</DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-3" onSubmit={(event) => void createBusiness(event)}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="business-name">Business name</Label>
              <Input
                id="business-name"
                value={name}
                required
                autoFocus
                onValueChange={setName}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending || name.trim() === ""}>
                {pending ? "Adding…" : "Add business"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
