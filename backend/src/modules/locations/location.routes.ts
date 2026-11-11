import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireCsrf, requireSession } from "../auth/auth-middleware.js";
import { requirePermission, requireTenant } from "../tenancy/tenant-context.js";

export const locationRouter = Router();

const locationCreateSchema = z.object({
  name: z.string().trim().min(2).max(191),
  code: z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/),
  type: z.string().trim().min(2).max(60).default("BRANCH"),
  address: z.string().trim().max(500).optional(),
  parentId: z.string().trim().min(1).optional(),
}).strict();

const locationListSchema = z.object({
  q: z.string().trim().max(191).optional(),
  parentId: z.string().trim().min(1).optional(),
  includeInactive: z.enum(["true", "false"]).default("false"),
}).strict();

const locationUpdateSchema = z.object({
  name: z.string().trim().min(2).max(191).optional(),
  code: z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/).optional(),
  type: z.string().trim().min(2).max(60).optional(),
  address: z.string().trim().max(500).nullable().optional(),
  parentId: z.string().trim().min(1).nullable().optional(),
  isActive: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Provide a field to update.");

function sendError(response: import("express").Response, status: number, code: string, message: string): void {
  response.status(status).json({ error: { code, message } });
}

locationRouter.get(
  "/",
  requireSession,
  requireTenant,
  requirePermission("location.read"),
  async (request, response, next) => {
    try {
      const tenantId = request.auth?.tenantId;
      if (!tenantId) {
        sendError(response, 400, "TENANT_CONTEXT_REQUIRED", "Select a workspace before continuing.");
        return;
      }

      const parsed = locationListSchema.safeParse(request.query);
      if (!parsed.success) {
        sendError(response, 400, "VALIDATION_ERROR", "Check the location search filters.");
        return;
      }

      const { q, parentId, includeInactive } = parsed.data;
      const allowInactive = includeInactive === "true" && (request.auth.permissions ?? []).includes("location.manage");
      const where = {
        tenantId,
        ...(allowInactive ? {} : { isActive: true }),
        ...(parentId ? { parentId } : {}),
        ...(q ? {
          OR: [
            { name: { contains: q } },
            { code: { contains: q } },
          ],
        } : {}),
        ...(request.auth?.allLocationsAccess
          ? {}
          : { id: { in: request.auth?.accessibleLocationIds ?? [] } }),
      };

      const locations = await prisma.location.findMany({
        where,
        select: {
          id: true,
          name: true,
          code: true,
          type: true,
          address: true,
          parentId: true,
          isActive: true,
        },
        orderBy: [{ name: "asc" }],
        take: 500,
      });

      response.status(200).json({ data: locations });
    } catch (error) {
      next(error);
    }
  },
);

locationRouter.post(
  "/",
  requireSession,
  requireTenant,
  requirePermission("location.manage"),
  requireCsrf,
  async (request, response, next) => {
    try {
      const tenantId = request.auth?.tenantId;
      const actorUserId = request.auth?.userId;
      if (!tenantId || !actorUserId) {
        sendError(response, 400, "TENANT_CONTEXT_REQUIRED", "Select a workspace before continuing.");
        return;
      }

      const parsed = locationCreateSchema.safeParse(request.body);
      if (!parsed.success) {
        sendError(response, 400, "VALIDATION_ERROR", "Check the location name, code, type and parent.");
        return;
      }

      const input = parsed.data;
      if (input.parentId) {
        if (
          !request.auth?.allLocationsAccess &&
          !(request.auth?.manageableLocationIds ?? []).includes(input.parentId)
        ) {
          sendError(response, 403, "LOCATION_ACCESS_DENIED", "You cannot create a child location under that location.");
          return;
        }
      } else if (!request.auth?.allLocationsAccess) {
        sendError(response, 403, "ROOT_LOCATION_DENIED", "Only workspace-wide location managers can create a root location.");
        return;
      }

      const result = await prisma.$transaction(async (tx) => {
        if (input.parentId) {
          const parent = await tx.location.findFirst({
            where: {
              id: input.parentId,
              tenantId,
              isActive: true,
            },
            select: { id: true },
          });
          if (!parent) throw new Error("LOCATION_PARENT_INVALID");
        }

        const location = await tx.location.create({
          data: {
            tenantId,
            name: input.name,
            code: input.code,
            type: input.type,
            address: input.address || undefined,
            parentId: input.parentId || undefined,
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId,
            actorUserId,
            action: "location.created",
            entityType: "Location",
            entityId: location.id,
            newData: {
              name: location.name,
              code: location.code,
              type: location.type,
              parentId: location.parentId,
            },
            ipAddress: request.ip?.slice(0, 64),
          },
        });

        return location;
      });

      response.status(201).json({ data: result });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
        sendError(response, 409, "LOCATION_CODE_EXISTS", "That location code is already in use in this workspace.");
        return;
      }
      if (error instanceof Error && error.message === "LOCATION_PARENT_INVALID") {
        sendError(response, 400, "INVALID_PARENT", "Choose an active parent location in this workspace.");
        return;
      }
      next(error);
    }
  },
);

