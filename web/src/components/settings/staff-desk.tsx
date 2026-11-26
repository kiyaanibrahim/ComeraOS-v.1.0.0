"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"

import { ConfirmDialog } from "@/components/data-table/confirm-dialog"
import { DataTable } from "@/components/data-table/data-table"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import type { DataTableFeatures } from "@/components/data-table/data-table-features"
import { DataTableRowActions } from "@/components/data-table/data-table-row-actions"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "@/components/ui/sonner"
import { useBusiness } from "@/lib/flow/use-business"

const roles = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  staff: "Staff",
} as const

const statuses = {
  active: "Active",
  invited: "Invited",
  disabled: "Disabled",
} as const

type RoleKey = keyof typeof roles
type Status = keyof typeof statuses

type Member = {
  id: string
  userId: string
  name: string
  email: string
  roleKey: RoleKey
  status: Status
}

function asRole(value: string): RoleKey {
  if (value === "owner" || value === "admin" || value === "manager") return value
  return "staff"
}

function asStatus(value: string): Status {
  if (value === "invited" || value === "disabled") return value
  return "active"
}

export function StaffDesk({ businessKey }: { businessKey: string }) {
  const { supabase, business, error: loadError } = useBusiness(businessKey)
  const [members, setMembers] = useState<Member[]>([])
  const [roleIds, setRoleIds] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<Member | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Member | null>(null)
  const [saving, setSaving] = useState(false)

  const reload = useCallback(async () => {
    if (!business) return
    const [memberResult, roleResult] = await Promise.all([
      supabase
        .from("business_members")
        .select("id, user_id, role_key, status")
        .eq("business_id", business.id)
        .order("created_at"),
      supabase.from("roles").select("id, key").eq("business_id", business.id),
    ])
    if (memberResult.error || roleResult.error) {
      toast.error(memberResult.error?.message ?? roleResult.error?.message ?? "Couldn't load staff.")
      return
    }
    const ids = (memberResult.data ?? []).map((row) => row.user_id)
    const profiles =
      ids.length === 0
        ? { data: [], error: null }
        : await supabase.from("profiles").select("id, display_name, email").in("id", ids)
    if (profiles.error) {
      toast.error(profiles.error.message)
      return
    }
    const people = new Map((profiles.data ?? []).map((profile) => [profile.id, profile]))
    setRoleIds(Object.fromEntries((roleResult.data ?? []).map((role) => [role.key, role.id])))
    setMembers(
      (memberResult.data ?? []).map((row) => {
        const person = people.get(row.user_id)
        return {
          id: row.id,
          userId: row.user_id,
          name: person?.display_name || person?.email || "Member",
          email: person?.email ?? "",
          roleKey: asRole(row.role_key),
          status: asStatus(row.status),
        }
      }),
    )
  }, [business, supabase])

  useEffect(() => {
    void reload()
  }, [reload])

  function guardOwner(member: Member, roleKey: RoleKey, status: Status) {
    const owners = members.filter((item) => item.roleKey === "owner" && item.status === "active")
    if (member.roleKey === "owner" && member.status === "active" && (roleKey !== "owner" || status !== "active") && owners.length < 2) {
      toast.error("Keep at least one active owner.")
      return false
    }
    return true
  }

  async function save() {
    if (!business || !editing) return
    if (!guardOwner(members.find((item) => item.id === editing.id) ?? editing, editing.roleKey, editing.status)) return
    setSaving(true)
    const { error } = await supabase
      .from("business_members")
      .update({
        role_key: editing.roleKey,
        role_id: roleIds[editing.roleKey] ?? null,
        status: editing.status,
      })
      .eq("id", editing.id)
      .eq("business_id", business.id)
    setSaving(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success("Staff updated.")
    setEditing(null)
    await reload()
  }

  async function remove() {
    if (!business || !pendingDelete) return
    if (!guardOwner(pendingDelete, pendingDelete.roleKey, "disabled")) return
    setSaving(true)
    const { error } = await supabase.from("business_members").delete().eq("id", pendingDelete.id).eq("business_id", business.id)
    setSaving(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success("Staff removed.")
    setPendingDelete(null)
    await reload()
  }

  const columns = useMemo<ColumnDef<DataTableFeatures, Member>[]>(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
        filterFn: "includesString",
      },
      {
        accessorKey: "email",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
      },
      {
        accessorKey: "roleKey",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Role" />,
        cell: ({ row }) => roles[row.original.roleKey],
      },
      {
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => (
          <StatusBadge status={row.original.status} label={statuses[row.original.status]} />
        ),
      },
      {
        id: "actions",
        enableHiding: false,
        enableSorting: false,
        cell: ({ row }) => (
          <DataTableRowActions onEdit={() => setEditing(row.original)} onDelete={() => setPendingDelete(row.original)} />
        ),
      },
    ],
    [],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-medium tracking-tight">Staff</h1>
        <p className="text-sm text-muted-foreground">Roles and access for {business?.name ?? "this business"}.</p>
      </div>
      {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
      <Card>
        <CardHeader>
          <CardTitle>People</CardTitle>
          <CardDescription>Owners and admins can change roles. Staff can view this list.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={members} filterColumn="name" filterPlaceholder="Search staff…" empty="No staff yet." getRowId={(row) => row.id} />
        </CardContent>
      </Card>
      <Dialog open={editing !== null} onOpenChange={(next) => { if (!next) setEditing(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : "Edit staff"}</DialogTitle>
          </DialogHeader>
          {editing ? (
            <FieldGroup>
              <Field>
                <FieldLabel>Role</FieldLabel>
                <Select
                  value={editing.roleKey}
                  items={roles}
                  onValueChange={(value) => setEditing({ ...editing, roleKey: asRole(value ?? editing.roleKey) })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(roles).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Status</FieldLabel>
                <Select
                  value={editing.status}
                  items={statuses}
                  onValueChange={(value) => setEditing({ ...editing, status: asStatus(value ?? editing.status) })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(statuses).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Remove staff"
        description={pendingDelete ? `Remove ${pendingDelete.name} from this business?` : ""}
        confirmLabel="Remove"
        pending={saving}
        onOpenChange={(next) => {
          if (!next) setPendingDelete(null)
        }}
        onConfirm={() => void remove()}
      />
    </div>
  )
}
