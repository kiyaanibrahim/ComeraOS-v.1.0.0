"use client"

import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

export type CustomerDraft = {
  id?: string
  name: string
  customer_type: "individual" | "business"
  phone: string
  email: string
  address: string
  notes: string
  status: "active" | "inactive"
}

export function emptyCustomer(): CustomerDraft {
  return {
    name: "",
    customer_type: "individual",
    phone: "",
    email: "",
    address: "",
    notes: "",
    status: "active",
  }
}

const typeItems = {
  individual: "Individual customer",
  business: "Business",
}

const statusItems = {
  active: "Active",
  inactive: "Inactive",
}

export function CustomerFormDialog({
  open,
  draft,
  pending,
  error,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  draft: CustomerDraft
  pending: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onSubmit: (draft: CustomerDraft) => void
}) {
  const [form, setForm] = useState(draft)

  useEffect(() => {
    if (open) setForm(draft)
  }, [open, draft])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{draft.id ? "Edit customer" : "New customer"}</DialogTitle>
          <DialogDescription>
            Name, contact, and address used on the directory and the profile.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit(form)
          }}
        >
          <Field id="customer-name" label="Name" className="sm:col-span-2">
            <Input
              id="customer-name"
              required
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Field>
          <Field id="customer-type" label="Type">
            <Select
              value={form.customer_type}
              items={typeItems}
              onValueChange={(value) =>
                setForm({ ...form, customer_type: value === "business" ? "business" : "individual" })
              }
            >
              <SelectTrigger id="customer-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="individual">Individual customer</SelectItem>
                <SelectItem value="business">Business</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field id="customer-status" label="Status">
            <Select
              value={form.status}
              items={statusItems}
              onValueChange={(value) =>
                setForm({ ...form, status: value === "inactive" ? "inactive" : "active" })
              }
            >
              <SelectTrigger id="customer-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field id="customer-phone" label="Phone">
            <Input
              id="customer-phone"
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
            />
          </Field>
          <Field id="customer-email" label="Email">
            <Input
              id="customer-email"
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </Field>
          <Field id="customer-address" label="Address" className="sm:col-span-2">
            <Input
              id="customer-address"
              value={form.address}
              onChange={(event) => setForm({ ...form, address: event.target.value })}
            />
          </Field>
          <Field id="customer-notes" label="Notes" className="sm:col-span-2">
            <Textarea
              id="customer-notes"
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
          </Field>
          {error ? <p className="text-sm text-destructive sm:col-span-2">{error}</p> : null}
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || form.name.trim().length === 0}>
              {pending ? "Saving…" : "Save customer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  id,
  label,
  className,
  children,
}: {
  id: string
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className ? `flex flex-col gap-1.5 ${className}` : "flex flex-col gap-1.5"}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}
