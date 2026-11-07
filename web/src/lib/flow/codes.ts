export function codeFromId(prefix: string, id: string, length: number) {
  const hex = id.replace(/-/g, "").slice(0, length).toUpperCase()
  return `${prefix}-${hex}`
}

export function autoSku(productId: string) {
  return codeFromId("SKU", productId, 8)
}

export function autoBatchReference(lineId: string) {
  return codeFromId("BATCH", lineId, 6)
}
