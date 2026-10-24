import { Router, type Response } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireCsrf, requireSession } from "../auth/auth-middleware.js";
import { requirePermission, requireTenant } from "../tenancy/tenant-context.js";
import { canAssignAssetToEmployee, canReturnAssetToStock } from "./assignment-policy.js";
import {
  assertAssetCreationAllowed,
  AssetPlanLimitError,
  SubscriptionAccessError,
} from "../subscriptions/subscription-policy.js";
import { CustomFieldValidationError, validateCustomFieldValues } from "../master-data/custom-fields.js";

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
  customFields: z.record(z.string(), z.unknown()).optional(),
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
  locationId: z.string().trim().min(1).optional(),
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
  requireTenant,
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

      const { q, status, locationId, page, pageSize } = parsed.data;
      if (locationId && !request.auth.allLocationsAccess && !(request.auth.accessibleLocationIds ?? []).includes(locationId)) {
        sendError(response, 403, "LOCATION_ACCESS_DENIED", "You cannot list assets in that location.");
        return;
      }

      const where = {
        tenantId,
        ...(status ? { status } : {}),
        ...(locationId ? { currentLocationId: locationId } : {}),
        ...(q ? {
          OR: [
            { inventoryNumber: { contains: q } },
            { assetNumber: { contains: q } },
            { serialNumber: { contains: q } },
            { title: { contains: q } },
          ],
        } : {}),
        ...(locationId || request.auth.allLocationsAccess
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
  requireTenant,
  requirePermission("asset.read"),
  async (request, response, next) => {
    try {
      const assetId = request.params.id;
      if (typeof assetId !== "string" || assetId.length === 0) {
        sendError(response, 400, "INVALID_ROUTE_PARAMETER", "A valid asset ID is required.");
        return;
      }

      const tenantId = request.auth?.tenantId;
      if (!tenantId || !request.auth?.membershipId) {
        sendError(response, 400, "TENANT_CONTEXT_REQUIRED", "Select a workspace before continuing.");
        return;
      }

      const asset = await prisma.asset.findFirst({
        where: { id: assetId, tenantId },
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
  requireTenant,
  requirePermission("asset.create"),
  requireCsrf,
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
      const financialInputProvided = [
        input.purchaseOrderNumber,
        input.accountCode,
        input.purchasedAt,
        input.purchaseCost,
        input.salvageValue,
        input.warrantyStart,
        input.warrantyEnd,
        input.expectedLifeMonths,
        input.depreciationMethod,
      ].some((value) => value !== undefined);
      if (financialInputProvided && !request.auth.permissions?.includes("asset.financial.update")) {
        sendError(response, 403, "FINANCIAL_PERMISSION_REQUIRED", "You are not allowed to set asset financial or warranty fields.");
        return;
      }

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
        // Serialize all asset-count-increasing operations for this tenant on the subscription row.
        // Imports and future bulk-creation paths must use the same lock + policy.
        await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM TenantSubscription WHERE tenantId = ${tenantId} FOR UPDATE`;

        const subscription = await tx.tenantSubscription.findUnique({
          where: { tenantId },
          include: { plan: { select: { maxAssets: true } } },
        });
        const currentAssetCount = await tx.asset.count({ where: { tenantId } });
        assertAssetCreationAllowed(subscription ? {
          status: subscription.status,
          trialEndsAt: subscription.trialEndsAt,
          maxAssets: subscription.plan.maxAssets,
          currentAssetCount,
          now: new Date(),
        } : null);

        const [model, manufacturer, supplier, location] = await Promise.all([
          input.modelId
            ? tx.assetModel.findFirst({ where: { id: input.modelId, tenantId, isActive: true }, select: { id: true, fieldSchema: true } })
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
        const validatedFields = validateCustomFieldValues(model?.fieldSchema ?? null, input.customFields ?? {});

        const asset = await tx.asset.create({
          data: {
            tenantId,
            inventoryNumber: input.inventoryNumber,
            assetNumber: input.assetNumber || undefined,
            serialNumber: input.serialNumber || undefined,
            title: input.title,
            description: input.description || undefined,
            modelId: input.modelId || undefined,
            customFields: validatedFields,
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
      if (error instanceof CustomFieldValidationError) {
        sendError(response, 400, error.code, error.message);
        return;
      }
      if (error instanceof AssetPlanLimitError) {
        response.status(409).json({
          error: {
            code: error.code,
            message: error.message,
            limit: error.limit,
            current: error.current,
            maximum: error.maximum,
            nextStep: "Ask your company administrator or platform administrator to upgrade the subscription plan.",
          },
        });
        return;
      }
      if (error instanceof SubscriptionAccessError) {
        const statusCode = error.code === "SUBSCRIPTION_NOT_CONFIGURED" ? 409 : 403;
        sendError(response, statusCode, error.code, error.message);
        return;
      }
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


const assetUpdateSchema = z.object({
  assetNumber: z.string().trim().max(191).optional(),
  serialNumber: z.string().trim().max(191).optional(),
  title: z.string().trim().min(1).max(191).optional(),
  description: z.string().trim().max(20000).optional(),
  modelId: z.string().trim().min(1).optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
  manufacturerId: z.string().trim().min(1).optional(),
  supplierId: z.string().trim().min(1).optional(),
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
}).strict().refine(
  (input) => Object.values(input).some((value) => value !== undefined),
  "Provide at least one field to update.",
);

const financialFields = new Set([
  "purchaseOrderNumber",
  "accountCode",
  "purchasedAt",
  "purchaseCost",
  "salvageValue",
  "warrantyStart",
  "warrantyEnd",
  "expectedLifeMonths",
  "depreciationMethod",
]);

assetRouter.patch(
  "/:id",
  requireSession,
  requireTenant,
  requirePermission("asset.update"),
  requireCsrf,
  async (request, response, next) => {
    try {
      const assetId = request.params.id;
      if (typeof assetId !== "string" || assetId.length === 0) {
        sendError(response, 400, "INVALID_ROUTE_PARAMETER", "A valid asset ID is required.");
        return;
      }

      const tenantId = request.auth?.tenantId;
      const actorUserId = request.auth?.userId;
      if (!tenantId || !actorUserId || !request.auth?.membershipId) {
        sendError(response, 400, "TENANT_CONTEXT_REQUIRED", "Select a workspace before continuing.");
        return;
      }

      const parsed = assetUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        sendError(response, 400, "VALIDATION_ERROR", "Check the fields you want to update.");
        return;
      }

      const input = parsed.data;
      const financialUpdateRequested = Object.keys(input).some((key) => financialFields.has(key));
      if (financialUpdateRequested && !request.auth.permissions?.includes("asset.financial.update")) {
        sendError(response, 403, "FINANCIAL_PERMISSION_REQUIRED", "You are not allowed to change asset financial or warranty fields.");
        return;
      }

      const result = await prisma.$transaction(async (tx) => {
        const existing = await tx.asset.findFirst({
          where: { id: assetId, tenantId },
        });
        if (!existing) throw new Error("ASSET_NOT_FOUND");

        if (
          !request.auth?.allLocationsAccess &&
          (!existing.currentLocationId || !(request.auth?.accessibleLocationIds ?? []).includes(existing.currentLocationId))
        ) {
          throw new Error("ASSET_NOT_FOUND");
        }

        const [model, manufacturer, supplier] = await Promise.all([
          input.modelId
            ? tx.assetModel.findFirst({ where: { id: input.modelId, tenantId, isActive: true }, select: { id: true, fieldSchema: true } })
            : Promise.resolve(null),
          input.manufacturerId
            ? tx.manufacturer.findFirst({ where: { id: input.manufacturerId, tenantId, isActive: true }, select: { id: true } })
            : Promise.resolve(null),
          input.supplierId
            ? tx.supplier.findFirst({ where: { id: input.supplierId, tenantId, isActive: true }, select: { id: true } })
            : Promise.resolve(null),
        ]);
        if (input.modelId && !model) throw new Error("ASSET_REFERENCE_INVALID");
        if (input.manufacturerId && !manufacturer) throw new Error("ASSET_REFERENCE_INVALID");
        if (input.supplierId && !supplier) throw new Error("ASSET_REFERENCE_INVALID");
        const targetModelId = input.modelId ?? existing.modelId;
        const targetModel = input.modelId ? model : targetModelId
          ? await tx.assetModel.findFirst({ where: { id: targetModelId, tenantId }, select: { fieldSchema: true } })
          : null;
        const validatedFields = input.customFields !== undefined || input.modelId !== undefined
          ? validateCustomFieldValues(
              targetModel?.fieldSchema ?? null,
              input.customFields ?? (input.modelId !== undefined ? {} : existing.customFields ?? {}),
            )
          : undefined;

        const updated = await tx.asset.update({
          where: { id: existing.id },
          data: {
            ...(input.assetNumber !== undefined ? { assetNumber: input.assetNumber } : {}),
            ...(input.serialNumber !== undefined ? { serialNumber: input.serialNumber } : {}),
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.modelId !== undefined ? { modelId: input.modelId } : {}),
            ...(validatedFields !== undefined ? { customFields: validatedFields } : {}),
            ...(input.manufacturerId !== undefined ? { manufacturerId: input.manufacturerId } : {}),
            ...(input.supplierId !== undefined ? { supplierId: input.supplierId } : {}),
            ...(input.purchaseOrderNumber !== undefined ? { purchaseOrderNumber: input.purchaseOrderNumber } : {}),
            ...(input.accountCode !== undefined ? { accountCode: input.accountCode } : {}),
            ...(input.purchasedAt !== undefined ? { purchasedAt: dateValue(input.purchasedAt) } : {}),
            ...(input.purchaseCost !== undefined ? { purchaseCost: input.purchaseCost } : {}),
            ...(input.salvageValue !== undefined ? { salvageValue: input.salvageValue } : {}),
            ...(input.warrantyStart !== undefined ? { warrantyStart: dateValue(input.warrantyStart) } : {}),
            ...(input.warrantyEnd !== undefined ? { warrantyEnd: dateValue(input.warrantyEnd) } : {}),
            ...(input.expectedLifeMonths !== undefined ? { expectedLifeMonths: input.expectedLifeMonths } : {}),
            ...(input.depreciationMethod !== undefined ? { depreciationMethod: input.depreciationMethod } : {}),
            ...(input.notes !== undefined ? { notes: input.notes } : {}),
          },
        });

        await tx.assetTransaction.create({
          data: {
            tenantId,
            assetId: updated.id,
            eventType: "CORRECTED",
            actorUserId,
            notes: "Asset details updated",
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId,
            actorUserId,
            action: "asset.updated",
            entityType: "Asset",
            entityId: updated.id,
            oldData: {
              inventoryNumber: existing.inventoryNumber,
              assetNumber: existing.assetNumber,
              serialNumber: existing.serialNumber,
              title: existing.title,
              description: existing.description,
              modelId: existing.modelId,
              manufacturerId: existing.manufacturerId,
              supplierId: existing.supplierId,
              currentLocationId: existing.currentLocationId,
              assignedEmployeeId: existing.assignedEmployeeId,
              purchaseOrderNumber: existing.purchaseOrderNumber,
              accountCode: existing.accountCode,
              purchasedAt: existing.purchasedAt?.toISOString() ?? null,
              purchaseCost: existing.purchaseCost?.toString() ?? null,
              salvageValue: existing.salvageValue?.toString() ?? null,
              warrantyStart: existing.warrantyStart?.toISOString() ?? null,
              warrantyEnd: existing.warrantyEnd?.toISOString() ?? null,
              expectedLifeMonths: existing.expectedLifeMonths,
              depreciationMethod: existing.depreciationMethod,
              notes: existing.notes,
              status: existing.status,
            },
            newData: {
              inventoryNumber: updated.inventoryNumber,
              assetNumber: updated.assetNumber,
              serialNumber: updated.serialNumber,
              title: updated.title,
              description: updated.description,
              modelId: updated.modelId,
              manufacturerId: updated.manufacturerId,
              supplierId: updated.supplierId,
              currentLocationId: updated.currentLocationId,
              assignedEmployeeId: updated.assignedEmployeeId,
              purchaseOrderNumber: updated.purchaseOrderNumber,
              accountCode: updated.accountCode,
              purchasedAt: updated.purchasedAt?.toISOString() ?? null,
              purchaseCost: updated.purchaseCost?.toString() ?? null,
              salvageValue: updated.salvageValue?.toString() ?? null,
              warrantyStart: updated.warrantyStart?.toISOString() ?? null,
              warrantyEnd: updated.warrantyEnd?.toISOString() ?? null,
              expectedLifeMonths: updated.expectedLifeMonths,
              depreciationMethod: updated.depreciationMethod,
              notes: updated.notes,
              status: updated.status,
            },
            ipAddress: request.ip?.slice(0, 64),
          },
        });

        return tx.asset.findFirst({
          where: { id: updated.id, tenantId },
          include: assetInclude,
        });
      });

      response.status(200).json({ data: result });
    } catch (error) {
      if (error instanceof CustomFieldValidationError) {
        sendError(response, 400, error.code, error.message);
        return;
      }
      if (error instanceof Error && error.message === "ASSET_NOT_FOUND") {
        sendError(response, 404, "ASSET_NOT_FOUND", "The requested asset was not found.");
        return;
      }
      if (error instanceof Error && error.message === "ASSET_REFERENCE_INVALID") {
        sendError(response, 400, "INVALID_REFERENCE", "Choose active reference data from this workspace.");
        return;
      }
      if (isForeignKeyError(error)) {
        sendError(response, 400, "INVALID_REFERENCE", "One of the selected references is no longer available.");
        return;
      }
      next(error);
    }
  },
);


const assetAssignmentSchema = z.object({
  employeeId: z.string().trim().min(1),
  notes: z.string().trim().max(4000).optional(),
}).strict();

const assetUnassignmentSchema = z.object({
  notes: z.string().trim().max(4000).optional(),
}).strict();

function canManageAssetLocation(
  request: import("express").Request,
  locationId: string | null,
): boolean {
  if (request.auth?.allLocationsAccess) return true;
  return Boolean(locationId && request.auth?.manageableLocationIds?.includes(locationId));
}

assetRouter.post(
  "/:id/assign",
  requireSession,
  requireTenant,
  requirePermission("asset.assign"),
  requireCsrf,
  async (request, response, next) => {
    try {
      const assetId = request.params.id;
      if (typeof assetId !== "string" || assetId.length === 0) {
        sendError(response, 400, "INVALID_ROUTE_PARAMETER", "A valid asset ID is required.");
        return;
      }

      const tenantId = request.auth?.tenantId;
      const actorUserId = request.auth?.userId;
      if (!tenantId || !actorUserId || !request.auth?.membershipId) {
        sendError(response, 400, "TENANT_CONTEXT_REQUIRED", "Select a workspace before continuing.");
        return;
      }

      const parsed = assetAssignmentSchema.safeParse(request.body);
      if (!parsed.success) {
        sendError(response, 400, "VALIDATION_ERROR", "Choose a valid employee and check the assignment note.");
        return;
      }

      const input = parsed.data;
      const result = await prisma.$transaction(async (tx) => {
        const asset = await tx.asset.findFirst({
          where: { id: assetId, tenantId },
        });
        if (!asset) throw new Error("ASSET_NOT_FOUND");
        if (!canManageAssetLocation(request, asset.currentLocationId)) {
          throw new Error("ASSET_LOCATION_SCOPE_DENIED");
        }
        if (asset.status !== "AVAILABLE" || asset.assignedEmployeeId !== null) {
          throw new Error("ASSET_NOT_AVAILABLE");
        }
        if (!asset.currentLocationId) throw new Error("ASSET_LOCATION_REQUIRED");

        const employee = await tx.employee.findFirst({
          where: {
            id: input.employeeId,
            tenantId,
            isActive: true,
            homeLocationId: asset.currentLocationId,
          },
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            homeLocationId: true,
            isActive: true,
          },
        });
        if (!employee || !canAssignAssetToEmployee(asset, employee)) throw new Error("EMPLOYEE_LOCATION_MISMATCH");

        const changed = await tx.asset.updateMany({
          where: {
            id: asset.id,
            tenantId,
            status: "AVAILABLE",
            assignedEmployeeId: null,
            currentLocationId: asset.currentLocationId,
          },
          data: {
            status: "ASSIGNED",
            assignedEmployeeId: employee.id,
          },
        });
        if (changed.count !== 1) throw new Error("ASSET_CONCURRENT_CHANGE");

        const updated = await tx.asset.findFirst({
          where: { id: asset.id, tenantId },
          include: assetInclude,
        });

        await tx.assetTransaction.create({
          data: {
            tenantId,
            assetId: asset.id,
            eventType: "ASSIGNED",
            fromLocationId: asset.currentLocationId,
            toLocationId: asset.currentLocationId,
            toEmployeeId: employee.id,
            actorUserId,
            notes: `Assigned to ${employee.firstName} ${employee.lastName} (${employee.employeeCode}).${input.notes ? ` ${input.notes}` : ""}`,
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId,
            actorUserId,
            action: "asset.assigned",
            entityType: "Asset",
            entityId: asset.id,
            oldData: {
              status: asset.status,
              assignedEmployeeId: asset.assignedEmployeeId,
              currentLocationId: asset.currentLocationId,
            },
            newData: {
              status: "ASSIGNED",
              assignedEmployeeId: employee.id,
              currentLocationId: asset.currentLocationId,
            },
            ipAddress: request.ip?.slice(0, 64),
          },
        });

        return updated;
      });

      response.status(200).json({ data: result });
    } catch (error) {
      if (error instanceof CustomFieldValidationError) {
        sendError(response, 400, error.code, error.message);
        return;
      }
      if (error instanceof Error && error.message === "ASSET_NOT_FOUND") {
        sendError(response, 404, "ASSET_NOT_FOUND", "The requested asset was not found.");
        return;
      }
      if (error instanceof Error && error.message === "ASSET_LOCATION_SCOPE_DENIED") {
        sendError(response, 403, "LOCATION_ACCESS_DENIED", "You must manage this asset's location to assign it.");
        return;
      }
      if (error instanceof Error && error.message === "ASSET_NOT_AVAILABLE") {
        sendError(response, 409, "ASSET_NOT_AVAILABLE", "Only available, unassigned assets can be assigned.");
        return;
      }
      if (error instanceof Error && error.message === "ASSET_LOCATION_REQUIRED") {
        sendError(response, 400, "LOCATION_REQUIRED", "Assign the asset to a location before assigning a custodian.");
        return;
      }
      if (error instanceof Error && error.message === "EMPLOYEE_LOCATION_MISMATCH") {
        sendError(response, 400, "EMPLOYEE_LOCATION_MISMATCH", "Choose an active employee whose home location matches the asset location.");
        return;
      }
      if (error instanceof Error && error.message === "ASSET_CONCURRENT_CHANGE") {
        sendError(response, 409, "ASSET_CHANGED", "The asset changed during assignment. Refresh and try again.");
        return;
      }
      next(error);
    }
  },
);

assetRouter.post(
  "/:id/unassign",
  requireSession,
  requireTenant,
  requirePermission("asset.assign"),
  requireCsrf,
  async (request, response, next) => {
    try {
      const assetId = request.params.id;
      if (typeof assetId !== "string" || assetId.length === 0) {
        sendError(response, 400, "INVALID_ROUTE_PARAMETER", "A valid asset ID is required.");
        return;
      }

      const tenantId = request.auth?.tenantId;
      const actorUserId = request.auth?.userId;
      if (!tenantId || !actorUserId || !request.auth?.membershipId) {
        sendError(response, 400, "TENANT_CONTEXT_REQUIRED", "Select a workspace before continuing.");
        return;
      }

      const parsed = assetUnassignmentSchema.safeParse(request.body);
      if (!parsed.success) {
        sendError(response, 400, "VALIDATION_ERROR", "Check the return note and try again.");
        return;
      }

      const result = await prisma.$transaction(async (tx) => {
        const asset = await tx.asset.findFirst({
          where: { id: assetId, tenantId },
        });
        if (!asset) throw new Error("ASSET_NOT_FOUND");
        if (!canManageAssetLocation(request, asset.currentLocationId)) {
          throw new Error("ASSET_LOCATION_SCOPE_DENIED");
        }
        if (!canReturnAssetToStock(asset)) {
          throw new Error("ASSET_NOT_ASSIGNED");
        }
        const assignedEmployeeId = asset.assignedEmployeeId;
        if (!assignedEmployeeId) throw new Error("ASSET_NOT_ASSIGNED");

        const employee = await tx.employee.findFirst({
          where: { id: assignedEmployeeId, tenantId },
          select: { id: true, employeeCode: true, firstName: true, lastName: true },
        });

        const changed = await tx.asset.updateMany({
          where: {
            id: asset.id,
            tenantId,
            status: "ASSIGNED",
            assignedEmployeeId: asset.assignedEmployeeId,
            currentLocationId: asset.currentLocationId,
          },
          data: { status: "AVAILABLE", assignedEmployeeId: null },
        });
        if (changed.count !== 1) throw new Error("ASSET_CONCURRENT_CHANGE");

        const updated = await tx.asset.findFirst({
          where: { id: asset.id, tenantId },
          include: assetInclude,
        });

        await tx.assetTransaction.create({
          data: {
            tenantId,
            assetId: asset.id,
            eventType: "UNASSIGNED",
            fromLocationId: asset.currentLocationId,
            toLocationId: asset.currentLocationId,
            fromEmployeeId: asset.assignedEmployeeId,
            actorUserId,
            notes: `Returned from ${employee ? `${employee.firstName} ${employee.lastName} (${employee.employeeCode})` : "the assigned employee"}.${parsed.data.notes ? ` ${parsed.data.notes}` : ""}`,
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId,
            actorUserId,
            action: "asset.unassigned",
            entityType: "Asset",
            entityId: asset.id,
            oldData: {
              status: asset.status,
              assignedEmployeeId: asset.assignedEmployeeId,
              currentLocationId: asset.currentLocationId,
            },
            newData: {
              status: "AVAILABLE",
              assignedEmployeeId: null,
              currentLocationId: asset.currentLocationId,
            },
            ipAddress: request.ip?.slice(0, 64),
          },
        });

        return updated;
      });

      response.status(200).json({ data: result });
    } catch (error) {
      if (error instanceof CustomFieldValidationError) {
        sendError(response, 400, error.code, error.message);
        return;
      }
      if (error instanceof Error && error.message === "ASSET_NOT_FOUND") {
        sendError(response, 404, "ASSET_NOT_FOUND", "The requested asset was not found.");
        return;
      }
      if (error instanceof Error && error.message === "ASSET_LOCATION_SCOPE_DENIED") {
        sendError(response, 403, "LOCATION_ACCESS_DENIED", "You must manage this asset's location to unassign it.");
        return;
      }
      if (error instanceof Error && error.message === "ASSET_NOT_ASSIGNED") {
        sendError(response, 409, "ASSET_NOT_ASSIGNED", "This asset is not currently assigned to an employee.");
        return;
      }
      if (error instanceof Error && error.message === "ASSET_LOCATION_REQUIRED") {
        sendError(response, 400, "LOCATION_REQUIRED", "A location is required for the asset return.");
        return;
      }
      if (error instanceof Error && error.message === "ASSET_CONCURRENT_CHANGE") {
        sendError(response, 409, "ASSET_CHANGED", "The asset changed during return. Refresh and try again.");
        return;
      }
      next(error);
    }
  },
);
