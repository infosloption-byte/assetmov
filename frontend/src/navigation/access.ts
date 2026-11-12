import type { WorkspacePage } from "./routes";

/** Presentation only: API authorization remains enforced by requireTenant. */
export function canOpenWorkspacePage(page: WorkspacePage, keys: readonly string[], roleKey: string | null): boolean {
  const has = (key: string) => keys.includes(key);
  switch (page) {
    case "overview": return true; // summary widgets check asset.read separately
    case "assets": return has("asset.read");
    case "transfers": return ["asset.transfer.read","asset.transfer.dispatch","asset.transfer.receive"].some(has);
    case "requests": return has("request.create") || has("request.approve");
    case "employees": return has("employee.read");
    case "locations": return has("location.read");
    case "company": return has("members.manage") || has("roles.manage");
    case "profile": return has("tenant.settings.manage");
    case "masterData": return has("tenant.settings.manage");
    case "billing": return roleKey === "TENANT_OWNER";
    default: return false;
  }
}
