"use client";

import { Search, Bell, ChevronDown } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase/client";

export function TopBar() {
  const supabaseReady = isSupabaseConfigured();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm text-[var(--foreground)]"
        >
          <span className="font-medium">Demo Colony</span>
          <ChevronDown className="h-3.5 w-3.5 text-[var(--muted)]" />
        </button>
        <span className="hidden text-xs text-[var(--muted)] sm:inline">
          Location: Main Store
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative hidden md:block">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted)]" />
          <input
            type="search"
            placeholder="Search ComeraOS"
            className="h-8 w-56 rounded-md border border-[var(--border)] bg-white pr-3 pl-8 text-sm outline-none focus:border-[var(--accent)]"
          />
        </div>

        <span
          className={
            supabaseReady
              ? "rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium text-emerald-800"
              : "rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-800"
          }
          title={
            supabaseReady
              ? "Supabase env vars detected"
              : "Add Supabase keys in web/.env.local"
          }
        >
          {supabaseReady ? "Supabase ready" : "Supabase not configured"}
        </span>

        <button
          type="button"
          className="rounded-md border border-[var(--border)] p-2 text-[var(--muted)] hover:bg-black/3"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
        </button>

        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--sidebar)] text-xs font-semibold text-white">
          U
        </div>
      </div>
    </header>
  );
}
