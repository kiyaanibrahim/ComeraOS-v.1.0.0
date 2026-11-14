"use client"

import { useEffect, useId, useRef, useState } from "react"
import Link from "next/link"

const links = [
  { href: "#product", label: "Product" },
  { href: "#features", label: "Features" },
  { href: "#businesses", label: "Portfolio" },
  { href: "#pricing", label: "Pricing" },
]

const items = [
  { href: "#product", label: "Product", note: "The desks a working day actually uses." },
  { href: "#features", label: "Features", note: "Staff, orders, books, and the people you sell to." },
  { href: "#businesses", label: "Portfolio", note: "Every business you open, on one owner desk." },
  { href: "#pricing", label: "Pricing", note: "Starter, Complete, and Owner. Each plan is $0 a month." },
  { href: "/login", label: "Log in", note: "Open a desk that already belongs to you." },
  { href: "/signup", label: "Get started", note: "A new account opens an empty desk." },
]

export function SiteHeader() {
  const [open, setOpen] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [origin, setOrigin] = useState("calc(100% - 3rem) 2.5rem")
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return

    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    panelRef.current?.querySelector("a")?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)

    return () => {
      document.body.style.overflow = previous
      window.removeEventListener("keydown", onKey)
      buttonRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    let last = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      const delta = y - last
      if (Math.abs(delta) > 6) {
        setHidden(!open && delta > 0 && y > 72)
        last = y
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [open])

  function toggle() {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) {
      setOrigin(`${rect.left + rect.width / 2}px ${rect.top + rect.height / 2}px`)
    }
    setHidden(false)
    setOpen((value) => !value)
  }

  return (
    <>
      <header
        className={`float-nav${hidden ? " is-hidden" : ""}`}
        onFocus={() => setHidden(false)}
      >
        <div className={`float-bar${open ? " is-open" : ""}`}>
          <Link href="/" className="grid size-10 shrink-0 place-items-center" aria-label="ComeraOS" onClick={() => setOpen(false)}>
            <img
              src="/brand/mark.png"
              alt=""
              width={980}
              height={1024}
              className={`size-7 ${open ? "invert dark:invert-0" : "invert"}`}
            />
          </Link>

          <nav className={`float-links${open ? " is-open" : ""}`} aria-label="Sections" aria-hidden={open}>
            {links.map((link) => (
              <a key={link.href} href={link.href} className="float-link" tabIndex={open ? -1 : undefined}>
                {link.label}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <Link
              href="/signup"
              className={`float-cta${open ? " is-open" : ""}`}
              tabIndex={open ? -1 : undefined}
              aria-hidden={open}
            >
              Get started
            </Link>
            <button
              ref={buttonRef}
              type="button"
              className={`nav-toggle${open ? " is-open" : ""}`}
              aria-expanded={open}
              aria-controls="site-index"
              onClick={toggle}
            >
              <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
              <span className="nav-toggle-bars" aria-hidden="true">
                <span className="nav-toggle-line" />
                <span className="nav-toggle-line" />
              </span>
            </button>
          </div>
        </div>
      </header>

      <div
        id="site-index"
        ref={panelRef}
        role="dialog"
        aria-modal={open}
        aria-labelledby={titleId}
        aria-hidden={!open}
        inert={open ? undefined : true}
        className={`nav-flood${open ? " is-open" : ""}`}
        style={{ ["--nav-origin" as string]: origin }}
      >
        <div className="mx-auto flex h-full max-w-6xl flex-col px-5 pb-8 pt-28">
          <p id={titleId} className="text-xs font-medium tracking-[0.22em] uppercase opacity-60">
            Index
          </p>
          <nav className="nav-list mt-6" aria-label="Page">
            {items.map((item, index) => (
              <Link
                key={item.href}
                href={item.href}
                className="nav-strip"
                onClick={() => setOpen(false)}
              >
                <span className="nav-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="min-w-0">
                  <span className="nav-label">{item.label}</span>
                  <span className="nav-note">{item.note}</span>
                </span>
                <span className="nav-go" aria-hidden="true">
                  →
                </span>
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </>
  )
}
