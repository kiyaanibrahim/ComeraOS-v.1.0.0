"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"

import { ConfirmDialog } from "@/components/data-table/confirm-dialog"
import { UnsavedChangesDialog, useUnsavedChanges } from "@/components/unsaved-changes"
import { DataTable } from "@/components/data-table/data-table"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import type { DataTableFeatures } from "@/components/data-table/data-table-features"
import { DataTableRowActions } from "@/components/data-table/data-table-row-actions"
import { FlowFrame } from "@/components/flow/flow-frame"
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/sonner"
import { autoSku } from "@/lib/flow/codes"
import { money } from "@/lib/flow/format"
import type { BusinessRecord, FlowClient } from "@/lib/flow/use-business"

type ProductRow = {
  id: string
  sku: string
  name: string
  description: string | null
  price: number
  cost: number
  weight_grams: number | null
  supplier_sku: string | null
  pack_size: string | null
  track_inventory: boolean
  status: string
}

export function ProductDesk({ businessKey }: { businessKey: string }) {
  return (
    <FlowFrame
      businessKey={businessKey}
      title="Products"
      description="Active products are what procurement can buy and POS can sell."
    >
      {({ business, supabase }) => <ProductEditor business={business} supabase={supabase} />}
    </FlowFrame>
  )
}

