"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { User } from "@supabase/supabase-js"

import { createClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"

export type BusinessRecord = {
  id: string
  name: string
  slug: string
  currency: string
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const businessNames: Record<string, string> = {
  demo: "Dreams Pvt Ltd",
}

const demoAccount = {
  email: "demo@comera.os",
  password: "comera-demo-colony",
}

export function useBusiness(key: string) {
  const supabase = useMemo(() => createClient(), [])
  const [user, setUser] = useState<User | null>(null)
  const [business, setBusiness] = useState<BusinessRecord | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setError(null)
    const { data: authData, error: authError } = await supabase.auth.getUser()
    let nextUser = authData.user

    if (!nextUser) {
      const signedIn = await supabase.auth.signInWithPassword(demoAccount)
      nextUser = signedIn.data.user
      if (!nextUser) {
        setUser(null)
        setBusiness(null)
        setError(signedIn.error?.message ?? "Couldn't open this business.")
        setReady(true)
        return
      }
    }

    if (authError && nextUser) setError(null)
    setUser(nextUser)

    if (!nextUser) {
      setBusiness(null)
      setError("Couldn't open this business.")
      setReady(true)
      return
    }

    const query = supabase.from("businesses").select("id, name, slug, currency")
    const lookup = uuidPattern.test(key)
      ? await query.eq("id", key).maybeSingle()
      : await query.eq("slug", key).maybeSingle()

    let nextBusiness = lookup.data
    if (lookup.error) {
      setError(lookup.error.message)
      setBusiness(null)
      setReady(true)
      return
    }

    if (!nextBusiness && !uuidPattern.test(key)) {
      const created = await supabase.from("businesses").insert({
        name: businessNames[key] ?? key,
        slug: key,
        owner_id: nextUser.id,
      })
      if (created.error) {
        setError(created.error.message)
        setBusiness(null)
        setReady(true)
        return
      }
      const again = await supabase
        .from("businesses")
        .select("id, name, slug, currency")
        .eq("slug", key)
        .maybeSingle()
      if (again.error || !again.data) {
        setError(again.error?.message ?? "Couldn't open this business.")
        setBusiness(null)
        setReady(true)
        return
      }
      nextBusiness = again.data
    }

    setBusiness(nextBusiness)
    setReady(true)
  }, [key, supabase])

  useEffect(() => {
    void reload()
  }, [reload])

  return { supabase, user, business, ready, error, reload, key }
}

export type FlowClient = ReturnType<typeof useBusiness>["supabase"]
export type FlowDatabase = Database
