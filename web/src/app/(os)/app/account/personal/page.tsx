"use client"

import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/sonner"
import { profileUpdatedEvent } from "@/lib/profile"
import { createClient } from "@/lib/supabase/client"

export default function PersonalInformationPage() {
  const [nickname, setNickname] = useState("")
  const [saved, setSaved] = useState("")
  const [email, setEmail] = useState("")
  const [userId, setUserId] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    void supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user
      if (!user) return
      setUserId(user.id)
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, email")
        .eq("id", user.id)
        .maybeSingle()
      const name = profile?.display_name?.trim() ?? ""
      setEmail(profile?.email || user.email || "")
      setNickname(name)
      setSaved(name)
    })
  }, [])

  async function save() {
    if (!userId || pending) return
    const next = nickname.trim().replace(/\s+/g, " ")
    if (next.length < 1 || next.length > 40) {
      toast.error("Use a nickname between 1 and 40 characters.")
      return
    }
    setPending(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from("profiles")
      .update({ display_name: next })
      .eq("id", userId)
      .select("display_name")
      .maybeSingle()
    setPending(false)
    if (error || !data) {
      toast.error(error?.message ?? "Couldn't save your nickname.")
      return
    }
    const name = data.display_name.trim()
    setNickname(name)
    setSaved(name)
    window.dispatchEvent(new CustomEvent(profileUpdatedEvent))
    toast.success("Nickname saved.")
  }

  const dirty = nickname.trim().replace(/\s+/g, " ") !== saved

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-medium tracking-tight">Personal Information</h1>
        <p className="text-sm text-muted-foreground">
          The name ComeraOS uses when it talks to you.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Nickname</CardTitle>
          <CardDescription>
            Shown on the business portfolio, your account, and the sidebar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="nickname">Nickname</FieldLabel>
              <Input
                id="nickname"
                value={nickname}
                autoComplete="nickname"
                maxLength={40}
                onValueChange={setNickname}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    void save()
                  }
                }}
              />
              <FieldDescription>This replaces the name taken from your email.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" type="email" value={email} disabled />
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter>
          <Button type="button" disabled={!dirty || pending || !userId} onClick={() => void save()}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
