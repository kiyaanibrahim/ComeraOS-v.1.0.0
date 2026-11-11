"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { money } from "@/lib/flow/format"

export const DENOMS = [100, 50, 20, 10, 5, 1, 0.5, 0.25, 0.1, 0.05, 0.01] as const

export function emptyCount(): Record<string, number> {
  return Object.fromEntries(DENOMS.map((value) => [String(value), 0]))
}

export function countTotal(count: Record<string, number>) {
  return DENOMS.reduce((sum, value) => sum + value * (Number(count[String(value)]) || 0), 0)
}

export function countPayload(count: Record<string, number>) {
  const payload: Record<string, number> = {}
  for (const value of DENOMS) {
    const qty = Number(count[String(value)]) || 0
    if (qty > 0) payload[String(value)] = qty
  }
  return payload
}

export function CashCounter({
  title,
  description,
  currency,
  count,
  total,
  onChange,
  breakdown,
  onCancel,
  actionLabel,
  actionDisabled,
  onAction,
}: {
  title: string
  description: string
  currency: string
  count: Record<string, number>
  total: number
  onChange: (value: number, raw: string) => void
  breakdown: [string, number][] | null
  onCancel: () => void
  actionLabel: string
  actionDisabled: boolean
  onAction: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {DENOMS.map((value) => (
            <div key={value} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <div className="text-sm font-medium tabular-nums">{money(value, currency)}</div>
              <Input
                className="w-24"
                type="number"
                min="0"
                step="1"
                value={count[String(value)] || 0}
                onChange={(event) => onChange(value, event.target.value)}
              />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between rounded-lg border px-3 py-3">
          <span className="text-sm text-muted-foreground">Counted total</span>
          <span className="text-xl font-medium tabular-nums">{money(total, currency)}</span>
        </div>
        {breakdown ? (
          <div className="space-y-2 rounded-lg border p-3 text-sm">
            {breakdown.map(([label, amount]) => (
              <div key={label} className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{label}</span>
                <span className="tabular-nums">{label === "Sales" ? amount : money(amount, currency)}</span>
              </div>
            ))}
          </div>
        ) : null}
        <div className="flex gap-2">
          <Button type="button" disabled={actionDisabled} onClick={onAction}>
            {actionLabel}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
