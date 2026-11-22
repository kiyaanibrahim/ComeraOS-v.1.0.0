"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/sonner"
import { slugFromName } from "@/lib/businesses"
import { createClient } from "@/lib/supabase/client"
import {
  type Employee,
  type SalesChannel,
  type SetupAction,
  type SetupData,
  sells,
} from "@/components/setup/model"

async function publishAddress(
  supabase: ReturnType<typeof createClient>,
  businessId: string,
  line: string,
) {
  const trimmed = line.trim()
  if (!businessId || !trimmed) return
  const current = await supabase.from("business_settings").select("address").eq("business_id", businessId).maybeSingle()
  if (current.error || !current.data) return
  const address = current.data.address
  const existing = address && typeof address === "object" && !Array.isArray(address) && typeof address.line === "string" ? address.line.trim() : ""
  if (existing) return
  await supabase.from("business_settings").update({ address: { line: trimmed } }).eq("business_id", businessId)
}

const channels = {
  physical: "Physical",
  online: "Online",
  both: "Physical / Online",
} as const

function descendants(employees: Employee[], id: string) {
  const blocked = new Set<string>([id])
  const walk = (current: string) => {
    for (const employee of employees) {
      if (employee.reportsToId === current && !blocked.has(employee.id)) {
        blocked.add(employee.id)
        walk(employee.id)
      }
    }
  }
  walk(id)
  return blocked
}

export function SetupDialog({
  action,
  data,
  onClose,
  onSaved,
}: {
  action: SetupAction
  data: SetupData
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogBody key={JSON.stringify(action)} action={action} data={data} onClose={onClose} onSaved={onSaved} />
      </DialogContent>
    </Dialog>
  )
}

