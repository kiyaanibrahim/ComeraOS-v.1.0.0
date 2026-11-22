"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Background, Controls, ReactFlow, useReactFlow } from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import { focusOf, fulfillmentEdges, layoutTree, organizationTree, staffTree } from "@/components/setup/graph"
import {
  type SetupAction,
  type SetupData,
  type SetupLocation,
  addressLine,
  asChannel,
  asKind,
  opensDialog,
} from "@/components/setup/model"
import { SetupDialog } from "@/components/setup/setup-dialogs"
import { SetupClickContext, setupNodeTypes, type SetupFlowNode, type SetupNodeData } from "@/components/setup/setup-node"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createClient } from "@/lib/supabase/client"

type View = "organization" | "staff"

function FitTop({ layoutKey }: { layoutKey: string }) {
  const instance = useReactFlow()
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void Promise.resolve(instance.fitView({ padding: 0.12 })).then(() => {
        const zoom = instance.getZoom()
        const viewport = instance.getViewport()
        const placed = instance.getNodes()
        const canvas = document.querySelector(".react-flow")?.clientHeight ?? 0
        if (placed.length === 0 || canvas === 0) return
        const top = Math.min(...placed.map((node) => node.position.y * zoom + viewport.y))
        const bottom = Math.max(...placed.map((node) => (node.position.y + (node.measured?.height ?? 76)) * zoom + viewport.y))
        const spareBelow = canvas - 28 - bottom
        const wantUp = top - 28
        const shift = -Math.min(wantUp, Math.max(0, spareBelow))
        if (shift < -4) instance.setViewport({ x: viewport.x, y: viewport.y + shift, zoom })
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [instance, layoutKey])
  return null
}

export function OrganizationSetup({ organizationId }: { organizationId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [data, setData] = useState<SetupData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>("organization")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selection, setSelection] = useState<SetupAction | null>(null)
  const [dialog, setDialog] = useState<SetupAction | null>(null)

  const load = useCallback(async () => {
    const [orgResult, authResult] = await Promise.all([
      supabase.from("organizations").select("id, name, owner_id").eq("id", organizationId).maybeSingle(),
      supabase.auth.getUser(),
    ])
    if (orgResult.error || !orgResult.data) {
      setError(orgResult.error?.message ?? "This organization is not available.")
      setData(null)
      return
    }
    const organization = orgResult.data
    const userId = authResult.data.user?.id ?? ""
    const [profileResult, industryResult, businessResult, employeeResult] = await Promise.all([
      supabase.from("profiles").select("display_name").eq("id", organization.owner_id).maybeSingle(),
      supabase.from("organization_industries").select("id, name").eq("organization_id", organization.id).order("name"),
      supabase.from("businesses").select("id, name, slug, industry_id").eq("organization_id", organization.id).order("name"),
      supabase.from("organization_employees").select("id, display_name, email, phone, job_title, reports_to_id").eq("organization_id", organization.id).order("display_name"),
    ])
    const failed = profileResult.error ?? industryResult.error ?? businessResult.error ?? employeeResult.error
    if (failed) {
      setError(failed.message)
      return
    }
    const businesses = businessResult.data ?? []
    const businessIds = businesses.map((business) => business.id)
    const employees = employeeResult.data ?? []
    const employeeIds = employees.map((employee) => employee.id)
    const [placeResult, locationResult, registerResult, assignmentResult] = await Promise.all([
      businessIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : supabase.from("places").select("id, business_id, name, address").in("business_id", businessIds).order("name"),
      businessIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : supabase.from("locations").select("id, business_id, place_id, name, kind, address, is_active, fulfillment_warehouse_id, sales_channel").in("business_id", businessIds).order("name"),
      businessIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : supabase.from("registers").select("id, business_id, location_id, name").in("business_id", businessIds).order("name"),
      employeeIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : supabase.from("employee_store_assignments").select("employee_id, location_id").in("employee_id", employeeIds),
    ])
    const childError = placeResult.error ?? locationResult.error ?? registerResult.error ?? assignmentResult.error
    if (childError) {
      setError(childError.message)
      return
    }
    setError(null)
    setData({
      organization: { id: organization.id, name: organization.name, ownerId: organization.owner_id },
      ownerName: profileResult.data?.display_name || "Owner",
      isOwner: userId === organization.owner_id,
      industries: (industryResult.data ?? []).map((row) => ({ id: row.id, name: row.name })),
      businesses: businesses.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        industryId: row.industry_id,
      })),
      places: (placeResult.data ?? []).map((row) => ({
        id: row.id,
        businessId: row.business_id,
        name: row.name,
        line: addressLine(row.address),
      })),
      locations: (locationResult.data ?? []).map((row) => ({
        id: row.id,
        businessId: row.business_id,
        placeId: row.place_id,
        name: row.name,
        kind: asKind(row.kind),
        line: addressLine(row.address),
        isActive: row.is_active,
        warehouseId: row.fulfillment_warehouse_id,
        channel: asChannel(row.sales_channel),
      })),
      registers: (registerResult.data ?? []).map((row) => ({
        id: row.id,
        businessId: row.business_id,
        locationId: row.location_id,
        name: row.name,
      })),
      employees: employees.map((row) => ({
        id: row.id,
        name: row.display_name,
        email: row.email ?? "",
        phone: row.phone ?? "",
        title: row.job_title ?? "",
        reportsToId: row.reports_to_id,
      })),
      assignments: (assignmentResult.data ?? []).map((row) => ({
        employeeId: row.employee_id,
        locationId: row.location_id,
      })),
    })
  }, [organizationId, supabase])

  useEffect(() => {
    void load()
  }, [load])

  const graph = useMemo(() => {
    if (!data) return { nodes: [] as SetupFlowNode[], edges: [] }
    const tree = view === "staff" ? staffTree(data) : organizationTree(data)
    const laid = layoutTree(tree)
    const extra = view === "organization" ? fulfillmentEdges(data) : []
    const nodes: SetupFlowNode[] = laid.nodes.map((node) => ({
      id: node.id,
      type: "setup",
      position: node.position,
      data: {
        nodeId: node.id,
        title: node.title,
        subtitle: node.subtitle,
        tone: node.tone,
        disabled: node.disabled,
        reason: node.reason,
        action: node.action,
        selected: node.id === selectedId,
      },
      style: { width: 180, height: 76, background: "transparent", border: "none", padding: 0, boxShadow: "none", pointerEvents: "all" },
    }))
    const edges = [...laid.edges, ...extra].map((edge) => ({
      ...edge,
      type: "smoothstep",
      style: { stroke: "var(--muted-foreground)" },
    }))
    return { nodes, edges }
  }, [data, selectedId, view])

  function choose(node: SetupNodeData) {
    setSelectedId(node.nodeId)
    setSelection(node.action)
    if (!node.disabled && opensDialog(node.action)) setDialog(node.action)
  }

  const layoutKey = `${view}:${graph.nodes.map((node) => `${node.id}:${node.position.x}:${node.position.y}`).join("|")}`
  const focus = data ? focusOf(data, selection) : null
  const store = data?.locations.find((location) => location.id === focus?.storeId) ?? null
  const bar = barState(data, view, focus, store)

  return (
    <div className="flex h-[calc(100svh-5.5rem)] min-h-0 flex-col gap-4 overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-xl font-medium tracking-tight">
            {data?.organization.name ?? "Organization setup"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Build the business from connected steps. Staff is optional, and Business settings keeps the same records.
          </p>
        </div>
        <Button variant="outline" render={<Link href="/app" />}>Portfolio</Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Tabs value={view} onValueChange={(value) => setView(value === "staff" ? "staff" : "organization")}>
        <TabsList>
          <TabsTrigger value="organization">Organization</TabsTrigger>
          <TabsTrigger value="staff">Staff</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border bg-muted/40">
        {data ? (
          <SetupClickContext.Provider value={choose}>
            <style>{".react-flow__node, .react-flow__node * { pointer-events: all; }"}</style>
            <ReactFlow
              key={view}
              nodes={graph.nodes}
              edges={graph.edges}
              nodeTypes={setupNodeTypes}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              proOptions={{ hideAttribution: true }}
              minZoom={0.4}
              maxZoom={1.5}
            >
              <FitTop layoutKey={layoutKey} />
              <Background gap={20} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </SetupClickContext.Provider>
        ) : error ? null : (
          <div className="h-full animate-pulse bg-muted" />
        )}
      </div>
      <div className="flex flex-col items-center gap-2">
        <p className="text-center text-sm text-muted-foreground">Buttons stay off until the earlier step exists.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <BarButton label="Add business" state={bar.business} onClick={() => openBar("business")} />
          <BarButton label="Add location" state={bar.location} onClick={() => openBar("location")} />
          <BarButton label="Add register" state={bar.register} onClick={() => openBar("register")} />
          <BarButton label="Add staff" state={bar.staff} onClick={() => openBar("staff")} />
        </div>
      </div>
      {data && dialog && opensDialog(dialog) ? (
        <SetupDialog
          action={dialog}
          data={data}
          onClose={() => setDialog(null)}
          onSaved={async () => {
            setDialog(null)
            await load()
          }}
        />
      ) : null}
    </div>
  )

  function openBar(kind: "business" | "location" | "register" | "staff") {
    if (!data || !focus) return
    if (kind === "business" && focus.industryId) {
      const action: SetupAction = { type: "add-business", industryId: focus.industryId }
      setSelection(action)
      setDialog(action)
      return
    }
    if (kind === "location" && focus.businessId) {
      const action: SetupAction = { type: "add-place", businessId: focus.businessId }
      setSelection(action)
      setDialog(action)
      return
    }
    if (kind === "register" && focus.storeId) {
      const action: SetupAction = { type: "add-register", storeId: focus.storeId }
      setSelection(action)
      setDialog(action)
      return
    }
    if (kind === "staff") {
      if (view === "staff") {
        const action: SetupAction = { type: "add-employee", reportsToId: selection?.type === "employee" ? selection.id : null }
        setView("staff")
        setSelection(action)
        setDialog(action)
        return
      }
      if (focus.storeId) {
        const action: SetupAction = { type: "assign-staff", storeId: focus.storeId }
        setSelection(action)
        setDialog(action)
      }
    }
  }
}

