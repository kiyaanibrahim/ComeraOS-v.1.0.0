import type { FlowItem, SetupAction, SetupData } from "@/components/setup/model"
import { channelLabel, sells } from "@/components/setup/model"

export type Focus = {
  industryId: string | null
  businessId: string | null
  placeId: string | null
  storeId: string | null
  reportsToId: string | null
}

const emptyFocus: Focus = {
  industryId: null,
  businessId: null,
  placeId: null,
  storeId: null,
  reportsToId: null,
}

export function focusOf(data: SetupData, action: SetupAction | null): Focus {
  if (!action) return emptyFocus
  const businessOf = (id: string | null) => data.businesses.find((business) => business.id === id) ?? null
  const placeOf = (id: string | null) => data.places.find((place) => place.id === id) ?? null
  const locationOf = (id: string | null) => data.locations.find((location) => location.id === id) ?? null

  switch (action.type) {
    case "industry":
      return { ...emptyFocus, industryId: action.id }
    case "add-business":
      return { ...emptyFocus, industryId: action.industryId }
    case "business": {
      const business = businessOf(action.id)
      return { ...emptyFocus, industryId: business?.industryId ?? null, businessId: action.id }
    }
    case "add-place":
      return { ...emptyFocus, businessId: action.businessId, industryId: businessOf(action.businessId)?.industryId ?? null }
    case "place": {
      const place = placeOf(action.id)
      const business = businessOf(place?.businessId ?? null)
      return { ...emptyFocus, placeId: action.id, businessId: place?.businessId ?? null, industryId: business?.industryId ?? null }
    }
    case "add-store":
    case "add-warehouse": {
      const business = businessOf(action.businessId)
      return {
        ...emptyFocus,
        businessId: action.businessId,
        placeId: action.placeId,
        industryId: business?.industryId ?? null,
        storeId: action.type === "add-warehouse" ? action.storeId : null,
      }
    }
    case "location": {
      const location = locationOf(action.id)
      const business = businessOf(location?.businessId ?? null)
      const storeId = location && sells(location.kind) ? location.id : null
      return {
        ...emptyFocus,
        businessId: location?.businessId ?? null,
        placeId: location?.placeId ?? null,
        industryId: business?.industryId ?? null,
        storeId,
      }
    }
    case "register": {
      const register = data.registers.find((row) => row.id === action.id)
      const location = locationOf(register?.locationId ?? null)
      const business = businessOf(location?.businessId ?? null)
      return {
        ...emptyFocus,
        storeId: location?.id ?? null,
        placeId: location?.placeId ?? null,
        businessId: location?.businessId ?? null,
        industryId: business?.industryId ?? null,
      }
    }
    case "add-register":
    case "assign-staff": {
      const location = locationOf(action.storeId)
      const business = businessOf(location?.businessId ?? null)
      return {
        ...emptyFocus,
        storeId: action.storeId,
        placeId: location?.placeId ?? null,
        businessId: location?.businessId ?? null,
        industryId: business?.industryId ?? null,
      }
    }
    case "employee":
      return { ...emptyFocus, reportsToId: action.id }
    case "add-employee":
      return { ...emptyFocus, reportsToId: action.reportsToId }
    default:
      return emptyFocus
  }
}

function item(partial: Omit<FlowItem, "children"> & { children?: FlowItem[] }): FlowItem {
  return { children: [], ...partial }
}

