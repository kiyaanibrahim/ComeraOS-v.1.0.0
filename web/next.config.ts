import os from "node:os"
import type { NextConfig } from "next";

const demo = "/app/demo"

function lanDevOrigins() {
  const hosts = new Set<string>()
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.internal) continue
      if (addr.family === "IPv4" || addr.family === 4) hosts.add(addr.address)
      if (addr.family === "IPv6" || addr.family === 6) {
        hosts.add(addr.address.replace(/%.*/, ""))
      }
    }
  }
  return [...hosts]
}

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "0.0.0.0", ...lanDevOrigins()],
  async redirects() {
    const corePaths = [
      "pos",
      "orders",
      "orders/drafts",
      "crm",
      "locations",
      "shipments",
      "procurement",
      "inventory",
      "products",
      "catalog",
      "categories",
      "batches",
      "financials/purchasing",
      "financials/expenses",
      "financials/capital",
      "financials/accounting",
      "reporting",
      "analytics",
    ]
    const toConstellation = [
      "/app/portfolio",
      "/app/portfolio/insights",
      "/app/business/portfolio",
      "/app/business/admin",
      "/app/business/directory",
    ]
    const toCosmos = [
      ["/app/platform", "/app/admin"],
      ["/app/platform/capabilities", "/app/admin/capabilities"],
      ["/app/platform/capabilities/list", "/app/admin/capabilities/list"],
      ["/app/platform/catalogue", "/app/admin/catalogue"],
      ["/app/platform/register", "/app/admin/register"],
      ["/app/platform/register-sessions", "/app/admin/register-sessions"],
      ["/app/platform/health", "/app/admin/health"],
      ["/app/platform/integrity", "/app/admin/integrity"],
      ["/app/userbase", "/app/admin/userbase"],
    ] as const

    return [
      ...corePaths.map((path) => ({
        source: `/app/${path}`,
        destination: `${demo}/${path}`,
        permanent: false,
      })),
      {
        source: "/app/staff",
        destination: `${demo}/settings/staff`,
        permanent: false,
      },
      {
        source: "/app/business/settings",
        destination: `${demo}/settings/settings`,
        permanent: false,
      },
      {
        source: "/app/platform/billing",
        destination: `${demo}/settings/billing`,
        permanent: false,
      },
      ...toConstellation.map((source) => ({
        source,
        destination: "/app",
        permanent: false,
      })),
      ...toCosmos.map(([source, destination]) => ({
        source,
        destination,
        permanent: false,
      })),
      { source: "/app/cosmos", destination: "/app/admin", permanent: false },
      { source: "/app/cosmos/:path*", destination: "/app/admin/:path*", permanent: false },
      { source: "/app/:businessId/colony", destination: "/app/:businessId/settings", permanent: false },
      { source: "/app/:businessId/colony/:path*", destination: "/app/:businessId/settings/:path*", permanent: false },
      { source: "/app/quotations", destination: `${demo}/quotes`, permanent: false },
      { source: "/app/payments", destination: `${demo}/payments`, permanent: false },
      { source: "/app/bills", destination: `${demo}/pos/bills`, permanent: false },
      { source: "/app/:businessId/quotations", destination: "/app/:businessId/quotes", permanent: false },
      { source: "/app/:businessId/pos/quotations", destination: "/app/:businessId/quotes", permanent: false },
      { source: "/app/:businessId/pos/payments", destination: "/app/:businessId/payments", permanent: false },
      { source: "/app/:businessId/orders/drafts", destination: "/app/:businessId/orders", permanent: false },
      { source: "/app/:businessId/bills", destination: "/app/:businessId/pos/bills", permanent: false },
      { source: "/app/:businessId/financials/reporting", destination: "/app/:businessId/reporting", permanent: false },
      { source: "/app/financials/reporting", destination: `${demo}/reporting`, permanent: false },
    ]
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
