import { Router } from "express";
import { requireSession } from "../auth/auth-middleware.js";
import { requireTenant } from "./tenant-context.js";

export const workspaceRouter = Router();

workspaceRouter.get("/context", requireSession, requireTenant, (request, response) => {
  const auth = request.auth;

  if (!auth?.tenantId || !auth.membershipId) {
    response.status(500).json({
      error: { code: "TENANT_CONTEXT_MISSING", message: "Workspace context could not be resolved." },
    });
    return;
  }

  response.status(200).json({
    tenant: {
      id: auth.tenantId,
      name: auth.tenantName,
      slug: auth.tenantSlug,
      status: auth.tenantStatus,
    },
    membership: {
      id: auth.membershipId,
      role: {
        id: auth.roleId,
        key: auth.roleKey,
        name: auth.roleName,
      },
      allLocationsAccess: auth.allLocationsAccess ?? false,
    },
    permissions: auth.permissions ?? [],
    locationScope: {
      accessibleLocationIds: auth.accessibleLocationIds ?? [],
      manageableLocationIds: auth.manageableLocationIds ?? [],
    },
  });
});
