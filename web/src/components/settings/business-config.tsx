"use client"

import { useCallback, useEffect, useState } from "react"

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
}) {
  return JSON.stringify(values)
}

function addressLine(address: Json): string {
  if (!address || typeof address !== "object" || Array.isArray(address)) return ""
  const line = address.line
  return typeof line === "string" ? line : ""
}

export function BusinessConfig({ businessKey }: { businessKey: string }) {
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
  })
  const dirty = baseline !== "" && baseline !== current
  const unsaved = useUnsavedChanges(dirty)

  const load = useCallback(async () => {
    if (!business) return
    const [businessRow, settingsRow] = await Promise.all([
      supabase
        .from("businesses")
        .select("name, currency, locale, timezone")
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
    const next = {
      name: businessRow.data?.name ?? "",
      currency: businessRow.data?.currency || "USD",
      locale: businessRow.data?.locale || "en-US",
      timezone: businessRow.data?.timezone || "Asia/Karachi",
      legalName: settingsRow.data?.legal_name ?? "",
      taxId: settingsRow.data?.tax_id ?? "",
      taxRate: String(settingsRow.data?.tax_rate ?? 0),
      invoicePrefix: settingsRow.data?.invoice_prefix ?? "",
      orderPrefix: settingsRow.data?.order_prefix ?? "",
      address: addressLine(settingsRow.data?.address ?? null),
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
    const businessResult = await supabase
      .from("businesses")
      .update({ name: nextName, currency, locale, timezone })
      .eq("id", business.id)
    const settingsResult = await supabase
      .from("business_settings")
      .update({
        legal_name: legalName.trim() || null,
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
              <FieldLabel htmlFor="legal-name">Legal name</FieldLabel>
              <Input id="legal-name" value={legalName} onValueChange={setLegalName} />
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