function barState(data: SetupData | null, view: View, focus: ReturnType<typeof focusOf> | null, store: SetupLocation | null) {
  const off = (reason: string) => ({ disabled: true, reason })
  const on = { disabled: false, reason: undefined as string | undefined }
  if (!data || !focus) {
    return { business: off("Loading…"), location: off("Loading…"), register: off("Loading…"), staff: off("Loading…") }
  }
  const business = data.isOwner && focus.industryId ? on : off(data.isOwner ? "Select an industry first." : "Only the organization owner can add a business.")
  const location = focus.businessId ? on : off("Select a business first.")
  const register = focus.storeId && store?.warehouseId ? on : off(focus.storeId ? "This store needs a warehouse first." : "Select a store first.")
  const staff = view === "staff"
    ? data.isOwner ? on : off("Only the organization owner can add staff.")
    : data.isOwner && focus.storeId && data.employees.length > 0
      ? on
      : off(!data.isOwner ? "Only the organization owner can assign staff." : data.employees.length === 0 ? "Add people in the Staff view first." : "Select a store first.")
  return { business, location, register, staff }
}

function BarButton({
  label,
  state,
  onClick,
}: {
  label: string
  state: { disabled: boolean; reason?: string }
  onClick: () => void
}) {
  return (
    <Button type="button" disabled={state.disabled} title={state.reason} onClick={onClick}>
      {label}
    </Button>
  )
}
