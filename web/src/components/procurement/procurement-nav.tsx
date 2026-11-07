import Link from "next/link"

import { cn } from "cn"

const items = [
  ["tracker", "Shipment Tracker", "shipments"],
  ["drafts", "Draft Orders", "procurement/drafts"],
  ["landing", "Landing Cost", "procurement/landing"],
] as const

export function ProcurementNav({
  businessKey,
  current,
}: {
  businessKey: string
  current: (typeof items)[number][0]
}) {
  return (
    <nav aria-label="Procurement pages" className="flex flex-wrap gap-2">
      {items.map(([key, label, path]) => (
        <Link
          key={key}
          href={`/app/${businessKey}/${path}`}
          aria-current={key === current ? "page" : undefined}
          className={cn(
            "inline-flex items-center rounded-lg border px-3.5 py-2 text-sm",
            key === current
              ? "border-primary/40 bg-primary/10 text-foreground"
              : "border-border bg-muted/40 text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  )
}