function locationNodes(data: SetupData, locations: SetupData["locations"]): FlowItem[] {
  return locations.map((location) => {
    const warehouse = data.locations.find((row) => row.id === location.warehouseId)
    const assigned = data.assignments.filter((row) => row.locationId === location.id)
    const children: FlowItem[] = []
    if (sells(location.kind)) {
      if (!location.warehouseId) {
        children.push(
          item({
            id: `link-warehouse-${location.id}`,
            title: "Add warehouse",
            subtitle: "An active store needs one",
            tone: "action",
            action: {
              type: "add-warehouse",
              businessId: location.businessId,
              placeId: location.placeId,
              storeId: location.id,
            },
          }),
        )
      }
      children.push(
        item({
          id: `add-register-${location.id}`,
          title: "Add register",
          tone: "action",
          disabled: !location.warehouseId,
          reason: location.warehouseId ? undefined : "A register needs the store’s warehouse.",
          action: { type: "add-register", storeId: location.id },
        }),
      )
      for (const register of data.registers.filter((row) => row.locationId === location.id)) {
        children.push(
          item({
            id: `register-${register.id}`,
            title: register.name,
            subtitle: "Register",
            tone: "flow",
            action: { type: "register", id: register.id },
          }),
        )
      }
      children.push(
        item({
          id: `assign-${location.id}`,
          title: "Add staff",
          tone: "action",
          disabled: !data.isOwner || data.employees.length === 0,
          reason: !data.isOwner
            ? "Only the organization owner can assign staff."
            : data.employees.length === 0
              ? "Add people in the Staff view first."
              : undefined,
          action: { type: "assign-staff", storeId: location.id },
        }),
      )
      for (const assignment of assigned) {
        const employee = data.employees.find((row) => row.id === assignment.employeeId)
        if (!employee) continue
        children.push(
          item({
            id: `assigned-${location.id}-${employee.id}`,
            title: employee.name,
            subtitle: "Assigned",
            tone: "staff",
            action: { type: "employee", id: employee.id },
          }),
        )
      }
    }
    const kindLabel = location.kind === "warehouse" ? "Warehouse" : location.kind === "site" ? "Site" : "Store"
    const detail = sells(location.kind)
      ? `${channelLabel(location.channel)}${warehouse ? ` · ${warehouse.name}` : ""}`
      : "Can stand alone"
    return item({
      id: `location-${location.id}`,
      title: location.name,
      subtitle: location.isActive ? detail : `${kindLabel} · Inactive`,
      tone: location.isActive ? "flow" : "muted",
      action: { type: "location", id: location.id },
      children,
    })
  })
}

function placeBranch(data: SetupData, businessId: string, placeId: string | null, title: string, subtitle: string, id: string): FlowItem {
  const locations = data.locations.filter((location) => location.businessId === businessId && location.placeId === placeId)
  return item({
    id,
    title,
    subtitle,
    tone: placeId ? "flow" : "muted",
    action: placeId ? { type: "place", id: placeId } : { type: "business", id: businessId },
    children: [
      ...locationNodes(data, locations),
      item({
        id: `add-store-${id}`,
        title: "Add store",
        tone: "action",
        action: { type: "add-store", businessId, placeId },
      }),
      item({
        id: `add-warehouse-${id}`,
        title: "Add warehouse",
        subtitle: "A warehouse can stand alone",
        tone: "action",
        action: { type: "add-warehouse", businessId, placeId, storeId: null },
      }),
    ],
  })
}

function businessNode(data: SetupData, business: SetupData["businesses"][number]): FlowItem {
  const places = data.places.filter((place) => place.businessId === business.id)
  const ungrouped = data.locations.some((location) => location.businessId === business.id && !location.placeId)
  return item({
    id: `business-${business.id}`,
    title: business.name,
    subtitle: "Business",
    tone: "flow",
    action: { type: "business", id: business.id },
    children: [
      ...places.map((place) => placeBranch(data, business.id, place.id, place.name, place.line || "Location", `place-${place.id}`)),
      ...(ungrouped ? [placeBranch(data, business.id, null, "Ungrouped", "No place yet", `ungrouped-${business.id}`)] : []),
      item({
        id: `add-place-${business.id}`,
        title: "Add location",
        tone: "action",
        action: { type: "add-place", businessId: business.id },
      }),
    ],
  })
}

