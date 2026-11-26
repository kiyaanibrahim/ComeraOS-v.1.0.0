"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { AuthCard, AuthProviders, type SocialProvider } from "@/components/auth-card"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { startGoogleSignIn } from "@/lib/auth/google"
import { createClient } from "@/lib/supabase/client"

export function LoginForm() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const error = new URLSearchParams(window.location.search).get("error")
    if (error) setMessage("Sign-in didn't finish. Try again.")
  }, [])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get("email") ?? "")
    const password = String(form.get("password") ?? "")
    setPending(true)
    setMessage(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setPending(false)
    if (error) {
      setMessage(error.message)
      return
    }
    router.push("/app")
    router.refresh()
  }

  async function resetPassword(event: React.MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form
    const email = String(new FormData(form ?? undefined).get("email") ?? "")
    if (!email) {
      setMessage("Enter your email, then ask for a reset link.")
      return
    }
    setPending(true)
    setMessage(null)
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/login`,
    })
    setPending(false)
    setMessage(error ? error.message : "Check your email for the reset link.")
  }

  async function onProvider(_provider: SocialProvider) {
    setPending(true)
    setMessage(null)
    const { error } = await startGoogleSignIn("/app")
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
            <h1 className="text-2xl font-bold">Welcome back</h1>
            <p className="text-balance text-muted-foreground">Log in to your ComeraOS account</p>
          </div>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" name="email" type="email" placeholder="m@example.com" autoComplete="email" required />
          </Field>
          <Field>
            <div className="flex items-center">
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <button
                type="button"
                onClick={resetPassword}
                className="ml-auto text-sm underline-offset-2 hover:underline"
              >
                Forgot your password?
              </button>
            </div>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </Field>
          {message ? (
            <p role="alert" className="text-sm text-muted-foreground">
              {message}
            </p>
          ) : null}
          <Field>
            <Button type="submit" disabled={pending}>
              {pending ? "Please wait" : "Login"}
            </Button>
          </Field>
          <AuthProviders pending={pending} onProvider={onProvider} />
          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <a href="/signup" className="underline underline-offset-2">
              Sign up
            </a>
          </p>
        </FieldGroup>
      </form>
    </AuthCard>
  )
}
