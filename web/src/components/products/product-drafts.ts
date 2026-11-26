import { autoSku } from "@/lib/flow/codes"
import { randomUUID } from "@/lib/utils"

export type ProductType = "standard" | "variable" | "bundle"
export type TaxMode = "inherit" | "exempt" | "custom"
export type OptionDraft = { name: string; values: string[] }
export type VariantDraft = {
  id: string
  sku: string
  barcode: string
  price: string
  cost: string
  status: string
  variant_key: string
  option_values: { option: string; value: string }[]
  image_path: string
}
export type ComponentDraft = {
  component_id: string
  quantity: string
  label: string
  cost: number
  price: number
}

export const OPTION_PRESETS = ["Size", "Colour", "Flavour", "Weight"] as const

export function cartesian(groups: { option: string; values: string[] }[]) {
  return groups.reduce<{ option: string; value: string }[][]>(
    (acc, group) =>
      acc.flatMap((prefix) => group.values.map((value) => [...prefix, { option: group.option, value }])),
    [[]],
  )
}

export function variantKey(values: { option: string; value: string }[]) {
  return [...values]
    .sort((a, b) => a.option.localeCompare(b.option))
    .map((item) => `${item.option.toLowerCase()}:${item.value.toLowerCase()}`)
    .join("|")
}

export function buildVariantDrafts(
  sourceOptions: OptionDraft[],
  existing: VariantDraft[] = [],
  fallbackPrice = "0",
  fallbackCost = "0",
) {
  const groups = sourceOptions
    .map((option) => ({
      option: option.name.trim(),
      values: option.values.map((value) => value.trim()).filter(Boolean),
    }))
    .filter((group) => group.option && group.values.length > 0)
  if (groups.length === 0) return []
  return cartesian(groups).map((values) => {
    const key = variantKey(values)
    const prior = existing.find((item) => item.variant_key === key)
    const id = prior?.id ?? randomUUID()
    return {
      id,
      sku: prior?.sku || autoSku(id),
      barcode: prior?.barcode || "",
      price: prior?.price || fallbackPrice || "0",
      cost: prior?.cost || fallbackCost || "0",
      status: prior?.status || "active",
      variant_key: key,
      option_values: values,
      image_path: prior?.image_path || "",
    }
  })
}

export function variantLabel(variant: VariantDraft, skipFirst = false) {
  const values = skipFirst ? variant.option_values.slice(1) : variant.option_values
  if (values.length === 0) return variant.option_values[0]?.value ?? "Variant"
  return values.map((item) => item.value).join(" / ")
}

export function categorySlug(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return `${base || "category"}-${randomUUID().slice(0, 8)}`
}
