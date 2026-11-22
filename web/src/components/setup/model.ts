import type { Json } from "@/lib/supabase/database.types"

export type SalesChannel = "physical" | "online" | "both"

export type Industry = { id: string; name: string }

export type SetupBusiness = {
  id: string
  name: string
  slug: string
  industryId: string | null
}

export type Place = {
  id: string
  businessId: string
  name: string
  line: string
}

export type SetupLocation = {
  id: string
  businessId: string
  placeId: string | null
  name: string
  kind: "store" | "warehouse" | "site"
  line: string
  isActive: boolean
  warehouseId: string | null
  channel: SalesChannel | null
}

export type SetupRegister = {
  id: string
  businessId: string
  locationId: string
  name: string
}

export type Employee = {
  id: string
  name: string
  email: string
  phone: string
  title: string
  reportsToId: string | null
}

export type Assignment = {
  employeeId: string
  locationId: string
}

export type SetupData = {
  organization: { id: string; name: string; ownerId: string }
  ownerName: string
  isOwner: boolean
  industries: Industry[]
  businesses: SetupBusiness[]
  places: Place[]
  locations: SetupLocation[]
  registers: SetupRegister[]
  employees: Employee[]
  assignments: Assignment[]
}

export type SetupAction =
  | { type: "organization" }
  | { type: "industry"; id: string }
  | { type: "add-industry" }
  | { type: "business"; id: string }
  | { type: "add-business"; industryId: string }
  | { type: "place"; id: string }
  | { type: "add-place"; businessId: string }
  | { type: "location"; id: string }
  | { type: "add-store"; businessId: string; placeId: string | null }
  | { type: "add-warehouse"; businessId: string; placeId: string | null; storeId: string | null }
  | { type: "register"; id: string }
  | { type: "add-register"; storeId: string }
  | { type: "assign-staff"; storeId: string }
  | { type: "owner" }
  | { type: "employee"; id: string }
  | { type: "add-employee"; reportsToId: string | null }

export type FlowTone = "neutral" | "industry" | "flow" | "action" | "owner" | "staff" | "subordinate" | "muted"

export type FlowItem = {
  id: string
  title: string
  subtitle?: string
  tone: FlowTone
  disabled?: boolean
  reason?: string
  action: SetupAction
  children: FlowItem[]
}

export function addressLine(address: Json): string {
  if (!address || typeof address !== "object" || Array.isArray(address)) return ""
  const line = address.line
  return typeof line === "string" ? line : ""
}

export function asKind(value: string): SetupLocation["kind"] {
  if (value === "warehouse" || value === "site") return value
  return "store"
}

export function asChannel(value: string | null): SalesChannel | null {
  if (value === "physical" || value === "online" || value === "both") return value
  return null
}

export function channelLabel(channel: SalesChannel | null) {
  if (channel === "physical") return "Physical"
  if (channel === "online") return "Online"
  if (channel === "both") return "Physical / Online"
  return "Channel not set"
}

export function sells(kind: SetupLocation["kind"]) {
  return kind === "store" || kind === "site"
}

export function actionKey(action: SetupAction) {
  return JSON.stringify(action)
}

export function opensDialog(action: SetupAction) {
  return action.type !== "organization" && action.type !== "owner"
}
