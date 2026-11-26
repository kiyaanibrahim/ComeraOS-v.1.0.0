"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"

import { ConfirmDialog } from "@/components/data-table/confirm-dialog"
import { DataTable } from "@/components/data-table/data-table"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import type { DataTableFeatures } from "@/components/data-table/data-table-features"
import { DataTableRowActions } from "@/components/data-table/data-table-row-actions"
import { StatusBadge } from "@/components/status-badge"
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/sonner"
import { useBusiness } from "@/lib/flow/use-business"
import type { Json } from "@/lib/supabase/database.types"

const kinds = {
  store: "Store",
  warehouse: "Warehouse",
  site: "Site",
} as const

type Kind = keyof typeof kinds

type LocationRow = {
  id: string
  name: string
  kind: Kind
  line: string
  is_active: boolean
  fulfillment_warehouse_id: string | null
  warehouse: string
  place_id: string | null
  place: string
  sales_channel: string | null
}

const channels = {
  physical: "Physical",
  online: "Online",
  both: "Physical / Online",
} as const

function addressLine(address: Json): string {
  if (!address || typeof address !== "object" || Array.isArray(address)) return ""
  const line = address.line
  return typeof line === "string" ? line : ""
}

function asKind(value: string): Kind {
  if (value === "warehouse" || value === "site") return value
  return "store"
}

const emptyDraft = {
  id: null as string | null,
  name: "",
  kind: "warehouse" as Kind,
  line: "",
  isActive: true,
  fulfillmentWarehouseId: "",
  placeId: "",
  newPlace: "",
  channel: "" as "" | keyof typeof channels,
}

