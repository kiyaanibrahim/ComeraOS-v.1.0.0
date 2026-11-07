"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navSections } from "@/lib/nav";
import { clsx } from "clsx";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--sidebar)] text-[var(--sidebar-fg)]">
      <div className="flex h-14 items-center gap-2 border-b border-white/10 px-4">
        <img
          src="/logo.png"
          alt="ComeraOS"
          width={32}
          height={32}
          className="h-8 w-8 rounded-md"
        />
        <div className="leading-tight">
          <p className="font-[family-name:var(--font-display)] text-sm font-semibold tracking-wide">
            ComeraOS
          </p>
          <p className="text-[11px] text-white/50">v1.0.0</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {navSections.map((section) => (
          <div key={section.title} className="mb-4">
            <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href;

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={clsx(
                        "block rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                        active
                          ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                          : "text-white/75 hover:bg-white/8 hover:text-white",
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
