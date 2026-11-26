export type DatedAmount = {
  day: string
  amount: number
}

function shiftDay(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

export function dayKey(value: string | Date | null | undefined) {
  if (!value) return ""
  if (typeof value === "string") return value.slice(0, 10)
  return value.toISOString().slice(0, 10)
}

export function todayKey(timeZone = "UTC") {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

export function percentChange(current: number, prior: number) {
  if (!Number.isFinite(current) || !Number.isFinite(prior) || prior === 0) return null
  return Math.round(((current - prior) / Math.abs(prior)) * 1000) / 10
}

export function dayWindow(endDay: string, length: number) {
  return Array.from({ length }, (_, index) => shiftDay(endDay, index - (length - 1)))
}

export function bucketByDay(
  rows: { day: string; amount: number }[],
  days: string[],
): number[] {
  const totals = new Map(days.map((day) => [day, 0]))
  for (const row of rows) {
    if (!totals.has(row.day)) continue
    totals.set(row.day, (totals.get(row.day) ?? 0) + row.amount)
  }
  return days.map((day) => totals.get(day) ?? 0)
}

export function seriesWithDelta(
  rows: DatedAmount[],
  options?: { endDay?: string; length?: number; timeZone?: string },
) {
  const length = options?.length ?? 14
  const end = options?.endDay ?? todayKey(options?.timeZone)
  const currentDays = dayWindow(end, length)
  const priorEnd = shiftDay(currentDays[0], -1)
  const priorDays = dayWindow(priorEnd, length)
  const values = bucketByDay(rows, currentDays)
  const priorValues = bucketByDay(rows, priorDays)
  const currentTotal = values.reduce((sum, value) => sum + value, 0)
  const priorTotal = priorValues.reduce((sum, value) => sum + value, 0)
  return {
    values,
    points: currentDays.map((day, index) => ({
      label: new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value: values[index] ?? 0,
    })),
    currentTotal,
    priorTotal,
    delta: percentChange(currentTotal, priorTotal),
  }
}

export function runningBalance(values: number[], start = 0) {
  let balance = start
  return values.map((value) => {
    balance += value
    return balance
  })
}
