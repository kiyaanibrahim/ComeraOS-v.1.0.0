"use client"

import { useCallback, useEffect, useState } from "react"
import { Building2Icon } from "lucide-react"

import { StatusBadge, TrendBadge } from "@/components/analytics/status-badge"
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
import { buildInsights } from "@/lib/analytics"
import { formatMoney, presentBusiness, type Business } from "@/lib/businesses"
import { toast } from "@/components/ui/sonner"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"

function slugFromName(name: string) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  return base || "business"
}

export function BusinessPortfolio() {
  const [rows, setRows] = useState<Business[]>([])
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [pending, setPending] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase.from("businesses").select("name, slug").order("name")
    if (error || !data) {
      setRows([])
      const text = error?.message ?? "Couldn't load businesses."
      setLoadError(text)
      toast.error(text)
      return
    }
    setLoadError(null)
    setRows(data.map((row) => presentBusiness(row)))
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
          const salesTrend = buildInsights("Home", business.id).metrics[0]
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
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <TrendBadge delta={salesTrend?.delta ?? 0} />
                      <StatusBadge tone={business.billingStatus === "Current" ? "positive" : "negative"}>
                        {business.billingStatus}
                      </StatusBadge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Sales</span>
                    <span className="font-medium">{formatMoney(business.sales)}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Open orders</span>
                    <span className="font-medium">{business.openOrders}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Staff</span>
                    <span className="font-medium">{business.staff}</span>
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
