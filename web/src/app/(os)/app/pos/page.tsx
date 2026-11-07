import { ModulePage } from "@/components/shell/ModulePage";

export default function PosPage() {
  return (
    <ModulePage
      section="Sell"
      title="POS"
      description="Point of sale terminal for the active location."
    >
      <div className="grid min-h-[420px] gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-[var(--border)] bg-white p-5">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
            Cart
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            No line items yet. Product catalog + inventory unlock live selling.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-2">
            {["Cash", "Card", "Other"].map((tender) => (
              <button
                key={tender}
                type="button"
                className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-3 text-sm font-medium hover:border-[var(--accent)]"
              >
                {tender}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--sidebar)] p-5 text-[var(--sidebar-fg)]">
          <p className="text-xs tracking-[0.14em] text-white/50 uppercase">
            Ticket total
          </p>
          <p className="mt-2 font-[family-name:var(--font-display)] text-4xl font-semibold">
            0.00
          </p>
          <p className="mt-4 text-sm text-white/60">
            Fullscreen POS mode and barcode scan land after catalog wiring.
          </p>
        </div>
      </div>
    </ModulePage>
  );
}
