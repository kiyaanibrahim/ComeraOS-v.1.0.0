"use client"

import { useState } from "react"
import Link from "next/link"

const links = [
  { href: "#product", label: "Product" },
  { href: "#features", label: "Features" },
  { href: "#businesses", label: "Portfolio" },
  { href: "#pricing", label: "Pricing" },
]

export function SiteHeader() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <Link href="/" className="flex items-center" onClick={() => setOpen(false)}>
          <img
            src="/brand/logo-horizontal.png"
            alt="ComeraOS"
            width={1024}
            height={284}
            className="h-8 w-auto"
          />
        </Link>

        <nav className="hidden items-center gap-8 text-sm text-neutral-600 md:flex">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="transition-colors hover:text-neutral-950">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link
            href="/login"
            className="inline-flex h-9 items-center rounded-full px-4 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="inline-flex h-9 items-center rounded-full bg-[#ff4d1c] px-4 text-sm font-medium text-white transition-colors hover:bg-[#e84314]"
          >
            Get started
          </Link>
        </div>

        <button
          type="button"
          className="inline-flex h-9 items-center rounded-full border border-black/10 px-3 text-sm font-medium md:hidden"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>

      {open ? (
        <div className="border-t border-black/5 px-5 py-4 md:hidden">
          <nav className="flex flex-col gap-3 text-sm">
            {links.map((link) => (
              <a key={link.href} href={link.href} onClick={() => setOpen(false)} className="py-1">
                {link.label}
              </a>
            ))}
            <Link href="/login" onClick={() => setOpen(false)} className="py-1">
              Log in
            </Link>
            <Link
              href="/signup"
              onClick={() => setOpen(false)}
              className="inline-flex h-10 items-center justify-center rounded-full bg-[#ff4d1c] text-sm font-medium text-white"
            >
              Get started
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  )
}
