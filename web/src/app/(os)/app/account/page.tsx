import Link from "next/link"

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

const links = [
  { href: "/app/account/personal", label: "Personal Information" },
  { href: "/app/account/security", label: "Security & Privacy" },
  { href: "/app/account/settings", label: "Account Settings" },
]

export default function AccountPage() {
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
      <InsightsView data={buildInsights("Profile Overview", "platform")} />
      <Card>
        <CardHeader>
          <CardTitle>Demo User</CardTitle>
          <CardDescription>demo@comera.os</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Avatar className="size-12">
            <AvatarFallback>DU</AvatarFallback>
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
