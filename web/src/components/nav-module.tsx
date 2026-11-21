"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BoxesIcon,
  Building2Icon,
  ChevronLeftIcon,
  ClipboardListIcon,
  CreditCardIcon,
  FileTextIcon,
  HeartPulseIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  MapPinIcon,
  MonitorIcon,
  PackageIcon,
  ReceiptTextIcon,
  PuzzleIcon,
  ScrollTextIcon,
  Settings2Icon,
  ShieldIcon,
  ShoppingCartIcon,
  TagsIcon,
  TimerIcon,
  TruckIcon,
  UserRoundIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react"

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { isNavActive, type NavModule } from "@/lib/nav"

const itemIcons: Record<string, LucideIcon> = {
  Sell: ShoppingCartIcon,
  Register: MonitorIcon,
  "Register Sessions": TimerIcon,
  Quotes: ClipboardListIcon,
  Payments: CreditCardIcon,
  "Bill History": ReceiptTextIcon,
  Orders: ShoppingCartIcon,
  "Draft Orders": FileTextIcon,
  CRM: UsersIcon,
  "Shipment Tracker": TruckIcon,
  Purchasing: WalletIcon,
  Inventory: BoxesIcon,
  Products: PackageIcon,
  "Product Catalog": TagsIcon,
  Categories: TagsIcon,
  Batches: BoxesIcon,
  Expenses: WalletIcon,
  Capital: LandmarkIcon,
  Accounting: LandmarkIcon,
  Reporting: ScrollTextIcon,
  Overview: LayoutDashboardIcon,
  "Business config": Building2Icon,
  Locations: MapPinIcon,
  Registers: MonitorIcon,
  Staff: UsersIcon,
  "Payment & billing": CreditCardIcon,
  Extensions: PuzzleIcon,
  Features: Settings2Icon,
  "Enabled features": Settings2Icon,
  Plans: CreditCardIcon,
  "POS registers": MonitorIcon,
  "POS sessions": TimerIcon,
  Health: HeartPulseIcon,
  Audit: ShieldIcon,
  Users: UsersIcon,
  "Profile Overview": UserRoundIcon,
  "Personal Information": UserRoundIcon,
  "Security & Privacy": ShieldIcon,
  "Account Settings": Settings2Icon,
}

export function NavModule({ module }: { module: NavModule }) {
  const pathname = usePathname()
  const hrefs = module.items.map((item) => item.href)

  return (
    <SidebarGroup className="animate-in fade-in slide-in-from-left-2 duration-200">
      <SidebarGroupLabel className="sr-only">{module.title}</SidebarGroupLabel>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton tooltip="Home" render={<Link href={module.backHref} />}>
            <ChevronLeftIcon />
            <span>{module.title}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        {module.items.map((item) => {
          const Icon = itemIcons[item.label] ?? LayoutDashboardIcon
          return (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                tooltip={item.label}
                isActive={isNavActive(pathname, item.href, hrefs)}
                render={<Link href={item.href} />}
              >
                <Icon />
                <span>{item.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
