export type ShellLayer =
  | "businesses"
  | "home"
  | "settings"
  | "admin"
  | "account"

export function resolveShell(pathname: string): {
  layer: ShellLayer
  businessId: string | null
} {
  const path = pathname.split("?")[0]?.replace(/\/$/, "") || "/"

  if (path === "/app") {
    return { layer: "businesses", businessId: null }
  }
  if (path === "/app/account" || path.startsWith("/app/account/")) {
    return { layer: "account", businessId: null }
  }
  if (path === "/app/admin" || path.startsWith("/app/admin/")) {
    return { layer: "admin", businessId: null }
  }

  const match = path.match(/^\/app\/([^/]+)(\/.*)?$/)
  if (!match) {
    return { layer: "businesses", businessId: null }
  }

  const businessId = match[1] ?? null
  return { layer: "home", businessId }
}

export function withBusiness(pathname: string, fromId: string, toId: string) {
  const prefix = `/app/${fromId}`
  if (pathname === prefix) return `/app/${toId}`
  if (pathname.startsWith(`${prefix}/`)) {
    return `/app/${toId}${pathname.slice(prefix.length)}`
  }
  return `/app/${toId}`
}
