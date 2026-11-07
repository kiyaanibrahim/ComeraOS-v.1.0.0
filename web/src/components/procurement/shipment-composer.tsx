"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"

import { FlowFrame } from "@/components/flow/flow-frame"
import { catalogGaps, ProductPicker, type CatalogProduct } from "@/components/procurement/product-picker"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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

type ChargeDraft = {
  key: string
  kind: string
  group: string
  amount: string
  recoverable: boolean
}

const chargeKinds = ["freight", "insurance", "duty", "brokerage", "tax", "other"] as const

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
  const [charges, setCharges] = useState<ChargeDraft[]>([])
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

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
      setMessage(
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
    setLocationId((current) => current || locationRes.data?.[0]?.id || "")

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
      setMessage(shipmentRes.error?.message || "This draft is not in the business.")
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
    setCharges(
      (chargeRes.data ?? [])
        .filter((charge) => charge.description !== "Projected from weight")
        .map((charge) => ({
          key: charge.id,
          kind: charge.kind,
          group: charge.cost_group,
          amount: String(charge.amount),
          recoverable: charge.recoverable,
        })),
    )
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
      setMessage(error.message)
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
      setMessage(error?.message ?? "Could not add the location")
      return
    }
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
      setMessage(error?.message ?? "Could not add the supplier")
      return
    }
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
      setMessage(problem)
      return null
    }
    setPending(true)
    setMessage(null)
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
          .filter((charge) => Number(charge.amount) > 0)
          .map((charge) => ({
            kind: charge.kind,
            amount: Number(charge.amount),
            recoverable: charge.recoverable,
            cost_group: charge.group,
            source: "projected",
          })),
      })
      setDraftId(id)
      setDirty(false)
      if (!shipmentId) router.replace(`/app/${businessKey}/procurement/${id}/edit`)
      return id
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the draft")
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
      router.push(`/app/${businessKey}/procurement/${copy}/edit`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not duplicate the draft")
      setPending(false)
    }
  }

  async function convert() {
    const id = await save()
    if (!id) return
    if (cart.length === 0) {
      setMessage("Add at least one product.")
      return
    }
    setPending(true)
    try {
      await callRpc(supabase, "convert_shipment_draft", { p_shipment_id: id })
      router.push(`/app/${businessKey}/procurement/${id}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not convert the draft")
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
      router.push(`/app/${businessKey}/procurement/drafts`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete the draft")
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

  const locationItems = Object.fromEntries(locations.map((location) => [location.id, location.name]))
  const supplierItems = Object.fromEntries(suppliers.map((supplier) => [supplier.id, supplier.name]))

  return (
    <div className="flex flex-col gap-4">
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
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Field label="Shipment name">
            <Input value={name} onChange={(event) => mark(setName)(event.target.value)} />
          </Field>
          <Field label="Origin country">
            <Input value={originCountry} onChange={(event) => mark(setOriginCountry)(event.target.value)} />
          </Field>
          {locations.length > 0 ? (
            <Field label="Destination warehouse">
              <Select value={locationId} items={locationItems} onValueChange={(value) => mark(setLocationId)(value ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : (
            <Field label="Destination warehouse">
              <div className="flex gap-2">
                <Input value={locationName} onChange={(event) => setLocationName(event.target.value)} />
                <Button type="button" variant="outline" onClick={createLocation}>
                  Add
                </Button>
              </div>
            </Field>
          )}
          {suppliers.length > 0 ? (
            <Field label="Supplier">
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
            </Field>
          ) : (
            <Field label="Supplier">
              <div className="flex gap-2">
                <Input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} />
                <Button type="button" variant="outline" onClick={createSupplier}>
                  Add
                </Button>
              </div>
            </Field>
          )}
          <Field label="Discount %">
            <Input
              type="number"
              min="0"
              max="100"
              step="0.001"
              value={discount}
              onChange={(event) => mark(setDiscount)(event.target.value)}
            />
          </Field>
          <Field label="Origin currency">
            <Input value={originCurrency} onChange={(event) => mark(setOriginCurrency)(event.target.value.toUpperCase())} />
          </Field>
          <Field label="Origin to USD">
            <Input
              type="number"
              min="0.000001"
              step="0.000001"
              value={originToUsd}
              onChange={(event) => mark(setOriginToUsd)(event.target.value)}
            />
          </Field>
          <Field label={`USD to ${business.currency}`}>
            <Input
              type="number"
              min="0.000001"
              step="0.000001"
              value={usdToBusiness}
              onChange={(event) => mark(setUsdToBusiness)(event.target.value)}
            />
          </Field>
          <Field label="Freight USD per kg">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={freightPerKg}
              onChange={(event) => mark(setFreightPerKg)(event.target.value)}
            />
          </Field>
          <Field label="Declared value USD">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={declaredTouched ? declared : String(declaredPreview)}
              onChange={(event) => {
                setDeclaredTouched(true)
                mark(setDeclared)(event.target.value)
              }}
            />
          </Field>
          <Field label="Carrier">
            <Input value={carrier} onChange={(event) => mark(setCarrier)(event.target.value)} />
          </Field>
          <Field label="Tracking number">
            <Input value={tracking} onChange={(event) => mark(setTracking)(event.target.value)} />
          </Field>
          <Field label="ETA">
            <Input type="date" value={expectedOn} onChange={(event) => mark(setExpectedOn)(event.target.value)} />
          </Field>
          <Field label="Allocate landing charges">
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
          </Field>
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
                    const gaps = catalogGaps(line.catalogCost, line.weightGrams)
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
                        <TableCell>{line.weightGrams ? `${line.weightGrams} g` : "—"}</TableCell>
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

      <Card>
        <CardHeader>
          <CardTitle>Extra projected charges</CardTitle>
          <CardDescription>
            Freight from the kilogram rate is added on save when you do not enter a freight charge. Recoverable tax
            stays out of landing cost.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {charges.map((charge) => (
            <div key={charge.key} className="grid gap-2 md:grid-cols-[1fr_1fr_8rem_auto_auto]">
              <Select
                value={charge.kind}
                items={Object.fromEntries(chargeKinds.map((kind) => [kind, kind]))}
                onValueChange={(value) => {
                  setDirty(true)
                  setCharges((current) =>
                    current.map((item) => (item.key === charge.key ? { ...item, kind: value || item.kind } : item)),
                  )
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {chargeKinds.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {kind}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={charge.group}
                items={{
                  freight: "Freight",
                  shipping_company: "Shipping company",
                  clearance: "Clearance",
                  other: "Other",
                }}
                onValueChange={(value) => {
                  setDirty(true)
                  setCharges((current) =>
                    current.map((item) =>
                      item.key === charge.key ? { ...item, group: value || item.group } : item,
                    ),
                  )
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="freight">Freight</SelectItem>
                  <SelectItem value="shipping_company">Shipping company</SelectItem>
                  <SelectItem value="clearance">Clearance</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={charge.amount}
                onChange={(event) => {
                  setDirty(true)
                  setCharges((current) =>
                    current.map((item) =>
                      item.key === charge.key ? { ...item, amount: event.target.value } : item,
                    ),
                  )
                }}
              />
              <div className="flex items-center gap-2">
                <Switch
                  checked={charge.recoverable}
                  onCheckedChange={(checked) => {
                    setDirty(true)
                    setCharges((current) =>
                      current.map((item) =>
                        item.key === charge.key ? { ...item, recoverable: checked } : item,
                      ),
                    )
                  }}
                />
                <span className="text-sm text-muted-foreground">Recoverable</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDirty(true)
                  setCharges((current) => current.filter((item) => item.key !== charge.key))
                }}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setCharges((current) => [
                ...current,
                { key: crypto.randomUUID(), kind: "insurance", group: "other", amount: "", recoverable: false },
              ])
            }
          >
            Add charge
          </Button>
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
          {message ? <p className="text-destructive">{message}</p> : null}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
