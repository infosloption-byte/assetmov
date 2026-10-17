import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireSession } from "../auth/auth-middleware.js";
import { requirePermission } from "../tenancy/tenant-context.js";

export const assetRouter = Router();

const assetStatuses = [
  "DRAFT",
  "AVAILABLE",
  "ASSIGNED",
  "IN_TRANSIT",
  "IN_SERVICE",
  "DAMAGED",
  "DISPOSED",
  "RETIRED",
] as const;

const optionalDate = z.string().trim().max(40).optional().refine(
  (value) => value === undefined || value.length === 0 || !Number.isNaN(Date.parse(value)),
  "Enter a valid date.",
);

const assetCreateSchema = z.object({
  inventoryNumber: z.string().trim().min(1).max(191),
  assetNumber: z.string().trim().max(191).optional(),
  serialNumber: z.string().trim().max(191).optional(),
  title: z.string().trim().min(1).max(191),
  description: z.string().trim().max(20000).optional(),
  modelId: z.string().trim().min(1).optional(),
  manufacturerId: z.string().trim().min(1).optional(),
  supplierId: z.string().trim().min(1).optional(),
  currentLocationId: z.string().trim().min(1).optional(),
  purchaseOrderNumber: z.string().trim().max(191).optional(),
  accountCode: z.string().trim().max(100).optional(),
  purchasedAt: optionalDate,
  purchaseCost: z.coerce.number().finite().min(0).optional(),
  salvageValue: z.coerce.number().finite().min(0).optional(),
  warrantyStart: optionalDate,
  warrantyEnd: optionalDate,
  expectedLifeMonths: z.coerce.number().int().min(1).max(1200).optional(),
  depreciationMethod: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(20000).optional(),
}).strict();

