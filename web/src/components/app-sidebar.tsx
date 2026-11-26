"use client"

import * as React from "react"
import { Suspense } from "react"
import { usePathname } from "next/navigation"

import { LayerSwitcher } from "@/components/team-switcher"
import { NavMain } from "@/components/nav-main"
import { NavShortcuts } from "@/components/nav-shortcuts"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"
import { motion, useReducedMotion } from "motion/react"

import { presentBusiness, type Business } from "@/lib/businesses"
import { NavModule } from "@/components/nav-module"
import { matchModule, moduleByTitle, navForShell } from "@/lib/nav"
import { resolveShell } from "@/lib/shell"
import { createClient } from "@/lib/supabase/client"
import {
  BoxesIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  MonitorIcon,
  PackageIcon,
  TruckIcon,
  PieChartIcon,
  ScrollTextIcon,
  Settings2Icon,
  ShieldIcon,
  ShoppingCartIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react"

const sectionIcons: Record<string, LucideIcon> = {
  Home: LayoutDashboardIcon,
  "Point of Sale": MonitorIcon,
  Sales: ShoppingCartIcon,
  Customers: UsersIcon,
  Procurement: TruckIcon,
  Products: PackageIcon,
  Inventory: BoxesIcon,
  Financials: LandmarkIcon,
  Analytics: PieChartIcon,
  Reporting: ScrollTextIcon,
  Admin: ShieldIcon,
}

function SidebarNavFallback() {
  return (
    <SidebarHeader>
      <div className="h-12 rounded-lg bg-sidebar-accent/50" />
    </SidebarHeader>
  )
}

function SidebarNav() {
  const pathname = usePathname()
  const shell = resolveShell(pathname)
  const [listed, setListed] = React.useState<Business[]>([])
  const business = shell.businessId
    ? listed.find((item) => item.id === shell.businessId) ?? null
    : null

  React.useEffect(() => {
    const supabase = createClient()
    void supabase
      .from("businesses")
      .select("name, slug")
      .order("name")
      .then(({ data, error }) => {
        if (error || !data) {
          setListed([])
          return
        }
        setListed(data.map((row) => presentBusiness(row)))
      })
  }, [pathname])
  const sections =
    shell.layer === "home" || shell.layer === "settings" || shell.layer === "admin"
      ? navForShell(shell)
      : []
  const label =
    shell.layer === "settings" ? "Business settings" : shell.layer === "admin" ? "Admin" : "Home"

  const routeModule = matchModule(pathname, shell.businessId)
  const [trackedPath, setTrackedPath] = React.useState(pathname)
  const [pane, setPane] = React.useState<{ title: string } | "root" | null>(null)
  const [motionDirection, setMotionDirection] = React.useState<"idle" | "forward" | "back">("idle")
  if (pathname !== trackedPath) {
    setTrackedPath(pathname)
    setPane(null)
    setMotionDirection("idle")
  }

  const picked = pane && pane !== "root" ? moduleByTitle(shell.businessId, pane.title) : null
  const displayed = pane === "root" ? null : (picked ?? (pane === null ? routeModule : null))

  function openModule(title: string) {
    setMotionDirection("forward")
    setPane({ title })
  }

  function showRoot() {
    setMotionDirection("back")
    setPane("root")
  }

  const mainSections = sections.filter((section) => section.title !== "Business settings")
  const settingsSection = sections.find((section) => section.title === "Business settings")
  const navMain = mainSections.map((section) => {
    const Icon = sectionIcons[section.title] ?? Settings2Icon
    return {
      title: section.title,
      url: section.items[0]?.href ?? "#",
      icon: <Icon />,
      drill: section.drill,
      isActive: section.drill ? routeModule?.title === section.title : undefined,
      onSelect: section.drill ? () => openModule(section.title) : undefined,
      items:
        section.drill || section.items.length < 2
          ? undefined
          : section.items.map((item) => ({
              title: item.label,
              url: item.href,
            })),
    }
  })
  const reduceMotion = useReducedMotion()
  const slide =
    reduceMotion || motionDirection === "idle" ? false : { opacity: 0, x: motionDirection === "forward" ? 16 : -16 }

  return (
    <>
      <SidebarHeader>
        <LayerSwitcher
          layer={shell.layer}
          business={business}
          businesses={listed}
          pathname={pathname}
        />
      </SidebarHeader>
      <SidebarContent className="overflow-x-hidden">
        <motion.div
          key={displayed?.id ?? "root"}
          initial={slide}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          {displayed ? (
            <NavModule module={displayed} onBack={showRoot} />
          ) : (
            <>
              {navMain.length > 0 ? <NavMain label={label} items={navMain} /> : null}
              {shell.layer === "home" && shell.businessId ? <NavShortcuts businessKey={shell.businessId} /> : null}
            </>
          )}
        </motion.div>
      </SidebarContent>
      {settingsSection && displayed?.id !== "settings" ? (
        <SidebarFooter>
          <NavMain
            items={[
              {
                title: settingsSection.title,
                url: settingsSection.items[0]?.href ?? "#",
                icon: <Settings2Icon />,
                drill: true,
                isActive: routeModule?.id === "settings",
                onSelect: () => openModule(settingsSection.title),
              },
            ]}
          />
        </SidebarFooter>
      ) : null}
    </>
  )
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const path = pathname.split("?")[0]?.replace(/\/$/, "") || "/"
  if (path === "/app" || path.startsWith("/app/setup")) return null
  return (
    <Sidebar collapsible="icon" {...props}>
      <Suspense fallback={<SidebarNavFallback />}>
        <SidebarNav />
      </Suspense>
      <SidebarRail />
    </Sidebar>
  )
}
