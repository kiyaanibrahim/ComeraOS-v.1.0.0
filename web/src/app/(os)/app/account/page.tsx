import Link from "next/link"
import { Suspense } from "react"
import { connection } from "next/server"

import { InsightsView } from "@/components/analytics/insights"
import { StatusBadge } from "@/components/analytics/status-badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { buildInsights } from "@/lib/analytics"
import { loadVisibleBusinesses } from "@/lib/load-business"
import { createClient } from "@/lib/supabase/server"

const links = [
  { href: "/app/account/personal", label: "Personal Information" },
  { href: "/app/account/security", label: "Security & Privacy" },
  { href: "/app/account/settings", label: "Account Settings" },
]

function initials(name: string) {
  const letters = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
  return letters || "AC"
}

export default function AccountPage() {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted" />}>
      <AccountContent />
    </Suspense>
  )
}

async function AccountContent() {
  await connection()
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const user = data.user
  let email = user?.email ?? ""
  let name = email || "Account"
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, email")
      .eq("id", user.id)
      .maybeSingle()
    email = profile?.email || user.email || ""
    name = profile?.display_name || email || "Account"
  }

  const owned = await loadVisibleBusinesses()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-medium tracking-tight">
          Profile Overview
        </h1>
        <p className="text-sm text-muted-foreground">
          Your ComeraOS identity at a glance.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <StatusBadge tone="positive">Active</StatusBadge>
        <StatusBadge tone="positive">Email verified</StatusBadge>
      </div>
      <InsightsView data={buildInsights("Profile Overview", "platform", owned)} />
      <Card>
        <CardHeader>
          <CardTitle>{name}</CardTitle>
          <CardDescription>{email || "No email on file"}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Avatar className="size-12">
            <AvatarFallback>{initials(name)}</AvatarFallback>
          </Avatar>
          <div className="flex flex-wrap gap-2">
            {links.map((link) => (
              <Button
                key={link.href}
                variant="outline"
                nativeButton={false}
                render={<Link href={link.href} />}
              >
                {link.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