export function LocationsDesk({ businessKey }: { businessKey: string }) {
  const { supabase, business, ready, error: loadError } = useBusiness(businessKey)
  const [rows, setRows] = useState<LocationRow[]>([])
  const [places, setPlaces] = useState<{ id: string; name: string }[]>([])
  const [draft, setDraft] = useState(emptyDraft)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<LocationRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const reload = useCallback(async () => {
    if (!business) return
    const [locationResult, placeResult] = await Promise.all([
      supabase
        .from("locations")
        .select("id, name, kind, address, is_active, fulfillment_warehouse_id, place_id, sales_channel")
        .eq("business_id", business.id)
        .order("name"),
      supabase.from("places").select("id, name, address").eq("business_id", business.id).order("name"),
    ])
    if (locationResult.error || placeResult.error) {
      toast.error(locationResult.error?.message ?? placeResult.error?.message ?? "Couldn't load locations.")
      return
    }
    const data = locationResult.data ?? []
    const placeRows = placeResult.data ?? []
    setPlaces(placeRows)
    const names = new Map(data.map((row) => [row.id, row.name]))
    const placeNames = new Map(placeRows.map((row) => [row.id, row.name]))
    const placeLines = new Map(placeRows.map((row) => [row.id, addressLine(row.address)]))
    setRows(
      data.map((row) => ({
        id: row.id,
        name: row.name,
        kind: asKind(row.kind),
        line: addressLine(row.address) || (row.place_id ? placeLines.get(row.place_id) ?? "" : ""),
        is_active: row.is_active,
        fulfillment_warehouse_id: row.fulfillment_warehouse_id,
        warehouse: row.fulfillment_warehouse_id ? names.get(row.fulfillment_warehouse_id) ?? "Warehouse" : "—",
        place_id: row.place_id,
        place: row.place_id ? placeNames.get(row.place_id) ?? "Place" : "—",
        sales_channel: row.sales_channel,
      })),
    )
  }, [business, supabase])

  useEffect(() => {
    void reload()
  }, [reload])

  const warehouses = rows.filter((row) => row.kind === "warehouse")
  const warehouseItems = Object.fromEntries(warehouses.map((row) => [row.id, row.name]))
  const placeItems = Object.fromEntries(places.map((place) => [place.id, place.name]))
  const sells = draft.kind === "store" || draft.kind === "site"

  function openCreate() {
    setDraft(emptyDraft)
    setOpen(true)
  }

  function openEdit(row: LocationRow) {
    setDraft({
      id: row.id,
      name: row.name,
      kind: row.kind,
      line: row.line,
      isActive: row.is_active,
      fulfillmentWarehouseId: row.fulfillment_warehouse_id ?? "",
      placeId: row.place_id ?? "",
      newPlace: "",
      channel: row.sales_channel === "online" || row.sales_channel === "both" || row.sales_channel === "physical" ? row.sales_channel : "",
    })
    setOpen(true)
  }

  async function save() {
    if (!business) return
    const name = draft.name.trim()
    if (!name) {
      toast.error("Enter a name for the location.")
      return
    }
    if (sells && draft.isActive && !draft.fulfillmentWarehouseId) {
      toast.error("An active store needs a warehouse.")
      return
    }
    setSaving(true)
    let placeId = draft.placeId || null
    const placeName = draft.newPlace.trim()
    if (placeName) {
      const created = await supabase
        .from("places")
        .insert({ business_id: business.id, name: placeName, address: { line: draft.line.trim() } })
        .select("id")
        .single()
      if (created.error || !created.data) {
        setSaving(false)
        toast.error(created.error?.message ?? "Couldn't add the place.")
        return
      }
      placeId = created.data.id
    }
    const channel = sells && (draft.channel === "physical" || draft.channel === "online" || draft.channel === "both") ? draft.channel : null
    const payload = {
      name,
      kind: draft.kind,
      address: { line: draft.line.trim() },
      is_active: draft.isActive,
      fulfillment_warehouse_id: sells ? draft.fulfillmentWarehouseId || null : null,
      place_id: placeId,
      sales_channel: channel,
    }
    const result = draft.id
      ? await supabase.from("locations").update(payload).eq("id", draft.id).eq("business_id", business.id)
      : await supabase.from("locations").insert({ ...payload, business_id: business.id })
    setSaving(false)
    if (result.error) {
      toast.error(result.error.message)
      return
    }
    toast.success(draft.id ? "Location saved." : "Location added.")
    setOpen(false)
    setDraft(emptyDraft)
    await reload()
  }

  async function remove() {
    if (!business || !pendingDelete) return
    setDeleting(true)
    const { error } = await supabase.from("locations").delete().eq("id", pendingDelete.id).eq("business_id", business.id)
    setDeleting(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success("Location deleted.")
    setPendingDelete(null)
    await reload()
  }

  const columns = useMemo<ColumnDef<DataTableFeatures, LocationRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
        filterFn: "includesString",
      },
      {
        accessorKey: "kind",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Kind" />,
        cell: ({ row }) => kinds[row.original.kind],
      },
      {
        accessorKey: "warehouse",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Warehouse" />,
      },
      {
        accessorKey: "place",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Place" />,
      },
      {
        accessorKey: "line",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Address" />,
        cell: ({ row }) => row.original.line || "—",
      },
      {
        accessorKey: "sales_channel",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Channel" />,
        cell: ({ row }) => (row.original.sales_channel ? channels[row.original.sales_channel as keyof typeof channels] ?? row.original.sales_channel : "—"),
      },
      {
        accessorKey: "is_active",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Active" />,
        cell: ({ row }) => (
          <StatusBadge status={row.original.is_active ? "active" : "inactive"} />
        ),
      },
      {
        id: "actions",
        enableHiding: false,
        enableSorting: false,
        cell: ({ row }) => <DataTableRowActions onEdit={() => openEdit(row.original)} onDelete={() => setPendingDelete(row.original)} />,
      },
    ],
    [],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-xl font-medium tracking-tight">Locations</h1>
          <p className="text-sm text-muted-foreground">
            Stores, warehouses, and other sites for {business?.name ?? "this business"}. A store sells stock from one warehouse.
          </p>
        </div>
        <Button type="button" disabled={!ready || !business} onClick={openCreate}>
          Add location
        </Button>
      </div>
      {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
      <Card>
        <CardHeader>
          <CardTitle>Sites</CardTitle>
          <CardDescription>{rows.length === 0 ? "No locations yet." : `${rows.length} locations`}</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={rows} filterColumn="name" filterPlaceholder="Search locations…" empty="Add a warehouse or store to start." getRowId={(row) => row.id} />
        </CardContent>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit location" : "Add a location"}</DialogTitle>
            <DialogDescription>Warehouses receive stock. Stores and sites sell from a warehouse.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="location-name">Name</FieldLabel>
              <Input
                id="location-name"
                value={draft.name}
                placeholder="North warehouse"
                onValueChange={(value) => setDraft((current) => ({ ...current, name: value }))}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="location-place">Place</FieldLabel>
              {places.length > 0 ? (
                <Select
                  value={draft.placeId}
                  items={placeItems}
                  onValueChange={(value) => setDraft((current) => ({ ...current, placeId: value ?? "" }))}
                >
                  <SelectTrigger id="location-place" className="w-full">
                    <SelectValue placeholder="Choose a place" />
                  </SelectTrigger>
                  <SelectContent>
                    {places.map((place) => (
                      <SelectItem key={place.id} value={place.id}>
                        {place.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">No places yet. Create one below, or leave this location ungrouped.</p>
              )}
              <Input
                value={draft.newPlace}
                placeholder="Or create a place"
                onValueChange={(value) => setDraft((current) => ({ ...current, newPlace: value }))}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="location-kind">Kind</FieldLabel>
              <Select
                value={draft.kind}
                items={kinds}
                onValueChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    kind: asKind(value ?? "warehouse"),
                    fulfillmentWarehouseId: asKind(value ?? "warehouse") === "warehouse" ? "" : current.fulfillmentWarehouseId,
                  }))
                }
              >
                <SelectTrigger id="location-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(kinds).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {sells ? (
              <Field>
                <FieldLabel htmlFor="location-warehouse">Warehouse</FieldLabel>
                {warehouses.filter((row) => row.id !== draft.id).length > 0 ? (
                  <Select
                    value={draft.fulfillmentWarehouseId}
                    items={warehouseItems}
                    onValueChange={(value) => setDraft((current) => ({ ...current, fulfillmentWarehouseId: value ?? "" }))}
                  >
                    <SelectTrigger id="location-warehouse" className="w-full">
                      <SelectValue placeholder="Choose a warehouse" />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses
                        .filter((row) => row.id !== draft.id)
                        .map((row) => (
                          <SelectItem key={row.id} value={row.id}>
                            {row.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm text-muted-foreground">Add a warehouse before this store can sell.</p>
                )}
              </Field>
            ) : null}
            {sells ? (
              <Field>
                <FieldLabel htmlFor="location-channel">Sales channel</FieldLabel>
                <Select
                  value={draft.channel}
                  items={channels}
                  onValueChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      channel: value === "online" || value === "both" || value === "physical" ? value : "",
                    }))
                  }
                >
                  <SelectTrigger id="location-channel" className="w-full">
                    <SelectValue placeholder="Physical, online, or both" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(channels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="location-address">Address</FieldLabel>
              <Input
                id="location-address"
                value={draft.line}
                placeholder="Street, city"
                onValueChange={(value) => setDraft((current) => ({ ...current, line: value }))}
              />
            </Field>
            <Field orientation="horizontal">
              <Switch
                id="location-active"
                checked={draft.isActive}
                onCheckedChange={(checked) => setDraft((current) => ({ ...current, isActive: checked }))}
              />
              <FieldLabel htmlFor="location-active">Active</FieldLabel>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={!ready || !business || saving} onClick={() => void save()}>
              {saving ? "Saving…" : draft.id ? "Save location" : "Add location"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete location"
        description={pendingDelete ? `Delete ${pendingDelete.name}? Stock, registers, and shipments that use it will block this.` : ""}
        pending={deleting}
        onOpenChange={(next) => {
          if (!next) setPendingDelete(null)
        }}
        onConfirm={() => void remove()}
      />
    </div>
  )
}