function DialogBody({
  action,
  data,
  onClose,
  onSaved,
}: {
  action: SetupAction
  data: SetupData
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)

  async function finish(error: { message: string } | null, success: string) {
    setSaving(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success(success)
    await onSaved()
  }

  if (action.type === "add-industry" || action.type === "industry") {
    const current = action.type === "industry" ? data.industries.find((row) => row.id === action.id) : null
    return (
      <NameForm
        title={current ? "Industry" : "Add industry"}
        description="An organization can have more than one industry."
        label="Industry"
        initial={current?.name ?? ""}
        saving={saving}
        onClose={onClose}
        onSave={async (name) => {
          setSaving(true)
          const result = current
            ? await supabase.from("organization_industries").update({ name }).eq("id", current.id)
            : await supabase.from("organization_industries").insert({ organization_id: data.organization.id, name })
          await finish(result.error, current ? "Industry saved." : "Industry added.")
        }}
      />
    )
  }

  if (action.type === "add-business" || action.type === "business") {
    const current = action.type === "business" ? data.businesses.find((row) => row.id === action.id) : null
    const industryId = action.type === "add-business" ? action.industryId : current?.industryId ?? ""
    return (
      <BusinessForm
        data={data}
        initialName={current?.name ?? ""}
        initialIndustry={industryId ?? ""}
        lockedIndustry={action.type === "add-business"}
        saving={saving}
        onClose={onClose}
        onSave={async (name, nextIndustry) => {
          setSaving(true)
          if (!current) {
            const { data: auth } = await supabase.auth.getUser()
            const user = auth.user
            if (!user) {
              await finish({ message: "Sign in before making changes." }, "")
              return
            }
            let error: { message: string } | null = { message: "That name is already in use." }
            const base = slugFromName(name)
            for (let attempt = 0; attempt < 6; attempt += 1) {
              const slug = attempt === 0 ? base : `${base}-${attempt + 1}`
              const result = await supabase.from("businesses").insert({
                name,
                slug,
                owner_id: user.id,
                organization_id: data.organization.id,
                industry_id: nextIndustry,
              })
              if (!result.error) {
                error = null
                break
              }
              error = result.error
              if (result.error.code !== "23505") break
            }
            await finish(error, "Business added.")
            return
          }
          const result = await supabase
            .from("businesses")
            .update({ name, industry_id: nextIndustry || null })
            .eq("id", current.id)
          await finish(result.error, "Business saved.")
        }}
      />
    )
  }

  if (action.type === "add-place" || action.type === "place") {
    const current = action.type === "place" ? data.places.find((row) => row.id === action.id) : null
    const businessId = action.type === "add-place" ? action.businessId : current?.businessId ?? ""
    return (
      <PlaceForm
        initialName={current?.name ?? ""}
        initialLine={current?.line ?? ""}
        saving={saving}
        onClose={onClose}
        onSave={async (name, line) => {
          setSaving(true)
          const address = { line }
          const result = current
            ? await supabase.from("places").update({ name, address }).eq("id", current.id)
            : await supabase.from("places").insert({ business_id: businessId, name, address })
          if (!result.error) await publishAddress(supabase, businessId, line)
          await finish(result.error, current ? "Location saved." : "Location added.")
        }}
      />
    )
  }

  if (action.type === "add-store" || (action.type === "location" && sells(data.locations.find((row) => row.id === action.id)?.kind ?? "store"))) {
    const current = action.type === "location" ? data.locations.find((row) => row.id === action.id) ?? null : null
    const businessId = action.type === "add-store" ? action.businessId : current?.businessId ?? ""
    const placeId = action.type === "add-store" ? action.placeId : current?.placeId ?? null
    return (
      <StoreForm
        data={data}
        businessId={businessId}
        initial={current}
        saving={saving}
        onClose={onClose}
        onSave={async (draft) => {
          setSaving(true)
          const placeLine = data.places.find((place) => place.id === placeId)?.line ?? ""
          const line = draft.line.trim() || placeLine.trim()
          let warehouseId = draft.warehouseId || null
          if (draft.newWarehouse) {
            const created = await supabase
              .from("locations")
              .insert({
                business_id: businessId,
                place_id: placeId,
                name: draft.newWarehouse,
                kind: "warehouse",
                address: { line },
                is_active: true,
              })
              .select("id")
              .single()
            if (created.error || !created.data) {
              await finish(created.error ?? { message: "Couldn't add the warehouse." }, "")
              return
            }
            warehouseId = created.data.id
          }
          if (draft.active && !warehouseId) {
            await finish({ message: "An active store needs a warehouse." }, "")
            return
          }
          const payload = {
            name: draft.name,
            kind: current?.kind === "site" ? "site" : "store",
            address: { line },
            is_active: draft.active,
            place_id: placeId,
            sales_channel: draft.channel,
            fulfillment_warehouse_id: warehouseId,
          }
          const result = current
            ? await supabase.from("locations").update(payload).eq("id", current.id)
            : await supabase.from("locations").insert({ ...payload, business_id: businessId })
          if (!result.error) await publishAddress(supabase, businessId, line)
          await finish(result.error, current ? "Store saved." : "Store added.")
        }}
      />
    )
  }

  if (action.type === "add-warehouse" || action.type === "location") {
    const current = action.type === "location" ? data.locations.find((row) => row.id === action.id) ?? null : null
    const businessId = action.type === "add-warehouse" ? action.businessId : current?.businessId ?? ""
    const placeId = action.type === "add-warehouse" ? action.placeId : current?.placeId ?? null
    const storeId = action.type === "add-warehouse" ? action.storeId : null
    return (
      <WarehouseForm
        initialName={current?.name ?? ""}
        initialLine={current?.line ?? ""}
        initialActive={current?.isActive ?? true}
        linked={Boolean(storeId)}
        saving={saving}
        onClose={onClose}
        onSave={async (name, line, active) => {
          setSaving(true)
          const placeLine = data.places.find((place) => place.id === placeId)?.line ?? ""
          const savedLine = line.trim() || placeLine.trim()
          if (current) {
            const result = await supabase
              .from("locations")
              .update({ name, address: { line: savedLine }, is_active: active, place_id: placeId })
              .eq("id", current.id)
            if (!result.error) await publishAddress(supabase, businessId, savedLine)
            await finish(result.error, "Warehouse saved.")
            return
          }
          const created = await supabase
            .from("locations")
            .insert({
              business_id: businessId,
              place_id: placeId,
              name,
              kind: "warehouse",
              address: { line: savedLine },
              is_active: active,
            })
            .select("id")
            .single()
          if (created.error || !created.data) {
            await finish(created.error ?? { message: "Couldn't add the warehouse." }, "")
            return
          }
          await publishAddress(supabase, businessId, savedLine)
          if (storeId) {
            const linked = await supabase
              .from("locations")
              .update({ fulfillment_warehouse_id: created.data.id })
              .eq("id", storeId)
            await finish(linked.error, "Warehouse linked to the store.")
            return
          }
          await finish(null, "Warehouse added.")
        }}
      />
    )
  }

  if (action.type === "add-register" || action.type === "register") {
    const current = action.type === "register" ? data.registers.find((row) => row.id === action.id) : null
    const store = data.locations.find((row) => row.id === (action.type === "add-register" ? action.storeId : current?.locationId))
    return (
      <NameForm
        title={current ? "Register" : "Add register"}
        description={store?.warehouseId ? "The till sells stock from this store’s warehouse." : "This store needs a warehouse before it can have a register."}
        label="Register name"
        initial={current?.name ?? ""}
        saving={saving}
        onClose={onClose}
        onSave={async (name) => {
          if (!store?.warehouseId) {
            toast.error("A register needs the store’s warehouse.")
            return
          }
          setSaving(true)
          const result = current
            ? await supabase.from("registers").update({ name }).eq("id", current.id)
            : await supabase.from("registers").insert({
                business_id: store.businessId,
                location_id: store.id,
                warehouse_id: store.warehouseId,
                name,
              })
          await finish(result.error, current ? "Register saved." : "Register added.")
        }}
      />
    )
  }

  if (action.type === "assign-staff") {
    const store = data.locations.find((row) => row.id === action.storeId)
    const assigned = data.assignments.filter((row) => row.locationId === action.storeId)
    return (
      <AssignForm
        data={data}
        assigned={assigned.map((row) => row.employeeId)}
        storeName={store?.name ?? "this store"}
        saving={saving}
        onClose={onClose}
        onAssign={async (employeeId) => {
          setSaving(true)
          const result = await supabase
            .from("employee_store_assignments")
            .insert({ employee_id: employeeId, location_id: action.storeId })
          await finish(result.error, "Staff assigned.")
        }}
        onRemove={async (employeeId) => {
          setSaving(true)
          const result = await supabase
            .from("employee_store_assignments")
            .delete()
            .eq("employee_id", employeeId)
            .eq("location_id", action.storeId)
          await finish(result.error, "Staff removed from the store.")
        }}
      />
    )
  }

  if (action.type === "add-employee" || action.type === "employee") {
    const current = action.type === "employee" ? data.employees.find((row) => row.id === action.id) ?? null : null
    const reportsToId = action.type === "add-employee" ? action.reportsToId : current?.reportsToId ?? null
    return (
      <EmployeeForm
        data={data}
        current={current}
        initialManager={reportsToId}
        saving={saving}
        onClose={onClose}
        onSave={async (draft) => {
          setSaving(true)
          const payload = {
            display_name: draft.name,
            email: draft.email || null,
            phone: draft.phone || null,
            job_title: draft.title || null,
            reports_to_id: draft.reportsToId,
          }
          const result = current
            ? await supabase.from("organization_employees").update(payload).eq("id", current.id)
            : await supabase.from("organization_employees").insert({ ...payload, organization_id: data.organization.id })
          await finish(result.error, current ? "Staff saved." : "Staff added.")
        }}
      />
    )
  }

  return null
}

function NameForm({
  title,
  description,
  label,
  initial,
  saving,
  onClose,
  onSave,
}: {
  title: string
  description: string
  label: string
  initial: string
  saving: boolean
  onClose: () => void
  onSave: (name: string) => Promise<void>
}) {
  const [name, setName] = useState(initial)
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor="setup-name">{label}</FieldLabel>
        <Input id="setup-name" value={name} autoFocus onValueChange={setName} />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="button" disabled={saving || name.trim() === ""} onClick={() => void onSave(name.trim())}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </>
  )
}

