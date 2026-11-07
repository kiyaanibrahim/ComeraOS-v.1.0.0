type StatCardProps = {
  label: string;
  value: string;
  hint?: string;
};

export function StatCard({ label, value, hint }: StatCardProps) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-[0_1px_0_rgba(20,30,20,0.04)]">
      <p className="text-xs font-medium tracking-wide text-[var(--muted)] uppercase">
        {label}
      </p>
      <p className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--foreground)]">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p> : null}
    </div>
  );
}
