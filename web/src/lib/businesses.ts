export type Business = {
  id: string
  name: string
  plan: string
  sales: number
  openOrders: number
  staff: number
  billingStatus: string
}

export const businesses: Business[] = [
  {
    id: "demo",
    name: "Dreams Pvt Ltd",
    plan: "Retail",
    sales: 12840,
    openOrders: 6,
    staff: 4,
    billingStatus: "Current",
  },
]

export function presentBusiness(row: { slug: string; name: string }): Business {
  const known = businesses.find((business) => business.id === row.slug)
  if (known) return { ...known, name: row.name }
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

export function getBusiness(id: string): Business {
  return (
    businesses.find((business) => business.id === id) ?? {
      id,
      name: id,
      plan: "Business",
      sales: 0,
      openOrders: 0,
      staff: 0,
      billingStatus: "Unknown",
    }
  )
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}
