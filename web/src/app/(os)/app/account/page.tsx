import Link from "next/link";
import { ModulePage } from "@/components/shell/ModulePage";

const links = [
  { href: "/app/account/personal", label: "Personal Information" },
  { href: "/app/account/security", label: "Security & Privacy" },
  { href: "/app/account/settings", label: "Account Settings" },
];

export default function AccountPage() {
  return (
    <ModulePage
      section="Account"
      title="Profile Overview"
      description="Your ComeraOS identity at a glance."
    >
      <div className="rounded-xl border border-[var(--border)] bg-white p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--sidebar)] text-lg font-semibold text-white">
            U
          </div>
          <div>
            <p className="font-[family-name:var(--font-display)] text-lg font-semibold">
              Demo User
            </p>
            <p className="text-sm text-[var(--muted)]">demo@comera.os</p>
          </div>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:border-[var(--accent)] hover:bg-[var(--background)]"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </ModulePage>
  );
}
