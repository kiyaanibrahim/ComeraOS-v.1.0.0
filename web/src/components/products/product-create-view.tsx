"use client"

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from "react"
import { Boxes, ChevronDown, Layers, Package, Plus, X } from "lucide-react"

import { UnsavedChangesDialog, useUnsavedChanges } from "@/components/unsaved-changes"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/sonner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { autoSku } from "@/lib/flow/codes"
import { money } from "@/lib/flow/format"
import { callRpc } from "@/lib/flow/rpc"
import type { BusinessRecord, FlowClient } from "@/lib/flow/use-business"
import { cn, randomUUID } from "@/lib/utils"

import {
  OPTION_PRESETS,
  buildVariantDrafts,
  categorySlug,
  variantLabel,
  type ComponentDraft,
  type OptionDraft,
  type ProductType,
  type TaxMode,
  type VariantDraft,
} from "./product-drafts"

type CatalogRow = {
  id: string
  sku: string
  name: string
  price: number
  cost: number
  product_type: string
}

const TYPE_CARDS: { id: ProductType; index: string; title: string; description: string; icon: typeof Package }[] = [
  { id: "standard", index: "01", title: "Standard", description: "Single item", icon: Package },
  { id: "variable", index: "02", title: "Variable", description: "Multiple variants", icon: Layers },
  { id: "bundle", index: "03", title: "Bundle", description: "Combined items", icon: Boxes },
]

