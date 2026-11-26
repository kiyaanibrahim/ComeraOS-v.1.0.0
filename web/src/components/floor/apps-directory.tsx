"use client"

import { PosScreen } from "@/components/pos/pos-screen"
import { StatusBadge } from "@/components/status-badge"
import { Card, CardContent } from "@/components/ui/card"

const apps = [
  { name: "Online store", status: "Not connected" },
  { name: "Accounting", status: "Not connected" },
  { name: "Developer", status: "Not connected" },
]

export function AppsDirectory({ businessKey }: { businessKey: string }) {
  return (
    <PosScreen businessKey={businessKey} title="Extensions" description="Connections for this business. Nothing here calls an outside service.">
      {({ business }) => (
        <div className="grid gap-3 sm:grid-cols-3">
          {apps.map((app) => (
            <Card key={app.name}>
              <CardContent className="flex flex-col gap-2 px-4">
                <p className="font-medium">{app.name}</p>
                <p className="text-xs tracking-wide text-muted-foreground uppercase">{business.name}</p>
                <StatusBadge status={app.status} capitalize={false} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PosScreen>
  )
}
