"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"

import { ConfirmDialog } from "@/components/data-table/confirm-dialog"
import { DataTable } from "@/components/data-table/data-table"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import type { DataTableFeatures } from "@/components/data-table/data-table-features"
import { DataTableRowActions } from "@/components/data-table/data-table-row-actions"
import { FlowFrame } from "@/components/flow/flow-frame"
import { StatusBadge } from "@/components/status-badge"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ProductCreateView } from "@/components/products/product-create-view"
import {
  buildVariantDrafts,
  type ComponentDraft,
  type OptionDraft,
  type ProductType,
  type TaxMode,
  type VariantDraft,
} from "@/components/products/product-drafts"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/sonner"
import { money } from "@/lib/flow/format"
import { callRpc } from "@/lib/flow/rpc"
import type { BusinessRecord, FlowClient } from "@/lib/flow/use-business"

type ProductRow = {
  id: string
  sku: string
  barcode: string | null
  name: string
  description: string | null
  price: number
  cost: number
  weight_grams: number | null
  supplier_sku: string | null
  pack_size: string | null
  track_inventory: boolean
  is_visible: boolean
  sort_order: number
  status: string
  product_type: string
  parent_id: string | null
  brand_id: string | null
  category_id: string | null
  unit: string
  tax_mode: string
  tax_rate: number | null
  variant_key: string | null
}

type BrandRow = { id: string; name: string }
type CategoryRow = { id: string; name: string }

const TYPE_LABEL: Record<string, string> = {
  standard: "Standard",
  variable: "Variable",
  bundle: "Bundle",
  variant: "Variant",
}
export function ProductDesk({ businessKey }: { businessKey: string }) {
  const [creatingOpen, setCreatingOpen] = useState(false)
  return (
    <FlowFrame
      businessKey={businessKey}
      title="Products"
      description="Standard, variable, and bundle products share this catalog."
    >
      {({ business, supabase }) => (
        <ProductEditor
          business={business}
          supabase={supabase}
          creatingOpen={creatingOpen}
          setCreatingOpen={setCreatingOpen}
        />
      )}
    </FlowFrame>
  )
}

