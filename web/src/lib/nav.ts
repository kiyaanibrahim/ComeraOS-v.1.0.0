import type { ShellLayer } from "@/lib/shell"

export type NavItem = {
  label: string
  href: string
}

export type NavSection = {
  title: string
  items: NavItem[]
}

export function coreNav(businessId: string): NavSection[] {
  const base = `/app/${businessId}`
  return [
    {
      title: "Home",
      items: [{ label: "Overview", href: base }],
    },
    {
      title: "Sell",
      items: [
        { label: "POS", href: `${base}/pos` },
        { label: "Orders", href: `${base}/orders` },
        { label: "Draft Orders", href: `${base}/orders/drafts` },
        { label: "Quotations", href: `${base}/quotations` },
        { label: "Online Payments", href: `${base}/payments` },
        { label: "Bill History", href: `${base}/bills` },
      ],
    },
    {
      title: "Customers",
      items: [
        { label: "CRM", href: `${base}/crm` },
        { label: "Locations", href: `${base}/locations` },
      ],
    },
    {
      title: "Procurement",
      items: [
        { label: "Buying", href: `${base}/procurement` },
        { label: "Draft shipments", href: `${base}/procurement/drafts` },
        { label: "Shipment tracker", href: `${base}/shipments` },
        { label: "Landing cost", href: `${base}/procurement/landing` },
        { label: "Purchasing", href: `${base}/financials/purchasing` },
      ],
    },
    {
      title: "Inventory",
      items: [
        { label: "Inventory", href: `${base}/inventory` },
        { label: "Products", href: `${base}/products` },
        { label: "Product Catalog", href: `${base}/catalog` },
        { label: "Categories", href: `${base}/categories` },
        { label: "Batches", href: `${base}/batches` },
      ],
    },
    {
      title: "Financials",
      items: [
        { label: "Expenses", href: `${base}/financials/expenses` },
        { label: "Capital", href: `${base}/financials/capital` },
        { label: "Accounting", href: `${base}/financials/accounting` },
        { label: "Reporting", href: `${base}/financials/reporting` },
      ],
    },
  ]
}

export function settingsNav(businessId: string): NavSection[] {
  const base = `/app/${businessId}/settings`
  return [
    {
      title: "Settings",
      items: [
        { label: "Overview", href: base },
        { label: "Business config", href: `${base}/settings` },
        { label: "Staff", href: `${base}/staff` },
        { label: "Payment & billing", href: `${base}/billing` },
      ],
    },
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
  if (shell.layer === "settings" && shell.businessId) return settingsNav(shell.businessId)
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
