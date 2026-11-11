import { presentBusiness, type Business } from "@/lib/businesses"
import { createClient } from "@/lib/supabase/server"
import { connection } from "next/server"

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function loadVisibleBusiness(key: string): Promise<Business | null> {
  await connection()
  const supabase = await createClient()
  const query = supabase.from("businesses").select("name, slug")
  const lookup = uuidPattern.test(key)
    ? await query.eq("id", key).maybeSingle()
    : await query.eq("slug", key).maybeSingle()
  if (lookup.error || !lookup.data) return null
  return presentBusiness(lookup.data)
}

export async function loadVisibleBusinesses(): Promise<Business[]> {
  await connection()
  const supabase = await createClient()
  const { data, error } = await supabase.from("businesses").select("name, slug").order("name")
  if (error || !data) return []
  return data.map((row) => presentBusiness(row))
}
