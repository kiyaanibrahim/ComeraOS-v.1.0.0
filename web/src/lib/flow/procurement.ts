export const shipmentStages = [
  ["draft_order", "Draft order", "Order being prepared"],
  ["order_placed", "Order placed", "Supplier has confirmed the order"],
  ["at_forwarder", "Received at forwarder", "Products reached the forwarding company"],
  ["handed_to_freight", "Handed to freight", "Shipment handed over for transportation"],
  ["arrived", "Arrived", "Shipment has arrived in the destination country"],
  ["customs", "Under customs", "Customs clearance is underway"],
  ["cleared", "Cleared", "Clearance has been completed"],
  ["received", "Received at warehouse", "Goods physically received"],
  ["stock_added", "Stock added", "Inventory intake has been applied"],
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
