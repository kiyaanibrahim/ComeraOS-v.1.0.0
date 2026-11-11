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

export function useBusiness(key: string | null) {
  const supabase = useMemo(() => createClient(), [])
  const [user, setUser] = useState<User | null>(null)
  const [business, setBusiness] = useState<BusinessRecord | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setError(null)
    const { data: authData } = await supabase.auth.getUser()
    const nextUser = authData.user

    if (!nextUser) {
      setUser(null)
      setBusiness(null)
      setError("Sign in to open this business.")
      setReady(true)
      return
    }

    setUser(nextUser)

    if (!key) {
      setBusiness(null)
      setReady(true)
      return
    }

    const query = supabase.from("businesses").select("id, name, slug, currency")
    const lookup = uuidPattern.test(key)
      ? await query.eq("id", key).maybeSingle()
      : await query.eq("slug", key).maybeSingle()

    if (lookup.error || !lookup.data) {
      setError(lookup.error?.message ?? "This business isn't available.")
      setBusiness(null)
      setReady(true)
      return
    }

    setBusiness(lookup.data)
    setReady(true)
  }, [key, supabase])

  useEffect(() => {
    void reload()
  }, [reload])

  return { supabase, user, business, ready, error, reload, key }
}

export type FlowClient = ReturnType<typeof useBusiness>["supabase"]
export type FlowDatabase = Database
