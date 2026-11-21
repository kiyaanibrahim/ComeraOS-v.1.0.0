"use client"

import * as React from "react"
import { Suspense } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { SearchIcon } from "lucide-react"

import { DynamicIsland, DynamicIslandView } from "@/components/motion/dynamic-island"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"
import { holdIsland, useIslandToast } from "@/lib/island-toast"
import { money } from "@/lib/flow/format"
import { isNavActive, matchModule, matchNav, navForShell } from "@/lib/nav"
import { resolveShell } from "@/lib/shell"
import { createClient } from "@/lib/supabase/client"

function HeaderBreadcrumb() {
  const pathname = usePathname()
  const shell = resolveShell(pathname)
  const module = matchModule(pathname, shell.businessId)
  const moduleHref = module?.items.map((item) => item.href) ?? []
  const moduleItem = module?.items
    .filter((item) => isNavActive(pathname, item.href, moduleHref))
    .sort((a, b) => b.href.length - a.href.length)[0]
  const match = module ? null : matchNav(pathname, navForShell(shell))

  const section = module?.title ?? match?.section
  const page = moduleItem?.label ?? match?.label
  const sectionHref = module?.items[0]?.href ?? match?.sectionHref ?? "/app"
  const showPair = Boolean(section && page && section !== page)

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {showPair ? (
          <>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink render={<Link href={sectionHref} />}>{section}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>{page}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ) : (
          <BreadcrumbItem>
            <BreadcrumbPage>
              {page ?? (shell.layer === "businesses" ? "Business portfolio" : "Home")}
            </BreadcrumbPage>
          </BreadcrumbItem>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="24 0 1086 1134" className={className} aria-hidden>
      <g transform="translate(24 0)">
        <path fill="currentColor" d="M567 0C768.766 0 901.755 93.3215 1008.92 222.634C1069.56 295.798 1016.76 402.867 922.482 414.793C892.034 418.645 861.473 407.059 840.349 384.794C771.289 312.002 688.439 246 567 246C387.507 246 242 387.507 242 567C242 746.493 387.507 888 567 888C688.671 888 785.671 811.382 847.522 749.863C865.191 732.288 889.253 722.447 914.121 724.078C1012.78 730.55 1071.12 838.313 1007.5 913.996C902.984 1038.33 762.097 1134 567 1134C253.855 1134 0 880.145 0 567C0 253.855 253.855 0 567 0Z" />
        <path fill="currentColor" d="M1086 569C1086 633.617 1033.62 686 969 686C904.383 686 852 633.617 852 569C852 504.383 904.383 452 969 452C1033.62 452 1086 504.383 1086 569Z" />
      </g>
    </svg>
  )
}

function destinations(pathname: string) {
  const shell = resolveShell(pathname)
  const items = navForShell(shell).flatMap((section) =>
    section.items.map((item) => ({
      label: item.label,
      href: item.href,
      group: section.title,
      keywords: [section.title, ...(section.keywords ?? [])],
    })),
  )
  if (shell.businessId) {
    items.unshift({ label: "Portfolio", href: "/app", group: "Home", keywords: ["Home", "Portfolio"] })
    items.push({ label: "Help", href: `/app/${shell.businessId}/help`, group: "Help", keywords: ["Help"] })
  }
  return items
}

export function AppHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const shell = resolveShell(pathname)
  const notice = useIslandToast()
  const home = shell.businessId ? `/app/${shell.businessId}` : "/app"
  const [hover, setHover] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const searchRef = React.useRef<HTMLInputElement>(null)
  const [businesses, setBusinesses] = React.useState<{ name: string; slug: string }[]>([])
  const links = destinations(pathname)
  const needle = query.trim().toLowerCase()
  const pageHits = needle
    ? links
        .filter((item) => {
          if (item.label.toLowerCase().includes(needle)) return true
          if (needle.length < 3) return false
          return item.keywords.some((word) => word.toLowerCase().includes(needle))
        })
        .slice(0, 12)
    : []
  const businessHits = needle
    ? businesses.filter((business) => business.name.toLowerCase().includes(needle)).slice(0, 4)
    : []
  const hits = [
    ...pageHits.map((item) => ({ key: item.href, label: item.label, href: item.href, group: item.group })),
    ...businessHits.map((business) => ({ key: business.slug, label: business.name, href: `/app/${business.slug}`, group: "Business" })),
  ]
  const [active, setActive] = React.useState(0)
  const receipt = notice?.receipt
  const view = receipt ? "receipt" : notice ? "toast" : "search"

  React.useEffect(() => {
    if (receipt && hover) holdIsland(true)
  }, [receipt, hover])

  React.useEffect(() => {
    const supabase = createClient()
    void supabase.from("businesses").select("name, slug").order("name").limit(8).then(({ data }) => setBusinesses(data ?? []))
  }, [])

  React.useEffect(() => {
    setActive(0)
  }, [needle])

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.repeat || event.altKey || event.shiftKey) return
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) return
      const input = searchRef.current
      if (!input) return
      event.preventDefault()
      input.focus()
      input.select()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  function onSearchKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (hits.length === 0) {
      if (event.key === "Escape") setQuery("")
      return
    }
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActive((index) => (index + 1) % hits.length)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActive((index) => (index - 1 + hits.length) % hits.length)
    } else if (event.key === "Enter") {
      event.preventDefault()
      const hit = hits[active] ?? hits[0]
      if (hit) go(hit.href)
    } else if (event.key === "Escape") {
      setQuery("")
    }
  }

  function go(href: string) {
    setQuery("")
    setHover(false)
    router.push(href)
  }

  return (
    <header className="relative flex h-16 shrink-0 items-center justify-between gap-2 overflow-visible group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      <div className="flex min-w-0 items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 data-vertical:h-4 data-vertical:self-auto" />
        <Suspense fallback={<div className="h-4 w-28 rounded bg-muted" />}>
          <HeaderBreadcrumb />
        </Suspense>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-2 z-40 flex justify-center">
        <div
          className="pointer-events-auto relative"
          onMouseEnter={() => {
            setHover(true)
            if (notice?.receipt) holdIsland(true)
          }}
          onMouseLeave={() => {
            setHover(false)
            holdIsland(false)
          }}
        >
          <DynamicIsland
            view={view}
            compact={
              <Link href={home} className="flex size-8 items-center justify-center text-foreground" aria-label="Comera">
                <Mark className="size-6" />
              </Link>
            }
          >
            <DynamicIslandView id="search" className="relative h-9 w-60 items-center">
              <Link href={home} className="absolute left-3 z-10 flex h-9 items-center justify-center text-foreground" aria-label="Comera">
                <Mark className="size-5" />
              </Link>
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onSearchKey}
                placeholder="Search"
                aria-label="Search"
                role="combobox"
                aria-expanded={hits.length > 0}
                aria-controls="island-search-results"
                aria-activedescendant={hits[active] ? `island-hit-${active}` : undefined}
                className="h-full w-full bg-transparent px-10 text-center text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              <SearchIcon className="pointer-events-none absolute right-3.5 size-4 text-muted-foreground" />
            </DynamicIslandView>
            <DynamicIslandView id="toast" className="px-4 py-2">
              <span className={notice?.tone === "error" ? "text-sm text-red-400" : "text-sm text-emerald-400"}>
                {notice?.message}
              </span>
            </DynamicIslandView>
            <DynamicIslandView id="receipt" className="w-72 flex-col items-stretch p-0">
              {receipt ? (
                <>
                  <div id="island-receipt" className="flex w-full flex-col px-3.5 pt-3 pb-2 text-left">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-[15px] font-medium text-positive">Completed</p>
                      <p className="text-xs text-muted-foreground tabular-nums">{receipt.billNumber}</p>
                    </div>
                    {receipt.lines.length > 0 ? (
                      <div className="mt-2.5 flex flex-col gap-1.5">
                        {receipt.lines.map((line, index) => (
                          <div key={`${line.name}-${index}`} className="flex items-baseline justify-between gap-3 text-[13px] leading-5">
                            <span className="min-w-0 truncate">
                              {line.name}
                              <span className="text-muted-foreground"> × {line.quantity}</span>
                            </span>
                            <span className="shrink-0 text-muted-foreground tabular-nums">{money(line.amount, receipt.currency)}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-2.5 flex flex-col gap-1 border-t border-foreground/10 pt-2 text-[13px] leading-5">
                      <div className="flex justify-between gap-3 text-muted-foreground">
                        <span>Subtotal</span>
                        <span className="tabular-nums">{money(receipt.subtotal, receipt.currency)}</span>
                      </div>
                      {receipt.discount > 0 ? (
                        <div className="flex justify-between gap-3 text-muted-foreground">
                          <span>Discount</span>
                          <span className="tabular-nums">{money(receipt.discount, receipt.currency)}</span>
                        </div>
                      ) : null}
                      {receipt.tax > 0 ? (
                        <div className="flex justify-between gap-3 text-muted-foreground">
                          <span>Tax</span>
                          <span className="tabular-nums">{money(receipt.tax, receipt.currency)}</span>
                        </div>
                      ) : null}
                      <div className="flex justify-between gap-3 pt-0.5 font-medium">
                        <span>Total</span>
                        <span className="tabular-nums">{money(receipt.total, receipt.currency)}</span>
                      </div>
                      {receipt.tendered !== null ? (
                        <div className="flex justify-between gap-3 text-muted-foreground">
                          <span>Tendered</span>
                          <span className="tabular-nums">{money(receipt.tendered, receipt.currency)}</span>
                        </div>
                      ) : null}
                      {receipt.change !== null ? (
                        <div className="flex justify-between gap-3 text-muted-foreground">
                          <span>Change</span>
                          <span className="tabular-nums">{money(receipt.change, receipt.currency)}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="px-2.5 pb-2.5 print:hidden">
                    <Button type="button" variant="secondary" className="w-full" onClick={() => window.print()}>
                      Print
                    </Button>
                  </div>
                </>
              ) : null}
            </DynamicIslandView>
          </DynamicIsland>
          {!notice && hits.length > 0 ? (
            <div id="island-search-results" role="listbox" className="absolute top-full left-1/2 z-50 mt-2 w-72 -translate-x-1/2 rounded-xl border bg-popover p-1 text-popover-foreground shadow-md">
              {hits.map((hit, index) => (
                <button
                  key={hit.key}
                  id={`island-hit-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  className={`flex w-full items-baseline justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground ${index === active ? "bg-accent text-accent-foreground" : ""}`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => go(hit.href)}
                >
                  <span className="min-w-0 truncate">{hit.label}</span>
                  {hit.group && hit.group !== hit.label ? <span className="shrink-0 text-xs opacity-70">{hit.group}</span> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-1 px-4">
        {shell.businessId ? (
          <Button variant="ghost" size="sm" className="h-8" render={<Link href={`/app/${shell.businessId}/help`} />}>
            Help
          </Button>
        ) : null}
        <ThemeToggle />
      </div>
    </header>
  )
}
