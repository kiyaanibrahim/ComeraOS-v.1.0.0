"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"

import { ConfirmDialog } from "@/components/data-table/confirm-dialog"
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
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { toast } from "@/components/ui/sonner"
import { callRpc } from "@/lib/flow/rpc"
import type { BusinessRecord, FlowClient } from "@/lib/flow/use-business"

type Row = {
  id: string
  reference: string | null
  name: string | null
  location_id: string | null
  updated_at: string
  label: string
  destination: string
  updated: string
}

export function ShipmentDrafts({ businessKey }: { businessKey: string }) {
  return (
    <FlowFrame
      businessKey={businessKey}
      title="Draft Orders"
      description="Draft orders that have not been converted into a shipment."
    >
      {({ business, supabase }) => <DraftList business={business} businessKey={businessKey} supabase={supabase} />}
    </FlowFrame>
  )
}

function DraftList({
  business,
  businessKey,
  supabase,
}: {
  business: BusinessRecord
  businessKey: string
  supabase: FlowClient
}) {
  const [rows, setRows] = useState<Row[]>([])
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    const [shipmentRes, locationRes] = await Promise.all([
      supabase
        .from("shipments")
        .select("id, reference, name, location_id, updated_at")
        .eq("business_id", business.id)
        .eq("direction", "inbound")
        .eq("stage", "draft_order")
        .order("updated_at", { ascending: false }),
      supabase.from("locations").select("id, name").eq("business_id", business.id),
    ])
    if (shipmentRes.error || locationRes.error) {
      toast.error(shipmentRes.error?.message || locationRes.error?.message || "Could not load drafts")
    }
    const locations = Object.fromEntries((locationRes.data ?? []).map((location) => [location.id, location.name]))
    setRows(
      (shipmentRes.data ?? []).map((row) => ({
        ...row,
        label: row.name || row.reference || "Draft",
        destination: row.location_id ? locations[row.location_id] : "—",
        updated: new Date(row.updated_at).toLocaleString(),
      })),
    )
  }, [business.id, supabase])

  useEffect(() => {
    void load()
  }, [load])

  async function remove() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await callRpc(supabase, "delete_shipment_draft", { p_shipment_id: pendingDelete.id })
      toast.success("Draft deleted.")
      setPendingDelete(null)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the draft")
    } finally {
      setDeleting(false)
    }
  }

  const columns = useMemo<ColumnDef<DataTableFeatures, Row>[]>(
    () => [
      {
        accessorKey: "label",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Shipment" />,
        filterFn: "includesString",
        cell: ({ row }) => (
          <div>
            <Link className="underline-offset-4 hover:underline" href={`/app/${businessKey}/procurement/${row.original.id}/edit`}>
              {row.original.label}
            </Link>
            <div className="text-muted-foreground">{row.original.reference}</div>
          </div>
        ),
      },
      {
        accessorKey: "destination",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Destination" />,
      },
      {
        accessorKey: "updated",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Updated" />,
      },
      {
        id: "actions",
        enableHiding: false,
        enableSorting: false,
        cell: ({ row }) => (
          <DataTableRowActions
            extra={
              <DropdownMenuItem render={<Link href={`/app/${businessKey}/procurement/${row.original.id}/edit`} />}>
                Edit
              </DropdownMenuItem>
            }
            onDelete={() => setPendingDelete(row.original)}
          />
        ),
      },
    ],
    [businessKey],
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Draft Orders</CardTitle>
        <CardDescription>Open a draft order to change quantities or convert it into a shipment.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Button nativeButton={false} render={<Link href={`/app/${businessKey}/procurement/new`} />}>
          New draft order
        </Button>
        <DataTable columns={columns} data={rows} filterColumn="label" filterPlaceholder="Search drafts…" empty="No drafts yet." getRowId={(row) => row.id} />
      </CardContent>
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete draft order"
        description={pendingDelete ? `Delete ${pendingDelete.label}?` : ""}
        pending={deleting}
        onOpenChange={(next) => {
          if (!next) setPendingDelete(null)
        }}
        onConfirm={() => void remove()}
      />
    </Card>
  )
}
