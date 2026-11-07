import type { NextConfig } from "next";

const demo = "/app/demo"

const nextConfig: NextConfig = {
  /* config options here */
  async redirects() {
    const corePaths = [
      "pos",
      "orders",
      "orders/drafts",
      "quotations",
      "payments",
      "bills",
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
      "financials/reporting",
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
