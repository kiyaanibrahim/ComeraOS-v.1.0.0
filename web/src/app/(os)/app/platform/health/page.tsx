import { ModulePage } from "@/components/shell/ModulePage";
import { StatCard } from "@/components/shell/StatCard";

export default function PlatformHealthPage() {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  return (
    <ModulePage
      section="Platform"
      title="Platform Health"
      description="Global integrity and service health signals."
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Supabase"
          value={configured ? "Configured" : "Pending keys"}
          hint={
            configured
              ? "Env vars present in this runtime"
              : "Set NEXT_PUBLIC_SUPABASE_URL and ANON_KEY"
          }
        />
        <StatCard label="API surface" value="Scaffold" hint="Nest/modules later" />
        <StatCard label="Integrity jobs" value="Idle" hint="Queue not started" />
      </div>
      <div className="rounded-xl border border-[var(--border)] bg-white p-5 text-sm text-[var(--muted)]">
        Free-tier Supabase is the data plane for auth, Postgres, and storage.
        Paste project credentials into <code className="rounded bg-[var(--background)] px-1 py-0.5 font-mono text-[12px] text-[var(--foreground)]">web/.env.local</code> then restart the dev server.
      </div>
    </ModulePage>
  );
}
