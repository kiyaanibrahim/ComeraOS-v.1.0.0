import fs from "fs";
import path from "path";

const pages = [
  ["app/portfolio/page.tsx", "Portfolio Dashboard", "Cross-colony view across your cosmos portfolio.", "Overview"],
  ["app/portfolio/insights/page.tsx", "Portfolio Insights", "Trends, concentration, and health across colonies.", "Overview"],
  ["app/platform/page.tsx", "Platform Dashboard", "Global control plane for capabilities, billing, and integrity.", "Overview"],
  ["app/pos/page.tsx", "POS", "Point of sale terminal for the active location.", "Sell"],
  ["app/orders/page.tsx", "Orders", "Live and completed order ledger.", "Sell"],
  ["app/orders/drafts/page.tsx", "Draft Orders", "Uncommitted carts and pending drafts.", "Sell"],
  ["app/quotations/page.tsx", "Quotations", "Quotes awaiting acceptance or conversion.", "Sell"],
  ["app/payments/page.tsx", "Online Payments", "Inbound payment intents and settlements.", "Sell"],
  ["app/bills/page.tsx", "Bill History", "Historical invoices and receipts.", "Sell"],
  ["app/crm/page.tsx", "CRM", "Customers, pipelines, and relationship activity.", "CRM & Ops"],
  ["app/locations/page.tsx", "Locations", "Stores, warehouses, and operating sites.", "CRM & Ops"],
  ["app/shipments/page.tsx", "Shipment Tracker", "Inbound and outbound logistics status.", "CRM & Ops"],
  ["app/procurement/page.tsx", "Procurement", "Purchase requests and supplier workflows.", "CRM & Ops"],
  ["app/inventory/page.tsx", "Inventory", "On-hand stock, movements, and adjustments.", "Inventory"],
  ["app/products/page.tsx", "Products", "SKU master records for the colony.", "Inventory"],
  ["app/catalog/page.tsx", "Product Catalog", "Sellable catalogue presentation layer.", "Inventory"],
  ["app/categories/page.tsx", "Categories", "Taxonomy for products and catalogue browsing.", "Inventory"],
  ["app/batches/page.tsx", "Batches", "Lot and batch tracking for inventory.", "Inventory"],
  ["app/financials/purchasing/page.tsx", "Purchasing", "Purchase orders and vendor spend.", "Financials"],
  ["app/financials/expenses/page.tsx", "Expenses", "Operating expense capture and approval.", "Financials"],
  ["app/financials/capital/page.tsx", "Capital", "Capital injections, assets, and allocations.", "Financials"],
  ["app/financials/accounting/page.tsx", "Accounting", "Ledger, journals, and chart of accounts.", "Financials"],
  ["app/financials/reporting/page.tsx", "Reporting", "Financial statements and management reports.", "Financials"],
  ["app/business/portfolio/page.tsx", "Business Portfolio", "Owned and managed business entities.", "Business"],
  ["app/business/cosmos/page.tsx", "Cosmos", "Multi-colony constellation overview.", "Business"],
  ["app/business/directory/page.tsx", "Colony Directory", "Directory of registered colonies.", "Business"],
  ["app/business/settings/page.tsx", "Colony Settings", "Identity, locale, and operating defaults.", "Business"],
  ["app/staff/page.tsx", "Staff & Access", "People, roles, and permission grants.", "Business"],
  ["app/userbase/page.tsx", "Userbase", "Platform-wide user directory.", "Business"],
  ["app/platform/capabilities/page.tsx", "Capability Registry", "Register and govern platform capabilities.", "Platform"],
  ["app/platform/capabilities/list/page.tsx", "Capabilities", "Enabled capability set for this tenant.", "Platform"],
  ["app/platform/catalogue/page.tsx", "Commercial Catalogue", "Sellable plans and capability packs.", "Platform"],
  ["app/platform/billing/page.tsx", "Subscription & Billing", "Plans, invoices, and renewals.", "Platform"],
  ["app/platform/register/page.tsx", "Register", "Device and staff register enrollment.", "Platform"],
  ["app/platform/register-sessions/page.tsx", "Register Sessions", "Active and historical register sessions.", "Platform"],
  ["app/platform/health/page.tsx", "Platform Health", "Global integrity and service health signals.", "Platform"],
  ["app/platform/integrity/page.tsx", "Integrity Engine", "Audit trails, checksums, and anomaly rules.", "Platform"],
  ["app/account/page.tsx", "Profile Overview", "Your ComeraOS identity at a glance.", "Account"],
  ["app/account/personal/page.tsx", "Personal Information", "Name, contact details, and preferences.", "Account"],
  ["app/account/security/page.tsx", "Security & Privacy", "Password, MFA, sessions, and privacy controls.", "Account"],
  ["app/account/settings/page.tsx", "Account Settings", "Notification and account-level preferences.", "Account"],
];

const root = path.join("src", "app", "(os)");

for (const [rel, title, desc, section] of pages) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const content = `import { ModulePage } from "@/components/shell/ModulePage";

export default function Page() {
  return (
    <ModulePage
      section="${section}"
      title="${title}"
      description="${desc}"
    />
  );
}
`;
  fs.writeFileSync(full, content);
}

console.log(`Wrote ${pages.length} pages`);
