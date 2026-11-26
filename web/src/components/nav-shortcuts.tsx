"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BoxesIcon,
  FrameIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  MonitorIcon,
  MoreHorizontalIcon,
  PackageIcon,
  PieChartIcon,
  PlusIcon,
  ScrollTextIcon,
  Settings2Icon,
  ShoppingCartIcon,
  Trash2Icon,
  TruckIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { toast } from "@/components/ui/sonner"
import { coreNav } from "@/lib/nav"
import { createClient } from "@/lib/supabase/client"

type Shortcut = { label: string; path: string }

const defaults: Shortcut[] = [
  { label: "POS", path: "pos" },
  { label: "Orders", path: "orders" },
  { label: "Inventory", path: "inventory" },
]

const sectionIcons: Record<string, LucideIcon> = {
  Home: LayoutDashboardIcon,
  "Point of Sale": MonitorIcon,
  "Online orders": ShoppingCartIcon,
  Sales: ShoppingCartIcon,
  Customers: UsersIcon,
  Procurement: TruckIcon,
  Products: PackageIcon,
  Inventory: BoxesIcon,
  Financials: LandmarkIcon,
  Analytics: PieChartIcon,
  Reporting: ScrollTextIcon,
  "Business settings": Settings2Icon,
}

function shortcutIcon(path: string) {
  const section = coreNav("business").find((item) =>
    item.items.some((page) => page.href === `/app/business/${path}` || page.href.endsWith(`/${path}`)),
  )
  const Icon = sectionIcons[section?.title ?? ""] ?? FrameIcon
  return <Icon />
}

export function NavShortcuts({ businessKey }: { businessKey: string }) {
  const pathname = usePathname()
  const { isMobile } = useSidebar()
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [saved, setSaved] = useState<Shortcut[] | null>(null)
  const [customized, setCustomized] = useState(false)
  const visible = customized ? (saved ?? []).filter((item) => item.path) : defaults
  const pages = coreNav(businessKey).flatMap((section) =>
    section.items.flatMap((item) => {
      const prefix = `/app/${businessKey}/`
      if (!item.href.startsWith(prefix)) return []
      const path = item.href.slice(prefix.length)
      if (!path || visible.some((shortcut) => shortcut.path === path)) return []
      return [{ section: section.title, label: item.label, path }]
    }),
  )
  const groups = [...new Set(pages.map((page) => page.section))]

  const load = useCallback(async () => {
    const supabase = createClient()
    const business = await supabase.from("businesses").select("id").eq("slug", businessKey).maybeSingle()
    if (business.error || !business.data) {
      setBusinessId(null)
      setSaved([])
      setCustomized(false)
      return
    }
    setBusinessId(business.data.id)
    const rows = await supabase
      .from("nav_shortcuts")
      .select("label, path, position")
      .eq("business_id", business.data.id)
      .order("position")
    if (rows.error) {
      toast.error(rows.error.message)
      setSaved([])
      setCustomized(false)
      return
    }
    setCustomized((rows.data ?? []).length > 0)
    setSaved((rows.data ?? []).filter((row) => row.path).map((row) => ({ label: row.label, path: row.path })))
  }, [businessKey])

  useEffect(() => {
    void load()
  }, [load])

  async function persist(next: Shortcut[]) {
    if (!businessId) return
    const supabase = createClient()
    const removed = await supabase.from("nav_shortcuts").delete().eq("business_id", businessId)
    if (removed.error) {
      toast.error(removed.error.message)
      return
    }
    const records = next.length
      ? next.map((item, position) => ({ business_id: businessId, label: item.label, path: item.path, position }))
      : [{ business_id: businessId, label: "", path: "", position: 0 }]
    const inserted = await supabase.from("nav_shortcuts").insert(records)
    if (inserted.error) {
      toast.error(inserted.error.message)
      await load()
      return
    }
    setCustomized(true)
    setSaved(next)
  }

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Shortcuts</SidebarGroupLabel>
      <SidebarMenu className="gap-1">
        {visible.map((item) => (
          <SidebarMenuItem key={item.path}>
            <SidebarMenuButton isActive={pathname === `/app/${businessKey}/${item.path}`} render={<Link href={`/app/${businessKey}/${item.path}`} />}>
              {shortcutIcon(item.path)}
              <span>{item.label}</span>
            </SidebarMenuButton>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuAction showOnHover className="aria-expanded:bg-muted" />}>
                <MoreHorizontalIcon />
                <span className="sr-only">More</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-fit" side={isMobile ? "bottom" : "right"} align={isMobile ? "end" : "start"}>
                <DropdownMenuItem onClick={() => void persist(visible.filter((shortcut) => shortcut.path !== item.path))}>
                  <Trash2Icon />
                  <span>Remove</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        ))}
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger render={<SidebarMenuButton />}>
              <PlusIcon />
              <span>Add shortcut</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-52" side={isMobile ? "bottom" : "right"} align="start">
              {groups.length === 0 ? (
                <DropdownMenuItem disabled>Every page is already pinned</DropdownMenuItem>
              ) : (
                groups.map((group) => (
                  <DropdownMenuSub key={group}>
                    <DropdownMenuSubTrigger>{group}</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {pages
                        .filter((page) => page.section === group)
                        .map((page) => (
                          <DropdownMenuItem key={page.path} onClick={() => void persist([...visible, { label: page.label, path: page.path }])}>
                            {page.label}
                          </DropdownMenuItem>
                        ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  )
}
