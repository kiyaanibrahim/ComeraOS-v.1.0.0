import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { StatCard } from "@/components/shell/StatCard";

const shortcuts = [
  { label: "Open POS", href: "/app/pos" },
  { label: "Orders", href: "/app/orders" },
  { label: "Inventory", href: "/app/inventory" },
  { label: "CRM", href: "/app/crm" },
  { label: "Staff & Access", href: "/app/staff" },
  { label: "Platform Health", href: "/app/platform/health" },
];

export default function ColonyDashboardPage() {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-[var(--muted)] uppercase">
        Overview
      </p>
      <PageHeader
        title="Colony Dashboard"
        description="Operational pulse for the active colony — sales, stock, staff, and integrity."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Today's sales" value="—" hint="Connect POS to populate" />
        <StatCard label="Open orders" value="0" hint="No orders yet" />
        <StatCard label="Low stock SKUs" value="—" hint="Inventory module next" />
        <StatCard label="Integrity" value="Nominal" hint="Engine scaffolded" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-xl border border-[var(--border)] bg-white p-5">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
            Getting started
          </h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-[var(--muted)]">
            <li>Add your Supabase URL and anon key to <code className="rounded bg-[var(--background)] px-1 py-0.5 font-mono text-[12px] text-[var(--foreground)]">web/.env.local</code></li>
            <li>Invite staff and define roles under Staff & Access</li>
            <li>Load products, then open POS for the first sale</li>
          </ol>
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-white p-5">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
            Shortcuts
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {shortcuts.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--foreground)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--background)]"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
