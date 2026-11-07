"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { AuthCard, AuthProviders, type SocialProvider } from "@/components/auth-card"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"

const planNames: Record<string, string> = {
  core: "Starter",
  colony: "Complete",
  cosmos: "Owner",
}

export function SignupForm({ plan }: { plan?: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const chosen = plan ? planNames[plan] : null

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get("email") ?? "")
    const password = String(form.get("password") ?? "")
    setPending(true)
    setMessage(null)
    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/app`,
      },
    })
    setPending(false)
    if (error) {
      setMessage(error.message)
      return
    }
    if (data.session) {
      router.push("/app")
      router.refresh()
      return
    }
    setMessage("Check your email to confirm the account, then log in.")
  }

  async function onProvider(provider: SocialProvider) {
    setPending(true)
    setMessage(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: provider === "google" ? "custom:google" : provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/app`,
        queryParams: provider === "google" ? { prompt: "select_account" } : undefined,
      },
    })
    if (error) {
      setPending(false)
      setMessage(error.message)
    }
  }

  return (
    <AuthCard>
      <form onSubmit={onSubmit}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-2xl font-bold">Create your account</h1>
            <p className="text-balance text-muted-foreground">
              {chosen ? `Start on the ${chosen} plan.` : "Open a ComeraOS account."}
            </p>
          </div>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" name="email" type="email" placeholder="m@example.com" autoComplete="email" required />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={6}
              required
            />
          </Field>
          {message ? (
            <p role="status" className="text-sm text-muted-foreground">
              {message}
            </p>
          ) : null}
          <Field>
            <Button type="submit" disabled={pending}>
              {pending ? "Please wait" : "Sign up"}
            </Button>
          </Field>
          <AuthProviders pending={pending} onProvider={onProvider} />
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <a href="/login" className="underline underline-offset-2">
              Log in
            </a>
          </p>
        </FieldGroup>
      </form>
    </AuthCard>
  )
}
