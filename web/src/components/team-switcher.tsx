"use client"

import Link from "next/link"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import type { Business } from "@/lib/businesses"
import { withBusiness, type ShellLayer } from "@/lib/shell"
import {
  ChevronsUpDownIcon,
  GalleryVerticalEndIcon,
  LayoutDashboardIcon,
  OrbitIcon,
  ShieldIcon,
} from "lucide-react"

function logoFor(layer: ShellLayer) {
  if (layer === "home") return <LayoutDashboardIcon />
  if (layer === "settings") return <OrbitIcon />
  if (layer === "admin") return <ShieldIcon />
  return <GalleryVerticalEndIcon />
}

export function LayerSwitcher({
  layer,
  business,
  businesses,
  pathname,
}: {
  layer: ShellLayer
  business: Business | null
  businesses: Business[]
  pathname: string
}) {
  const { isMobile } = useSidebar()

  if (layer === "businesses" || layer === "account") {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            isActive={pathname === "/app"}
            render={<Link href="/app" />}
          >
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <GalleryVerticalEndIcon />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">Business portfolio</span>
              <span className="truncate text-xs">All businesses</span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  const title = layer === "admin" ? "Admin" : (business?.name ?? "Business")
  const subtitle =
    layer === "admin" ? "Owner" : layer === "settings" ? "Settings" : "Business"
  const listed =
    business && !businesses.some((item) => item.id === business.id)
      ? [business, ...businesses]
      : businesses

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
              />
            }
          >
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              {logoFor(layer)}
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{title}</span>
              <span className="truncate text-xs">{subtitle}</span>
            </div>
            <ChevronsUpDownIcon className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-fit"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuItem render={<Link href="/app" />}>
                <GalleryVerticalEndIcon />
                Business portfolio
              </DropdownMenuItem>
              {layer === "home" && business ? (
                <DropdownMenuItem
                  render={<Link href={`/app/${business.id}/settings`} />}
                >
                  <OrbitIcon />
                  Settings
                </DropdownMenuItem>
              ) : null}
              {layer === "settings" && business ? (
                <DropdownMenuItem render={<Link href={`/app/${business.id}`} />}>
                  <LayoutDashboardIcon />
                  Back to business
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuGroup>
            {layer !== "admin" && business ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Businesses
                  </DropdownMenuLabel>
                  {listed.map((item) => (
                    <DropdownMenuItem
                      key={item.id}
                      render={
                        <Link href={withBusiness(pathname, business.id, item.id)} />
                      }
                    >
                      <span className="truncate">{item.name}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
