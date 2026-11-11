export type Business = {
  id: string
  name: string
  plan: string
  sales: number
  openOrders: number
  staff: number
  billingStatus: string
}

export function presentBusiness(row: { slug: string; name: string }): Business {
  return {
    id: row.slug,
    name: row.name,
    plan: "Business",
    sales: 0,
    openOrders: 0,
    staff: 1,
    billingStatus: "Current",
  }
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}
