import { PageHeader } from "./PageHeader";

type ModulePageProps = {
  title: string;
  description: string;
  section?: string;
  children?: React.ReactNode;
};

export function ModulePage({
  title,
  description,
  section = "Module",
  children,
}: ModulePageProps) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
        {section}
      </p>
      <PageHeader title={title} description={description} />
      {children ?? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-white/70 p-8">
          <p className="text-sm font-medium text-[var(--foreground)]">
            Scaffold ready
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            This module is wired into navigation. Data models and workflows land
            in the next build phases.
          </p>
        </div>
      )}
    </div>
  );
}
