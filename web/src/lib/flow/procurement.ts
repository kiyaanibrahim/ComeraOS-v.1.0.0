export const shipmentStages = [
  ["draft_order", "Draft order", "Order being prepared"],
  ["order_placed", "Supplier", "Supplier planning to dispatch"],
  ["at_forwarder", "Forwarder", "Forwarder warehouse handling"],
  ["handed_to_freight", "Freight", "Air cargo movement"],
  ["arrived", "Arrived (Male)", "Shipment arrived in Male"],
  ["customs", "Customs", "Customs and clearing"],
  ["cleared", "Cleared", "Clearance completed"],
  ["received", "Final Delivery", "JUICIFY intake"],
  ["stock_added", "Inventory", "Stock added to inventory"],
] as const

export const lifecycleMilestones = [
  ["Supplier", "order_placed"],
  ["Forwarder", "at_forwarder"],
  ["Freight", "arrived"],
  ["Customs", "cleared"],
  ["Final Delivery", "received"],
  ["Inventory", "stock_added"],
] as const

export type ShipmentStage = (typeof shipmentStages)[number][0]

export function stageLabel(stage: string) {
  return shipmentStages.find((item) => item[0] === stage)?.[1] ?? stage
}

export function stageDetail(stage: string) {
  return shipmentStages.find((item) => item[0] === stage)?.[2] ?? ""
}

export function stageIndex(stage: string) {
  const index = shipmentStages.findIndex((item) => item[0] === stage)
  return index < 0 ? 0 : index
}

export function nextStage(stage: string) {
  const index = stageIndex(stage)
  return shipmentStages[Math.min(index + 1, shipmentStages.length - 1)][0]
}

export const chargeGroups = [
  ["freight", "Freight"],
  ["shipping_company", "Shipping company"],
  ["clearance", "Clearance"],
  ["other", "Other"],
] as const

export function groupLabel(group: string) {
  return chargeGroups.find((item) => item[0] === group)?.[1] ?? group
}

export const actualChargeLines = [
  { group: "freight", kind: "freight", description: "Freight", recoverable: false },
  {
    group: "shipping_company",
    kind: "brokerage",
    description: "Air cargo, delivery order, or bill of lading",
    recoverable: false,
  },
  { group: "shipping_company", kind: "other", description: "Handling", recoverable: false },
  { group: "shipping_company", kind: "tax", description: "GST", recoverable: true },
  { group: "clearance", kind: "brokerage", description: "Clearance documentation", recoverable: false },
  { group: "clearance", kind: "other", description: "Form filling", recoverable: false },
  { group: "clearance", kind: "other", description: "Clearance handling", recoverable: false },
  { group: "clearance", kind: "duty", description: "Duty", recoverable: false },
  { group: "clearance", kind: "other", description: "Pickup", recoverable: false },
  { group: "clearance", kind: "other", description: "MACL", recoverable: false },
  { group: "clearance", kind: "other", description: "Storage", recoverable: false },
  { group: "clearance", kind: "other", description: "Other", recoverable: false },
] as const
