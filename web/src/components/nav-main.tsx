"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import { isNavActive } from "@/lib/nav"
import { ChevronRightIcon } from "lucide-react"

export function NavMain({
  label,
  items,
}: {
  label?: string
  items: {
    title: string
    url: string
    icon?: React.ReactNode
    isActive?: boolean
    drill?: boolean
    onSelect?: () => void
    items?: {
      title: string
      url: string
    }[]
  }[]
}) {
  return (
    <SidebarGroup>
      {label ? <SidebarGroupLabel>{label}</SidebarGroupLabel> : null}
      <SidebarMenu className="gap-1">
        {items.map((item) => (
          <NavMainItem key={item.title} item={item} />
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}

function NavMainItem({
  item,
}: {
  item: {
    title: string
    url: string
    icon?: React.ReactNode
    isActive?: boolean
    drill?: boolean
    onSelect?: () => void
    items?: {
      title: string
      url: string
    }[]
  }
}) {
  const pathname = usePathname()
  const hrefs = item.items?.map((subItem) => subItem.url) ?? []
  const sectionActive = item.items?.some((subItem) => isNavActive(pathname, subItem.url, hrefs)) ?? false
  const [open, setOpen] = React.useState(sectionActive || Boolean(item.isActive))

  React.useEffect(() => {
    if (sectionActive) {
      setOpen(true)
    }
  }, [sectionActive])

  if (!item.items?.length) {
    const active = item.isActive ?? isNavActive(pathname, item.url, [item.url])
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          tooltip={item.title}
          isActive={active}
          onClick={item.onSelect}
          render={item.onSelect ? undefined : <Link href={item.url} />}
        >
          {item.icon}
          <span>{item.title}</span>
          {item.drill ? <ChevronRightIcon className="ml-auto" /> : null}
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="group/collapsible"
      render={<SidebarMenuItem />}
    >
      <CollapsibleTrigger render={<SidebarMenuButton tooltip={item.title} />}>
        {item.icon}
        <span>{item.title}</span>
        <ChevronRightIcon className="ml-auto transition-transform duration-200 group-data-open/collapsible:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <SidebarMenuSub>
          {item.items?.map((subItem) => (
            <SidebarMenuSubItem key={subItem.url}>
              <SidebarMenuSubButton
                isActive={isNavActive(pathname, subItem.url, hrefs)}
                render={<Link href={subItem.url} />}
              >
                <span>{subItem.title}</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  )
}
