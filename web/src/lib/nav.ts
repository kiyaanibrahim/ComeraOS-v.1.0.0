export type NavItem = {
  label: string;
  href: string;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

export const navSections: NavSection[] = [
  {
    title: "Overview",
    items: [
      { label: "Colony Dashboard", href: "/app" },
      { label: "Portfolio Dashboard", href: "/app/portfolio" },
      { label: "Platform Dashboard", href: "/app/platform" },
      { label: "Portfolio Insights", href: "/app/portfolio/insights" },
    ],
  },
  {
    title: "Sell",
    items: [
      { label: "POS", href: "/app/pos" },
      { label: "Orders", href: "/app/orders" },
      { label: "Draft Orders", href: "/app/orders/drafts" },
      { label: "Quotations", href: "/app/quotations" },
      { label: "Online Payments", href: "/app/payments" },
      { label: "Bill History", href: "/app/bills" },
    ],
  },
  {
    title: "CRM & Ops",
    items: [
      { label: "CRM", href: "/app/crm" },
      { label: "Locations", href: "/app/locations" },
      { label: "Shipment Tracker", href: "/app/shipments" },
      { label: "Procurement", href: "/app/procurement" },
    ],
  },
  {
    title: "Inventory",
    items: [
      { label: "Inventory", href: "/app/inventory" },
      { label: "Products", href: "/app/products" },
      { label: "Product Catalog", href: "/app/catalog" },
      { label: "Categories", href: "/app/categories" },
      { label: "Batches", href: "/app/batches" },
    ],
  },
  {
    title: "Financials",
    items: [
      { label: "Purchasing", href: "/app/financials/purchasing" },
      { label: "Expenses", href: "/app/financials/expenses" },
      { label: "Capital", href: "/app/financials/capital" },
      { label: "Accounting", href: "/app/financials/accounting" },
      { label: "Reporting", href: "/app/financials/reporting" },
    ],
  },
  {
    title: "Business",
    items: [
      { label: "Business Portfolio", href: "/app/business/portfolio" },
      { label: "Cosmos", href: "/app/business/cosmos" },
      { label: "Colony Directory", href: "/app/business/directory" },
      { label: "Colony Settings", href: "/app/business/settings" },
      { label: "Staff & Access", href: "/app/staff" },
      { label: "Userbase", href: "/app/userbase" },
    ],
  },
  {
    title: "Platform",
    items: [
      { label: "Capability Registry", href: "/app/platform/capabilities" },
      { label: "Capabilities", href: "/app/platform/capabilities/list" },
      { label: "Commercial Catalogue", href: "/app/platform/catalogue" },
      { label: "Subscription & Billing", href: "/app/platform/billing" },
      { label: "Register", href: "/app/platform/register" },
      { label: "Register Sessions", href: "/app/platform/register-sessions" },
      { label: "Platform Health", href: "/app/platform/health" },
      { label: "Integrity Engine", href: "/app/platform/integrity" },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "Profile Overview", href: "/app/account" },
      { label: "Personal Information", href: "/app/account/personal" },
      { label: "Security & Privacy", href: "/app/account/security" },
      { label: "Account Settings", href: "/app/account/settings" },
    ],
  },
];
