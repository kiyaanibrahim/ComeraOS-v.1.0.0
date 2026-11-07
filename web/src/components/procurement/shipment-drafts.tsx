"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"

import { FlowFrame } from "@/components/flow/flow-frame"
import { ProcurementNav } from "@/components/procurement/procurement-nav"
import { Button } from "@/components/ui/button"
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
import type { BusinessRecord, FlowClient } from "@/lib/flow/use-business"

type Row = {
  id: string
  reference: string | null
  name: string | null
  location_id: string | null
  updated_at: string
}

export function ShipmentDrafts({ businessKey }: { businessKey: string }) {
  return (
    <FlowFrame
      businessKey={businessKey}
      title="Draft shipments"
      description="Purchase plans that have not been converted into an active shipment."
      aside={<ProcurementNav businessKey={businessKey} current="drafts" />}
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
  const [locations, setLocations] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)

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
      setMessage(shipmentRes.error?.message || locationRes.error?.message || "Could not load drafts")
    }
    setRows(shipmentRes.data ?? [])
    setLocations(Object.fromEntries((locationRes.data ?? []).map((location) => [location.id, location.name])))
  }, [business.id, supabase])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Drafts</CardTitle>
        <CardDescription>Open a draft to change quantities or convert it.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Button nativeButton={false} render={<Link href={`/app/${businessKey}/procurement/new`} />}>
          New draft
        </Button>
        {message ? <p className="text-sm text-destructive">{message}</p> : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Shipment</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="h-16 text-center text-muted-foreground">
                  No drafts yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link
                      className="underline-offset-4 hover:underline"
                      href={`/app/${businessKey}/procurement/${row.id}/edit`}
                    >
                      {row.name || row.reference || "Draft"}
                    </Link>
                    <div className="text-muted-foreground">{row.reference}</div>
                  </TableCell>
                  <TableCell>{row.location_id ? locations[row.location_id] : "—"}</TableCell>
                  <TableCell>{new Date(row.updated_at).toLocaleString()}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
