"use client"

import * as React from "react"
import { Suspense } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ArrowLeftIcon, BadgeCheckIcon, BellIcon, CheckCheckIcon, LogOutIcon, SearchIcon, SunIcon } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"

import { DynamicIsland, DynamicIslandView, SHELL_SPRING } from "@/components/motion/dynamic-island"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/sonner"
import { dismissIsland, holdIsland, useIslandToast, type IslandToast } from "@/lib/island-toast"

function toastClass(notice: IslandToast | null) {
  const message = notice?.message ?? ""
  const short = message.trim().split(/\s+/).filter(Boolean).length <= 2
  const red = notice?.tone === "error" || message.toLowerCase().includes("deleted")
  return [
    "text-center text-sm",
    short ? "whitespace-nowrap" : "",
    red ? "text-red-400" : "text-foreground",
  ].join(" ")
}
import { useTheme } from "next-themes"

import { money } from "@/lib/flow/format"
import { isNavActive, matchModule, matchNav, navForShell } from "@/lib/nav"
import { profileUpdatedEvent } from "@/lib/profile"
import { resolveShell } from "@/lib/shell"
import { createClient } from "@/lib/supabase/client"

const outlineControl = "border-border transition-none!"

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function sidebarHidden(pathname: string) {
  const path = pathname.split("?")[0]?.replace(/\/$/, "") || "/"
  return path === "/app" || path.startsWith("/app/setup")
}

function HeaderAccount() {
  const router = useRouter()
  const { setTheme } = useTheme()
  const [user, setUser] = React.useState({ name: "Account", email: "", avatar: "" })

  React.useEffect(() => {
    const supabase = createClient()
    let active = true
    async function load() {
      const { data } = await supabase.auth.getUser()
      const current = data.user
      if (!current || !active) return
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, email")
        .eq("id", current.id)
        .maybeSingle()
      if (!active) return
      const email = profile?.email || current.email || ""
      setUser({ name: profile?.display_name?.trim() || email || "Account", email, avatar: "" })
    }
    void load()
    const refresh = () => void load()
    window.addEventListener(profileUpdatedEvent, refresh)
    return () => {
      active = false
      window.removeEventListener(profileUpdatedEvent, refresh)
    }
  }, [])

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  const fallback = initials(user.name) || "A"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button type="button" variant="outline" size="icon" className={outlineControl} aria-label={user.name} />
        }
      >
        <Avatar className="size-6">
          <AvatarImage src={user.avatar} alt={user.name} />
          <AvatarFallback className="text-xs">{fallback}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="p-0 font-normal">
            <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
              <Avatar className="size-8">
                <AvatarFallback>{fallback}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </div>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href="/app/account" />}>
            <BadgeCheckIcon />
            Account
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/app/account/settings" />}>
            <BellIcon />
            Notifications
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <SunIcon />
              Theme
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={() => setTheme("light")}>Light</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("dark")}>Dark</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void signOut()}>
          <LogOutIcon />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type HeaderNotice = {
  id: string
  title: string
  detail: string
  time: string
  unread: boolean
}

