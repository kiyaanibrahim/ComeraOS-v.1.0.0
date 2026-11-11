"use client"

import { Suspense } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { ThemeToggle } from "@/components/theme-toggle"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { isNavActive, matchModule, matchNav, navForShell } from "@/lib/nav"
import { resolveShell } from "@/lib/shell"

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
              <BreadcrumbLink render={<Link href={sectionHref} />}>
                {section}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>{page}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ) : (
          <BreadcrumbItem>
            <BreadcrumbPage>
              {page ??
                (shell.layer === "businesses" ? "Business portfolio" : "Home")}
            </BreadcrumbPage>
          </BreadcrumbItem>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

export function AppHeader() {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      <div className="flex items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 data-vertical:h-4 data-vertical:self-auto"
        />
        <Suspense fallback={<div className="h-4 w-28 rounded bg-muted" />}>
          <HeaderBreadcrumb />
        </Suspense>
      </div>
      <div className="flex items-center px-4">
        <ThemeToggle />
      </div>
    </header>
  )
}
