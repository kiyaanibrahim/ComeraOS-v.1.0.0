"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { money } from "@/lib/flow/format"

export type CatalogProduct = {
  id: string
  sku: string
  name: string
  description: string | null
  price: number
  cost: number
  track_inventory: boolean
  category_id: string | null
  weight_grams: number | null
  supplier_sku: string | null
  pack_size: string | null
}

export function catalogGaps(cost: number) {
  return cost <= 0 ? ["Supplier cost is missing."] : []
}

export function ProductPicker({
  open,
  onOpenChange,
  products,
  categories,
  excludeIds,
  currency,
  onAdd,
  onWeight,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  products: CatalogProduct[]
  categories: Record<string, string>
  excludeIds: string[]
  currency: string
  onAdd: (products: CatalogProduct[]) => void
  onWeight: (productId: string, grams: number | null) => Promise<void>
}) {
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<string[]>([])
  const [weights, setWeights] = useState<Record<string, string>>({})
  const timers = useRef<Record<string, number>>({})
  const excluded = useMemo(() => new Set(excludeIds), [excludeIds])

  useEffect(() => {
    setWeights((current) => {
      const next = { ...current }
      let changed = false
      for (const product of products) {
        const draft = next[product.id]
        if (draft === undefined) continue
        const grams = draft.trim() === "" ? null : Number(draft)
        if (grams === product.weight_grams || (grams === null && !product.weight_grams)) {
          delete next[product.id]
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [products])

  function gramsFrom(raw: string | undefined, saved: number | null) {
    if (raw === undefined) return saved
    if (raw.trim() === "") return null
    const next = Number(raw)
    return Number.isFinite(next) ? next : saved
  }

  function queueWeight(productId: string, raw: string, saved: number | null) {
    window.clearTimeout(timers.current[productId])
    timers.current[productId] = window.setTimeout(() => {
      const next = raw.trim() === "" ? null : Number(raw)
      const savedGrams = saved == null ? null : Number(saved)
      if (next !== null && (!Number.isFinite(next) || next < 0)) return
      if (next === savedGrams) return
      void onWeight(productId, next)
    }, 400)
  }

  const visible = products.filter((product) => {
    if (excluded.has(product.id)) return false
    const needle = query.trim().toLowerCase()
    if (!needle) return true
    const category = product.category_id ? categories[product.category_id] ?? "" : ""
    return [product.name, product.sku, category, product.supplier_sku, product.pack_size]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(needle))
  })

  function toggle(id: string, checked: boolean) {
    setSelected((current) => (checked ? [...current, id] : current.filter((item) => item !== id)))
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setSelected([])
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Add products</DialogTitle>
          <DialogDescription>Choose products from the master catalog.</DialogDescription>
        </DialogHeader>
        <Input
          placeholder="Search product, SKU code, category, supplier SKU..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="max-h-[24rem] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Product</TableHead>
                <TableHead>SKU code</TableHead>
                <TableHead>Unit weight</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Supplier SKU</TableHead>
                <TableHead>Default supplier cost</TableHead>
                <TableHead>Retail price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-16 text-center text-muted-foreground">
                    No matching products.
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((product) => {
                  const weightValue =
                    weights[product.id] ?? (product.weight_grams ? String(product.weight_grams) : "")
                  const gaps = catalogGaps(Number(product.cost))
                  return (
                    <TableRow key={product.id}>
                      <TableCell>
                        <Checkbox
                          checked={selected.includes(product.id)}
                          onCheckedChange={(checked) => toggle(product.id, checked === true)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{product.name}</div>
                        <div className="text-muted-foreground">{product.pack_size || "No pack size"}</div>
                        {gaps.map((gap) => (
                          <div key={gap} className="text-destructive">
                            {gap}
                          </div>
                        ))}
                      </TableCell>
                      <TableCell>{product.sku}</TableCell>
                      <TableCell>
                        <Input
                          className="w-24"
                          type="number"
                          min="0"
                          step="1"
                          placeholder="grams"
                          aria-label={`Unit weight for ${product.name}`}
                          value={weightValue}
                          onValueChange={(value) => {
                            setWeights((current) => ({ ...current, [product.id]: value }))
                            queueWeight(product.id, value, product.weight_grams)
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        {product.category_id ? categories[product.category_id] || "—" : "—"}
                      </TableCell>
                      <TableCell>{product.supplier_sku || "—"}</TableCell>
                      <TableCell>{money(Number(product.cost), currency)}</TableCell>
                      <TableCell>{money(Number(product.price), currency)}</TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button
            type="button"
            disabled={selected.length === 0}
            onClick={() => {
              onAdd(
                products
                  .filter((product) => selected.includes(product.id))
                  .map((product) => ({
                    ...product,
                    weight_grams: gramsFrom(weights[product.id], product.weight_grams),
                  })),
              )
              setSelected([])
              onOpenChange(false)
            }}
          >
            Add selected products
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