function HeaderNotifications() {
  const [items, setItems] = React.useState<HeaderNotice[]>([])
  const fresh = items.filter((item) => item.unread)
  const earlier = items.filter((item) => !item.unread)
  const unread = fresh.length

  function markRead(id: string) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, unread: false } : item)))
  }

  function markAllRead() {
    setItems((current) => current.map((item) => ({ ...item, unread: false })))
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={`relative ${outlineControl}`}
            aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          />
        }
      >
        <BellIcon />
        {unread > 0 ? (
          <span className="absolute top-0.5 right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground tabular-nums">
            {unread}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        collisionPadding={12}
        collisionAvoidance={{ side: "shift", align: "shift", fallbackAxisSide: "none" }}
        className="w-[min(23.5rem,calc(100vw-2rem))] max-h-[min(42rem,calc(100dvh-6rem))] gap-0 overflow-hidden rounded-2xl p-0 shadow-[0_0_0_1px_rgb(0_0_0/0.07),0_24px_48px_-12px_rgb(0_0_0/0.22)] dark:shadow-[0_0_0_1px_rgb(255_255_255/0.1),0_24px_48px_-12px_rgb(0_0_0/0.6)]"
      >
        <div className="flex h-12 shrink-0 items-center justify-between gap-3 pr-2 pl-4">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            Notifications
            {unread > 0 ? (
              <span className="rounded-full bg-muted px-1.5 text-xs leading-5 text-muted-foreground tabular-nums">
                {unread} new
              </span>
            ) : null}
          </h2>
          <button
            type="button"
            onClick={markAllRead}
            disabled={unread === 0}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:text-muted-foreground disabled:hover:bg-transparent"
          >
            <CheckCheckIcon className="size-4" />
            Mark all read
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-2 pb-2">
          {fresh.length > 0 ? (
            <section aria-label="New">
              <h3 className="px-2 pt-3 pb-1 text-xs font-medium text-muted-foreground">New</h3>
              <ul>
                {fresh.map((item) => (
                  <NoticeRow key={item.id} item={item} onRead={() => markRead(item.id)} />
                ))}
              </ul>
            </section>
          ) : null}
          <div className="my-2 overflow-hidden rounded-lg bg-muted/40 px-4 pt-5 pb-4 text-center">
            <p className="text-sm font-medium">{unread ? "That's everything new" : "You're all caught up"}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {earlier.length ? "Earlier notifications are below." : "Sales, staff changes, and organization updates show up here."}
            </p>
          </div>
          {earlier.length > 0 ? (
            <section aria-label="Earlier">
              <h3 className="px-2 pt-3 pb-1 text-xs font-medium text-muted-foreground">Earlier</h3>
              <ul>
                {earlier.map((item) => (
                  <NoticeRow key={item.id} item={item} onRead={() => markRead(item.id)} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function NoticeRow({ item, onRead }: { item: HeaderNotice; onRead: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onRead}
        className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/70 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-card text-muted-foreground shadow-[0_0_0_1px_var(--color-border)]">
          <BellIcon className="size-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={`truncate text-sm font-medium ${item.unread ? "text-foreground" : "text-foreground/70"}`}>
            {item.title}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {item.detail}, {item.time} ago
          </span>
        </span>
        <span
          aria-hidden
          className={`size-2 shrink-0 rounded-full bg-teal-500 transition-[opacity,scale] ${item.unread ? "" : "scale-50 opacity-0"}`}
        />
        {item.unread ? <span className="sr-only">Unread</span> : null}
      </button>
    </li>
  )
}

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

function backHref(pathname: string) {
  const path = pathname.split("?")[0]?.replace(/\/$/, "") || "/"
  if (path.startsWith("/app/setup")) return "/app"
  return null
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
  const [feedbackOpen, setFeedbackOpen] = React.useState(false)
  const [feedback, setFeedback] = React.useState("")
  const back = backHref(pathname)
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const searchRef = React.useRef<HTMLInputElement>(null)
  const hoverRef = React.useRef(false)
  const focusSearch = React.useRef(false)
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
  const confirm = notice?.confirm
  const islandRef = React.useRef<HTMLDivElement>(null)
  const view = confirm ? "confirm" : receipt ? "receipt" : notice ? "toast" : hover || open ? "search" : null

  React.useEffect(() => {
    if (!confirm) return
    function onPointerDown(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Node) || islandRef.current?.contains(target)) return
      dismissIsland()
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [confirm, notice?.id])

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
      event.preventDefault()
      focusSearch.current = true
      setOpen(true)
      const input = searchRef.current
      if (!input) return
      focusSearch.current = false
      input.focus()
      input.select()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  React.useEffect(() => {
    if (view !== "search" || !focusSearch.current) return
    focusSearch.current = false
    const input = searchRef.current
    if (!input) return
    input.focus()
    input.select()
  }, [view])

  function onSearchKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && query === "") {
      setOpen(false)
      return
    }
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
    setOpen(false)
    hoverRef.current = false
    router.push(href)
  }

  const reduceMotion = useReducedMotion()
  const headerRef = React.useRef<HTMLElement>(null)
  const [floating, setFloating] = React.useState(false)
  const [barHeight, setBarHeight] = React.useState(48)

  React.useEffect(() => {
    const update = () => {
      const scrolling = document.scrollingElement
      const header = headerRef.current
      if (!scrolling || !header) return
      setBarHeight(header.clientHeight)
      const canScroll = scrolling.scrollHeight > scrolling.clientHeight + 1
      setFloating(canScroll && scrolling.scrollTop > 8)
    }
    update()
    window.addEventListener("scroll", update, { passive: true })
    window.addEventListener("resize", update)
    const observer = new ResizeObserver(update)
    observer.observe(document.body)
    if (headerRef.current) observer.observe(headerRef.current)
    return () => {
      window.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
      observer.disconnect()
    }
  }, [])

  return (
    <header ref={headerRef} className="pointer-events-none sticky top-0 z-30 h-12 overflow-visible">
      <motion.div
        initial={false}
        animate={
          floating
            ? { left: 12, right: 12, top: 8, height: barHeight, borderRadius: 16 }
            : { left: 0, right: 0, top: 0, height: barHeight, borderRadius: 0 }
        }
        transition={
          reduceMotion
            ? { duration: 0 }
            : floating
              ? SHELL_SPRING
              : { type: "spring", duration: 0.22, bounce: 0 }
        }
        className="pointer-events-auto absolute bg-background/60 ring-1 ring-foreground/10 backdrop-blur-xl"
      >
      <div className="absolute inset-y-0 left-0 z-10 flex items-center gap-2 px-4">
        {sidebarHidden(pathname) ? (
          back ? (
            <Button variant="outline" size="icon" className={outlineControl} aria-label="Back" render={<Link href={back} />}>
              <ArrowLeftIcon />
            </Button>
          ) : null
        ) : (
          <SidebarTrigger className="-ml-1 transition-none!" />
        )}
        <Separator orientation="vertical" className="mr-2 data-vertical:h-4 data-vertical:self-auto" />
        <Suspense fallback={<div className="h-4 w-28 rounded bg-muted" />}>
          <HeaderBreadcrumb />
        </Suspense>
      </div>
      <div className="absolute inset-y-0 right-0 z-10 flex items-center gap-1 px-4">
        {shell.businessId ? (
          <Button variant="outline" size="sm" className={`h-8 ${outlineControl}`} render={<Link href={`/app/${shell.businessId}/help`} />}>
            Help
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={`h-8 ${outlineControl}`}
          onClick={() => setFeedbackOpen(true)}
        >
          Feedback
        </Button>
        <HeaderNotifications />
        <HeaderAccount />
      </div>
      <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
        <div
          ref={islandRef}
          className="pointer-events-auto relative"
          onMouseEnter={() => {
            hoverRef.current = true
            setHover(true)
            if (notice?.receipt) holdIsland(true)
          }}
          onMouseLeave={() => {
            hoverRef.current = false
            setHover(false)
            holdIsland(false)
            if (document.activeElement !== searchRef.current) setOpen(false)
          }}
        >
          <DynamicIsland
            view={view}
            compact={
              <Link href={home} className="flex size-8 items-center justify-center text-foreground" aria-label="Comera">
                <Mark className="size-5" />
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
                onBlur={() => {
                  if (!hoverRef.current) setOpen(false)
                }}
                placeholder="Search"
                aria-label="Search"
                role="combobox"
                aria-expanded={hits.length > 0}
                aria-controls="island-search-results"
                aria-activedescendant={hits[active] ? `island-hit-${active}` : undefined}
                className="h-full w-full bg-transparent px-10 text-left text-sm text-foreground outline-none placeholder:text-center placeholder:text-muted-foreground"
              />
              <SearchIcon className="pointer-events-none absolute right-3.5 size-4 text-muted-foreground" />
            </DynamicIslandView>
            <DynamicIslandView id="confirm" className="w-72 flex-col items-stretch gap-3 px-3.5 py-3">
              <p className="text-center text-sm">{notice?.message}</p>
              <Button
                type="button"
                variant={notice?.confirm?.destructive ? "destructive" : "default"}
                onClick={() => {
                  const run = notice?.confirm?.run
                  dismissIsland()
                  run?.()
                }}
              >
                {notice?.confirm?.label ?? "Confirm"}
              </Button>
            </DynamicIslandView>
            <DynamicIslandView id="toast" className="px-4 py-2">
              <span className={toastClass(notice)}>{notice?.message}</span>
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
          {!notice && view === "search" && hits.length > 0 ? (
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
      </motion.div>
      <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Feedback</DialogTitle>
            <DialogDescription>Tell us what is working and what is in the way.</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              if (!feedback.trim()) return
              setFeedback("")
              setFeedbackOpen(false)
              toast.success("Feedback sent.")
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="header-feedback">Message</Label>
              <Textarea id="header-feedback" value={feedback} required onChange={(event) => setFeedback(event.target.value)} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={feedback.trim() === ""}>Send</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </header>
  )
}
