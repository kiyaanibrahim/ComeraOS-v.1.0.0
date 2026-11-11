"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { FlowFrame } from "@/components/flow/flow-frame"
import { chargesToDrafts, type ChargeDraft } from "@/components/procurement/charge-drafts"
import { FieldCard, FieldGrid, FormSection } from "@/components/procurement/form-row"
import { ProcurementNav } from "@/components/procurement/procurement-nav"
import { catalogGaps, ProductPicker, type CatalogProduct } from "@/components/procurement/product-picker"
import { UnsavedChangesDialog, useUnsavedChanges } from "@/components/unsaved-changes"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/sonner"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  businessUnitCost,
  discountFactor,
  landShipment,
  margin,
  projectedFreight,
  type AllocationMethod,
} from "@/lib/flow/cost"
import { money, quantity } from "@/lib/flow/format"
import { chargeGroups, groupLabel } from "@/lib/flow/procurement"
import { callRpc } from "@/lib/flow/rpc"
import type { BusinessRecord, FlowClient } from "@/lib/flow/use-business"

type LocationRow = { id: string; name: string; kind: string }
type SupplierRow = { id: string; name: string }

type CartLine = {
  productId: string
  sku: string
  name: string
  sellPrice: number
  catalogCost: number
  quantity: string
  weightGrams: number
  supplierSku: string | null
}

export function ShipmentComposer({
  businessKey,
  shipmentId,
}: {
  businessKey: string
  shipmentId?: string
}) {
  return (
    <FlowFrame
      businessKey={businessKey}
      title={shipmentId ? "Edit draft" : "New draft"}
      description="Name the shipment, choose products, and save. Converting it starts the tracker."
      aside={<ProcurementNav businessKey={businessKey} current="drafts" />}
    >
      {({ business, supabase }) => (
        <Composer
          business={business}
          businessKey={businessKey}
          shipmentId={shipmentId}
          supabase={supabase}
        />
      )}
    </FlowFrame>
  )
}

