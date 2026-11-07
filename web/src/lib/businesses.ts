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
  {
    id: "north",
    name: "Juicify Pvt Ltd",
    plan: "Beverage",
    sales: 8420,
    openOrders: 3,
    staff: 7,
    billingStatus: "Current",
  },
]

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
