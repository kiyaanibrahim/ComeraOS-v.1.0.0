"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"

import { UnsavedChangesDialog, useUnsavedChanges } from "@/components/unsaved-changes"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "@/components/ui/sonner"
import { slugFromName } from "@/lib/businesses"
import { useBusiness } from "@/lib/flow/use-business"
import type { Json } from "@/lib/supabase/database.types"

const currencies = { USD: "USD", PKR: "PKR", AED: "AED", EUR: "EUR" }
const locales = { "en-US": "English (US)", "en-PK": "English (Pakistan)" }
const timezones = {
  "Asia/Karachi": "Asia/Karachi",
  UTC: "UTC",
  "Asia/Dubai": "Asia/Dubai",
  "Europe/London": "Europe/London",
  "America/New_York": "America/New_York",
}

async function availableSlug(
  supabase: ReturnType<typeof useBusiness>["supabase"],
  base: string,
  businessId: string,
) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`
    const { data } = await supabase.from("businesses").select("id").eq("slug", slug).maybeSingle()
    if (!data || data.id === businessId) return slug
  }
  return `${base}-${businessId.slice(0, 8)}`
}

function formSnapshot(values: {
  name: string
  currency: string
  locale: string
  timezone: string
  legalName: string
  taxId: string
  taxRate: string
  invoicePrefix: string
  orderPrefix: string
  address: string
  industryId: string
}) {
  return JSON.stringify(values)
}

function addressLine(address: Json): string {
  if (!address || typeof address !== "object" || Array.isArray(address)) return ""
  const line = address.line
  return typeof line === "string" ? line : ""
}

export function BusinessConfig({ businessKey }: { businessKey: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const { supabase, business, ready, error: loadError, reload } = useBusiness(businessKey)
  const [name, setName] = useState("")
  const [currency, setCurrency] = useState("USD")
  const [locale, setLocale] = useState("en-US")
  const [timezone, setTimezone] = useState("Asia/Karachi")
  const [legalName, setLegalName] = useState("")
  const [taxId, setTaxId] = useState("")
  const [taxRate, setTaxRate] = useState("0")
  const [invoicePrefix, setInvoicePrefix] = useState("")
  const [orderPrefix, setOrderPrefix] = useState("")
  const [address, setAddress] = useState("")
  const [industryId, setIndustryId] = useState("")
  const [industries, setIndustries] = useState<{ id: string; name: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [baseline, setBaseline] = useState("")
  const current = formSnapshot({
    name,
    currency,
    locale,
    timezone,
    legalName,
    taxId,
    taxRate,
    invoicePrefix,
    orderPrefix,
    address,
    industryId,
  })
  const dirty = baseline !== "" && baseline !== current
  const unsaved = useUnsavedChanges(dirty)

  const load = useCallback(async () => {
    if (!business) return
    const [businessRow, settingsRow] = await Promise.all([
      supabase
        .from("businesses")
        .select("name, currency, locale, timezone, industry_id, organization_id, organizations(name)")
        .eq("id", business.id)
        .maybeSingle(),
      supabase
        .from("business_settings")
        .select("legal_name, tax_id, tax_rate, invoice_prefix, order_prefix, address")
        .eq("business_id", business.id)
        .maybeSingle(),
    ])
    if (businessRow.error || settingsRow.error) {
      toast.error(businessRow.error?.message ?? settingsRow.error?.message ?? "Couldn't load settings.")
      return
    }
    const organizationId = businessRow.data?.organization_id
    const industryResult = organizationId
      ? await supabase.from("organization_industries").select("id, name").eq("organization_id", organizationId).order("name")
      : { data: [], error: null }
    if (industryResult.error) {
      toast.error(industryResult.error.message)
      return
    }
    setIndustries(industryResult.data ?? [])
    const organization = businessRow.data?.organizations
    const organizationName = organization && !Array.isArray(organization) ? organization.name : ""
    let address = addressLine(settingsRow.data?.address ?? null)
    if (!address) {
      const [placeRows, locationRows] = await Promise.all([
        supabase.from("places").select("address").eq("business_id", business.id),
        supabase.from("locations").select("address").eq("business_id", business.id),
      ])
      const lines = [...(placeRows.data ?? []), ...(locationRows.data ?? [])].map((row) => addressLine(row.address)).filter(Boolean)
      address = lines[0] ?? ""
      if (address) {
        await supabase.from("business_settings").update({ address: { line: address } }).eq("business_id", business.id)
      }
    }
    const next = {
      name: businessRow.data?.name ?? "",
      currency: businessRow.data?.currency || "USD",
      locale: businessRow.data?.locale || "en-US",
      timezone: businessRow.data?.timezone || "Asia/Karachi",
      legalName: organizationName || settingsRow.data?.legal_name || "",
      taxId: settingsRow.data?.tax_id ?? "",
      taxRate: String(settingsRow.data?.tax_rate ?? 0),
      invoicePrefix: settingsRow.data?.invoice_prefix ?? "",
      orderPrefix: settingsRow.data?.order_prefix ?? "",
      address,
      industryId: businessRow.data?.industry_id ?? "",
    }
    setName(next.name)
    setCurrency(next.currency)
    setLocale(next.locale)
    setTimezone(next.timezone)
    setLegalName(next.legalName)
    setTaxId(next.taxId)
    setTaxRate(next.taxRate)
    setInvoicePrefix(next.invoicePrefix)
    setOrderPrefix(next.orderPrefix)
    setAddress(next.address)
    setIndustryId(next.industryId)
    setBaseline(formSnapshot(next))
  }, [business, supabase])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    if (!business) return
    const nextName = name.trim()
    const rate = Number(taxRate)
    if (!nextName) {
      toast.error("Enter a business name.")
      return
    }
    if (Number.isNaN(rate) || rate < 0 || rate > 100) {
      toast.error("Tax rate must be a percent from 0 to 100.")
      return
    }
    setSaving(true)
    const nextSlug = await availableSlug(supabase, slugFromName(nextName), business.id)
    const businessResult = await supabase
      .from("businesses")
      .update({ name: nextName, slug: nextSlug, currency, locale, timezone, industry_id: industryId || null })
      .eq("id", business.id)
    const settingsResult = await supabase
      .from("business_settings")
      .update({
        tax_id: taxId.trim() || null,
        tax_rate: rate,
        invoice_prefix: invoicePrefix.trim() || "INV",
        order_prefix: orderPrefix.trim() || "ORD",
        address: { line: address.trim() },
      })
      .eq("business_id", business.id)
    setSaving(false)
    if (businessResult.error || settingsResult.error) {
      toast.error(businessResult.error?.message ?? settingsResult.error?.message ?? "Couldn't save settings.")
      return
    }
    setBaseline(current)
    toast.success("Settings saved.")
    if (nextSlug !== business.slug) {
      router.replace(pathname.replace(`/app/${businessKey}`, `/app/${nextSlug}`))
      return
    }
    await reload()
  }

  const currencyItems = currency in currencies ? currencies : { ...currencies, [currency]: currency }
  const localeItems = locale in locales ? locales : { ...locales, [locale]: locale }
  const timezoneItems = timezone in timezones ? timezones : { ...timezones, [timezone]: timezone }

  return (
    <div className="flex flex-col gap-4">
      <UnsavedChangesDialog open={unsaved.open} onStay={unsaved.stay} onLeave={unsaved.leave} />
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-medium tracking-tight">Business config</h1>
        <p className="text-sm text-muted-foreground">Identity, locale, and document defaults.</p>
      </div>
      {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
      <Card>
        <CardHeader>
          <CardTitle>Business</CardTitle>
          <CardDescription>These values apply across sales, inventory, and documents.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="business-name">Name</FieldLabel>
              <Input id="business-name" value={name} onValueChange={setName} />
            </Field>
            <Field>
              <FieldLabel htmlFor="legal-name">Organization</FieldLabel>
              <Input id="legal-name" value={legalName} readOnly />
              <p className="text-sm text-muted-foreground">
                The incorporated name. Rename it from the business portfolio.
              </p>
            </Field>
            <Field>
              <FieldLabel htmlFor="business-industry">Industry</FieldLabel>
              {industries.length === 0 ? (
                <p className="text-sm text-muted-foreground">Industries are added in organization setup.</p>
              ) : (
                <Select
                  value={industryId || "none"}
                  items={{ none: "No industry", ...Object.fromEntries(industries.map((industry) => [industry.id, industry.name])) }}
                  onValueChange={(value) => setIndustryId(!value || value === "none" ? "" : value)}
                >
                  <SelectTrigger id="business-industry" className="w-full">
                    <SelectValue placeholder="Industry" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No industry</SelectItem>
                    {industries.map((industry) => (
                      <SelectItem key={industry.id} value={industry.id}>
                        {industry.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
            <Field>
              <FieldLabel htmlFor="tax-id">Tax ID</FieldLabel>
              <Input id="tax-id" value={taxId} onValueChange={setTaxId} />
            </Field>
            <Field>
              <FieldLabel htmlFor="tax-rate">Tax rate (%)</FieldLabel>
              <Input
                id="tax-rate"
                type="number"
                min={0}
                max={100}
                step="0.001"
                value={taxRate}
                onValueChange={setTaxRate}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="business-address">Address</FieldLabel>
              <Input id="business-address" value={address} onValueChange={setAddress} />
            </Field>
            <Field>
              <FieldLabel htmlFor="currency">Currency</FieldLabel>
              <Select value={currency} items={currencyItems} onValueChange={(value) => setCurrency(value ?? "USD")}>
                <SelectTrigger id="currency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(currencyItems).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="locale">Locale</FieldLabel>
              <Select value={locale} items={localeItems} onValueChange={(value) => setLocale(value ?? "en-US")}>
                <SelectTrigger id="locale" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(localeItems).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="timezone">Timezone</FieldLabel>
              <Select value={timezone} items={timezoneItems} onValueChange={(value) => setTimezone(value ?? "UTC")}>
                <SelectTrigger id="timezone" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(timezoneItems).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="invoice-prefix">Invoice prefix</FieldLabel>
              <Input id="invoice-prefix" value={invoicePrefix} onValueChange={setInvoicePrefix} />
            </Field>
            <Field>
              <FieldLabel htmlFor="order-prefix">Order prefix</FieldLabel>
              <Input id="order-prefix" value={orderPrefix} onValueChange={setOrderPrefix} />
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter>
          <Button type="button" disabled={!ready || !business || saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save config"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
