import type { ShellLayer } from "@/lib/shell"

export type NavItem = {
  label: string
  href: string
}

export type NavSection = {
  title: string
  items: NavItem[]
  drill?: boolean
}

export type NavModule = {
  id: string
  title: string
  backHref: string
  items: NavItem[]
}

export function coreNav(businessId: string): NavSection[] {
  const base = `/app/${businessId}`
  return [
    {
      title: "Home",
      items: [{ label: "Overview", href: base }],
    },
    ...businessModules(businessId).map((module) => ({
      title: module.title,
      drill: true,
      items: module.items,
    })),
  ]
}

export function settingsItems(businessId: string): NavItem[] {
  const base = `/app/${businessId}/settings`
  return [
    { label: "Overview", href: base },
    { label: "Business config", href: `${base}/settings` },
    { label: "Locations", href: `${base}/locations` },
    { label: "Registers", href: `${base}/registers` },
    { label: "Staff", href: `${base}/staff` },
    { label: "Payment & billing", href: `${base}/billing` },
  ]
}

export const adminNav: NavSection[] = [
  {
    title: "Admin",
    items: [
      { label: "Overview", href: "/app/admin" },
      { label: "Features", href: "/app/admin/capabilities" },
      { label: "Enabled features", href: "/app/admin/capabilities/list" },
      { label: "Plans", href: "/app/admin/catalogue" },
      { label: "POS registers", href: "/app/admin/register" },
      { label: "POS sessions", href: "/app/admin/register-sessions" },
      { label: "Health", href: "/app/admin/health" },
      { label: "Audit", href: "/app/admin/integrity" },
      { label: "Users", href: "/app/admin/userbase" },
    ],
  },
]

export const accountNav: NavSection[] = [
  {
    title: "Account",
    items: [
      { label: "Profile Overview", href: "/app/account" },
      { label: "Personal Information", href: "/app/account/personal" },
      { label: "Security & Privacy", href: "/app/account/security" },
      { label: "Account Settings", href: "/app/account/settings" },
    ],
  },
]

export function navForShell(shell: {
  layer: ShellLayer
  businessId: string | null
}): NavSection[] {
  if (shell.layer === "home" && shell.businessId) return coreNav(shell.businessId)
  if (shell.layer === "admin") return adminNav
  if (shell.layer === "account") return accountNav
  return []
}

function pathOnly(value: string) {
  return (value.split("?")[0] ?? value).replace(/\/$/, "") || "/"
}

export function isNavActive(pathname: string, href: string, hrefs: string[]) {
  const path = pathOnly(pathname)
  const target = pathOnly(href)
  if (path === target) return true
  if (/^\/app\/[^/]+$/.test(target)) return false
  if (!path.startsWith(`${target}/`)) return false
  return !hrefs.some((other) => {
    const candidate = pathOnly(other)
    if (candidate.length <= target.length) return false
    return path === candidate || path.startsWith(`${candidate}/`)
  })
}

type NavModuleMatch = NavModule & { roots: string[] }

function businessModules(businessId: string): NavModuleMatch[] {
  const base = `/app/${businessId}`
  return [
    {
      id: "pos",
      title: "Point of Sale",
      backHref: base,
      roots: [`${base}/pos`],
      items: [
        { label: "Sell", href: `${base}/pos` },
        { label: "Register", href: `${base}/pos/register` },
        { label: "Register Sessions", href: `${base}/pos/sessions` },
        { label: "Bill History", href: `${base}/pos/bills` },
      ],
    },
    {
      id: "sales",
      title: "Sales",
      backHref: base,
      roots: [`${base}/orders`, `${base}/quotes`, `${base}/payments`],
      items: [
        { label: "Quotes", href: `${base}/quotes` },
        { label: "Orders", href: `${base}/orders` },
        { label: "Payments", href: `${base}/payments` },
      ],
    },
    {
      id: "customers",
      title: "Customers",
      backHref: base,
      roots: [`${base}/crm`],
      items: [{ label: "CRM", href: `${base}/crm` }],
    },
    {
      id: "inventory",
      title: "Inventory",
      backHref: base,
      roots: [`${base}/inventory`, `${base}/products`, `${base}/catalog`, `${base}/categories`, `${base}/batches`],
      items: [
        { label: "Inventory", href: `${base}/inventory` },
        { label: "Products", href: `${base}/products` },
        { label: "Product Catalog", href: `${base}/catalog` },
        { label: "Categories", href: `${base}/categories` },
        { label: "Batches", href: `${base}/batches` },
      ],
    },
    {
      id: "procurement",
      title: "Procurement",
      backHref: base,
      roots: [`${base}/procurement`, `${base}/shipments`],
      items: [
        { label: "Shipment Tracker", href: `${base}/procurement` },
        { label: "Draft Orders", href: `${base}/procurement/drafts` },
      ],
    },
    {
      id: "financials",
      title: "Financials",
      backHref: base,
      roots: [`${base}/financials`],
      items: [
        { label: "Purchasing", href: `${base}/financials/purchasing` },
        { label: "Expenses", href: `${base}/financials/expenses` },
        { label: "Capital", href: `${base}/financials/capital` },
        { label: "Accounting", href: `${base}/financials/accounting` },
        { label: "Reporting", href: `${base}/financials/reporting` },
      ],
    },
    {
      id: "settings",
      title: "Business settings",
      backHref: base,
      roots: [`${base}/settings`, `${base}/locations`],
      items: settingsItems(businessId),
    },
  ]
}

function platformModules(): NavModuleMatch[] {
  return [
    {
      id: "admin",
      title: "Admin",
      backHref: "/app",
      roots: ["/app/admin"],
      items: adminNav[0]?.items ?? [],
    },
    {
      id: "account",
      title: "Account",
      backHref: "/app",
      roots: ["/app/account"],
      items: accountNav[0]?.items ?? [],
    },
  ]
}

export function matchModule(pathname: string, businessId: string | null) {
  const path = pathOnly(pathname)
  const modules = [...(businessId ? businessModules(businessId) : []), ...platformModules()]
  let match: { module: NavModule; length: number } | null = null
  for (const module of modules) {
    for (const root of module.roots) {
      const target = pathOnly(root)
      const hit = path === target || path.startsWith(`${target}/`)
      if (!hit || (match && target.length <= match.length)) continue
      match = { module, length: target.length }
    }
  }
  return match?.module ?? null
}

export function matchNav(pathname: string, sections: NavSection[]) {
  const items = sections.flatMap((section) =>
    section.items.map((item) => ({
      section: section.title,
      sectionHref: section.items[0]?.href ?? "/app",
      ...item,
    })),
  )
  const hrefs = items.map((item) => item.href)
  return items
    .filter((item) => isNavActive(pathname, item.href, hrefs))
    .sort((a, b) => b.href.length - a.href.length)[0]
}