export function organizationTree(data: SetupData): FlowItem {
  const unassigned = data.businesses.filter((business) => !business.industryId)
  const industries = data.industries.map((industry) =>
    item({
      id: `industry-${industry.id}`,
      title: industry.name,
      subtitle: "Industry",
      tone: "industry",
      action: { type: "industry", id: industry.id },
      children: [
        ...data.businesses.filter((business) => business.industryId === industry.id).map((business) => businessNode(data, business)),
        item({
          id: `add-business-${industry.id}`,
          title: "Add business",
          tone: "action",
          disabled: !data.isOwner,
          reason: data.isOwner ? undefined : "Only the organization owner can add a business.",
          action: { type: "add-business", industryId: industry.id },
        }),
      ],
    }),
  )
  const children = [...industries]
  if (unassigned.length > 0) {
    children.push(
      item({
        id: "unassigned",
        title: "Unassigned",
        subtitle: "Choose an industry on the business",
        tone: "muted",
        action: { type: "organization" },
        children: unassigned.map((business) => businessNode(data, business)),
      }),
    )
  }
  children.push(
    item({
      id: "add-industry",
      title: "Add industry",
      tone: "action",
      disabled: !data.isOwner,
      reason: data.isOwner ? undefined : "Only the organization owner can add an industry.",
      action: { type: "add-industry" },
    }),
  )
  return item({
    id: "organization",
    title: data.organization.name,
    subtitle: "Organization",
    tone: "neutral",
    action: { type: "organization" },
    children,
  })
}

function staffGroup(data: SetupData, reportsToId: string | null, label: string): FlowItem[] {
  const people = data.employees.filter((employee) => employee.reportsToId === reportsToId)
  const nodes = people.map((employee) =>
    item({
      id: `employee-${employee.id}`,
      title: employee.name,
      subtitle: employee.title || "Staff",
      tone: reportsToId ? "subordinate" : "staff",
      action: { type: "employee", id: employee.id },
      children: staffGroup(data, employee.id, "Add subordinate"),
    }),
  )
  nodes.push(
    item({
      id: `add-employee-${reportsToId ?? "owner"}`,
      title: label,
      tone: "action",
      disabled: !data.isOwner,
      reason: data.isOwner ? undefined : "Only the organization owner can add staff.",
      action: { type: "add-employee", reportsToId },
    }),
  )
  return nodes
}

export function staffTree(data: SetupData): FlowItem {
  const hasRoots = data.employees.some((employee) => !employee.reportsToId)
  return item({
    id: "owner",
    title: data.ownerName || "Owner",
    subtitle: "Owner",
    tone: "owner",
    action: { type: "owner" },
    children: staffGroup(data, null, hasRoots ? "+ same level" : "Add staff"),
  })
}

export type LaidOut = {
  id: string
  title: string
  subtitle?: string
  tone: FlowItem["tone"]
  disabled?: boolean
  reason?: string
  action: SetupAction
  position: { x: number; y: number }
  parentId: string | null
}

export function layoutTree(root: FlowItem) {
  const nodes: LaidOut[] = []
  const edges: { id: string; source: string; target: string; sourceHandle: string; targetHandle: string }[] = []
  let row = 0

  function place(node: FlowItem, depth: number, at: number, parentId: string | null) {
    nodes.push({
      id: node.id,
      title: node.title,
      subtitle: node.subtitle,
      tone: node.tone,
      disabled: node.disabled,
      reason: node.reason,
      action: node.action,
      position: { x: at * 220, y: depth * 136 },
      parentId,
    })
    if (parentId) {
      edges.push({
        id: `${parentId}-${node.id}`,
        source: parentId,
        target: node.id,
        sourceHandle: "out",
        targetHandle: "in",
      })
    }
  }

  function walk(node: FlowItem, depth: number, parentId: string | null): number {
    if (node.children.length === 0) {
      const here = row
      row += 1
      place(node, depth, here, parentId)
      return here
    }
    const rows = node.children.map((child) => walk(child, depth + 1, node.id))
    const center = (rows[0] + rows[rows.length - 1]) / 2
    place(node, depth, center, parentId)
    return center
  }

  walk(root, 0, null)
  return { nodes, edges }
}

export function fulfillmentEdges(data: SetupData) {
  return data.locations
    .filter((location) => location.warehouseId && data.locations.some((row) => row.id === location.warehouseId))
    .map((location) => ({
      id: `fulfill-${location.id}`,
      source: `location-${location.id}`,
      target: `location-${location.warehouseId}`,
      sourceHandle: "side-out",
      targetHandle: "side-in",
    }))
}
