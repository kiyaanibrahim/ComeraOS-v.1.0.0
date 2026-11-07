export type AllocationMethod = "value" | "quantity" | "weight"

export type CostLine = {
  id: string
  quantity: number
  unitCost: number
  weightGrams?: number
}

export type CostCharge = {
  amount: number
  recoverable: boolean
}

export type LandedLine = CostLine & {
  merchandise: number
  weight: number
  allocated: number
  lineLanding: number
  unitLanding: number
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function roundUnit(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000
}

function roundWeight(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000
}

export function discountFactor(discountPercent: number) {
  return 1 - Math.min(100, Math.max(0, discountPercent)) / 100
}

export function businessUnitCost(
  originUnit: number,
  discountPercent: number,
  originToUsd: number,
  usdToBusiness: number,
) {
  return roundMoney(originUnit * discountFactor(discountPercent) * originToUsd * usdToBusiness)
}

export function projectedFreight(totalGrams: number, usdPerKg: number, usdToBusiness: number) {
  return roundMoney((totalGrams / 1000) * usdPerKg * usdToBusiness)
}

export function suggestedPackages(totalGrams: number) {
  const kg = totalGrams / 1000
  if (kg <= 0) return 0
  return Math.max(1, Math.ceil(kg / 20))
}

export function margin(sellPrice: number, unitLanding: number) {
  if (sellPrice <= 0) return null
  return (sellPrice - unitLanding) / sellPrice
}

export function landShipment(
  lines: CostLine[],
  charges: CostCharge[],
  method: AllocationMethod,
) {
  const priced = lines.map((line) => ({
    ...line,
    merchandise: roundMoney(line.quantity * line.unitCost),
    weight: roundWeight(line.quantity * (line.weightGrams ?? 0)),
  }))
  const merchandiseTotal = priced.reduce((sum, line) => sum + line.merchandise, 0)
  const chargeTotal = charges
    .filter((charge) => !charge.recoverable)
    .reduce((sum, charge) => sum + roundMoney(charge.amount), 0)
  const recoverableTotal = charges
    .filter((charge) => charge.recoverable)
    .reduce((sum, charge) => sum + roundMoney(charge.amount), 0)
  const quantityTotal = priced.reduce((sum, line) => sum + line.quantity, 0)
  const weightTotal = priced.reduce((sum, line) => sum + line.weight, 0)
  let remaining = chargeTotal

  const landed: LandedLine[] = priced.map((line, index) => {
    const last = index === priced.length - 1
    const lineWeight = line.weight
    let allocated = 0
    if (priced.length === 0) {
      allocated = 0
    } else if (last) {
      allocated = roundMoney(remaining)
    } else if (method === "quantity" && quantityTotal > 0) {
      allocated = roundMoney((chargeTotal * line.quantity) / quantityTotal)
      remaining = roundMoney(remaining - allocated)
    } else if (method === "weight" && weightTotal > 0) {
      allocated = roundMoney((chargeTotal * lineWeight) / weightTotal)
      remaining = roundMoney(remaining - allocated)
    } else if (merchandiseTotal > 0) {
      allocated = roundMoney((chargeTotal * line.merchandise) / merchandiseTotal)
      remaining = roundMoney(remaining - allocated)
    } else if (quantityTotal > 0) {
      allocated = roundMoney((chargeTotal * line.quantity) / quantityTotal)
      remaining = roundMoney(remaining - allocated)
    }
    const lineLanding = roundMoney(line.merchandise + allocated)
    const unitLanding =
      line.quantity === 0 ? 0 : roundUnit((line.merchandise + allocated) / line.quantity)
    return { ...line, allocated, lineLanding, unitLanding }
  })

  return {
    lines: landed,
    merchandiseTotal: roundMoney(merchandiseTotal),
    chargeTotal,
    recoverableTotal,
    weightGrams: weightTotal,
    landingTotal: roundMoney(merchandiseTotal + chargeTotal),
  }
}

export function projectedCost(
  onHand: number,
  currentCost: number,
  receiveQuantity: number,
  unitLanding: number,
) {
  if (receiveQuantity <= 0) return roundMoney(currentCost)
  if (onHand <= 0) return roundMoney(unitLanding)
  return roundMoney(
    (onHand * currentCost + receiveQuantity * unitLanding) / (onHand + receiveQuantity),
  )
}
