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
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { matchNav, navForShell } from "@/lib/nav"
import { resolveShell } from "@/lib/shell"

function HeaderBreadcrumb() {
  const pathname = usePathname()
  const shell = resolveShell(pathname)
  const match = matchNav(pathname, navForShell(shell))

  const section = match?.section
  const page = match?.label
  const sectionHref = match?.sectionHref ?? "/app"
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
    <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
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
    </header>
  )
}
