import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireSession } from "../auth/auth-middleware.js";
import { requirePermission, requireTenant } from "./tenant-context.js";

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

// Asset metrics follow the same tenant, role and location visibility rules as
// GET /api/assets. The company dashboard must not disclose hidden locations.
workspaceRouter.get("/overview",
  requireSession,
  requireTenant,
  requirePermission("asset.read"),
  async (request, response, next) => {
    try {
      const tenantId = request.auth?.tenantId;
      if (!tenantId || !request.auth?.membershipId) {
        response.status(400).json({
          error: { code: "TENANT_CONTEXT_REQUIRED", message: "Select a workspace to view asset metrics." },
        });
        return;
      }

      const locationFilter = request.auth.allLocationsAccess
        ? {}
        : { currentLocationId: { in: request.auth.accessibleLocationIds ?? [] } };
      const grouped = await prisma.asset.groupBy({
        by: ["status"],
        where: { tenantId, ...locationFilter },
        _count: { _all: true },
      });
      const byStatus = (status: string) =>
        grouped.find((item) => item.status === status)?._count._all ?? 0;

      response.status(200).json({
        data: {
          total: grouped.reduce((sum, item) => sum + item._count._all, 0),
          assigned: byStatus("ASSIGNED"),
          inService: byStatus("IN_SERVICE"),
          inTransit: byStatus("IN_TRANSIT"),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);