function ProductEditor({
  business,
  supabase,
  creatingOpen,
  setCreatingOpen,
}: {
  business: BusinessRecord
  supabase: FlowClient
  creatingOpen: boolean
  setCreatingOpen: (open: boolean) => void
}) {
  const [rows, setRows] = useState<ProductRow[]>([])
  const [brands, setBrands] = useState<BrandRow[]>([])
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [pending, setPending] = useState(false)
  const [editing, setEditing] = useState<ProductRow | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ProductRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [editOptions, setEditOptions] = useState<OptionDraft[]>([])
  const [editVariants, setEditVariants] = useState<VariantDraft[]>([])
  const [editComponents, setEditComponents] = useState<ComponentDraft[]>([])

  const stockable = useMemo(
    () => rows.filter((row) => row.product_type === "standard" || row.product_type === "variant"),
    [rows],
  )
  const parents = useMemo(
    () => rows.filter((row) => row.product_type !== "variant"),
    [rows],
  )
  const filteredParents = useMemo(
    () => (typeFilter === "all" ? parents : parents.filter((row) => row.product_type === typeFilter)),
    [parents, typeFilter],
  )
  const variantsByParent = useMemo(() => {
    const map = new Map<string, ProductRow[]>()
    for (const row of rows) {
      if (row.product_type !== "variant" || !row.parent_id) continue
      const list = map.get(row.parent_id) ?? []
      list.push(row)
      map.set(row.parent_id, list)
    }
    return map
  }, [rows])

  const load = useCallback(async () => {
    const [productRes, brandRes, categoryRes] = await Promise.all([
      supabase
        .from("products")
        .select(
          "id, sku, barcode, name, description, price, cost, weight_grams, supplier_sku, pack_size, track_inventory, is_visible, sort_order, status, product_type, parent_id, brand_id, category_id, unit, tax_mode, tax_rate, variant_key",
        )
        .eq("business_id", business.id)
        .order("sort_order")
        .order("name"),
      supabase.from("brands").select("id, name").eq("business_id", business.id).order("name"),
      supabase.from("categories").select("id, name").eq("business_id", business.id).order("name"),
    ])
    if (productRes.error) toast.error(productRes.error.message)
    if (brandRes.error) toast.error(brandRes.error.message)
    if (categoryRes.error) toast.error(categoryRes.error.message)
    setRows((productRes.data as ProductRow[] | null) ?? [])
    setBrands(brandRes.data ?? [])
    setCategories(categoryRes.data ?? [])
  }, [business.id, supabase])

  useEffect(() => {
    void load()
  }, [load])

  async function loadEditChildren(product: ProductRow) {
    if (product.product_type === "variable") {
      const { data: optionRows, error } = await supabase
        .from("product_options")
        .select("id, name, position")
        .eq("business_id", business.id)
        .eq("product_id", product.id)
        .order("position")
      if (error) {
        toast.error(error.message)
        return
      }
      const optionIds = (optionRows ?? []).map((option) => option.id)
      const valueRes =
        optionIds.length > 0
          ? await supabase
              .from("product_option_values")
              .select("option_id, value, position")
              .eq("business_id", business.id)
              .in("option_id", optionIds)
              .order("position")
          : { data: [] as { option_id: string; value: string; position: number }[] }
      const valuesByOption = new Map<string, string[]>()
      for (const value of valueRes.data ?? []) {
        valuesByOption.set(value.option_id, [...(valuesByOption.get(value.option_id) ?? []), value.value])
      }
      const nextOptions = (optionRows ?? []).map((option) => ({
        name: option.name,
        values: valuesByOption.get(option.id) ?? [],
      }))
      setEditOptions(nextOptions.length ? nextOptions : [{ name: "Size", values: [] }])
      const children = rows.filter((row) => row.parent_id === product.id)
      setEditVariants(
        children.map((child) => ({
          id: child.id,
          sku: child.sku,
          barcode: child.barcode ?? "",
          price: String(child.price),
          cost: String(child.cost),
          status: child.status,
          variant_key: child.variant_key ?? "",
          option_values: (child.variant_key ?? "")
            .split("|")
            .filter(Boolean)
            .map((part) => {
              const [option, value] = part.split(":")
              return { option: option ?? "", value: value ?? "" }
            }),
          image_path: "",
        })),
      )
      setEditComponents([])
    } else if (product.product_type === "bundle") {
      const { data, error } = await supabase
        .from("bundle_components")
        .select("component_id, quantity")
        .eq("business_id", business.id)
        .eq("bundle_id", product.id)
      if (error) {
        toast.error(error.message)
        return
      }
      const componentIds = (data ?? []).map((row) => row.component_id)
      const details =
        componentIds.length > 0
          ? await supabase
              .from("products")
              .select("id, name, sku, cost, price")
              .eq("business_id", business.id)
              .in("id", componentIds)
          : { data: [] as { id: string; name: string; sku: string; cost: number; price: number }[] }
      const detailMap = new Map((details.data ?? []).map((item) => [item.id, item]))
      setEditComponents(
        (data ?? []).map((row) => {
          const detail = detailMap.get(row.component_id)
          return {
            component_id: row.component_id,
            quantity: String(row.quantity),
            label: detail ? `${detail.name} (${detail.sku})` : row.component_id,
            cost: Number(detail?.cost ?? 0),
            price: Number(detail?.price ?? 0),
          }
        }),
      )
      setEditOptions([])
      setEditVariants([])
    } else {
      setEditOptions([])
      setEditVariants([])
      setEditComponents([])
    }
  }

  function payloadFromForm() {
    const source = editing
    if (!source) return null
    const nextSku = (source.sku ?? "").trim()
    const type = (source.product_type as ProductType) ?? "standard"
    const resolvedTaxMode = (source.tax_mode as TaxMode) ?? "inherit"
    return {
      id: source.id,
      product_type: type,
      sku: nextSku,
      barcode: (source.barcode ?? "").trim() || null,
      name: (source.name ?? "").trim(),
      description: (source.description ?? "")?.trim() || null,
      price: Number(source.price) || 0,
      cost: Number(source.cost) || 0,
      weight_grams: source.weight_grams,
      supplier_sku: source.supplier_sku?.trim() || nextSku,
      pack_size: (source.pack_size ?? "")?.trim() || null,
      track_inventory: type === "standard" ? source.track_inventory : false,
      is_visible: source.is_visible,
      sort_order: Number(source.sort_order) || 0,
      status: source.status,
      unit: source.unit || "each",
      tax_mode: resolvedTaxMode,
      tax_rate: resolvedTaxMode === "custom" ? Number(source.tax_rate) || 0 : null,
      brand_id: source.brand_id || null,
      brand_name: null,
      category_id: source.category_id || null,
      options:
        type === "variable"
          ? editOptions
              .filter((option) => option.name.trim())
              .map((option) => ({
                name: option.name.trim(),
                values: option.values.map((value) => value.trim()).filter(Boolean),
              }))
          : [],
      variants:
        type === "variable"
          ? editVariants.map((variant) => ({
              id: variant.id,
              sku: variant.sku.trim(),
              barcode: variant.barcode.trim() || null,
              price: Number(variant.price) || 0,
              cost: Number(variant.cost) || 0,
              status: variant.status,
              variant_key: variant.variant_key,
              option_values: variant.option_values,
              image_path: variant.image_path || null,
            }))
          : [],
      components:
        type === "bundle"
          ? editComponents.map((component) => ({
              component_id: component.component_id,
              quantity: Number(component.quantity) || 0,
            }))
          : [],
      images: [],
    }
  }

  async function saveEdit() {
    const payload = payloadFromForm()
    if (!payload) return
    setPending(true)
    try {
      await callRpc(supabase, "save_product", {
        p_business_id: business.id,
        p_payload: payload,
      })
      toast.success("Product updated.")
      setEditing(null)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update product.")
    } finally {
      setPending(false)
    }
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

  const editBundleCost = useMemo(
    () =>
      editComponents.reduce((sum, component) => sum + component.cost * (Number(component.quantity) || 0), 0),
    [editComponents],
  )
  const editBundleRetail = useMemo(
    () =>
      editComponents.reduce((sum, component) => sum + component.price * (Number(component.quantity) || 0), 0),
    [editComponents],
  )

  const columns = useMemo<ColumnDef<DataTableFeatures, ProductRow>[]>(
    () => [
      {
        accessorKey: "sku",
        header: ({ column }) => <DataTableColumnHeader column={column} title="SKU" />,
        filterFn: "includesString",
      },
      {
        accessorKey: "name",
        meta: { cellClassName: "whitespace-normal" },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.name}</div>
            {row.original.description ? <div className="text-muted-foreground">{row.original.description}</div> : null}
          </div>
        ),
        filterFn: "includesString",
      },
      {
        accessorKey: "product_type",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
        cell: ({ row }) => TYPE_LABEL[row.original.product_type] ?? row.original.product_type,
        filterFn: "includesString",
      },
      {
        accessorKey: "price",
        meta: { align: "right" },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Sell price" />,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.product_type === "variable" ? "—" : money(Number(row.original.price), business.currency)}
          </span>
        ),
      },
      {
        accessorKey: "cost",
        meta: { align: "right" },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Cost" />,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.product_type === "variable" ? "—" : money(Number(row.original.cost), business.currency)}
          </span>
        ),
      },
      {
        id: "stock",
        header: "Stock",
        accessorFn: (row) =>
          row.product_type === "bundle"
            ? "Components"
            : row.product_type === "variable"
              ? "Variants"
              : row.track_inventory
                ? "Tracked"
                : "Untracked",
        cell: ({ row }) => {
          if (row.original.product_type === "bundle") return "Components"
          if (row.original.product_type === "variable") {
            return `${variantsByParent.get(row.original.id)?.length ?? 0} variants`
          }
          return row.original.track_inventory ? "Tracked" : "Untracked"
        },
      },
      {
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableHiding: false,
        enableSorting: false,
        cell: ({ row }) => (
          <DataTableRowActions
            onEdit={() => {
              setEditing(row.original)
              void loadEditChildren(row.original)
            }}
            onDelete={() => setPendingDelete(row.original)}
          />
        ),
      },
    ],
    [business.currency, variantsByParent],
  )

  return (
    <div className="flex flex-col gap-4">
      <ProductCreateView
        open={creatingOpen}
        business={business}
        supabase={supabase}
        brands={brands}
        categories={categories}
        stockable={stockable}
        onCancel={() => setCreatingOpen(false)}
        onCreated={async () => {
          setCreatingOpen(false)
          await load()
        }}
      />
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            <CardTitle>Catalog</CardTitle>
            <CardDescription>
              {filteredParents.length === 0 ? "No products yet." : `${filteredParents.length} products`}
            </CardDescription>
          </div>
          <Button type="button" onClick={() => setCreatingOpen(true)}>
            Add product
          </Button>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filteredParents}
            filterColumn="name"
            filterPlaceholder="Search products…"
            empty="Add a product to start procurement."
            getRowId={(row) => row.id}
            emptySubRows="No variants yet."
            getSubRows={(row) =>
              row.product_type === "variable" ? (variantsByParent.get(row.id) ?? []) : null
            }
            toolbar={
              <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value ?? "all")}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="variable">Variable</SelectItem>
                  <SelectItem value="bundle">Bundle</SelectItem>
                </SelectContent>
              </Select>
            }
          />
        </CardContent>
      </Card>

      <Dialog
        open={editing !== null}
        onOpenChange={(next) => {
          if (!next) setEditing(null)
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit product</DialogTitle>
          </DialogHeader>
          {editing ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="edit-type" label="Type">
                <Input id="edit-type" value={TYPE_LABEL[editing.product_type] ?? editing.product_type} readOnly />
              </Field>
              <Field id="edit-sku" label="SKU">
                <Input
                  id="edit-sku"
                  value={editing.sku}
                  onChange={(event) => setEditing({ ...editing, sku: event.target.value })}
                />
              </Field>
              <Field id="edit-barcode" label="Barcode">
                <Input
                  id="edit-barcode"
                  value={editing.barcode ?? ""}
                  onChange={(event) => setEditing({ ...editing, barcode: event.target.value })}
                />
              </Field>
              <Field id="edit-name" label="Name">
                <Input
                  id="edit-name"
                  value={editing.name}
                  onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                />
              </Field>
              <Field id="edit-description" label="Description" className="sm:col-span-2">
                <Input
                  id="edit-description"
                  value={editing.description ?? ""}
                  onChange={(event) => setEditing({ ...editing, description: event.target.value })}
                />
              </Field>
              {editing.product_type !== "variable" ? (
                <>
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
                  <Field id="edit-cost" label="Cost">
                    <Input
                      id="edit-cost"
                      type="number"
                      min="0"
                      step="0.01"
                      value={editing.product_type === "bundle" ? String(editBundleCost) : String(editing.cost)}
                      onChange={(event) => setEditing({ ...editing, cost: Number(event.target.value) })}
                      readOnly={editing.product_type === "bundle"}
                    />
                  </Field>
                </>
              ) : null}
              <Field id="edit-status" label="Status">
                <Select
                  value={editing.status}
                  onValueChange={(value) => setEditing({ ...editing, status: value ?? "active" })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="flex items-center gap-2">
                <Switch
                  id="edit-listed"
                  checked={editing.is_visible}
                  onCheckedChange={(checked) => setEditing({ ...editing, is_visible: checked })}
                />
                <Label htmlFor="edit-listed">Listed in catalog</Label>
              </div>
              {editing.product_type === "bundle" ? (
                <div className="sm:col-span-2 grid gap-2 rounded-md border p-3">
                  <div className="text-sm">
                    Combined retail {money(editBundleRetail, business.currency)} · Savings{" "}
                    {money(Math.max(editBundleRetail - Number(editing.price), 0), business.currency)}
                  </div>
                  {editComponents.map((component) => (
                    <div key={component.component_id} className="grid gap-2 md:grid-cols-[1fr_120px_auto] items-center">
                      <div className="text-sm">{component.label}</div>
                      <Input
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={component.quantity}
                        onChange={(event) =>
                          setEditComponents((current) =>
                            current.map((item) =>
                              item.component_id === component.component_id
                                ? { ...item, quantity: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          setEditComponents((current) =>
                            current.filter((item) => item.component_id !== component.component_id),
                          )
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
              {editing.product_type === "variable" ? (
                <div className="sm:col-span-2 grid gap-2 rounded-md border p-3">
                  {editOptions.map((option, index) => (
                    <div key={index} className="grid gap-2 md:grid-cols-2">
                      <Input
                        value={option.name}
                        onChange={(event) =>
                          setEditOptions((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, name: event.target.value } : item,
                            ),
                          )
                        }
                      />
                      <Input
                        value={option.values.join(", ")}
                        onChange={(event) =>
                          setEditOptions((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    values: event.target.value
                                      .split(",")
                                      .map((value) => value.trim())
                                      .filter(Boolean),
                                  }
                                : item,
                            ),
                          )
                        }
                      />
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setEditVariants(buildVariantDrafts(editOptions, editVariants))}
                  >
                    Regenerate combinations
                  </Button>
                  {editVariants.map((variant) => (
                    <div key={variant.id} className="grid gap-2 border-t pt-2 md:grid-cols-5">
                      <div className="text-sm md:col-span-5">{variant.variant_key.replaceAll("|", " / ")}</div>
                      <Input
                        value={variant.sku}
                        onChange={(event) =>
                          setEditVariants((current) =>
                            current.map((item) =>
                              item.id === variant.id ? { ...item, sku: event.target.value } : item,
                            ),
                          )
                        }
                      />
                      <Input
                        value={variant.barcode}
                        onChange={(event) =>
                          setEditVariants((current) =>
                            current.map((item) =>
                              item.id === variant.id ? { ...item, barcode: event.target.value } : item,
                            ),
                          )
                        }
                      />
                      <Input
                        type="number"
                        value={variant.price}
                        onChange={(event) =>
                          setEditVariants((current) =>
                            current.map((item) =>
                              item.id === variant.id ? { ...item, price: event.target.value } : item,
                            ),
                          )
                        }
                      />
                      <Input
                        type="number"
                        value={variant.cost}
                        onChange={(event) =>
                          setEditVariants((current) =>
                            current.map((item) =>
                              item.id === variant.id ? { ...item, cost: event.target.value } : item,
                            ),
                          )
                        }
                      />
                      <Select
                        value={variant.status}
                        onValueChange={(value) =>
                          setEditVariants((current) =>
                            current.map((item) =>
                              item.id === variant.id ? { ...item, status: value ?? "active" } : item,
                            ),
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              ) : null}
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
        description={
          pendingDelete ? `Delete ${pendingDelete.name}? Sales and shipments that use it will block this.` : ""
        }
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
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}