function Composer({
  business,
  businessKey,
  shipmentId,
  supabase,
}: {
  business: BusinessRecord
  businessKey: string
  shipmentId?: string
  supabase: FlowClient
}) {
  const router = useRouter()
  const [products, setProducts] = useState<CatalogProduct[]>([])
  const [categories, setCategories] = useState<Record<string, string>>({})
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [draftId, setDraftId] = useState(shipmentId ?? "")
  const [reference, setReference] = useState("")
  const [closed, setClosed] = useState(false)
  const [name, setName] = useState("")
  const [locationId, setLocationId] = useState("")
  const [supplierId, setSupplierId] = useState("")
  const [locationName, setLocationName] = useState("")
  const [supplierName, setSupplierName] = useState("")
  const [originCountry, setOriginCountry] = useState("")
  const [carrier, setCarrier] = useState("")
  const [tracking, setTracking] = useState("")
  const [expectedOn, setExpectedOn] = useState("")
  const [method, setMethod] = useState<AllocationMethod>("weight")
  const [discount, setDiscount] = useState("0")
  const [originCurrency, setOriginCurrency] = useState(business.currency)
  const [originToUsd, setOriginToUsd] = useState("1")
  const [usdToBusiness, setUsdToBusiness] = useState("1")
  const [freightPerKg, setFreightPerKg] = useState("0")
  const [declared, setDeclared] = useState("")
  const [declaredTouched, setDeclaredTouched] = useState(false)
  const [cart, setCart] = useState<CartLine[]>([])
  const [charges, setCharges] = useState<ChargeDraft[]>(() => chargesToDrafts([]))
  const [dirty, setDirty] = useState(false)
  const [pending, setPending] = useState(false)
  const unsaved = useUnsavedChanges(dirty)
  const weightTimers = useRef<Record<string, number>>({})

  const load = useCallback(async () => {
    const [productRes, categoryRes, locationRes, supplierRes] = await Promise.all([
      supabase
        .from("products")
        .select(
          "id, sku, name, description, price, cost, track_inventory, category_id, weight_grams, supplier_sku, pack_size",
        )
        .eq("business_id", business.id)
        .eq("status", "active")
        .order("name"),
      supabase.from("categories").select("id, name").eq("business_id", business.id),
      supabase.from("locations").select("id, name, kind").eq("business_id", business.id).order("name"),
      supabase.from("suppliers").select("id, name").eq("business_id", business.id).order("name"),
    ])
    if (productRes.error || categoryRes.error || locationRes.error || supplierRes.error) {
      toast.error(
        productRes.error?.message ||
          categoryRes.error?.message ||
          locationRes.error?.message ||
          supplierRes.error?.message ||
          "Could not load products",
      )
    }
    setProducts(productRes.data ?? [])
    setCategories(Object.fromEntries((categoryRes.data ?? []).map((row) => [row.id, row.name])))
    setLocations(locationRes.data ?? [])
    setSuppliers(supplierRes.data ?? [])
    setLocationId((current) => current || locationRes.data?.find((row) => row.kind === "warehouse")?.id || "")

    if (!shipmentId) return
    const shipmentRes = await supabase
      .from("shipments")
      .select(
        "id, reference, stage, name, location_id, supplier_id, origin_country, carrier, tracking_number, expected_on, allocation_method, discount_percent, origin_currency, origin_to_usd_rate, usd_to_business_rate, freight_per_kg, declared_value",
      )
      .eq("id", shipmentId)
      .eq("business_id", business.id)
      .maybeSingle()
    if (shipmentRes.error || !shipmentRes.data) {
      toast.error(shipmentRes.error?.message || "This draft is not in the business.")
      setClosed(true)
      return
    }
    if (shipmentRes.data.stage !== "draft_order") {
      setClosed(true)
      setReference(shipmentRes.data.reference || "")
      return
    }
    const [lineRes, chargeRes] = await Promise.all([
      supabase
        .from("shipment_lines")
        .select("product_id, sku, name, sell_price, catalog_cost, quantity, unit_weight_grams, supplier_sku, position")
        .eq("shipment_id", shipmentId)
        .order("position"),
      supabase
        .from("shipment_charges")
        .select("id, kind, amount, recoverable, cost_group, description")
        .eq("shipment_id", shipmentId),
    ])
    const row = shipmentRes.data
    setDraftId(row.id)
    setReference(row.reference || "")
    setName(row.name || "")
    setLocationId(row.location_id || "")
    setSupplierId(row.supplier_id || "")
    setOriginCountry(row.origin_country || "")
    setCarrier(row.carrier || "")
    setTracking(row.tracking_number || "")
    setExpectedOn(row.expected_on || "")
    setMethod((row.allocation_method as AllocationMethod) || "weight")
    setDiscount(String(row.discount_percent ?? 0))
    setOriginCurrency(row.origin_currency || business.currency)
    setOriginToUsd(String(row.origin_to_usd_rate ?? 1))
    setUsdToBusiness(String(row.usd_to_business_rate ?? 1))
    setFreightPerKg(String(row.freight_per_kg ?? 0))
    setDeclared(String(row.declared_value ?? 0))
    setDeclaredTouched(true)
    setCart(
      (lineRes.data ?? []).map((line) => ({
        productId: line.product_id,
        sku: line.sku,
        name: line.name,
        sellPrice: Number(line.sell_price),
        catalogCost: Number(line.catalog_cost),
        quantity: String(line.quantity),
        weightGrams: Number(line.unit_weight_grams),
        supplierSku: line.supplier_sku,
      })),
    )
    setCharges(chargesToDrafts((chargeRes.data ?? []).filter((charge) => charge.description !== "Projected from weight")))
  }, [business.currency, business.id, shipmentId, supabase])

  useEffect(() => {
    void load()
  }, [load])

  const rates = {
    discount: Number(discount) || 0,
    originToUsd: Number(originToUsd) || 0,
    usdToBusiness: Number(usdToBusiness) || 0,
    freightPerKg: Number(freightPerKg) || 0,
  }

  const previewLines = useMemo(
    () =>
      cart.map((line) => ({
        id: line.productId,
        quantity: Number(line.quantity) || 0,
        unitCost: businessUnitCost(line.catalogCost, rates.discount, rates.originToUsd, rates.usdToBusiness),
        weightGrams: line.weightGrams,
      })),
    [cart, rates.discount, rates.originToUsd, rates.usdToBusiness],
  )

  const weightGrams = previewLines.reduce((sum, line) => sum + line.quantity * line.weightGrams, 0)
  const freightPreview = projectedFreight(weightGrams, rates.freightPerKg, rates.usdToBusiness)
  const hasFreightCharge = charges.some((charge) => charge.group === "freight" && Number(charge.amount) > 0)
  const previewCharges = [
    ...charges.map((charge) => ({ amount: Number(charge.amount) || 0, recoverable: charge.recoverable })),
    ...(freightPreview > 0 && !hasFreightCharge ? [{ amount: freightPreview, recoverable: false }] : []),
  ]
  const landed = useMemo(
    () => landShipment(previewLines, previewCharges, method),
    [method, previewCharges, previewLines],
  )
  const declaredPreview = roundDeclared(cart, rates.discount, rates.originToUsd)

  function mark<T>(setter: (value: T) => void) {
    return (value: T) => {
      setDirty(true)
      setter(value)
    }
  }

  async function saveWeight(productId: string, grams: number | null) {
    const { error } = await supabase
      .from("products")
      .update({ weight_grams: grams })
      .eq("id", productId)
      .eq("business_id", business.id)
    if (error) {
      toast.error(error.message)
      return
    }
    setProducts((current) =>
      current.map((product) => (product.id === productId ? { ...product, weight_grams: grams } : product)),
    )
    setCart((current) =>
      current.map((line) => (line.productId === productId ? { ...line, weightGrams: grams ?? 0 } : line)),
    )
  }

  function addProducts(picked: CatalogProduct[]) {
    setDirty(true)
    setCart((current) => [
      ...current,
      ...picked
        .filter((product) => !current.some((line) => line.productId === product.id))
        .map((product) => ({
          productId: product.id,
          sku: product.sku,
          name: product.name,
          sellPrice: Number(product.price),
          catalogCost: Number(product.cost),
          quantity: "1",
          weightGrams: Number(product.weight_grams) || 0,
          supplierSku: product.supplier_sku,
        })),
    ])
  }

  async function createLocation() {
    const next = locationName.trim()
    if (!next) return
    const { data, error } = await supabase
      .from("locations")
      .insert({ business_id: business.id, name: next, kind: "warehouse" })
      .select("id, name, kind")
      .single()
    if (error || !data) {
      toast.error(error?.message ?? "Could not add the location")
      return
    }
    toast.success("Location added.")
    setLocations((current) => [...current, data].sort((a, b) => a.name.localeCompare(b.name)))
    setLocationId(data.id)
    setLocationName("")
    setDirty(true)
  }

  async function createSupplier() {
    const next = supplierName.trim()
    if (!next) return
    const { data, error } = await supabase
      .from("suppliers")
      .insert({ business_id: business.id, name: next })
      .select("id, name")
      .single()
    if (error || !data) {
      toast.error(error?.message ?? "Could not add the supplier")
      return
    }
    toast.success("Supplier added.")
    setSuppliers((current) => [...current, data].sort((a, b) => a.name.localeCompare(b.name)))
    setSupplierId(data.id)
    setSupplierName("")
    setDirty(true)
  }

  function validate() {
    if (!locationId) return "Choose a destination location."
    if (cart.some((line) => Number(line.quantity) <= 0)) return "Every line needs a quantity greater than zero."
    if (method === "weight" && cart.some((line) => line.weightGrams <= 0)) {
      return "Add a unit weight before allocating by weight."
    }
    if (rates.originToUsd <= 0 || rates.usdToBusiness <= 0) return "Exchange rates must be greater than zero."
    return null
  }

  async function save() {
    const problem = validate()
    if (problem) {
      toast.error(problem)
      return null
    }
    setPending(true)
    try {
      const id = await callRpc<string>(supabase, "save_shipment_draft", {
        p_business_id: business.id,
        p_shipment_id: draftId || null,
        p_location_id: locationId,
        p_supplier_id: supplierId || null,
        p_name: name,
        p_origin_country: originCountry,
        p_carrier: carrier,
        p_tracking_number: tracking,
        p_expected_on: expectedOn || null,
        p_allocation_method: method,
        p_discount_percent: rates.discount,
        p_origin_currency: originCurrency || business.currency,
        p_origin_to_usd_rate: rates.originToUsd,
        p_usd_to_business_rate: rates.usdToBusiness,
        p_freight_per_kg: rates.freightPerKg,
        p_declared_value: declaredTouched ? Number(declared) || 0 : null,
        p_lines: cart.map((line) => ({ product_id: line.productId, quantity: Number(line.quantity) })),
        p_charges: charges
          .filter((charge) => charge.amount.trim() !== "" && Number(charge.amount) > 0)
          .map((charge) => ({
            kind: charge.kind,
            amount: Number(charge.amount),
            recoverable: charge.recoverable,
            cost_group: charge.group,
            source: "projected",
            description: charge.description,
          })),
      })
      setDraftId(id)
      setDirty(false)
      toast.success("Draft saved.")
      if (!shipmentId) router.replace(`/app/${businessKey}/procurement/${id}/edit`)
      return id
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the draft")
      return null
    } finally {
      setPending(false)
    }
  }

  async function duplicate() {
    const id = draftId || (await save())
    if (!id) return
    setPending(true)
    try {
      const copy = await callRpc<string>(supabase, "duplicate_shipment", { p_shipment_id: id })
      toast.success("Draft duplicated.")
      router.push(`/app/${businessKey}/procurement/${copy}/edit`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not duplicate the draft")
      setPending(false)
    }
  }

  async function convert() {
    const id = await save()
    if (!id) return
    if (cart.length === 0) {
      toast.error("Add at least one product.")
      return
    }
    setPending(true)
    try {
      await callRpc(supabase, "convert_shipment_draft", { p_shipment_id: id })
      toast.success("Draft converted to a shipment.")
      router.push(`/app/${businessKey}/procurement/${id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not convert the draft")
      setPending(false)
    }
  }

  async function removeDraft() {
    if (!draftId) {
      router.push(`/app/${businessKey}/procurement/drafts`)
      return
    }
    setPending(true)
    try {
      await callRpc(supabase, "delete_shipment_draft", { p_shipment_id: draftId })
      toast.success("Draft deleted.")
      router.push(`/app/${businessKey}/procurement/drafts`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the draft")
      setPending(false)
    }
  }

  if (closed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{reference || "Shipment"}</CardTitle>
          <CardDescription>This shipment is no longer a draft.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button nativeButton={false} render={<Link href={`/app/${businessKey}/procurement/${shipmentId}`} />}>
            View shipment
          </Button>
        </CardContent>
      </Card>
    )
  }

  const destinations = locations.filter((location) => location.kind === "warehouse" || location.id === locationId)
  const locationItems = Object.fromEntries(destinations.map((location) => [location.id, location.name]))
  const supplierItems = Object.fromEntries(suppliers.map((supplier) => [supplier.id, supplier.name]))

  return (
    <div className="flex flex-col gap-4">
      <UnsavedChangesDialog open={unsaved.open} onStay={unsaved.stay} onLeave={unsaved.leave} />
      <ProductPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        products={products}
        categories={categories}
        excludeIds={cart.map((line) => line.productId)}
        currency={originCurrency || business.currency}
        onAdd={addProducts}
        onWeight={saveWeight}
      />

      <Card>
        <CardHeader>
          <CardTitle>Shipment setup</CardTitle>
          <CardDescription>
            {reference ? `${reference}. ` : ""}
            Discount and rates convert the catalog cost into {business.currency} when you save.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FormSection title="Shipment">
            <div className="py-3">
            <FieldGrid>
            <FieldCard label="Shipment name">
              <Input value={name} onValueChange={(value) => mark(setName)(value)} />
            </FieldCard>
            <FieldCard label="Origin country">
              <Input value={originCountry} onValueChange={(value) => mark(setOriginCountry)(value)} />
            </FieldCard>
            <FieldCard label="Destination warehouse">
              {destinations.length > 0 ? (
                <Select value={locationId} items={locationItems} onValueChange={(value) => mark(setLocationId)(value ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {destinations.map((location) => (
                      <SelectItem key={location.id} value={location.id}>
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex gap-2">
                  <Input value={locationName} onValueChange={setLocationName} />
                  <Button type="button" variant="outline" onClick={createLocation}>
                    Add
                  </Button>
                </div>
              )}
            </FieldCard>
            <FieldCard label="Supplier">
              {suppliers.length > 0 ? (
                <Select value={supplierId} items={supplierItems} onValueChange={(value) => mark(setSupplierId)(value ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Optional supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex gap-2">
                  <Input value={supplierName} onValueChange={setSupplierName} />
                  <Button type="button" variant="outline" onClick={createSupplier}>
                    Add
                  </Button>
                </div>
              )}
            </FieldCard>
            <FieldCard label="Carrier">
              <Input value={carrier} onValueChange={(value) => mark(setCarrier)(value)} />
            </FieldCard>
            <FieldCard label="Tracking number">
              <Input value={tracking} onValueChange={(value) => mark(setTracking)(value)} />
            </FieldCard>
            <FieldCard label="ETA">
              <Input type="date" value={expectedOn} onValueChange={(value) => mark(setExpectedOn)(value)} />
            </FieldCard>
            </FieldGrid>
            </div>
          </FormSection>
          <FormSection title="Pricing">
            <div className="py-3">
            <FieldGrid>
            <FieldCard label="Discount %">
              <Input
                type="number"
                min="0"
                max="100"
                step="0.001"
                value={discount}
                onValueChange={(value) => mark(setDiscount)(value)}
              />
            </FieldCard>
            <FieldCard label="Origin currency">
              <Input value={originCurrency} onValueChange={(value) => mark(setOriginCurrency)(value.toUpperCase())} />
            </FieldCard>
            <FieldCard label="Origin to USD">
              <Input
                type="number"
                min="0.000001"
                step="0.000001"
                value={originToUsd}
                onValueChange={(value) => mark(setOriginToUsd)(value)}
              />
            </FieldCard>
            <FieldCard label={`USD to ${business.currency}`}>
              <Input
                type="number"
                min="0.000001"
                step="0.000001"
                value={usdToBusiness}
                onValueChange={(value) => mark(setUsdToBusiness)(value)}
              />
            </FieldCard>
            <FieldCard label="Freight USD per kg">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={freightPerKg}
                onValueChange={(value) => mark(setFreightPerKg)(value)}
              />
            </FieldCard>
            <FieldCard label="Declared value USD">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={declaredTouched ? declared : String(declaredPreview)}
                onValueChange={(value) => {
                  setDeclaredTouched(true)
                  mark(setDeclared)(value)
                }}
              />
            </FieldCard>
            <FieldCard label="Allocate landing charges">
              <Select
                value={method}
                items={{ weight: "By weight", value: "By merchandise value", quantity: "By quantity" }}
                onValueChange={(value) => mark(setMethod)((value as AllocationMethod) || "weight")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weight">By weight</SelectItem>
                  <SelectItem value="value">By merchandise value</SelectItem>
                  <SelectItem value="quantity">By quantity</SelectItem>
                </SelectContent>
              </Select>
            </FieldCard>
            </FieldGrid>
            </div>
          </FormSection>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Build order</CardTitle>
          <CardDescription>Quantity is the field you edit. Prices and weight come from the catalog.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button type="button" onClick={() => setPickerOpen(true)}>
            Add products
          </Button>
          {dirty ? (
            <p className="text-sm text-muted-foreground">Unsaved changes. The stored totals refresh when you save.</p>
          ) : null}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Before discount</TableHead>
                  <TableHead>After discount</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Unit weight</TableHead>
                  <TableHead>Total weight</TableHead>
                  <TableHead>Purchase {originCurrency || "origin"}</TableHead>
                  <TableHead>Purchase USD</TableHead>
                  <TableHead>Purchase {business.currency}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {cart.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="h-16 text-center text-muted-foreground">
                      No products yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  cart.map((line) => {
                    const qty = Number(line.quantity) || 0
                    const after = line.catalogCost * discountFactor(rates.discount)
                    const gaps = catalogGaps(line.catalogCost)
                    return (
                      <TableRow key={line.productId}>
                        <TableCell>
                          <div className="font-medium">{line.name}</div>
                          {gaps.map((gap) => (
                            <div key={gap} className="text-destructive">
                              {gap}
                            </div>
                          ))}
                        </TableCell>
                        <TableCell>{line.sku}</TableCell>
                        <TableCell>{money(line.catalogCost, originCurrency || business.currency)}</TableCell>
                        <TableCell>{money(after, originCurrency || business.currency)}</TableCell>
                        <TableCell>
                          <Input
                            className="w-24"
                            type="number"
                            min="0.001"
                            step="0.001"
                            value={line.quantity}
                            onChange={(event) => {
                              setDirty(true)
                              setCart((current) =>
                                current.map((item) =>
                                  item.productId === line.productId
                                    ? { ...item, quantity: event.target.value }
                                    : item,
                                ),
                              )
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="w-24"
                            type="number"
                            min="0"
                            step="1"
                            placeholder="grams"
                            aria-label={`Unit weight for ${line.name}`}
                            value={line.weightGrams ? String(line.weightGrams) : ""}
                            onValueChange={(value) => {
                              const grams = value.trim() === "" ? 0 : Number(value)
                              if (!Number.isFinite(grams) || grams < 0) return
                              setDirty(true)
                              setCart((current) =>
                                current.map((item) =>
                                  item.productId === line.productId ? { ...item, weightGrams: grams } : item,
                                ),
                              )
                              window.clearTimeout(weightTimers.current[line.productId])
                              weightTimers.current[line.productId] = window.setTimeout(() => {
                                void saveWeight(line.productId, grams > 0 ? grams : null)
                              }, 400)
                            }}
                          />
                        </TableCell>
                        <TableCell>{quantity(qty * line.weightGrams)} g</TableCell>
                        <TableCell>{money(qty * after, originCurrency || business.currency)}</TableCell>
                        <TableCell>{money(qty * after * rates.originToUsd, "USD")}</TableCell>
                        <TableCell>
                          {money(
                            qty *
                              businessUnitCost(
                                line.catalogCost,
                                rates.discount,
                                rates.originToUsd,
                                rates.usdToBusiness,
                              ),
                            business.currency,
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              setDirty(true)
                              setCart((current) => current.filter((item) => item.productId !== line.productId))
                            }}
                          >
                            Remove
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Extra projected charges</CardTitle>
          <CardDescription>
            Freight from the kilogram rate is added on save when you do not enter a freight charge. Recoverable tax
            stays out of landing cost.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {chargeGroups
            .filter(([group]) => charges.some((charge) => charge.group === group))
            .map(([group]) => (
            <FormSection key={group} title={groupLabel(group)}>
              <div className="py-3">
              <FieldGrid>
              {charges
                .filter((charge) => charge.group === group)
                .map((charge) => (
                  <FieldCard key={charge.key} label={charge.description} hint={charge.recoverable ? "Recoverable" : undefined}>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={charge.amount}
                      onValueChange={(value) => {
                        setDirty(true)
                        setCharges((current) =>
                          current.map((item) => (item.key === charge.key ? { ...item, amount: value } : item)),
                        )
                      }}
                    />
                  </FieldCard>
                ))}
              </FieldGrid>
              </div>
            </FormSection>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Projection summary</CardTitle>
          <CardDescription>
            Purchase {money(landed.merchandiseTotal, business.currency)} · landing charges{" "}
            {money(landed.chargeTotal, business.currency)} · weight {quantity(weightGrams / 1000)} kg
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {landed.lines.map((line) => {
            const cartLine = cart.find((item) => item.productId === line.id)
            const share = weightGrams > 0 ? (line.weight / weightGrams) * 100 : 0
            const lineMargin = margin(cartLine?.sellPrice ?? 0, line.unitLanding)
            return (
              <div key={line.id} className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{cartLine?.name}</div>
                  <div className="text-muted-foreground">
                    {share.toFixed(1)}% of weight · allocated {money(line.allocated, business.currency)}
                    {lineMargin === null ? "" : ` · margin ${(lineMargin * 100).toFixed(1)}%`}
                  </div>
                </div>
                <div className="text-right tabular-nums">
                  <div>{money(line.lineLanding, business.currency)}</div>
                  <div className="text-muted-foreground">{money(line.unitLanding, business.currency)} each</div>
                </div>
              </div>
            )
          })}
          <div className="flex items-center justify-between border-t pt-2 font-medium">
            <span>Total shipment cost</span>
            <span className="tabular-nums">{money(landed.landingTotal, business.currency)}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void save()} disabled={pending}>
              {pending ? "Saving…" : "Save draft"}
            </Button>
            <Button type="button" variant="outline" onClick={() => void duplicate()} disabled={pending}>
              Duplicate
            </Button>
            <Button type="button" variant="outline" onClick={() => void convert()} disabled={pending}>
              Convert to shipment
            </Button>
            <Button type="button" variant="ghost" onClick={() => void removeDraft()} disabled={pending}>
              Delete draft
            </Button>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  )
}

function roundDeclared(
  cart: CartLine[],
  discount: number,
  originToUsd: number,
) {
  return cart.reduce((sum, line) => {
    const qty = Number(line.quantity) || 0
    return sum + qty * line.catalogCost * discountFactor(discount) * originToUsd
  }, 0)
}

