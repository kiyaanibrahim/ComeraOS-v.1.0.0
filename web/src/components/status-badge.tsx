import { Badge } from "@/components/ui/badge"
import { statusLabel } from "@/lib/flow/format"
import { cn } from "@/lib/utils"

export type StatusBadgeVariant = "positive" | "secondary" | "destructive" | "outline" | "default"

const POSITIVE = new Set([
  "accepted",
  "active",
  "actual",
  "approved",
  "collected",
  "completed",
  "delivered",
  "enabled",
  "issued",
  "ok",
  "open",
  "paid",
  "posted",
  "received",
  "recognized",
  "succeeded",
  "visible",
  "won",
])

const DESTRUCTIVE = new Set([
  "cancelled",
  "canceled",
  "declined",
  "disabled",
  "discontinued",
  "failed",
  "inactive",
  "overdue",
  "rejected",
  "refunded",
  "void",
])

const SECONDARY = new Set([
  "archived",
  "closed",
  "draft",
  "expired",
  "hidden",
  "invited",
  "paused",
  "projected",
])

/** Map any domain status string to a Badge color variant. */
export function statusVariant(status: string): StatusBadgeVariant {
  const value = status.trim().toLowerCase().replaceAll(" ", "_")
  if (!value) return "outline"
  if (POSITIVE.has(value)) return "positive"
  if (DESTRUCTIVE.has(value)) return "destructive"
  if (SECONDARY.has(value)) return "secondary"
  // in_transit, pending, processing, partial, quoted, …
  return "outline"
}

type StatusBadgeProps = {
  status: string
  label?: string
  className?: string
  capitalize?: boolean
}

/** Colored status chip for tables, headers, and detail rows. */
export function StatusBadge({ status, label, className, capitalize = true }: StatusBadgeProps) {
  const text = label ?? statusLabel(status)
  return (
    <Badge
      variant={statusVariant(status)}
      className={cn(capitalize ? "capitalize" : undefined, className)}
    >
      {text}
    </Badge>
  )
}
