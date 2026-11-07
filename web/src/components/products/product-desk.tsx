"use client"

import { useCallback, useEffect, useState } from "react"

import { FlowFrame } from "@/components/flow/flow-frame"
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
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [sku, setSku] = useState("")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [price, setPrice] = useState("0")
  const [cost, setCost] = useState("0")
  const [weight, setWeight] = useState("")
  const [supplierSku, setSupplierSku] = useState("")
  const [packSize, setPackSize] = useState("")
  const [track, setTrack] = useState(true)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("products")
      .select("id, sku, name, description, price, cost, weight_grams, supplier_sku, pack_size, track_inventory, status")
      .eq("business_id", business.id)
      .order("name")
    if (error) setMessage(error.message)
    setRows(data ?? [])
  }, [business.id, supabase])

  useEffect(() => {
    void load()
  }, [load])

  async function create(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setMessage(null)
    const { error } = await supabase.from("products").insert({
      business_id: business.id,
      sku: sku.trim(),
      name: name.trim(),
      description: description.trim() || null,
      price: Number(price) || 0,
      cost: Number(cost) || 0,
      weight_grams: weight.trim() === "" ? null : Number(weight),
      supplier_sku: supplierSku.trim() || null,
      pack_size: packSize.trim() || null,
      track_inventory: track,
      status: "active",
    })
    setPending(false)
    if (error) {
      setMessage(error.message)
      return
    }
    setSku("")
    setName("")
    setDescription("")
    setPrice("0")
    setCost("0")
    setWeight("")
    setSupplierSku("")
    setPackSize("")
    setTrack(true)
    await load()
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>New product</CardTitle>
          <CardDescription>SKU, sell price, and catalog cost.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={create}>
            <Field id="sku" label="SKU">
              <Input id="sku" required value={sku} onChange={(event) => setSku(event.target.value)} />
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
              <Input id="supplier-sku" value={supplierSku} onChange={(event) => setSupplierSku(event.target.value)} />
            </Field>
            <Field id="pack-size" label="Pack size">
              <Input id="pack-size" value={packSize} onChange={(event) => setPackSize(event.target.value)} />
            </Field>
            <div className="flex items-center gap-2 md:col-span-2">
              <Switch id="track" checked={track} onCheckedChange={setTrack} />
              <Label htmlFor="track">Track inventory and batches</Label>
            </div>
            {message ? <p className="text-sm text-destructive md:col-span-2">{message}</p> : null}
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Sell price</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Weight</TableHead>
                <TableHead>Supplier SKU</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-16 text-center text-muted-foreground">
                    Add a product to start procurement.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.sku}</TableCell>
                    <TableCell>
                      <div className="font-medium">{row.name}</div>
                      {row.description ? (
                        <div className="text-muted-foreground">{row.description}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>{money(Number(row.price), business.currency)}</TableCell>
                    <TableCell>{money(Number(row.cost), business.currency)}</TableCell>
                    <TableCell>{row.weight_grams ? `${row.weight_grams} g` : "—"}</TableCell>
                    <TableCell>{row.supplier_sku || "—"}</TableCell>
                    <TableCell>{row.track_inventory ? "Tracked" : "Untracked"}</TableCell>
                    <TableCell className="capitalize">{row.status}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
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
