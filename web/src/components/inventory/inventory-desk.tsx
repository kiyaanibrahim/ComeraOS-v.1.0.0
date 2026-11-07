"use client"

import { useCallback, useEffect, useState } from "react"

import { FlowFrame } from "@/components/flow/flow-frame"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { money, quantity } from "@/lib/flow/format"
import type { BusinessRecord, FlowClient } from "@/lib/flow/use-business"

type Balance = {
  product_id: string
  location_id: string
  quantity: number
}

type Movement = {
  id: string
  product_id: string
  location_id: string
  quantity: number
  reason: string
  reference: string | null
  created_at: string
}

export function InventoryDesk({ businessKey }: { businessKey: string }) {
  return (
    <FlowFrame
      businessKey={businessKey}
      title="Inventory"
      description="Stock posted when a shipment is delivered. POS sells from these balances."
    >
      {({ business, supabase }) => <Stock business={business} supabase={supabase} />}
    </FlowFrame>
  )
}

function Stock({ business, supabase }: { business: BusinessRecord; supabase: FlowClient }) {
  const [balances, setBalances] = useState<Balance[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [names, setNames] = useState<Record<string, { sku: string; name: string; cost: number }>>({})
  const [locations, setLocations] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [balanceRes, movementRes, productRes, locationRes] = await Promise.all([
      supabase
        .from("inventory_balances")
        .select("product_id, location_id, quantity")
        .eq("business_id", business.id),
      supabase
        .from("inventory_movements")
        .select("id, product_id, location_id, quantity, reason, reference, created_at")
        .eq("business_id", business.id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.from("products").select("id, sku, name, cost").eq("business_id", business.id),
      supabase.from("locations").select("id, name").eq("business_id", business.id),
    ])
    const error = balanceRes.error || movementRes.error || productRes.error || locationRes.error
    if (error) setMessage(error.message)
    setBalances(balanceRes.data ?? [])
    setMovements(movementRes.data ?? [])
    setNames(
      Object.fromEntries(
        (productRes.data ?? []).map((product) => [
          product.id,
          { sku: product.sku, name: product.name, cost: Number(product.cost) },
        ]),
      ),
    )
    setLocations(Object.fromEntries((locationRes.data ?? []).map((location) => [location.id, location.name])))
  }, [business.id, supabase])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="flex flex-col gap-4">
      {message ? <p className="text-sm text-destructive">{message}</p> : null}
      <Card>
        <CardHeader>
          <CardTitle>On hand</CardTitle>
          <CardDescription>Active stock by location. POS uses the selling location’s balance.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>On hand</TableHead>
                <TableHead>Cost price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {balances.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-16 text-center text-muted-foreground">
                    Deliver a shipment to post stock.
                  </TableCell>
                </TableRow>
              ) : (
                balances.map((row) => (
                  <TableRow key={`${row.product_id}-${row.location_id}`}>
                    <TableCell>
                      {names[row.product_id]?.name ?? "Product"}
                      <div className="text-muted-foreground">{names[row.product_id]?.sku}</div>
                    </TableCell>
                    <TableCell>{locations[row.location_id] ?? "Location"}</TableCell>
                    <TableCell>{quantity(Number(row.quantity))}</TableCell>
                    <TableCell>{money(names[row.product_id]?.cost ?? 0, business.currency)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Movements</CardTitle>
          <CardDescription>Receipts increase stock. POS sales decrease it.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Quantity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-16 text-center text-muted-foreground">
                    No movements yet.
                  </TableCell>
                </TableRow>
              ) : (
                movements.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{new Date(row.created_at).toLocaleString()}</TableCell>
                    <TableCell>{names[row.product_id]?.name ?? "Product"}</TableCell>
                    <TableCell>
                      {row.reason}
                      {row.reference ? ` · ${row.reference}` : ""}
                    </TableCell>
                    <TableCell>{quantity(Number(row.quantity))}</TableCell>
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
