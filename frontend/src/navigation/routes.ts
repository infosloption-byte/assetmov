/**
 * Shareable, refresh-safe navigation paths.
 *
 * No tenant identifier is trusted from a URL: App resolves the tenant slug
 * against the authenticated user's memberships before requesting tenant data.
 * The API remains responsible for permission enforcement.
 */
export const workspacePages = [
  "overview", "assets", "transfers", "requests", "employees", "locations",
  "company", "profile", "masterData", "billing",
] as const;
export type WorkspacePage = (typeof workspacePages)[number];

export const platformPages = [
  "overview", "companies", "users", "reports",
  "activities", "billing", "plans", "settings",
] as const;
export type PlatformPage = (typeof platformPages)[number];

export type AppRoute =
  | { kind: "home" }
  | { kind: "workspace"; tenantSlug: string; page: WorkspacePage }
  | { kind: "platform"; page: PlatformPage }
  | { kind: "notFound" };

const workspaceSlugs: Record<WorkspacePage, string> = {
  overview: "overview", assets: "assets", transfers: "transfers",
  employees: "employees", locations: "locations", requests: "requests", company: "users",
  profile: "profile", masterData: "master-data", billing: "billing",
};

const workspaceBySlug = Object.fromEntries(
  Object.entries(workspaceSlugs).map(([key, value]) => [value, key]),
) as Record<string, WorkspacePage | undefined>;

const allowedPlatformPages = new Set<string>(platformPages);

export function readAppRoute(pathname: string): AppRoute {
  if (pathname === "/" || pathname === "") return { kind: "home" };
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "platform" && parts.length === 2 &&
    allowedPlatformPages.has(parts[1] ?? "")) {
    return { kind: "platform", page: parts[1] as PlatformPage };
  }
  if (parts[0] === "workspace" && parts.length === 3) {
    let slug = "";
    try { slug = decodeURIComponent(parts[1] ?? ""); }
    catch { return { kind: "notFound" }; }
    // Restrict slug to the same URL-safe characters used for tenant slugs.
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(slug)) return { kind: "notFound" };
    const page = workspaceBySlug[parts[2] ?? ""];
    if (page) return { kind: "workspace", tenantSlug: slug, page };
  }
  return { kind: "notFound" };
}

export function appRoutePath(route: AppRoute): string {
  if (route.kind === "workspace") {
    return "/workspace/" + encodeURIComponent(route.tenantSlug) + "/" + workspaceSlugs[route.page];
  }
  if (route.kind === "platform") return "/platform/" + route.page;
  return "/";
}

export function isProtectedRoute(route: AppRoute): boolean {
  return route.kind === "workspace" || route.kind === "platform";
}
