export function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">{children}</div>
}

export function FieldCard({
  label,
  hint,
  badge,
  quiet,
  children,
}: {
  label: string
  hint?: string
  badge?: React.ReactNode
  quiet?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">{label}</div>
        {badge}
      </div>
      <div className={quiet ? "text-muted-foreground" : undefined}>{children}</div>
      {hint ? <p className="mt-2 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export function ValueCard({
  label,
  value,
  badge,
}: {
  label: string
  value: React.ReactNode
  badge?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2">
        {badge}
        <div className="text-sm font-medium">{value}</div>
      </div>
    </div>
  )
}

export function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border">
      <h3 className="border-b px-4 py-3 text-sm font-medium">{title}</h3>
      <div className="px-4">{children}</div>
    </section>
  )
}

export function FormRow({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-2 border-b py-3 last:border-b-0 sm:grid-cols-[minmax(12rem,18rem)_minmax(0,1fr)] sm:items-center">
      <div>
        <div className="text-sm">{label}</div>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="min-w-0 sm:max-w-md">{children}</div>
    </div>
  )
}
