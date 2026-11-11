"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"

import { ConfirmDialog } from "@/components/data-table/confirm-dialog"
import { DataTable } from "@/components/data-table/data-table"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import type { DataTableFeatures } from "@/components/data-table/data-table-features"
import { DataTableRowActions } from "@/components/data-table/data-table-row-actions"
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
}

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
}

export function LocationsDesk({ businessKey }: { businessKey: string }) {
  const { supabase, business, ready, error: loadError } = useBusiness(businessKey)
  const [rows, setRows] = useState<LocationRow[]>([])
  const [draft, setDraft] = useState(emptyDraft)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<LocationRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const reload = useCallback(async () => {
    if (!business) return
    const { data, error } = await supabase
      .from("locations")
      .select("id, name, kind, address, is_active, fulfillment_warehouse_id")
      .eq("business_id", business.id)
      .order("name")
    if (error) {
      toast.error(error.message)
      return
    }
    const names = new Map((data ?? []).map((row) => [row.id, row.name]))
    setRows(
      (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        kind: asKind(row.kind),
        line: addressLine(row.address),
        is_active: row.is_active,
        fulfillment_warehouse_id: row.fulfillment_warehouse_id,
        warehouse: row.fulfillment_warehouse_id ? names.get(row.fulfillment_warehouse_id) ?? "Warehouse" : "—",
      })),
    )
  }, [business, supabase])

  useEffect(() => {
    void reload()
  }, [reload])

  const warehouses = rows.filter((row) => row.kind === "warehouse")
  const warehouseItems = Object.fromEntries(warehouses.map((row) => [row.id, row.name]))
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
    const payload = {
      name,
      kind: draft.kind,
      address: { line: draft.line.trim() },
      is_active: draft.isActive,
      fulfillment_warehouse_id: sells ? draft.fulfillmentWarehouseId || null : null,
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
        accessorKey: "line",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Address" />,
        cell: ({ row }) => row.original.line || "—",
      },
      {
        accessorKey: "is_active",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Active" />,
        cell: ({ row }) => (row.original.is_active ? "Active" : "Inactive"),
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
