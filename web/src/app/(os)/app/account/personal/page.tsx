"use client"

import { useEffect, useState } from "react"

import { DonutChart } from "@/components/analytics/charts"
import { StatusBadge } from "@/components/analytics/status-badge"
import { DatePicker } from "@/components/date-picker"
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
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { createClient } from "@/lib/supabase/client"

export default function PersonalInformationPage() {
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")

  useEffect(() => {
    const supabase = createClient()
    void supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user
      if (!user) return
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, email")
        .eq("id", user.id)
        .maybeSingle()
      setEmail(profile?.email || user.email || "")
      setFullName(profile?.display_name || "")
    })
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-medium tracking-tight">
          Personal Information
        </h1>
        <p className="text-sm text-muted-foreground">
          Name, contact details, and preferences.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <StatusBadge tone="positive">Name on file</StatusBadge>
        <StatusBadge tone="positive">Email verified</StatusBadge>
        <StatusBadge tone="negative">Phone missing</StatusBadge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Profile completeness</CardTitle>
          <CardDescription>Filled fields on this profile against the ones still empty.</CardDescription>
        </CardHeader>
        <CardContent>
          <DonutChart
            label="Profile completeness"
            items={[
              { label: "Filled", value: 2, tone: "positive" },
              { label: "Missing", value: 3, tone: "negative" },
            ]}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Stored on the signed-in user once auth is connected.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="full-name">Full name</FieldLabel>
                <Input id="full-name" value={fullName} onValueChange={setFullName} />
              </Field>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input id="email" type="email" value={email} onValueChange={setEmail} />
              </Field>
              <Field>
                <FieldLabel htmlFor="phone">Phone</FieldLabel>
                <Input id="phone" type="tel" placeholder="+1 555 0100" />
              </Field>
              <Field>
                <FieldLabel htmlFor="language">Language</FieldLabel>
                <Select
                  defaultValue="en"
                  items={{ en: "English", ar: "Arabic", ur: "Urdu" }}
                >
                  <SelectTrigger id="language" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="ar">Arabic</SelectItem>
                    <SelectItem value="ur">Urdu</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="dob">Date of birth</FieldLabel>
              <DatePicker id="dob" />
            </Field>
            <Field>
              <FieldLabel htmlFor="bio">Notes</FieldLabel>
              <Textarea id="bio" placeholder="Internal notes about this profile" />
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter>
          <Button type="button">Save</Button>
        </CardFooter>
      </Card>
    </div>
  )
}
