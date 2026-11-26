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
  BanknoteIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  MapPinIcon,
  MonitorIcon,
  PackageIcon,
  ReceiptTextIcon,
  PieChartIcon,
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
  Revenue: BanknoteIcon,
  Purchasing: WalletIcon,
  Inventory: BoxesIcon,
  Products: PackageIcon,
  Categories: TagsIcon,
  Batches: BoxesIcon,
  Expenses: WalletIcon,
  Capital: LandmarkIcon,
  Accounting: LandmarkIcon,
  Analytics: PieChartIcon,
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

export function NavModule({ module, onBack }: { module: NavModule; onBack: () => void }) {
  const pathname = usePathname()
  const hrefs = module.items.map((item) => item.href)

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="sr-only">{module.title}</SidebarGroupLabel>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip={module.title}
            className="relative justify-center bg-black/10 px-7 font-medium hover:bg-black/15 dark:bg-black/45 dark:hover:bg-black/55"
            onClick={onBack}
          >
            <ChevronLeftIcon className="absolute left-2 group-data-[collapsible=icon]:static" />
            <span className="group-data-[collapsible=icon]:sr-only">{module.title}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      <SidebarMenu className="mt-2 gap-1">
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
