"use client"

import { useState } from "react"

import { StatusBadge } from "@/components/analytics/status-badge"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
export default function AccountSettingsPage() {
  const [emailAlerts, setEmailAlerts] = useState(true)
  const [integrityAlerts, setIntegrityAlerts] = useState(true)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-medium tracking-tight">
          Account Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Notification and account-level preferences.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <StatusBadge tone={emailAlerts ? "positive" : "negative"}>
          {emailAlerts ? "Email on" : "Email off"}
        </StatusBadge>
        <StatusBadge tone={integrityAlerts ? "positive" : "negative"}>
          {integrityAlerts ? "Audit on" : "Audit off"}
        </StatusBadge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Theme for the whole app.</CardDescription>
        </CardHeader>
        <CardContent>
          <Field orientation="horizontal">
            <div className="flex flex-1 flex-col gap-1">
              <FieldLabel>Color theme</FieldLabel>
              <FieldDescription>
                Toggle light and dark. The new theme expands from the button.
              </FieldDescription>
            </div>
            <ThemeToggle />
          </Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>Defaults for this user across businesses.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="timezone">Timezone</FieldLabel>
              <Select
                defaultValue="asia-karachi"
                items={{
                  "asia-karachi": "Asia/Karachi",
                  utc: "UTC",
                  "america-new-york": "America/New_York",
                }}
              >
                <SelectTrigger id="timezone" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asia-karachi">Asia/Karachi</SelectItem>
                  <SelectItem value="utc">UTC</SelectItem>
                  <SelectItem value="america-new-york">America/New_York</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="currency">Display currency</FieldLabel>
              <Select
                defaultValue="pkr"
                items={{ pkr: "PKR", usd: "USD", aed: "AED" }}
              >
                <SelectTrigger id="currency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pkr">PKR</SelectItem>
                  <SelectItem value="usd">USD</SelectItem>
                  <SelectItem value="aed">AED</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field orientation="horizontal">
              <Switch id="email-alerts" checked={emailAlerts} onCheckedChange={setEmailAlerts} />
              <FieldLabel htmlFor="email-alerts">Email alerts</FieldLabel>
            </Field>
            <Field orientation="horizontal">
              <Switch
                id="integrity-alerts"
                checked={integrityAlerts}
                onCheckedChange={setIntegrityAlerts}
              />
              <FieldLabel htmlFor="integrity-alerts">Audit alerts</FieldLabel>
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter>
          <Button type="button">Save settings</Button>
        </CardFooter>
      </Card>
    </div>
  )
}
