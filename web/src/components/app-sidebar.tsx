"use client"

import * as React from "react"
import { Suspense } from "react"
import { usePathname } from "next/navigation"

import { LayerSwitcher } from "@/components/team-switcher"
import { NavMain } from "@/components/nav-main"
import { NavProjects } from "@/components/nav-projects"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"
import { businesses, getBusiness } from "@/lib/businesses"
import { navForShell } from "@/lib/nav"
import { resolveShell } from "@/lib/shell"
import {
  BoxesIcon,
  Building2Icon,
  FrameIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  TruckIcon,
  MapIcon,
  PieChartIcon,
  Settings2Icon,
  ShieldIcon,
  ShoppingCartIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react"

const sectionIcons: Record<string, LucideIcon> = {
  Home: LayoutDashboardIcon,
  Sell: ShoppingCartIcon,
  Customers: UsersIcon,
  Procurement: TruckIcon,
  Inventory: BoxesIcon,
  Financials: LandmarkIcon,
  Settings: Building2Icon,
  Admin: ShieldIcon,
}

const user = {
  name: "Demo User",
  email: "demo@comera.os",
  avatar: "",
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
  const business = shell.businessId ? getBusiness(shell.businessId) : null
  const sections =
    shell.layer === "home" || shell.layer === "settings" || shell.layer === "admin"
      ? navForShell(shell)
      : []
  const label =
    shell.layer === "settings" ? "Settings" : shell.layer === "admin" ? "Admin" : "Home"

  const navMain = sections.map((section) => {
    const Icon = sectionIcons[section.title] ?? Settings2Icon
    return {
      title: section.title,
      url: section.items[0]?.href ?? "#",
      icon: <Icon />,
      items: section.items.map((item) => ({
        title: item.label,
        url: item.href,
      })),
    }
  })

  const shortcuts =
    shell.layer === "home" && shell.businessId
      ? [
          {
            name: "POS",
            url: `/app/${shell.businessId}/pos`,
            icon: <FrameIcon />,
          },
          {
            name: "Orders",
            url: `/app/${shell.businessId}/orders`,
            icon: <PieChartIcon />,
          },
          {
            name: "Inventory",
            url: `/app/${shell.businessId}/inventory`,
            icon: <MapIcon />,
          },
        ]
      : []

  return (
    <>
      <SidebarHeader>
        <LayerSwitcher
          layer={shell.layer}
          business={business}
          businesses={businesses}
          pathname={pathname}
        />
      </SidebarHeader>
      <SidebarContent>
        {navMain.length > 0 ? <NavMain label={label} items={navMain} /> : null}
        {shortcuts.length > 0 ? (
          <NavProjects label="Shortcuts" projects={shortcuts} />
        ) : null}
      </SidebarContent>
    </>
  )
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <Suspense fallback={<SidebarNavFallback />}>
        <SidebarNav />
      </Suspense>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
