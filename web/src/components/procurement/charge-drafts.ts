import { actualChargeLines, groupLabel } from "@/lib/flow/procurement"

export type ChargeDraft = {
  key: string
  group: string
  kind: string
  description: string
  amount: string
  recoverable: boolean
  source: string
  assumed: string
}

type SavedCharge = {
  id: string
  kind: string
  amount: number
  recoverable: boolean
  description: string | null
  cost_group: string
  source?: string
}

export function blankChargeDrafts(): ChargeDraft[] {
  return actualChargeLines.map((line) => ({
    key: `${line.group}:${line.description}`,
    group: line.group,
    kind: line.kind,
    description: line.description,
    amount: "",
    recoverable: line.recoverable,
    source: "",
    assumed: "",
  }))
}

export function chargesToDrafts(rows: SavedCharge[]): ChargeDraft[] {
  const used = new Set<string>()
  const drafts = blankChargeDrafts().map((line) => {
    const match = rows.find((row) => {
      if (used.has(row.id) || row.cost_group !== line.group) return false
      const description = (row.description || "").trim()
      if (line.group === "freight" && line.description === "Freight") {
        return description === "" || description === "Freight"
      }
      return description === line.description
    })
    if (!match) return line
    used.add(match.id)
    return {
      ...line,
      amount: String(match.amount),
      recoverable: match.recoverable,
      source: match.source ?? "",
      assumed: "",
    }
  })
  for (const row of rows) {
    if (used.has(row.id)) continue
    drafts.push({
      key: row.id,
      group: row.cost_group,
      kind: row.kind,
      description: row.description || groupLabel(row.cost_group),
      amount: String(row.amount),
      recoverable: row.recoverable,
      source: row.source ?? "",
      assumed: "",
    })
  }
  return drafts
}
