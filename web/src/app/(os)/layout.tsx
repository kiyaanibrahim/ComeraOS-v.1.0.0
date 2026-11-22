import { Suspense } from "react"
import { connection } from "next/server"

import { AppHeader } from "@/components/app-header"
import { AppSidebar } from "@/components/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export default function OsLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <Suspense fallback={<div className="min-h-svh bg-background" />}>
      <AuthenticatedOs>{children}</AuthenticatedOs>
    </Suspense>
  )
}

async function AuthenticatedOs({ children }: { children: React.ReactNode }) {
  await connection()
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect("/login")

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <div className="flex flex-1 flex-col gap-4 p-4 pt-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
