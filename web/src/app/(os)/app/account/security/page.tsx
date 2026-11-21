"use client"

import { useState } from "react"

import { StatusBadge } from "@/components/analytics/status-badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
export default function SecurityPage() {
  const [mfa, setMfa] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-medium tracking-tight">
          Security & Privacy
        </h1>
        <p className="text-sm text-muted-foreground">
          Password, MFA, sessions, and privacy controls.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <StatusBadge tone={mfa ? "positive" : "negative"}>{mfa ? "MFA on" : "MFA off"}</StatusBadge>
        <StatusBadge tone="neutral">1 active session</StatusBadge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Sign-in</CardTitle>
          <CardDescription>Password changes apply after Supabase Auth is connected.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="current-password">Current password</FieldLabel>
              <Input id="current-password" type="password" autoComplete="current-password" />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-password">New password</FieldLabel>
              <Input id="new-password" type="password" autoComplete="new-password" />
            </Field>
            <Field orientation="horizontal">
              <Switch id="mfa" checked={mfa} onCheckedChange={setMfa} />
              <FieldLabel htmlFor="mfa">Require multi-factor authentication</FieldLabel>
            </Field>
            <Field orientation="horizontal">
              <Checkbox id="revoke" />
              <FieldLabel htmlFor="revoke">Sign out other sessions</FieldLabel>
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter>
          <Button type="button">Update security</Button>
        </CardFooter>
      </Card>
    </div>
  )
}