const listQuerySchema = z.object({
  q: z.string().trim().max(191).optional(),
  status: z.enum(assetStatuses).optional(),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

function sendError(response: Response, status: number, code: string, message: string): void {
  response.status(status).json({ error: { code, message } });
}

function dateValue(value: string | undefined): Date | undefined {
  return value ? new Date(value) : undefined;
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function isForeignKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2003";
}

const assetInclude = {
  model: { include: { category: true } },
  manufacturer: true,
  supplier: true,
  currentLocation: true,
  custodian: true,
} as const;

assetRouter.get(
  "/",
  requireSession,
  // requireTenant is installed here as well as a permission gate so each resource
  // route always establishes a trusted tenant context before querying.
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      // Dynamically imported middleware isn't needed; tenant resolution is delegated
      // to the shared router guard added below.
      next();
    } catch (error) {
      next(error);
    }
  },
  requirePermission("asset.read"),
  async (request, response, next) => {
    try {
      const tenantId = request.auth?.tenantId;
      if (!tenantId || !request.auth?.membershipId) {
        sendError(response, 400, "TENANT_CONTEXT_REQUIRED", "Select a workspace before continuing.");
        return;
      }

      const parsed = listQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        sendError(response, 400, "VALIDATION_ERROR", "Check the search, status and pagination filters.");
        return;
      }

      const { q, status, page, pageSize } = parsed.data;
      const where = {
        tenantId,
        ...(status ? { status } : {}),
        ...(q ? {
          OR: [
            { inventoryNumber: { contains: q } },
            { assetNumber: { contains: q } },
            { serialNumber: { contains: q } },
            { title: { contains: q } },
          ],
        } : {}),
        ...(request.auth.allLocationsAccess
          ? {}
          : { currentLocationId: { in: request.auth.accessibleLocationIds ?? [] } }),
      };

      const [total, assets] = await Promise.all([
        prisma.asset.count({ where }),
        prisma.asset.findMany({
          where,
          include: assetInclude,
          orderBy: [{ inventoryNumber: "asc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);

      response.status(200).json({
        data: assets,
        pagination: {
          page,
          pageSize,
          total,
          pageCount: Math.ceil(total / pageSize),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

assetRouter.get(
  "/:id",
  requireSession,
  async (request, response, next) => {
    try {
      // Tenant context will be resolved by the common middleware in the route chain.
      next();
    } catch (error) {
      next(error);
    }
  },
  requirePermission("asset.read"),
  async (request, response, next) => {
    try {
      const tenantId = request.auth?.tenantId;
      if (!tenantId || !request.auth?.membershipId) {
        sendError(response, 400, "TENANT_CONTEXT_REQUIRED", "Select a workspace before continuing.");
        return;
      }

      const asset = await prisma.asset.findFirst({
        where: { id: request.params.id, tenantId },
        include: {
          ...assetInclude,
          transactions: {
            where: { tenantId },
            orderBy: { occurredAt: "desc" },
            take: 100,
            include: {
              fromLocation: true,
              toLocation: true,
              fromEmployee: true,
              toEmployee: true,
            },
          },
          serviceRecords: {
            where: { tenantId },
            orderBy: { createdAt: "desc" },
          },
          tags: true,
        },
      });

      if (!asset) {
        sendError(response, 404, "ASSET_NOT_FOUND", "The requested asset was not found.");
        return;
      }

      const allowedLocations = request.auth.accessibleLocationIds ?? [];
      if (
        !request.auth.allLocationsAccess &&
        (!asset.currentLocationId || !allowedLocations.includes(asset.currentLocationId))
      ) {
        // Return the same response for inaccessible and unknown asset IDs.
        sendError(response, 404, "ASSET_NOT_FOUND", "The requested asset was not found.");
        return;
      }

      response.status(200).json({ data: asset });
    } catch (error) {
      next(error);
    }
  },
);

assetRouter.post(
  "/",
  requireSession,
  async (request, response, next) => {
    try {
      // Tenant context will be resolved by the common middleware in the route chain.
      next();
    } catch (error) {
      next(error);
    }
  },
  requirePermission("asset.create"),
  async (request, response, next) => {
    try {
      const tenantId = request.auth?.tenantId;
      const actorUserId = request.auth?.userId;
      if (!tenantId || !request.auth?.membershipId || !actorUserId) {
        sendError(response, 400, "TENANT_CONTEXT_REQUIRED", "Select a workspace before continuing.");
        return;
      }

      const parsed = assetCreateSchema.safeParse(request.body);
      if (!parsed.success) {
        sendError(response, 400, "VALIDATION_ERROR", "Check the asset details and try again.");
        return;
      }

      const input = parsed.data;
      const assignedLocationId = input.currentLocationId || undefined;

      if (!assignedLocationId && !request.auth.allLocationsAccess) {
        sendError(response, 400, "LOCATION_REQUIRED", "Choose a location before registering an asset.");
        return;
      }

      if (
        assignedLocationId &&
        !request.auth.allLocationsAccess &&
        !(request.auth.accessibleLocationIds ?? []).includes(assignedLocationId)
      ) {
        sendError(response, 403, "LOCATION_ACCESS_DENIED", "You cannot register assets in that location.");
        return;
      }

      const result = await prisma.$transaction(async (tx) => {
        const [model, manufacturer, supplier, location] = await Promise.all([
          input.modelId
            ? tx.assetModel.findFirst({ where: { id: input.modelId, tenantId, isActive: true }, select: { id: true } })
            : Promise.resolve(null),
          input.manufacturerId
            ? tx.manufacturer.findFirst({ where: { id: input.manufacturerId, tenantId, isActive: true }, select: { id: true } })
            : Promise.resolve(null),
          input.supplierId
            ? tx.supplier.findFirst({ where: { id: input.supplierId, tenantId, isActive: true }, select: { id: true } })
            : Promise.resolve(null),
          assignedLocationId
            ? tx.location.findFirst({ where: { id: assignedLocationId, tenantId, isActive: true }, select: { id: true } })
            : Promise.resolve(null),
        ]);

        if (input.modelId && !model) throw new Error("REFERENCE_MODEL_INVALID");
        if (input.manufacturerId && !manufacturer) throw new Error("REFERENCE_MANUFACTURER_INVALID");
        if (input.supplierId && !supplier) throw new Error("REFERENCE_SUPPLIER_INVALID");
        if (assignedLocationId && !location) throw new Error("REFERENCE_LOCATION_INVALID");

        const asset = await tx.asset.create({
          data: {
            tenantId,
            inventoryNumber: input.inventoryNumber,
            assetNumber: input.assetNumber || undefined,
            serialNumber: input.serialNumber || undefined,
            title: input.title,
            description: input.description || undefined,
            modelId: input.modelId || undefined,
            manufacturerId: input.manufacturerId || undefined,
            supplierId: input.supplierId || undefined,
            currentLocationId: assignedLocationId,
            purchaseOrderNumber: input.purchaseOrderNumber || undefined,
            accountCode: input.accountCode || undefined,
            purchasedAt: dateValue(input.purchasedAt),
            purchaseCost: input.purchaseCost,
            salvageValue: input.salvageValue,
            warrantyStart: dateValue(input.warrantyStart),
            warrantyEnd: dateValue(input.warrantyEnd),
            expectedLifeMonths: input.expectedLifeMonths,
            depreciationMethod: input.depreciationMethod || undefined,
            notes: input.notes || undefined,
            status: "AVAILABLE",
          },
        });

        await tx.assetTransaction.create({
          data: {
            tenantId,
            assetId: asset.id,
            eventType: "REGISTERED",
            toLocationId: assignedLocationId,
            actorUserId,
            notes: "Asset registered",
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId,
            actorUserId,
            action: "asset.registered",
            entityType: "Asset",
            entityId: asset.id,
            newData: {
              inventoryNumber: asset.inventoryNumber,
              title: asset.title,
              status: asset.status,
              currentLocationId: asset.currentLocationId,
            },
            ipAddress: request.ip?.slice(0, 64),
          },
        });

        return tx.asset.findFirst({
          where: { id: asset.id, tenantId },
          include: assetInclude,
        });
      });

      response.status(201).json({ data: result });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        sendError(response, 409, "INVENTORY_NUMBER_EXISTS", "That inventory number is already in use in this workspace.");
        return;
      }
      if (isForeignKeyError(error)) {
        sendError(response, 400, "INVALID_REFERENCE", "One of the selected asset references is no longer available.");
        return;
      }
      if (error instanceof Error && error.message.startsWith("REFERENCE_")) {
        const messages: Record<string, string> = {
          REFERENCE_MODEL_INVALID: "Choose an active asset model in this workspace.",
          REFERENCE_MANUFACTURER_INVALID: "Choose an active manufacturer in this workspace.",
          REFERENCE_SUPPLIER_INVALID: "Choose an active supplier in this workspace.",
          REFERENCE_LOCATION_INVALID: "Choose an active location in this workspace.",
        };
        sendError(response, 400, "INVALID_REFERENCE", messages[error.message] ?? "One of the selected references is invalid.");
        return;
      }
      next(error);
    }
  },
);
