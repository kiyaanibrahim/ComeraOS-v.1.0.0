"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"

import { DataTable } from "@/components/data-table/data-table"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import type { DataTableFeatures } from "@/components/data-table/data-table-features"
import { FlowFrame } from "@/components/flow/flow-frame"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { toast } from "@/components/ui/sonner"
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
      description="Stock posted when a shipment is delivered. A store sells the in-stock products from its warehouse."
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
    if (error) toast.error(error.message)
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

  const balanceRows = useMemo(
    () =>
      balances.map((row) => ({
        id: `${row.product_id}-${row.location_id}`,
        product: names[row.product_id]?.name ?? "Product",
        sku: names[row.product_id]?.sku ?? "",
        location: locations[row.location_id] ?? "Location",
        onHand: Number(row.quantity),
        cost: names[row.product_id]?.cost ?? 0,
      })),
    [balances, locations, names],
  )
  const movementRows = useMemo(
    () =>
      movements.map((row) => ({
        ...row,
        product: names[row.product_id]?.name ?? "Product",
        detail: row.reference ? `${row.reason} · ${row.reference}` : row.reason,
        when: new Date(row.created_at).toLocaleString(),
      })),
    [movements, names],
  )
  const balanceColumns = useMemo<ColumnDef<DataTableFeatures, (typeof balanceRows)[number]>[]>(
    () => [
      {
        accessorKey: "product",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Product" />,
        filterFn: "includesString",
        cell: ({ row }) => (
          <div>
            {row.original.product}
            <div className="text-muted-foreground">{row.original.sku}</div>
          </div>
        ),
      },
      {
        accessorKey: "location",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Location" />,
      },
      {
        accessorKey: "onHand",
        header: ({ column }) => <DataTableColumnHeader column={column} title="On hand" />,
        cell: ({ row }) => quantity(row.original.onHand),
      },
      {
        accessorKey: "cost",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Cost price" />,
        cell: ({ row }) => money(row.original.cost, business.currency),
      },
    ],
    [business.currency],
  )
  const movementColumns = useMemo<ColumnDef<DataTableFeatures, (typeof movementRows)[number]>[]>(
    () => [
      {
        accessorKey: "when",
        header: ({ column }) => <DataTableColumnHeader column={column} title="When" />,
      },
      {
        accessorKey: "product",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Product" />,
        filterFn: "includesString",
      },
      {
        accessorKey: "detail",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Reason" />,
      },
      {
        accessorKey: "quantity",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Quantity" />,
        cell: ({ row }) => quantity(Number(row.original.quantity)),
      },
    ],
    [],
  )

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>On hand</CardTitle>
          <CardDescription>On-hand quantity by location. Point of Sale shows products in stock at the store’s warehouse.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={balanceColumns} data={balanceRows} filterColumn="product" filterPlaceholder="Search products…" empty="Deliver a shipment to post stock." getRowId={(row) => row.id} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Movements</CardTitle>
          <CardDescription>Receipts increase stock. POS sales decrease it.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={movementColumns} data={movementRows} filterColumn="product" filterPlaceholder="Search movements…" empty="No movements yet." getRowId={(row) => row.id} />
        </CardContent>
      </Card>
    </div>
  )
}