export function ProductCreateView({
  open,
  business,
  supabase,
  brands,
  categories,
  stockable,
  onCancel,
  onCreated,
}: {
  open: boolean
  business: BusinessRecord
  supabase: FlowClient
  brands: { id: string; name: string }[]
  categories: { id: string; name: string }[]
  stockable: CatalogRow[]
  onCancel: () => void
  onCreated: () => Promise<void>
}) {
  const [pending, setPending] = useState(false)
  const [productId] = useState(() => randomUUID())
  const [productType, setProductType] = useState<ProductType>("standard")
  const [sku, setSku] = useState(() => autoSku(productId))
  const [barcode, setBarcode] = useState("")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [price, setPrice] = useState("0")
  const [cost, setCost] = useState("0")
  const [unit, setUnit] = useState("each")
  const [taxMode, setTaxMode] = useState<TaxMode>("inherit")
  const [taxRate, setTaxRate] = useState("")
  const [brandId, setBrandId] = useState("")
  const [brandName, setBrandName] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [categoryName, setCategoryName] = useState("")
  const [track, setTrack] = useState(true)
  const [listed, setListed] = useState(true)
  const [sortOrder, setSortOrder] = useState("0")
  const [options, setOptions] = useState<OptionDraft[]>([])
  const [variants, setVariants] = useState<VariantDraft[]>([])
  const [components, setComponents] = useState<ComponentDraft[]>([])
  const [componentSearch, setComponentSearch] = useState("")
  const [selectedVariantIds, setSelectedVariantIds] = useState<string[]>([])
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkPrice, setBulkPrice] = useState("")
  const [bulkCost, setBulkCost] = useState("")
  const [bulkStatus, setBulkStatus] = useState("active")
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([])
  const [optionMenuOpen, setOptionMenuOpen] = useState(false)

  const unsaved = useUnsavedChanges(
    open &&
      (name.trim() !== "" ||
        description.trim() !== "" ||
        variants.length > 0 ||
        components.length > 0 ||
        options.length > 0),
  )

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onCancel])

  useEffect(() => {
    if (productType !== "variable") {
      setVariants([])
      setSelectedVariantIds([])
      return
    }
    setVariants((current) => buildVariantDrafts(options, current, "0", "0"))
  }, [options, productType])

  const searchableComponents = stockable.filter((product) => {
    const query = componentSearch.trim().toLowerCase()
    if (!query) return false
    return product.name.toLowerCase().includes(query) || product.sku.toLowerCase().includes(query)
  })

  const bundleCost = useMemo(
    () => components.reduce((sum, component) => sum + component.cost * (Number(component.quantity) || 0), 0),
    [components],
  )
  const bundleRetail = useMemo(
    () => components.reduce((sum, component) => sum + component.price * (Number(component.quantity) || 0), 0),
    [components],
  )

  const variantGroups = useMemo(() => {
    const firstOption = options[0]?.name.trim() ?? ""
    const groups = new Map<string, VariantDraft[]>()
    for (const variant of variants) {
      const key = variant.option_values.find((item) => item.option === firstOption)?.value ?? "Variants"
      const list = groups.get(key) ?? []
      list.push(variant)
      groups.set(key, list)
    }
    return [...groups.entries()]
  }, [options, variants])

  function addOption(nameValue: string) {
    const next = nameValue.trim()
    setOptionMenuOpen(false)
    if (!next) {
      setOptions((current) => [...current, { name: "", values: [] }])
      return
    }
    if (options.some((option) => option.name.toLowerCase() === next.toLowerCase())) return
    setOptions((current) => [...current, { name: next, values: [] }])
  }

  function addOptionValue(index: number, value: string) {
    const next = value.trim()
    if (!next) return
    setOptions((current) =>
      current.map((option, optionIndex) => {
        if (optionIndex !== index) return option
        if (option.values.some((item) => item.toLowerCase() === next.toLowerCase())) return option
        return { ...option, values: [...option.values, next] }
      }),
    )
  }

  function applyBulk() {
    setVariants((current) =>
      current.map((variant) =>
        selectedVariantIds.includes(variant.id)
          ? {
              ...variant,
              price: bulkPrice.trim() || variant.price,
              cost: bulkCost.trim() || variant.cost,
              status: bulkStatus || variant.status,
            }
          : variant,
      ),
    )
    setBulkOpen(false)
    setBulkPrice("")
    setBulkCost("")
  }

  async function resolveCategoryId() {
    if (categoryId) return categoryId
    const nextName = categoryName.trim()
    if (!nextName) return null
    const existing = categories.find((category) => category.name.toLowerCase() === nextName.toLowerCase())
    if (existing) return existing.id
    const { data, error } = await supabase
      .from("categories")
      .insert({ business_id: business.id, name: nextName, slug: categorySlug(nextName) })
      .select("id")
      .single()
    if (error) throw error
    return data.id as string
  }

  async function create(event: FormEvent) {
    event.preventDefault()
    if (productType === "variable" && variants.length === 0) {
      toast.error("Add option values to generate variants.")
      return
    }
    if (productType === "bundle" && components.length === 0) {
      toast.error("Add at least one bundle item.")
      return
    }
    setPending(true)
    try {
      const resolvedCategoryId = await resolveCategoryId()
      await callRpc(supabase, "save_product", {
        p_business_id: business.id,
        p_payload: {
          id: productId,
          product_type: productType,
          sku: productType === "variable" ? autoSku(productId) : sku.trim() || autoSku(productId),
          barcode: productType === "variable" ? null : barcode.trim() || null,
          name: name.trim(),
          description: description.trim() || null,
          price: Number(price) || 0,
          cost: productType === "bundle" ? bundleCost : Number(cost) || 0,
          weight_grams: null,
          supplier_sku: sku.trim() || autoSku(productId),
          pack_size: null,
          track_inventory: productType === "standard" ? track : false,
          is_visible: listed,
          sort_order: Number(sortOrder) || 0,
          status: "active",
          unit,
          tax_mode: taxMode,
          tax_rate: taxMode === "custom" ? Number(taxRate) || 0 : null,
          brand_id: brandId || null,
          brand_name: !brandId ? brandName.trim() || null : null,
          category_id: resolvedCategoryId,
          options:
            productType === "variable"
              ? options
                  .filter((option) => option.name.trim() && option.values.length > 0)
                  .map((option) => ({ name: option.name.trim(), values: option.values }))
              : [],
          variants:
            productType === "variable"
              ? variants.map((variant) => ({
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
            productType === "bundle"
              ? components.map((component) => ({
                  component_id: component.component_id,
                  quantity: Number(component.quantity) || 0,
                }))
              : [],
          images: [],
        },
      })
      toast.success("Product saved.")
      await onCreated()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save product.")
    } finally {
      setPending(false)
    }
  }

  const unusedPresets = OPTION_PRESETS.filter(
    (preset) => !options.some((option) => option.name.toLowerCase() === preset.toLowerCase()),
  )

  return (
    <>
      <button
        type="button"
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        aria-label="Close product form"
        className={cn(
          "fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ease-linear",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onCancel}
      />
      <div
        data-state={open ? "expanded" : "collapsed"}
        aria-hidden={!open}
        {...(!open ? { inert: "" as never } : {})}
        style={{ "--product-form-width": "min(calc(100vw - 2rem), 44rem)" } as CSSProperties}
        className={cn(
          "fixed top-4 bottom-4 z-50 flex w-(--product-form-width) flex-col overflow-hidden rounded-2xl border bg-muted/40 shadow-2xl transition-[right] duration-200 ease-linear",
          open ? "right-4" : "right-[calc(var(--product-form-width)*-1)]",
        )}
      >
        <UnsavedChangesDialog open={unsaved.open} onStay={unsaved.stay} onLeave={unsaved.leave} />
        <form id="new-product-form" className="flex min-h-0 flex-1 flex-col" onSubmit={create}>
          <div className="flex items-start justify-between gap-4 border-b bg-background px-4 py-3">
            <div className="space-y-0.5">
              <h2 className="font-heading text-base font-medium">New product</h2>
              <p className="text-sm text-muted-foreground">Add a product to your catalogue.</p>
            </div>
            <Button type="button" variant="ghost" size="icon-sm" onClick={onCancel} aria-label="Close">
              <X />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="flex flex-col gap-3">
          <FormSection title="Product type" description="Choose how this product is sold.">
            <div className="grid gap-3 sm:grid-cols-3">
              {TYPE_CARDS.map((item) => {
                const Icon = item.icon
                const selected = productType === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setProductType(item.id)
                      setTrack(item.id === "standard")
                      if (item.id !== "variable") {
                        setOptions([])
                        setVariants([])
                      }
                      if (item.id !== "bundle") setComponents([])
                    }}
                    className={cn(
                      "flex min-h-28 flex-col items-start gap-3 rounded-2xl border p-4 text-left transition-colors",
                      selected
                        ? "border-foreground bg-muted ring-1 ring-foreground"
                        : "border-transparent bg-muted/50 hover:bg-muted/70",
                    )}
                  >
                    <span className="flex w-full items-center justify-between">
                      <span className="text-xs text-muted-foreground">{item.index}</span>
                      <Icon className="size-4" />
                    </span>
                    <span>
                      <span className="font-heading block text-base font-medium">{item.title}</span>
                      <span className="text-sm text-muted-foreground">{item.description}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </FormSection>

          <FormSection title="General information" description="Shared information for all product variants.">
            <div className="grid gap-4">
              <Field id="name" label="Product name">
                <Input id="name" required value={name} onChange={(event) => setName(event.target.value)} />
              </Field>
              <Field id="description" label="Description">
                <Textarea
                  id="description"
                  rows={3}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="category" label="Category">
                  <CreatableCombobox
                    id="category"
                    items={categories}
                    valueId={categoryId}
                    valueName={categoryName}
                    placeholder="Search or create a category"
                    onSelect={(id, label) => {
                      setCategoryId(id)
                      setCategoryName(label)
                    }}
                  />
                </Field>
                <Field id="brand" label="Brand">
                  <CreatableCombobox
                    id="brand"
                    items={brands}
                    valueId={brandId}
                    valueName={brandName}
                    placeholder="Search or create a brand"
                    onSelect={(id, label) => {
                      setBrandId(id)
                      setBrandName(label)
                    }}
                  />
                </Field>
              </div>
            </div>
          </FormSection>

          {productType === "standard" ? (
            <FormSection title="Pricing and stock" description="This product is sold and counted on its own.">
              <div className="grid gap-4 sm:grid-cols-2">
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
                <Field id="cost" label="Cost">
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
                <Field id="sku" label="SKU">
                  <Input id="sku" required value={sku} onChange={(event) => setSku(event.target.value)} />
                </Field>
                <Field id="barcode" label="Barcode">
                  <Input id="barcode" value={barcode} onChange={(event) => setBarcode(event.target.value)} />
                </Field>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <Switch id="track" checked={track} onCheckedChange={setTrack} />
                  <Label htmlFor="track">Track inventory</Label>
                </div>
              </div>
            </FormSection>
          ) : null}

          {productType === "variable" ? (
            <>
              <FormSection title="Variant options" description="Define the attributes and values customers can choose.">
                <div className="grid gap-4">
                  <Popover open={optionMenuOpen} onOpenChange={setOptionMenuOpen}>
                    <PopoverTrigger render={<Button type="button" variant="outline" />}>
                      <Plus />
                      Add option
                    </PopoverTrigger>
                    <PopoverContent align="start" className="z-[80] w-48 p-1">
                      {unusedPresets.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          className="flex w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                          onClick={() => addOption(preset)}
                        >
                          {preset}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="flex w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                        onClick={() => addOption("")}
                      >
                        Custom option
                      </button>
                    </PopoverContent>
                  </Popover>

                  {options.map((option, index) => (
                    <OptionEditor
                      key={`${option.name}-${index}`}
                      option={option}
                      onName={(value) =>
                        setOptions((current) =>
                          current.map((item, itemIndex) => (itemIndex === index ? { ...item, name: value } : item)),
                        )
                      }
                      onAddValue={(value) => addOptionValue(index, value)}
                      onRemoveValue={(value) =>
                        setOptions((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, values: item.values.filter((entry) => entry !== value) }
                              : item,
                          ),
                        )
                      }
                      onRemove={() => setOptions((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                    />
                  ))}
                </div>
              </FormSection>

              <FormSection
                title={`Variants (${variants.length})`}
                description={`Combinations generated automatically. Prices shown in ${business.currency}.`}
                action={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={selectedVariantIds.length === 0}
                    onClick={() => setBulkOpen(true)}
                  >
                    Bulk edit
                  </Button>
                }
              >
                {variants.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Add option values to generate combinations.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">
                            <Checkbox
                              checked={selectedVariantIds.length === variants.length && variants.length > 0}
                              onCheckedChange={(checked) =>
                                setSelectedVariantIds(checked === true ? variants.map((variant) => variant.id) : [])
                              }
                              aria-label="Select all variants"
                            />
                          </TableHead>
                          <TableHead>Variant / SKU</TableHead>
                          <TableHead className="w-28">Price</TableHead>
                          <TableHead className="w-28">Cost</TableHead>
                          <TableHead className="w-28">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {variantGroups.map(([group, rows]) => {
                          const collapsed = collapsedGroups.includes(group)
                          return (
                            <VariantGroup
                              key={group}
                              group={group}
                              rows={rows}
                              collapsed={collapsed}
                              optionsCount={options.length}
                              selectedVariantIds={selectedVariantIds}
                              onToggle={() =>
                                setCollapsedGroups((current) =>
                                  collapsed ? current.filter((item) => item !== group) : [...current, group],
                                )
                              }
                              onSelect={(id, checked) =>
                                setSelectedVariantIds((current) =>
                                  checked ? [...current, id] : current.filter((item) => item !== id),
                                )
                              }
                              onChange={(next) =>
                                setVariants((current) => current.map((item) => (item.id === next.id ? next : item)))
                              }
                            />
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </FormSection>
            </>
          ) : null}

          {productType === "bundle" ? (
            <>
              <FormSection
                title="Bundle items"
                description="Add products or variants. Selling the bundle deducts stock from these items."
              >
                <div className="grid gap-3">
                  <Field id="component-search" label="Add from catalogue">
                    <Input
                      id="component-search"
                      placeholder="Search by name or SKU"
                      value={componentSearch}
                      onChange={(event) => setComponentSearch(event.target.value)}
                    />
                  </Field>
                  {searchableComponents.slice(0, 8).map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      className="rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => {
                        if (components.some((item) => item.component_id === product.id)) return
                        setComponents((current) => [
                          ...current,
                          {
                            component_id: product.id,
                            quantity: "1",
                            label: `${product.name} (${product.sku})`,
                            cost: Number(product.cost),
                            price: Number(product.price),
                          },
                        ])
                        setComponentSearch("")
                      }}
                    >
                      {product.name} · {product.sku} · {money(Number(product.price), business.currency)}
                    </button>
                  ))}
                  {components.map((component) => (
                    <div key={component.component_id} className="grid items-center gap-2 sm:grid-cols-[1fr_88px_auto]">
                      <div className="text-sm">{component.label}</div>
                      <Input
                        aria-label={`Quantity for ${component.label}`}
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={component.quantity}
                        onChange={(event) =>
                          setComponents((current) =>
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
                          setComponents((current) =>
                            current.filter((item) => item.component_id !== component.component_id),
                          )
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              </FormSection>
              <FormSection title="Price" description="Cost is the sum of the items. You set the bundle selling price.">
                <div className="grid gap-4 sm:grid-cols-2">
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
                  <Field id="sku" label="SKU">
                    <Input id="sku" required value={sku} onChange={(event) => setSku(event.target.value)} />
                  </Field>
                  <div className="rounded-lg border p-3 text-sm sm:col-span-2">
                    <div>Item cost {money(bundleCost, business.currency)}</div>
                    <div>Combined retail {money(bundleRetail, business.currency)}</div>
                    <div>Savings {money(Math.max(bundleRetail - (Number(price) || 0), 0), business.currency)}</div>
                  </div>
                </div>
              </FormSection>
            </>
          ) : null}

          <FormSection title="Additional settings" description="Configure shared product defaults.">
            <div className="-mx-3 divide-y">
              <SettingsRow label="Tax configuration">
                <Select value={taxMode} onValueChange={(value) => setTaxMode((value as TaxMode | null) ?? "inherit")}>
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inherit">Inherit</SelectItem>
                    <SelectItem value="exempt">Exempt</SelectItem>
                    <SelectItem value="custom">Custom rate</SelectItem>
                  </SelectContent>
                </Select>
              </SettingsRow>
              {taxMode === "custom" ? (
                <SettingsRow label="Tax rate %">
                  <Input
                    className="w-44"
                    type="number"
                    min="0"
                    max="100"
                    step="0.001"
                    value={taxRate}
                    onChange={(event) => setTaxRate(event.target.value)}
                  />
                </SettingsRow>
              ) : null}
              <SettingsRow label="Unit of measurement">
                <Input className="w-44" value={unit} onChange={(event) => setUnit(event.target.value)} />
              </SettingsRow>
              <SettingsRow label="Sort order">
                <Input
                  className="w-44"
                  type="number"
                  value={sortOrder}
                  onChange={(event) => setSortOrder(event.target.value)}
                />
              </SettingsRow>
              <SettingsRow label="Listed in catalogue">
                <Switch id="listed" checked={listed} onCheckedChange={setListed} />
              </SettingsRow>
            </div>
          </FormSection>
            </div>
          </div>
          <div className="mt-auto flex justify-end gap-2 border-t bg-background p-4">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" form="new-product-form" disabled={pending}>
              {pending ? "Saving…" : "Create product"}
            </Button>
          </div>
        </form>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk edit {selectedVariantIds.length} variants</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Field id="bulk-price" label="Sell price">
              <Input id="bulk-price" value={bulkPrice} placeholder="Leave blank to keep" onChange={(event) => setBulkPrice(event.target.value)} />
            </Field>
            <Field id="bulk-cost" label="Cost">
              <Input id="bulk-cost" value={bulkCost} placeholder="Leave blank to keep" onChange={(event) => setBulkCost(event.target.value)} />
            </Field>
            <Field id="bulk-status" label="Status">
              <Select value={bulkStatus} onValueChange={(value) => setBulkStatus(value ?? "active")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBulkOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={applyBulk}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </>
  )
}

function VariantGroup({
  group,
  rows,
  collapsed,
  optionsCount,
  selectedVariantIds,
  onToggle,
  onSelect,
  onChange,
}: {
  group: string
  rows: VariantDraft[]
  collapsed: boolean
  optionsCount: number
  selectedVariantIds: string[]
  onToggle: () => void
  onSelect: (id: string, checked: boolean) => void
  onChange: (variant: VariantDraft) => void
}) {
  return (
    <>
      <TableRow className="bg-muted/40 hover:bg-muted/40">
        <TableCell />
        <TableCell colSpan={4}>
          <button type="button" className="inline-flex items-center gap-2 text-sm font-medium" onClick={onToggle}>
            <ChevronDown className={cn("size-4 transition-transform", collapsed && "-rotate-90")} />
            {group}
            <span className="font-normal text-muted-foreground">
              {rows.length} {rows.length === 1 ? "variant" : "variants"}
            </span>
          </button>
        </TableCell>
      </TableRow>
      {collapsed
        ? null
        : rows.map((variant) => (
            <TableRow key={variant.id}>
              <TableCell>
                <Checkbox
                  checked={selectedVariantIds.includes(variant.id)}
                  onCheckedChange={(checked) => onSelect(variant.id, checked === true)}
                  aria-label={`Select ${variantLabel(variant)}`}
                />
              </TableCell>
              <TableCell>
                <div className="font-medium">{variantLabel(variant, optionsCount > 1)}</div>
                <Input
                  className="mt-1"
                  aria-label={`SKU for ${variantLabel(variant)}`}
                  value={variant.sku}
                  onChange={(event) => onChange({ ...variant, sku: event.target.value })}
                />
              </TableCell>
              <TableCell>
                <Input
                  aria-label={`Price for ${variantLabel(variant)}`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={variant.price}
                  onChange={(event) => onChange({ ...variant, price: event.target.value })}
                />
              </TableCell>
              <TableCell>
                <Input
                  aria-label={`Cost for ${variantLabel(variant)}`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={variant.cost}
                  onChange={(event) => onChange({ ...variant, cost: event.target.value })}
                />
              </TableCell>
              <TableCell>
                <Select
                  value={variant.status}
                  onValueChange={(value) => onChange({ ...variant, status: value ?? "active" })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
            </TableRow>
          ))}
    </>
  )
}

function OptionEditor({
  option,
  onName,
  onAddValue,
  onRemoveValue,
  onRemove,
}: {
  option: OptionDraft
  onName: (value: string) => void
  onAddValue: (value: string) => void
  onRemoveValue: (value: string) => void
  onRemove: () => void
}) {
  const [draft, setDraft] = useState("")

  function commit() {
    onAddValue(draft)
    setDraft("")
  }

  return (
    <div className="grid gap-3 rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <Input
          aria-label="Option name"
          placeholder="Option name"
          value={option.name}
          onChange={(event) => onName(event.target.value)}
        />
        <Button type="button" variant="ghost" onClick={onRemove}>
          Remove
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {option.values.map((value) => (
          <button
            key={value}
            type="button"
            title={value}
            className="inline-flex h-8 w-24 shrink-0 items-center justify-between gap-1 rounded-lg border px-2 text-sm"
            onClick={() => onRemoveValue(value)}
          >
            <span className="min-w-0 flex-1 truncate text-left">{value}</span>
            <X className="size-3 shrink-0" />
          </button>
        ))}
        <div className="flex min-w-40 flex-1 items-center gap-1">
          <Input
            value={draft}
            placeholder="Add value"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                commit()
              }
            }}
          />
          <Button type="button" variant="outline" size="icon-sm" onClick={commit} aria-label="Add value">
            <Plus />
          </Button>
        </div>
      </div>
    </div>
  )
}

function CreatableCombobox({
  id,
  items,
  valueId,
  valueName,
  placeholder,
  onSelect,
}: {
  id: string
  items: { id: string; name: string }[]
  valueId: string
  valueName: string
  placeholder: string
  onSelect: (id: string, name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const selected = items.find((item) => item.id === valueId)
  const label = selected?.name || valueName
  const filtered = items.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase()))
  const canCreate =
    query.trim() !== "" && !items.some((item) => item.name.toLowerCase() === query.trim().toLowerCase())

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        render={
          <Button type="button" variant="outline" className="w-full justify-between font-normal" />
        }
      >
        <span className={cn("truncate", !label && "text-muted-foreground")}>{label || placeholder}</span>
        <ChevronDown className="size-4 opacity-50" />
      </PopoverTrigger>
      <PopoverContent align="start" className="z-[80] w-80 p-0">
        <Command>
          <CommandInput placeholder={placeholder} value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            <CommandGroup>
              {filtered.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.name}
                  data-checked={item.id === valueId}
                  onSelect={() => {
                    onSelect(item.id, item.name)
                    setQuery("")
                    setOpen(false)
                  }}
                >
                  {item.name}
                </CommandItem>
              ))}
              {canCreate ? (
                <CommandItem
                  value={`create ${query}`}
                  onSelect={() => {
                    onSelect("", query.trim())
                    setQuery("")
                    setOpen(false)
                  }}
                >
                  Create “{query.trim()}”
                </CommandItem>
              ) : null}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function FormSection({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <Card size="sm" className="shadow-sm">
      <CardHeader className={description ? "border-b" : undefined}>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
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
  children: ReactNode
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}

function SettingsRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="text-sm">{label}</div>
      {children}
    </div>
  )
}
