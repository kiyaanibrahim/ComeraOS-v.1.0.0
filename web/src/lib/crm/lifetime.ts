export type CustomerRecord = {
  id: string
  name: string
  email: string | null
  phone: string | null
  notes: string | null
  status: string
  address: string | null
  customer_type: string
  created_at: string
  updated_at: string
}

export type OrderRecord = {
  id: string
  customer_id: string | null
  number: string
  status: string
  source: string
  total: number
  notes: string | null
  created_at: string
}

export type OrderLineRecord = {
  id: string
  order_id: string
  description: string
  quantity: number
  line_total: number
}

export type PaymentRecord = {
  id: string
  order_id: string | null
  bill_id: string | null
  amount: number
  status: string
  method: string
  created_at: string
}

export type DealRecord = {
  id: string
  customer_id: string | null
  title: string
  stage: string
  amount: number
  created_at: string
}

export function customerTypeLabel(value: string) {
  return value === "business" ? "Business" : "Individual customer"
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
  if (parts.length === 0) return "?"
  return parts.map((part) => part.charAt(0).toUpperCase()).join("")
}

export function stamp(value: string | null) {
  if (!value) return "—"
  return new Date(value).toLocaleString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function lineSummary(lines: { quantity: number; description: string }[]) {
  if (lines.length === 0) return "—"
  return lines
    .map((line) => {
      const count = Number(line.quantity)
      const qty = Number.isInteger(count) ? String(count) : String(count)
      return `${qty}x ${line.description}`
    })
    .join(", ")
}

export function completedOrders(orders: OrderRecord[]) {
  return orders.filter((order) => order.status === "completed")
}

export function lifetimeValue(orders: OrderRecord[], payments: PaymentRecord[]) {
  const completed = new Set(completedOrders(orders).map((order) => order.id))
  const gross = orders
    .filter((order) => completed.has(order.id))
    .reduce((sum, order) => sum + Number(order.total), 0)
  const refunded = payments
    .filter((payment) => payment.status === "refunded" && payment.order_id && completed.has(payment.order_id))
    .reduce((sum, payment) => sum + Number(payment.amount), 0)
  return gross - refunded
}

export function refundedOrderIds(payments: PaymentRecord[]) {
  return new Set(
    payments
      .filter((payment) => payment.status === "refunded" && payment.order_id)
      .map((payment) => payment.order_id as string),
  )
}

export function averageCompletedOrder(orders: OrderRecord[]) {
  const completed = completedOrders(orders)
  if (completed.length === 0) return 0
  const gross = completed.reduce((sum, order) => sum + Number(order.total), 0)
  return gross / completed.length
}

export function openDealValue(deals: DealRecord[]) {
  return deals
    .filter((deal) => deal.stage !== "won" && deal.stage !== "lost")
    .reduce((sum, deal) => sum + Number(deal.amount), 0)
}

export function lastOrder(orders: OrderRecord[]) {
  return [...orders].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
}

export function paymentMethods(payments: PaymentRecord[]) {
  const labels: string[] = []
  for (const payment of payments) {
    if (payment.status === "failed") continue
    const label = payment.method.replaceAll("_", " ")
    if (!labels.includes(label)) labels.push(label)
  }
  return labels
}

export function orderStatusLabel(order: OrderRecord, payments: PaymentRecord[]) {
  if (payments.some((payment) => payment.status === "refunded")) return "refunded"
  return order.status
}

export function blankText(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}