function BusinessForm({
  data,
  initialName,
  initialIndustry,
  lockedIndustry,
  saving,
  onClose,
  onSave,
}: {
  data: SetupData
  initialName: string
  initialIndustry: string
  lockedIndustry: boolean
  saving: boolean
  onClose: () => void
  onSave: (name: string, industryId: string) => Promise<void>
}) {
  const [name, setName] = useState(initialName)
  const [industryId, setIndustryId] = useState(initialIndustry)
  const items = Object.fromEntries(data.industries.map((industry) => [industry.id, industry.name]))
  return (
    <>
      <DialogHeader>
        <DialogTitle>{initialName ? "Business" : "Add business"}</DialogTitle>
        <DialogDescription>This business operates under the organization. Locations and registers use Business settings.</DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="setup-business">Business name</FieldLabel>
          <Input id="setup-business" value={name} autoFocus onValueChange={setName} />
        </Field>
        {lockedIndustry ? null : (
          <Field>
            <FieldLabel htmlFor="setup-business-industry">Industry</FieldLabel>
            {data.industries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add an industry before assigning this business.</p>
            ) : (
              <Select value={industryId} items={items} onValueChange={(value) => setIndustryId(value ?? "")}>
                <SelectTrigger id="setup-business-industry" className="w-full">
                  <SelectValue placeholder="Industry" />
                </SelectTrigger>
                <SelectContent>
                  {data.industries.map((industry) => (
                    <SelectItem key={industry.id} value={industry.id}>{industry.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
        )}
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          type="button"
          disabled={saving || name.trim() === "" || (lockedIndustry && !initialIndustry)}
          onClick={() => void onSave(name.trim(), lockedIndustry ? initialIndustry : industryId)}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </>
  )
}

function PlaceForm({
  initialName,
  initialLine,
  saving,
  onClose,
  onSave,
}: {
  initialName: string
  initialLine: string
  saving: boolean
  onClose: () => void
  onSave: (name: string, line: string) => Promise<void>
}) {
  const [name, setName] = useState(initialName)
  const [line, setLine] = useState(initialLine)
  return (
    <>
      <DialogHeader>
        <DialogTitle>{initialName ? "Location" : "Add location"}</DialogTitle>
        <DialogDescription>A location groups the stores and warehouses at one place.</DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="setup-place">Location name</FieldLabel>
          <Input id="setup-place" value={name} autoFocus onValueChange={setName} />
        </Field>
        <Field>
          <FieldLabel htmlFor="setup-place-line">Address</FieldLabel>
          <Input id="setup-place-line" value={line} onValueChange={setLine} />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="button" disabled={saving || name.trim() === ""} onClick={() => void onSave(name.trim(), line.trim())}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </>
  )
}

function StoreForm({
  data,
  businessId,
  initial,
  saving,
  onClose,
  onSave,
}: {
  data: SetupData
  businessId: string
  initial: SetupData["locations"][number] | null
  saving: boolean
  onClose: () => void
  onSave: (draft: { name: string; line: string; channel: SalesChannel; active: boolean; warehouseId: string; newWarehouse: string }) => Promise<void>
}) {
  const warehouses = data.locations.filter((row) => row.businessId === businessId && row.kind === "warehouse")
  const [name, setName] = useState(initial?.name ?? "")
  const [line, setLine] = useState(initial?.line ?? "")
  const [channel, setChannel] = useState<SalesChannel>(initial?.channel ?? "physical")
  const [active, setActive] = useState(initial?.isActive ?? true)
  const [warehouseId, setWarehouseId] = useState(initial?.warehouseId ?? "")
  const [newWarehouse, setNewWarehouse] = useState("")
  const items = Object.fromEntries(warehouses.map((row) => [row.id, row.name]))
  return (
    <>
      <DialogHeader>
        <DialogTitle>{initial ? "Store" : "Add store"}</DialogTitle>
        <DialogDescription>An active store sells from one warehouse. The warehouse can also stand alone.</DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="setup-store">Store name</FieldLabel>
          <Input id="setup-store" value={name} autoFocus onValueChange={setName} />
        </Field>
        <Field>
          <FieldLabel htmlFor="setup-store-line">Address</FieldLabel>
          <Input id="setup-store-line" value={line} onValueChange={setLine} />
        </Field>
        <Field>
          <FieldLabel htmlFor="setup-channel">Store attributes</FieldLabel>
          <Select value={channel} items={channels} onValueChange={(value) => setChannel(value === "online" || value === "both" ? value : "physical")}>
            <SelectTrigger id="setup-channel" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(channels).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="setup-store-warehouse">Warehouse</FieldLabel>
          {warehouses.length > 0 ? (
            <Select value={warehouseId} items={items} onValueChange={(value) => setWarehouseId(value ?? "")}>
              <SelectTrigger id="setup-store-warehouse" className="w-full">
                <SelectValue placeholder="Choose a warehouse" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((row) => (
                  <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-muted-foreground">No warehouse yet. Create one below.</p>
          )}
          <Input value={newWarehouse} placeholder="Or create a warehouse" onValueChange={setNewWarehouse} />
        </Field>
        <Field orientation="horizontal">
          <Switch id="setup-store-active" checked={active} onCheckedChange={setActive} />
          <FieldLabel htmlFor="setup-store-active">Active</FieldLabel>
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          type="button"
          disabled={saving || name.trim() === "" || (active && !warehouseId && newWarehouse.trim() === "")}
          onClick={() => void onSave({ name: name.trim(), line: line.trim(), channel, active, warehouseId, newWarehouse: newWarehouse.trim() })}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </>
  )
}

function WarehouseForm({
  initialName,
  initialLine,
  initialActive,
  linked,
  saving,
  onClose,
  onSave,
}: {
  initialName: string
  initialLine: string
  initialActive: boolean
  linked: boolean
  saving: boolean
  onClose: () => void
  onSave: (name: string, line: string, active: boolean) => Promise<void>
}) {
  const [name, setName] = useState(initialName)
  const [line, setLine] = useState(initialLine)
  const [active, setActive] = useState(initialActive)
  return (
    <>
      <DialogHeader>
        <DialogTitle>{initialName ? "Warehouse" : "Add warehouse"}</DialogTitle>
        <DialogDescription>
          {linked ? "This warehouse fulfills the store. A store uses one warehouse." : "A warehouse can stand alone, without a store."}
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="setup-warehouse">Warehouse name</FieldLabel>
          <Input id="setup-warehouse" value={name} autoFocus onValueChange={setName} />
        </Field>
        <Field>
          <FieldLabel htmlFor="setup-warehouse-line">Address</FieldLabel>
          <Input id="setup-warehouse-line" value={line} onValueChange={setLine} />
        </Field>
        <Field orientation="horizontal">
          <Switch id="setup-warehouse-active" checked={active} onCheckedChange={setActive} />
          <FieldLabel htmlFor="setup-warehouse-active">Active</FieldLabel>
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="button" disabled={saving || name.trim() === ""} onClick={() => void onSave(name.trim(), line.trim(), active)}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </>
  )
}

function AssignForm({
  data,
  assigned,
  storeName,
  saving,
  onClose,
  onAssign,
  onRemove,
}: {
  data: SetupData
  assigned: string[]
  storeName: string
  saving: boolean
  onClose: () => void
  onAssign: (employeeId: string) => Promise<void>
  onRemove: (employeeId: string) => Promise<void>
}) {
  const available = data.employees.filter((employee) => !assigned.includes(employee.id))
  const [employeeId, setEmployeeId] = useState(available[0]?.id ?? "")
  const items = Object.fromEntries(available.map((employee) => [employee.id, employee.name]))
  return (
    <>
      <DialogHeader>
        <DialogTitle>Store staff</DialogTitle>
        <DialogDescription>Assign people from the staff directory to {storeName}. This does not change login roles.</DialogDescription>
      </DialogHeader>
      {assigned.length > 0 ? (
        <ul className="flex flex-col gap-2 text-sm">
          {assigned.map((id) => {
            const employee = data.employees.find((row) => row.id === id)
            return (
              <li key={id} className="flex items-center justify-between gap-3">
                <span>{employee?.name ?? "Staff"}</span>
                <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => void onRemove(id)}>
                  Remove
                </Button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nobody is assigned to this store yet.</p>
      )}
      {available.length > 0 ? (
        <Field>
          <FieldLabel htmlFor="setup-assign">Directory</FieldLabel>
          <Select value={employeeId} items={items} onValueChange={(value) => setEmployeeId(value ?? "")}>
            <SelectTrigger id="setup-assign" className="w-full">
              <SelectValue placeholder="Choose a person" />
            </SelectTrigger>
            <SelectContent>
              {available.map((employee) => (
                <SelectItem key={employee.id} value={employee.id}>{employee.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : (
        <p className="text-sm text-muted-foreground">Everyone in the directory is already assigned, or the directory is empty.</p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Close</Button>
        <Button type="button" disabled={saving || employeeId === ""} onClick={() => void onAssign(employeeId)}>
          {saving ? "Saving…" : "Assign"}
        </Button>
      </DialogFooter>
    </>
  )
}

function EmployeeForm({
  data,
  current,
  initialManager,
  saving,
  onClose,
  onSave,
}: {
  data: SetupData
  current: Employee | null
  initialManager: string | null
  saving: boolean
  onClose: () => void
  onSave: (draft: { name: string; email: string; phone: string; title: string; reportsToId: string | null }) => Promise<void>
}) {
  const [name, setName] = useState(current?.name ?? "")
  const [email, setEmail] = useState(current?.email ?? "")
  const [phone, setPhone] = useState(current?.phone ?? "")
  const [title, setTitle] = useState(current?.title ?? "")
  const [manager, setManager] = useState(initialManager ?? "owner")
  const blocked = current ? descendants(data.employees, current.id) : new Set<string>()
  const managers = data.employees.filter((employee) => !blocked.has(employee.id))
  const items = { owner: data.ownerName || "Owner", ...Object.fromEntries(managers.map((employee) => [employee.id, employee.name])) }
  return (
    <>
      <DialogHeader>
        <DialogTitle>{current ? "Staff" : "Add staff"}</DialogTitle>
        <DialogDescription>Directory details and who they report to. Staff logins stay in Business settings.</DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="setup-employee">Name</FieldLabel>
          <Input id="setup-employee" value={name} autoFocus onValueChange={setName} />
        </Field>
        <Field>
          <FieldLabel htmlFor="setup-employee-title">Job title</FieldLabel>
          <Input id="setup-employee-title" value={title} onValueChange={setTitle} />
        </Field>
        <Field>
          <FieldLabel htmlFor="setup-employee-email">Email</FieldLabel>
          <Input id="setup-employee-email" value={email} onValueChange={setEmail} />
        </Field>
        <Field>
          <FieldLabel htmlFor="setup-employee-phone">Phone</FieldLabel>
          <Input id="setup-employee-phone" value={phone} onValueChange={setPhone} />
        </Field>
        <Field>
          <FieldLabel htmlFor="setup-employee-manager">Reports to</FieldLabel>
          <Select value={manager} items={items} onValueChange={(value) => setManager(value ?? "owner")}>
            <SelectTrigger id="setup-employee-manager" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="owner">{data.ownerName || "Owner"}</SelectItem>
              {managers.map((employee) => (
                <SelectItem key={employee.id} value={employee.id}>{employee.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          type="button"
          disabled={saving || name.trim() === ""}
          onClick={() => void onSave({
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim(),
            title: title.trim(),
            reportsToId: manager === "owner" ? null : manager,
          })}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </>
  )
}
