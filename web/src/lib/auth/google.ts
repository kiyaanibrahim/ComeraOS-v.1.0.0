import { createClient } from "@/lib/supabase/client"

export async function startGoogleSignIn(next = "/app") {
  const supabase = createClient()
  return supabase.auth.signInWithOAuth({
    provider: "custom:google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback?next=${next}`,
      queryParams: { prompt: "select_account" },
    },
  })
}
