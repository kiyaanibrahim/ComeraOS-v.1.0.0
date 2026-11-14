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
import { presentBusiness, type Business } from "@/lib/businesses"
import { NavModule } from "@/components/nav-module"
import { matchModule, navForShell } from "@/lib/nav"
import { resolveShell } from "@/lib/shell"
import { createClient } from "@/lib/supabase/client"
import {
  BoxesIcon,
  FrameIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  MonitorIcon,
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
  "Point of Sale": MonitorIcon,
  Sales: ShoppingCartIcon,
  Customers: UsersIcon,
  Procurement: TruckIcon,
  Inventory: BoxesIcon,
  Financials: LandmarkIcon,
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
  }, [])
  const sections =
    shell.layer === "home" || shell.layer === "settings" || shell.layer === "admin"
      ? navForShell(shell)
      : []
  const label =
    shell.layer === "settings" ? "Business settings" : shell.layer === "admin" ? "Admin" : "Home"

  const module = matchModule(pathname, shell.businessId)
  const mainSections = module ? sections : sections.filter((section) => section.title !== "Business settings")
  const settingsSection = sections.find((section) => section.title === "Business settings")
  const navMain = mainSections.map((section) => {
    const Icon = sectionIcons[section.title] ?? Settings2Icon
    return {
      title: section.title,
      url: section.items[0]?.href ?? "#",
      icon: <Icon />,
      drill: section.drill,
      items:
        section.drill || section.items.length < 2
          ? undefined
          : section.items.map((item) => ({
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
          businesses={listed}
          pathname={pathname}
        />
      </SidebarHeader>
      <SidebarContent>
        {module ? (
          <NavModule module={module} />
        ) : (
          <>
            {navMain.length > 0 ? <NavMain label={label} items={navMain} /> : null}
            {shortcuts.length > 0 ? (
              <NavProjects label="Shortcuts" projects={shortcuts} />
            ) : null}
          </>
        )}
      </SidebarContent>
      <SidebarFooter>
        {settingsSection && module?.id !== "settings" ? (
          <NavMain
            items={[
              {
                title: settingsSection.title,
                url: settingsSection.items[0]?.href ?? "#",
                icon: <Settings2Icon />,
                drill: true,
              },
            ]}
          />
        ) : null}
        <SidebarUser />
      </SidebarFooter>
    </>
  )
}

function SidebarUser() {
  const [user, setUser] = React.useState({
    name: "Account",
    email: "",
    avatar: "",
  })

  React.useEffect(() => {
    const supabase = createClient()
    void supabase.auth.getUser().then(async ({ data }) => {
      const current = data.user
      if (!current) return
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, email")
        .eq("id", current.id)
        .maybeSingle()
      const email = profile?.email || current.email || ""
      const name = profile?.display_name || email || "Account"
      setUser({ name, email, avatar: "" })
    })
  }, [])

  return <NavUser user={user} />
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <Suspense fallback={<SidebarNavFallback />}>
        <SidebarNav />
      </Suspense>
      <SidebarRail />
    </Sidebar>
  )
}
