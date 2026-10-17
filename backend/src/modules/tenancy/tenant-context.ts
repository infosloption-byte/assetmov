import type { NextFunction, Request, RequestHandler, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { expandLocationScope } from "./location-scope.js";

type LocationMode = "read" | "manage";

function sendError(
  response: Response,
  status: number,
  code: string,
  message: string,
): void {
  response.status(status).json({ error: { code, message } });
}

/**
 * Resolves the active tenant exclusively from a verified membership.
 * A client-supplied tenant header selects a candidate; it does not grant access.
 * Run after requireSession on every tenant-owned route.
 */
export const requireTenant: RequestHandler = async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!request.auth?.userId) {
      sendError(response, 401, "UNAUTHENTICATED", "Please sign in to continue.");
      return;
    }

    const tenantId = request.get("x-tenant-id")?.trim();
    if (!tenantId) {
      sendError(response, 400, "TENANT_REQUIRED", "Select a workspace before continuing.");
      return;
    }

    const membership = await prisma.membership.findFirst({
      where: {
        tenantId,
        userId: request.auth.userId,
        isActive: true,
      },
      include: {
        tenant: true,
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
        locationAssignments: {
          select: { locationId: true, canManage: true },
        },
      },
    });

    if (!membership || membership.tenant.status === "SUSPENDED") {
      sendError(response, 403, "TENANT_ACCESS_DENIED", "You do not have access to that workspace.");
      return;
    }

    const locations = await prisma.location.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, parentId: true },
    });

    const activeLocationIds = new Set(locations.map((location) => location.id));
    const activeAssignments = membership.locationAssignments.filter((assignment) =>
      activeLocationIds.has(assignment.locationId),
    );
    const visibleRoots = activeAssignments.map((assignment) => assignment.locationId);
    const manageableRoots = activeAssignments
      .filter((assignment) => assignment.canManage)
      .map((assignment) => assignment.locationId);

    const visibleDescendants = expandLocationScope(locations, visibleRoots);
    const manageableDescendants = expandLocationScope(locations, manageableRoots);
    const allLocationsAccess = membership.allLocationsAccess;
    const permissions = membership.role.permissions.map((entry) => entry.permission.key);

    request.auth = {
      ...request.auth,
      tenantId: membership.tenantId,
      tenantName: membership.tenant.name,
      tenantSlug: membership.tenant.slug,
      tenantStatus: membership.tenant.status,
      membershipId: membership.id,
      roleId: membership.role.id,
      roleKey: membership.role.key,
      roleName: membership.role.name,
      permissions,
      allLocationsAccess,
      accessibleLocationIds: allLocationsAccess
        ? [...activeLocationIds]
        : visibleDescendants,
      manageableLocationIds: allLocationsAccess
        ? [...activeLocationIds]
        : manageableDescendants,
    };

    next();
  } catch (error) {
    next(error);
  }
};

export function requirePermission(permission: string): RequestHandler {
  return (request, response, next) => {
    if (!request.auth?.tenantId || !request.auth.membershipId) {
      sendError(response, 400, "TENANT_CONTEXT_REQUIRED", "Select a workspace before continuing.");
      return;
    }

    if (!request.auth.permissions?.includes(permission)) {
      sendError(response, 403, "PERMISSION_DENIED", "You are not allowed to perform this action.");
      return;
    }

    next();
  };
}

export function requireAnyPermission(permissions: readonly string[]): RequestHandler {
  return (request, response, next) => {
    if (!request.auth?.tenantId || !request.auth.membershipId) {
      sendError(response, 400, "TENANT_CONTEXT_REQUIRED", "Select a workspace before continuing.");
      return;
    }

    if (!permissions.some((permission) => request.auth?.permissions?.includes(permission))) {
      sendError(response, 403, "PERMISSION_DENIED", "You are not allowed to perform this action.");
      return;
    }

    next();
  };
}

/**
 * Use after requireTenant and the relevant permission middleware. The callback
 * extracts the target location from a trusted route param or validated request.
 */
export function requireLocationAccess(
  getLocationId: (request: Request) => string | undefined,
  mode: LocationMode = "read",
): RequestHandler {
  return (request, response, next) => {
    const auth = request.auth;
    if (!auth?.tenantId || !auth.membershipId) {
      sendError(response, 400, "TENANT_CONTEXT_REQUIRED", "Select a workspace before continuing.");
      return;
    }

    const locationId = getLocationId(request);
    if (!locationId) {
      sendError(response, 400, "LOCATION_REQUIRED", "A valid location is required.");
      return;
    }

    const allowedLocations = mode === "manage"
      ? auth.manageableLocationIds
      : auth.accessibleLocationIds;

    if (!allowedLocations?.includes(locationId)) {
      sendError(response, 403, "LOCATION_ACCESS_DENIED", "You do not have access to that location.");
      return;
    }

    next();
  };
}
