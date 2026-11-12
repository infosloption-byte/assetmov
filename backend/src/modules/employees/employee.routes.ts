import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireCsrf, requireSession } from "../auth/auth-middleware.js";
import { requirePermission, requireTenant } from "../tenancy/tenant-context.js";

export const employeeRouter = Router();

const employeeListSchema = z.object({
  q: z.string().trim().max(191).optional(),
  locationId: z.string().trim().min(1).optional(),
  includeInactive: z.enum(["true", "false"]).default("false"),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const employeeCreateSchema = z.object({
  employeeCode: z.string().trim().min(1).max(100),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  designation: z.string().trim().max(100).optional(),
  employeeType: z.string().trim().max(100).optional(),
  email: z.string().trim().toLowerCase().email().max(191).optional(),
  phone: z.string().trim().max(50).optional(),
  homeLocationId: z.string().trim().min(1).optional(),
}).strict();

const employeeUpdateSchema = z.object({
  employeeCode: z.string().trim().min(1).max(100).optional(),
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  designation: z.string().trim().max(100).optional(),
  employeeType: z.string().trim().max(100).optional(),
  email: z.string().trim().toLowerCase().email().max(191).optional(),
  phone: z.string().trim().max(50).optional(),
  homeLocationId: z.string().trim().min(1).optional(),
  locationChangeReason: z.string().trim().min(8).max(300).optional(),
  isActive: z.boolean().optional(),
}).strict().refine((input) => Object.values(input).some((value) => value !== undefined), {
  message: "Provide at least one field to update.",
});

function sendError(response: import("express").Response, status: number, code: string, message: string): void {
  response.status(status).json({ error: { code, message } });
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

function canAccessLocation(request: import("express").Request, locationId: string | null): boolean {
  if (request.auth?.allLocationsAccess) return true;
  return Boolean(locationId && request.auth?.accessibleLocationIds?.includes(locationId));
}

function canManageLocation(request: import("express").Request, locationId: string | null): boolean {
  if (request.auth?.allLocationsAccess) return true;
  return Boolean(locationId && request.auth?.manageableLocationIds?.includes(locationId));
}

const employeeInclude = {
  homeLocation: { select: { id: true, name: true, code: true } },
} as const;

employeeRouter.get(
  "/",
  requireSession,
  requireTenant,
  requirePermission("employee.read"),
  async (request, response, next) => {
    try {
      const tenantId = request.auth?.tenantId;
      if (!tenantId || !request.auth?.membershipId) {
        sendError(response, 400, "TENANT_CONTEXT_REQUIRED", "Select a workspace before continuing.");
        return;
      }

      const parsed = employeeListSchema.safeParse(request.query);
      if (!parsed.success) {
        sendError(response, 400, "VALIDATION_ERROR", "Check the employee search and filter values.");
        return;
      }

      const { q, locationId, includeInactive, page, pageSize } = parsed.data;
      if (locationId && !canAccessLocation(request, locationId)) {
        sendError(response, 403, "LOCATION_ACCESS_DENIED", "You cannot view employees in that location.");
        return;
      }

      const scopedLocationIds = request.auth.allLocationsAccess
        ? undefined
        : (request.auth.accessibleLocationIds ?? []);

      const where = {
        tenantId,
        ...(includeInactive === "true" ? {} : { isActive: true }),
        ...(locationId ? { homeLocationId: locationId } : {}),
        ...(request.auth.allLocationsAccess || locationId
          ? {}
          : { homeLocationId: { in: scopedLocationIds } }),
        ...(q ? {
          OR: [
            { employeeCode: { contains: q } },
            { firstName: { contains: q } },
            { lastName: { contains: q } },
            { email: { contains: q } },
          ],
        } : {}),
      };

      const [total, data] = await Promise.all([
        prisma.employee.count({ where }),
        prisma.employee.findMany({
          where,
          include: {
            ...employeeInclude,
            _count: { select: { assignedAssets: true } },
          },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);

      response.status(200).json({
        data,
        pagination: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
      });
    } catch (error) {
      next(error);
    }
  },
);

employeeRouter.get(
  "/:id",
  requireSession,
  requireTenant,
  requirePermission("employee.read"),
  async (request, response, next) => {
    try {
      const employeeId = request.params.id;
      if (typeof employeeId !== "string" || employeeId.length === 0) {
        sendError(response, 400, "INVALID_ROUTE_PARAMETER", "A valid employee ID is required.");
        return;
      }

      const tenantId = request.auth?.tenantId;
      if (!tenantId || !request.auth?.membershipId) {
        sendError(response, 400, "TENANT_CONTEXT_REQUIRED", "Select a workspace before continuing.");
        return;
      }

      const employee = await prisma.employee.findFirst({
        where: { id: employeeId, tenantId },
        include: {
          ...employeeInclude,
          assignedAssets: {
            where: { tenantId },
            include: {
              currentLocation: { select: { id: true, name: true, code: true } },
            },
            orderBy: { inventoryNumber: "asc" },
          },
        },
      });

      if (!employee || !canAccessLocation(request, employee.homeLocationId)) {
        sendError(response, 404, "EMPLOYEE_NOT_FOUND", "The requested employee was not found.");
        return;
      }

      response.status(200).json({ data: employee });
    } catch (error) {
      next(error);
    }
  },
);

employeeRouter.get("/:id/location-history",
  requireSession, requireTenant, requirePermission("employee.read"),
  async (request, response, next) => {
    try {
      const id=request.params.id;
      const tenantId=request.auth!.tenantId!;
      if (typeof id!=="string" || !id) {
        sendError(response,400,"INVALID_ROUTE_PARAMETER","Employee ID is required."); return;
      }
      const employee=await prisma.employee.findFirst({
        where:{id,tenantId},select:{id:true,homeLocationId:true},
      });
      if (!employee || !canAccessLocation(request,employee.homeLocationId)) {
        sendError(response,404,"EMPLOYEE_NOT_FOUND","Employee not found in your location scope."); return;
      }
      const history=await prisma.employeeLocationHistory.findMany({
        where:{tenantId,employeeId:id},orderBy:{createdAt:"desc"},take:100,
      });
      const locationIds=[...new Set(history.flatMap(entry=>
        [entry.previousLocationId,entry.newLocationId].filter((value):value is string=>Boolean(value))))];
      const locations=await prisma.location.findMany({
        where:{tenantId,id:{in:locationIds}},select:{id:true,name:true,code:true},
      });
      const labels=new Map(locations.map(location=>[location.id,
        location.name+" ("+location.code+")"]));
      response.json({data:history.map(entry=>({
        id:entry.id,createdAt:entry.createdAt,reason:entry.reason,
        previousLocation:entry.previousLocationId
          ? labels.get(entry.previousLocationId) ?? "Unknown location" : "Not assigned",
        newLocation:entry.newLocationId
          ? labels.get(entry.newLocationId) ?? "Unknown location" : "Not assigned",
      }))});
    } catch(error){next(error);}
  },
);

employeeRouter.post(
  "/",
  requireSession,
  requireTenant,
  requirePermission("employee.manage"),
  requireCsrf,
  async (request, response, next) => {
    try {
      const tenantId = request.auth?.tenantId;
      const actorUserId = request.auth?.userId;
      if (!tenantId || !actorUserId || !request.auth?.membershipId) {
        sendError(response, 400, "TENANT_CONTEXT_REQUIRED", "Select a workspace before continuing.");
        return;
      }

      const parsed = employeeCreateSchema.safeParse(request.body);
      if (!parsed.success) {
        sendError(response, 400, "VALIDATION_ERROR", "Check the employee details and try again.");
        return;
      }

      const input = parsed.data;
      if (!input.homeLocationId && !request.auth.allLocationsAccess) {
        sendError(response, 400, "LOCATION_REQUIRED", "Choose a home location for this employee.");
        return;
      }
      if (input.homeLocationId && !canManageLocation(request, input.homeLocationId)) {
        sendError(response, 403, "LOCATION_ACCESS_DENIED", "You must manage the selected location to add an employee there.");
        return;
      }

      const result = await prisma.$transaction(async (tx) => {
        if (input.homeLocationId) {
          const location = await tx.location.findFirst({
            where: { id: input.homeLocationId, tenantId, isActive: true },
            select: { id: true },
          });
          if (!location) throw new Error("EMPLOYEE_LOCATION_INVALID");
        }

        const employee = await tx.employee.create({
          data: {
            tenantId,
            employeeCode: input.employeeCode,
            firstName: input.firstName,
            lastName: input.lastName,
            designation: input.designation || undefined,
            employeeType: input.employeeType || undefined,
            email: input.email || undefined,
            phone: input.phone || undefined,
            homeLocationId: input.homeLocationId || undefined,
          },
          include: employeeInclude,
        });

        await tx.employeeLocationHistory.create({ data: {
          tenantId, employeeId: employee.id, actorUserId,
          previousLocationId: null, newLocationId: employee.homeLocationId,
          reason: "Initial employee location",
        } });
        await tx.auditLog.create({
          data: {
            tenantId,
            actorUserId,
            action: "employee.created",
            entityType: "Employee",
            entityId: employee.id,
            newData: {
              employeeCode: employee.employeeCode,
              firstName: employee.firstName,
              lastName: employee.lastName,
              designation: employee.designation,
              employeeType: employee.employeeType,
              homeLocationId: employee.homeLocationId,
            },
            ipAddress: request.ip?.slice(0, 64),
          },
        });

        return employee;
      });

      response.status(201).json({ data: result });
    } catch (error) {
      if (error instanceof Error && error.message === "EMPLOYEE_LOCATION_INVALID") {
        sendError(response, 400, "INVALID_LOCATION", "Choose an active location in this workspace.");
        return;
      }
      if (errorCode(error) === "P2002") {
        sendError(response, 409, "EMPLOYEE_CODE_EXISTS", "That employee code is already used in this workspace.");
        return;
      }
      next(error);
    }
  },
);

employeeRouter.patch(
  "/:id",
  requireSession,
  requireTenant,
  requirePermission("employee.manage"),
  requireCsrf,
  async (request, response, next) => {
    try {
      const employeeId = request.params.id;
      if (typeof employeeId !== "string" || employeeId.length === 0) {
        sendError(response, 400, "INVALID_ROUTE_PARAMETER", "A valid employee ID is required.");
        return;
      }

      const tenantId = request.auth?.tenantId;
      const actorUserId = request.auth?.userId;
      if (!tenantId || !actorUserId || !request.auth?.membershipId) {
        sendError(response, 400, "TENANT_CONTEXT_REQUIRED", "Select a workspace before continuing.");
        return;
      }

      const parsed = employeeUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        sendError(response, 400, "VALIDATION_ERROR", "Check the employee fields you want to update.");
        return;
      }

      const input = parsed.data;
      const result = await prisma.$transaction(async (tx) => {
        const existing = await tx.employee.findFirst({
          where: { id: employeeId, tenantId },
        });
        if (!existing || !canAccessLocation(request, existing.homeLocationId)) {
          throw new Error("EMPLOYEE_NOT_FOUND");
        }

        const nextLocationId = input.homeLocationId ?? existing.homeLocationId;
        if (!canManageLocation(request, nextLocationId)) {
          throw new Error("EMPLOYEE_LOCATION_SCOPE_DENIED");
        }

        if (input.homeLocationId) {
          const location = await tx.location.findFirst({
            where: { id: input.homeLocationId, tenantId, isActive: true },
            select: { id: true },
          });
          if (!location) throw new Error("EMPLOYEE_LOCATION_INVALID");
        }

        const movingLocation = input.homeLocationId !== undefined &&
          input.homeLocationId !== existing.homeLocationId;
        if (movingLocation) {
          if (!input.locationChangeReason) throw new Error("LOCATION_CHANGE_REASON_REQUIRED");
          const assignedAssets = await tx.asset.count({
            where:{tenantId,assignedEmployeeId:existing.id},
          });
          if (assignedAssets > 0) throw new Error("EMPLOYEE_HAS_ASSIGNED_ASSETS");
        }
        // Deactivation cannot silently orphan custody. Return the employee's
        // assets to stock (or transfer custody) before making them inactive.
        if (input.isActive === false && existing.isActive) {
          const assigned = await tx.asset.count({ where: { tenantId, assignedEmployeeId: existing.id } });
          if (assigned > 0) throw new Error("EMPLOYEE_HAS_ASSIGNED_ASSETS");
        }
        if (input.isActive === true) {
          const homeLocationId = input.homeLocationId ?? existing.homeLocationId;
          if (homeLocationId) {
            const home = await tx.location.findFirst({
              where: { id: homeLocationId, tenantId, isActive: true }, select: { id: true },
            });
            if (!home) throw new Error("EMPLOYEE_LOCATION_INVALID");
          }
        }
        const updated = await tx.employee.update({
          where: { id: existing.id },
          data: {
            ...(input.employeeCode !== undefined ? { employeeCode: input.employeeCode } : {}),
            ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
            ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
            ...(input.designation !== undefined ? { designation: input.designation || null } : {}),
            ...(input.employeeType !== undefined ? { employeeType: input.employeeType || null } : {}),
            ...(input.email !== undefined ? { email: input.email || null } : {}),
            ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
            ...(input.homeLocationId !== undefined ? { homeLocationId: input.homeLocationId } : {}),
            ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          },
          include: employeeInclude,
        });

        if (movingLocation) {
          await tx.employeeLocationHistory.create({ data: {
            tenantId, employeeId:updated.id, actorUserId,
            previousLocationId:existing.homeLocationId,
            newLocationId:updated.homeLocationId,
            reason:input.locationChangeReason!,
          } });
        }
        await tx.auditLog.create({
          data: {
            tenantId,
            actorUserId,
            action: "employee.updated",
            entityType: "Employee",
            entityId: updated.id,
            oldData: {
              employeeCode: existing.employeeCode,
              firstName: existing.firstName,
              lastName: existing.lastName,
              designation: existing.designation,
              employeeType: existing.employeeType,
              email: existing.email,
              phone: existing.phone,
              homeLocationId: existing.homeLocationId,
              isActive: existing.isActive,
            },
            newData: {
              employeeCode: updated.employeeCode,
              firstName: updated.firstName,
              lastName: updated.lastName,
              designation: updated.designation,
              employeeType: updated.employeeType,
              email: updated.email,
              phone: updated.phone,
              homeLocationId: updated.homeLocationId,
              isActive: updated.isActive,
            },
            ipAddress: request.ip?.slice(0, 64),
          },
        });

        return updated;
      });

      response.status(200).json({ data: result });
    } catch (error) {
      if (error instanceof Error && error.message === "EMPLOYEE_NOT_FOUND") {
        sendError(response, 404, "EMPLOYEE_NOT_FOUND", "The requested employee was not found.");
        return;
      }
      if (error instanceof Error && error.message === "EMPLOYEE_LOCATION_SCOPE_DENIED") {
        sendError(response, 403, "LOCATION_ACCESS_DENIED", "You must manage both the current and new location to move an employee.");
        return;
      }
      if (error instanceof Error && error.message === "LOCATION_CHANGE_REASON_REQUIRED") {
        sendError(response, 400, "LOCATION_CHANGE_REASON_REQUIRED",
          "Explain why this employee is changing home locations.");
        return;
      }
      if (error instanceof Error && error.message === "EMPLOYEE_HAS_ASSIGNED_ASSETS") {
        sendError(response, 409, "EMPLOYEE_HAS_ASSIGNED_ASSETS", "Return or reassign the employee's assets before deactivation.");
        return;
      }
      if (error instanceof Error && error.message === "EMPLOYEE_LOCATION_INVALID") {
        sendError(response, 400, "INVALID_LOCATION", "Choose an active location in this workspace.");
        return;
      }
      if (errorCode(error) === "P2002") {
        sendError(response, 409, "EMPLOYEE_CODE_EXISTS", "That employee code is already used in this workspace.");
        return;
      }
      next(error);
    }
  },
);
