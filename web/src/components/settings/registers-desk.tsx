"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "@/components/ui/sonner"
import { useBusiness } from "@/lib/flow/use-business"

type LocationRow = {
  id: string
  name: string
  kind: string
  fulfillment_warehouse_id: string | null
}

type RegisterRow = {
  id: string
  name: string
  location_id: string
  warehouse_id: string
  status: string
}

export function RegistersDesk({ businessKey }: { businessKey: string }) {
  const { supabase, business, ready, error: loadError } = useBusiness(businessKey)
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [registers, setRegisters] = useState<RegisterRow[]>([])
  const [name, setName] = useState("")
  const [storeId, setStoreId] = useState("")
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!business) return
    const [locationRes, registerRes] = await Promise.all([
      supabase
        .from("locations")
        .select("id, name, kind, fulfillment_warehouse_id")
        .eq("business_id", business.id)
        .order("name"),
      supabase
        .from("registers")
        .select("id, name, location_id, warehouse_id, status")
        .eq("business_id", business.id)
        .order("name"),
    ])
    if (locationRes.error || registerRes.error) {
      toast.error(locationRes.error?.message ?? registerRes.error?.message ?? "Couldn't load registers.")
      return
    }
    const places = locationRes.data ?? []
    setLocations(places)
    setRegisters(registerRes.data ?? [])
    setStoreId(
      (current) =>
        current ||
        places.find((place) => (place.kind === "store" || place.kind === "site") && place.fulfillment_warehouse_id)?.id ||
        "",
    )
  }, [business, supabase])

  useEffect(() => {
    void load()
  }, [load])

  const placeName = useMemo(() => {
    const map = new Map(locations.map((location) => [location.id, location.name]))
    return (id: string) => map.get(id) ?? "Location"
  }, [locations])
  const stores = locations.filter((location) => location.kind === "store" || location.kind === "site")
  const storeItems = Object.fromEntries(stores.map((location) => [location.id, location.name]))
  const selectedStore = stores.find((location) => location.id === storeId) ?? null
  const warehouseId = selectedStore?.fulfillment_warehouse_id ?? ""

  async function saveRegister() {
    const nextName = name.trim()
    if (!business || !nextName || !storeId || !warehouseId) return
    setSaving(true)
    const { error } = await supabase
      .from("registers")
      .insert({ business_id: business.id, name: nextName, location_id: storeId, warehouse_id: warehouseId })
    setSaving(false)
    if (error) {
      toast.error(error.message)
      return
    }
    setName("")
    toast.success("Register saved.")
    await load()
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-medium tracking-tight">Registers</h1>
        <p className="text-sm text-muted-foreground">
          {business ? `${business.name}. Add a till for a store that already has a warehouse.` : "Add a till for a store that already has a warehouse."}
        </p>
      </div>
      {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
      <Card>
        <CardHeader>
          <CardTitle>Add register</CardTitle>
          <CardDescription>The till sells stock from the store’s warehouse.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!ready ? <div className="h-24 animate-pulse rounded-lg bg-muted" /> : null}
          {ready && stores.length === 0 ? (
            <p className="text-sm text-muted-foreground">Add a store and a warehouse in Locations before adding a register.</p>
          ) : null}
          {ready && stores.length > 0 ? (
            <>
              <Input placeholder="Register name" value={name} onChange={(event) => setName(event.target.value)} />
              <Select value={storeId} items={storeItems} onValueChange={(value) => setStoreId(value ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Store" />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name}
                      {location.fulfillment_warehouse_id ? "" : " · no warehouse"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {warehouseId
                  ? `Stock comes from ${placeName(warehouseId)}.`
                  : "This store has no warehouse. Link one in Locations before it can sell."}
              </p>
              <Button type="button" className="w-fit" disabled={saving || !name.trim() || !storeId || !warehouseId} onClick={() => void saveRegister()}>
                {saving ? "Saving…" : "Save register"}
              </Button>
            </>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Tills</CardTitle>
          <CardDescription>{registers.length === 0 ? "No registers yet." : `${registers.length} register${registers.length === 1 ? "" : "s"}.`}</CardDescription>
        </CardHeader>
        {registers.length > 0 ? (
          <CardContent className="flex flex-col gap-3 text-sm">
            {registers.map((row) => (
              <div key={row.id} className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{row.name}</p>
                  <p className="text-muted-foreground">
                    {placeName(row.location_id)} · stock from {placeName(row.warehouse_id)}
                  </p>
                </div>
                <p className="text-muted-foreground capitalize">{row.status}</p>
              </div>
            ))}
          </CardContent>
        ) : null}
      </Card>
    </div>
  )
}
