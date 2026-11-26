import { MinusIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"

export type Tone = "positive" | "negative" | "neutral"

export function trendTone(delta: number, invert = false): Tone {
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.05) return "neutral"
  const favorable = invert ? delta < 0 : delta > 0
  return favorable ? "positive" : "negative"
}

export function StatusBadge({
  tone,
  children,
}: {
  tone: Tone
  children: React.ReactNode
}) {
  return (
    <Badge
      variant={
        tone === "positive" ? "positive" : tone === "negative" ? "destructive" : "secondary"
      }
    >
      {children}
    </Badge>
  )
}

export function TrendBadge({
  delta,
  invert = false,
  versus = "Versus the prior period",
}: {
  delta: number
  invert?: boolean
  versus?: string
}) {
  const tone = trendTone(delta, invert)
  const Icon =
    Math.abs(delta) < 0.05 ? MinusIcon : delta > 0 ? TrendingUpIcon : TrendingDownIcon
  const rounded = Math.round(delta * 10) / 10
  const text = `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}%`

  return (
    <Badge
      variant={
        tone === "positive" ? "positive" : tone === "negative" ? "destructive" : "secondary"
      }
      aria-label={`${text} ${versus.toLowerCase()}`}
      title={versus}
    >
      <Icon />
      {text}
    </Badge>
  )
}