/** Update/archive an existing location without breaking custody or hierarchy. */
locationRouter.patch(
  "/:id",
  requireSession, requireTenant, requirePermission("location.manage"), requireCsrf,
  async (request, response, next) => {
    const id = request.params.id;
    const parsed = locationUpdateSchema.safeParse(request.body);
    const tenantId = request.auth?.tenantId;
    const actorUserId = request.auth?.userId;
    if (typeof id !== "string" || !id || !parsed.success || !tenantId || !actorUserId) {
      sendError(response, 400, "VALIDATION_ERROR", "Provide a valid location and changes.");
      return;
    }

    const input = parsed.data;
    const canManage = (locationId: string | null) =>
      Boolean(request.auth?.allLocationsAccess ||
        (locationId && request.auth?.manageableLocationIds?.includes(locationId)));
    if (!canManage(id)) {
      sendError(response, 403, "LOCATION_ACCESS_DENIED", "You may update only locations you manage.");
      return;
    }
    try {
      const updated = await prisma.$transaction(async (tx) => {
        const current = await tx.location.findFirst({ where: { id, tenantId } });
        if (!current) throw new Error("LOCATION_NOT_FOUND");
        const parentId = input.parentId === undefined ? current.parentId : input.parentId;
        if (parentId && !canManage(parentId)) throw new Error("LOCATION_ACCESS_DENIED");
        if (input.parentId === null && !request.auth?.allLocationsAccess) {
          throw new Error("ROOT_LOCATION_DENIED");
        }
        // Reject self-parenting, inactive/foreign parents and ancestor cycles.
        if (parentId !== current.parentId) {
          const seen = new Set([id]);
          let cursor = parentId;
          while (cursor) {
            if (seen.has(cursor)) throw new Error("LOCATION_CYCLE");
            seen.add(cursor);
            const ancestor = await tx.location.findFirst({
              where: { id: cursor, tenantId, isActive: true }, select: { parentId: true },
            });
            if (!ancestor) throw new Error("LOCATION_PARENT_INVALID");
            cursor = ancestor.parentId;
          }
        }
        if (input.isActive === false && current.isActive) {
          const [children, assets, employees, scopedMembers] = await Promise.all([
            tx.location.count({ where: { tenantId, parentId: id, isActive: true } }),
            tx.asset.count({ where: { tenantId, currentLocationId: id } }),
            tx.employee.count({ where: { tenantId, homeLocationId: id, isActive: true } }),
            tx.membershipLocation.count({ where: { tenantId, locationId: id } }),
          ]);
          if (children || assets || employees || scopedMembers) throw new Error("LOCATION_IN_USE");
        }
        if (input.isActive === true && parentId) {
          const parent = await tx.location.findFirst({
            where: { id: parentId, tenantId, isActive: true }, select: { id: true },
          });
          if (!parent) throw new Error("LOCATION_PARENT_INVALID");
        }
        const location = await tx.location.update({
          where: { id }, data: { ...input, parentId },
        });
        await tx.auditLog.create({
          data: { tenantId, actorUserId,
            action: location.isActive === current.isActive ? "location.updated" :
              location.isActive ? "location.reactivated" : "location.archived",
            entityType: "Location", entityId: id,
            oldData: { name: current.name, code: current.code, parentId: current.parentId, isActive: current.isActive },
            newData: { name: location.name, code: location.code, parentId: location.parentId, isActive: location.isActive },
            ipAddress: request.ip?.slice(0, 64),
          },
        });
        return location;
      });
      response.json({ data: updated });
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (["LOCATION_NOT_FOUND", "LOCATION_ACCESS_DENIED", "ROOT_LOCATION_DENIED",
        "LOCATION_CYCLE", "LOCATION_PARENT_INVALID", "LOCATION_IN_USE"].includes(code)) {
        const status = code === "LOCATION_NOT_FOUND" ? 404 :
          code.includes("DENIED") ? 403 : code === "LOCATION_IN_USE" ? 409 : 400;
        sendError(response, status, code, code === "LOCATION_IN_USE"
          ? "Move or unassign child locations, assets, active employees and member location scopes first."
          : code.replaceAll("_", " ").toLowerCase());
        return;
      }
      if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
        sendError(response, 409, "LOCATION_CODE_EXISTS", "That location code is already used.");
        return;
      }
      next(error);
    }
  },
);