function ProductEditor({ business, supabase }: { business: BusinessRecord; supabase: FlowClient }) {
  const [rows, setRows] = useState<ProductRow[]>([])
  const [pending, setPending] = useState(false)
  const [editing, setEditing] = useState<ProductRow | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ProductRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [productId, setProductId] = useState(() => crypto.randomUUID())
  const [sku, setSku] = useState(() => autoSku(productId))
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [price, setPrice] = useState("0")
  const [cost, setCost] = useState("0")
  const [weight, setWeight] = useState("")
  const [supplierSku, setSupplierSku] = useState(() => autoSku(productId))
  const [supplierTouched, setSupplierTouched] = useState(false)
  const [packSize, setPackSize] = useState("")
  const [track, setTrack] = useState(true)
  const generatedSku = autoSku(productId)
  const unsaved = useUnsavedChanges(
    name.trim() !== "" || description.trim() !== "" || price !== "0" || cost !== "0" || weight.trim() !== "" || packSize.trim() !== "",
  )

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("products")
      .select("id, sku, name, description, price, cost, weight_grams, supplier_sku, pack_size, track_inventory, status")
      .eq("business_id", business.id)
      .order("name")
    if (error) toast.error(error.message)
    setRows(data ?? [])
  }, [business.id, supabase])

  useEffect(() => {
    void load()
  }, [load])

  async function create(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    const nextSku = sku.trim() || generatedSku
    const { error } = await supabase.from("products").insert({
      id: productId,
      business_id: business.id,
      sku: nextSku,
      name: name.trim(),
      description: description.trim() || null,
      price: Number(price) || 0,
      cost: Number(cost) || 0,
      weight_grams: weight.trim() === "" ? null : Number(weight),
      supplier_sku: (supplierTouched ? supplierSku.trim() : "") || nextSku,
      pack_size: packSize.trim() || null,
      track_inventory: track,
      status: "active",
    })
    setPending(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success("Product saved.")
    const nextId = crypto.randomUUID()
    setProductId(nextId)
    setSku(autoSku(nextId))
    setName("")
    setDescription("")
    setPrice("0")
    setCost("0")
    setWeight("")
    setSupplierSku(autoSku(nextId))
    setSupplierTouched(false)
    setPackSize("")
    setTrack(true)
    await load()
  }

  async function saveEdit() {
    if (!editing) return
    setPending(true)
    const { error } = await supabase
      .from("products")
      .update({
        sku: editing.sku.trim(),
        name: editing.name.trim(),
        description: editing.description?.trim() || null,
        price: Number(editing.price) || 0,
        cost: Number(editing.cost) || 0,
        weight_grams: editing.weight_grams,
        supplier_sku: editing.supplier_sku?.trim() || editing.sku.trim(),
        pack_size: editing.pack_size?.trim() || null,
        track_inventory: editing.track_inventory,
        status: editing.status,
      })
      .eq("id", editing.id)
      .eq("business_id", business.id)
    setPending(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success("Product updated.")
    setEditing(null)
    await load()
  }

  async function remove() {
    if (!pendingDelete) return
    setDeleting(true)
    const { error } = await supabase.from("products").delete().eq("id", pendingDelete.id).eq("business_id", business.id)
    setDeleting(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success("Product deleted.")
    setPendingDelete(null)
    await load()
  }

  const columns = useMemo<ColumnDef<DataTableFeatures, ProductRow>[]>(
    () => [
      {
        accessorKey: "sku",
        header: ({ column }) => <DataTableColumnHeader column={column} title="SKU" />,
        filterFn: "includesString",
      },
      {
        accessorKey: "name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.name}</div>
            {row.original.description ? <div className="text-muted-foreground">{row.original.description}</div> : null}
          </div>
        ),
      },
      {
        accessorKey: "price",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Sell price" />,
        cell: ({ row }) => money(Number(row.original.price), business.currency),
      },
      {
        accessorKey: "cost",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Cost" />,
        cell: ({ row }) => money(Number(row.original.cost), business.currency),
      },
      {
        accessorKey: "weight_grams",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Weight" />,
        cell: ({ row }) => (row.original.weight_grams ? `${row.original.weight_grams} g` : "—"),
      },
      {
        accessorKey: "supplier_sku",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Supplier SKU" />,
        cell: ({ row }) => row.original.supplier_sku || "—",
      },
      {
        id: "stock",
        header: "Stock",
        accessorFn: (row) => (row.track_inventory ? "Tracked" : "Untracked"),
        cell: ({ row }) => (row.original.track_inventory ? "Tracked" : "Untracked"),
      },
      {
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <span className="capitalize">{row.original.status}</span>,
      },
      {
        id: "actions",
        enableHiding: false,
        enableSorting: false,
        cell: ({ row }) => (
          <DataTableRowActions onEdit={() => setEditing(row.original)} onDelete={() => setPendingDelete(row.original)} />
        ),
      },
    ],
    [business.currency],
  )

  return (
    <div className="flex flex-col gap-4">
      <UnsavedChangesDialog open={unsaved.open} onStay={unsaved.stay} onLeave={unsaved.leave} />
      <Card>
        <CardHeader>
          <CardTitle>New product</CardTitle>
          <CardDescription>SKU and supplier SKU are filled in. Change either field to use your own code.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={create}>
            <Field id="sku" label="SKU">
              <Input
                id="sku"
                required
                value={sku}
                onChange={(event) => {
                  const next = event.target.value.trim() === "" ? generatedSku : event.target.value
                  setSku(next)
                  if (!supplierTouched) setSupplierSku(next)
                }}
              />
            </Field>
            <Field id="name" label="Name">
              <Input id="name" required value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field id="description" label="Description" className="md:col-span-2">
              <Input
                id="description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <Field id="price" label="Sell price">
              <Input
                id="price"
                type="number"
                min="0"
                step="0.01"
                required
                value={price}
                onChange={(event) => setPrice(event.target.value)}
              />
            </Field>
            <Field id="cost" label="Catalog cost">
              <Input
                id="cost"
                type="number"
                min="0"
                step="0.01"
                required
                value={cost}
                onChange={(event) => setCost(event.target.value)}
              />
            </Field>
            <Field id="weight" label="Unit weight (g)">
              <Input
                id="weight"
                type="number"
                min="0"
                step="0.001"
                value={weight}
                onChange={(event) => setWeight(event.target.value)}
              />
            </Field>
            <Field id="supplier-sku" label="Supplier SKU">
              <Input
                id="supplier-sku"
                value={supplierSku}
                onChange={(event) => {
                  setSupplierTouched(true)
                  setSupplierSku(event.target.value.trim() === "" ? sku.trim() || generatedSku : event.target.value)
                }}
              />
            </Field>
            <Field id="pack-size" label="Pack size">
              <Input id="pack-size" value={packSize} onChange={(event) => setPackSize(event.target.value)} />
            </Field>
            <div className="flex items-center gap-2 md:col-span-2">
              <Switch id="track" checked={track} onCheckedChange={setTrack} />
              <Label htmlFor="track">Track inventory and batches</Label>
            </div>
            <div>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save product"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Catalog</CardTitle>
          <CardDescription>{rows.length === 0 ? "No products yet." : `${rows.length} products`}</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={rows}
            filterColumn="name"
            filterPlaceholder="Search products…"
            empty="Add a product to start procurement."
            getRowId={(row) => row.id}
          />
        </CardContent>
      </Card>
      <Dialog open={editing !== null} onOpenChange={(next) => { if (!next) setEditing(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit product</DialogTitle>
          </DialogHeader>
          {editing ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="edit-sku" label="SKU">
                <Input id="edit-sku" value={editing.sku} onChange={(event) => setEditing({ ...editing, sku: event.target.value })} />
              </Field>
              <Field id="edit-name" label="Name">
                <Input id="edit-name" value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} />
              </Field>
              <Field id="edit-description" label="Description" className="sm:col-span-2">
                <Input
                  id="edit-description"
                  value={editing.description ?? ""}
                  onChange={(event) => setEditing({ ...editing, description: event.target.value })}
                />
              </Field>
              <Field id="edit-price" label="Sell price">
                <Input
                  id="edit-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={String(editing.price)}
                  onChange={(event) => setEditing({ ...editing, price: Number(event.target.value) })}
                />
              </Field>
              <Field id="edit-cost" label="Catalog cost">
                <Input
                  id="edit-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={String(editing.cost)}
                  onChange={(event) => setEditing({ ...editing, cost: Number(event.target.value) })}
                />
              </Field>
              <Field id="edit-weight" label="Unit weight (g)">
                <Input
                  id="edit-weight"
                  type="number"
                  min="0"
                  step="0.001"
                  value={editing.weight_grams ?? ""}
                  onChange={(event) =>
                    setEditing({ ...editing, weight_grams: event.target.value === "" ? null : Number(event.target.value) })
                  }
                />
              </Field>
              <Field id="edit-supplier" label="Supplier SKU">
                <Input
                  id="edit-supplier"
                  value={editing.supplier_sku ?? ""}
                  onChange={(event) => setEditing({ ...editing, supplier_sku: event.target.value })}
                />
              </Field>
              <Field id="edit-pack" label="Pack size">
                <Input
                  id="edit-pack"
                  value={editing.pack_size ?? ""}
                  onChange={(event) => setEditing({ ...editing, pack_size: event.target.value })}
                />
              </Field>
              <div className="flex items-center gap-2 sm:col-span-2">
                <Switch
                  id="edit-track"
                  checked={editing.track_inventory}
                  onCheckedChange={(checked) => setEditing({ ...editing, track_inventory: checked })}
                />
                <Label htmlFor="edit-track">Track inventory and batches</Label>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={pending} onClick={() => void saveEdit()}>
              {pending ? "Saving…" : "Save product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete product"
        description={pendingDelete ? `Delete ${pendingDelete.name}? Sales and shipments that use it will block this.` : ""}
        pending={deleting}
        onOpenChange={(next) => {
          if (!next) setPendingDelete(null)
        }}
        onConfirm={() => void remove()}
      />
    </div>
  )
}

function Field({
  id,
  label,
  className,
  children,
}: {
  id: string
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}
