import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireCsrf, requireSession } from "../auth/auth-middleware.js";
import { requireAnyPermission, requirePermission, requireTenant } from "../tenancy/tenant-context.js";
import { areAllTransferLinesResolved, summarizeTransferStatus } from "./transfer-status.js";

export const transferRouter = Router();

const transferListSchema = z.object({
  direction: z.enum(["all", "outgoing", "incoming"]).default("all"),
  status: z.enum(["IN_TRANSIT", "PARTIALLY_RECEIVED", "RECEIVED", "REJECTED", "CANCELLED"]).optional(),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const dispatchSchema = z.object({
  originLocationId: z.string().trim().min(1),
  destinationLocationId: z.string().trim().min(1),
  assetIds: z.array(z.string().trim().min(1)).min(1).max(100),
  notes: z.string().trim().max(4000).optional(),
}).strict().refine(
  (input) => input.originLocationId !== input.destinationLocationId,
  { message: "Origin and destination must be different locations.", path: ["destinationLocationId"] },
).refine(
  (input) => new Set(input.assetIds).size === input.assetIds.length,
  { message: "Do not include the same asset more than once.", path: ["assetIds"] },
);

const receiveSchema = z.object({
  decisions: z.array(z.object({
    lineId: z.string().trim().min(1),
    decision: z.enum(["RECEIVED", "REJECTED"]),
    reason: z.string().trim().max(2000).optional(),
  }).strict()).min(1).max(100),
}).strict().refine(
  (input) => new Set(input.decisions.map((decision) => decision.lineId)).size === input.decisions.length,
  { message: "Each transfer line can only be decided once per submission.", path: ["decisions"] },
).refine(
  (input) => input.decisions.every((decision) =>
    decision.decision !== "REJECTED" || Boolean(decision.reason && decision.reason.length >= 3),
  ),
  { message: "A rejection reason of at least 3 characters is required.", path: ["decisions"] },
);

const transferInclude = {
  originLocation: { select: { id: true, name: true, code: true } },
  destinationLocation: { select: { id: true, name: true, code: true } },
  createdBy: { select: { id: true, fullName: true, email: true } },
  lines: {
    include: {
      asset: {
        select: {
          id: true,
          inventoryNumber: true,
          assetNumber: true,
          serialNumber: true,
          title: true,
          status: true,
          currentLocationId: true,
        },
      },
      resolvedBy: { select: { id: true, fullName: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

const transferListInclude = {
  originLocation: { select: { id: true, name: true, code: true } },
  destinationLocation: { select: { id: true, name: true, code: true } },
  createdBy: { select: { id: true, fullName: true } },
  _count: { select: { lines: true } },
} as const;

function sendError(
  response: import("express").Response,
  status: number,
  code: string,
  message: string,
): void {
  response.status(status).json({ error: { code, message } });
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

function hasLocationAccess(request: import("express").Request, locationId: string): boolean {
  return Boolean(
    request.auth?.allLocationsAccess ||
    request.auth?.accessibleLocationIds?.includes(locationId),
  );
}

function hasLocationManagement(request: import("express").Request, locationId: string): boolean {
  return Boolean(
    request.auth?.allLocationsAccess ||
    request.auth?.manageableLocationIds?.includes(locationId),
  );
}

function transferNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `TR-${date}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

transferRouter.get(
  "/",
  requireSession,
  requireTenant,
  requireAnyPermission(["asset.transfer.read", "asset.transfer.dispatch", "asset.transfer.receive"]),
  async (request, response, next) => {
    try {
      const tenantId = request.auth?.tenantId;
      if (!tenantId) {
        sendError(response, 400, "TENANT_CONTEXT_REQUIRED", "Select a workspace before continuing.");
        return;
      }

      const parsed = transferListSchema.safeParse(request.query);
      if (!parsed.success) {
        sendError(response, 400, "VALIDATION_ERROR", "Check the transfer filters and pagination values.");
        return;
      }

      const { direction, status, page, pageSize } = parsed.data;
      const scopeIds = request.auth?.allLocationsAccess
        ? undefined
        : (request.auth?.accessibleLocationIds ?? []);

      const locationScopeWhere = request.auth?.allLocationsAccess
        ? {}
        : direction === "outgoing"
          ? { originLocationId: { in: scopeIds } }
          : direction === "incoming"
            ? { destinationLocationId: { in: scopeIds } }
            : {
                OR: [
                  { originLocationId: { in: scopeIds } },
                  { destinationLocationId: { in: scopeIds } },
                ],
              };

      const where = {
        tenantId,
        ...(status ? { status } : {}),
        ...locationScopeWhere,
      };

      const [total, data] = await Promise.all([
        prisma.assetTransfer.count({ where }),
        prisma.assetTransfer.findMany({
          where,
          include: transferListInclude,
          orderBy: [{ createdAt: "desc" }],
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

transferRouter.get(
  "/:id",
  requireSession,
  requireTenant,
  requireAnyPermission(["asset.transfer.read", "asset.transfer.dispatch", "asset.transfer.receive"]),
  async (request, response, next) => {
    try {
      const tenantId = request.auth?.tenantId;
      if (!tenantId) {
        sendError(response, 400, "TENANT_CONTEXT_REQUIRED", "Select a workspace before continuing.");
        return;
      }

      const transfer = await prisma.assetTransfer.findFirst({
        where: { id: request.params.id, tenantId },
        include: transferInclude,
      });

      if (
        !transfer ||
        (!hasLocationAccess(request, transfer.originLocationId) &&
          !hasLocationAccess(request, transfer.destinationLocationId))
      ) {
        sendError(response, 404, "TRANSFER_NOT_FOUND", "The requested transfer was not found.");
        return;
      }

      response.status(200).json({ data: transfer });
    } catch (error) {
      next(error);
    }
  },
);

transferRouter.post(
  "/",
  requireSession,
  requireTenant,
  requirePermission("asset.transfer.dispatch"),
  requireCsrf,
  async (request, response, next) => {
    try {
      const tenantId = request.auth?.tenantId;
      const actorUserId = request.auth?.userId;
      if (!tenantId || !actorUserId || !request.auth?.membershipId) {
        sendError(response, 400, "TENANT_CONTEXT_REQUIRED", "Select a workspace before continuing.");
        return;
      }

      const parsed = dispatchSchema.safeParse(request.body);
      if (!parsed.success) {
        sendError(response, 400, "VALIDATION_ERROR", "Check the origin, destination and selected assets.");
        return;
      }

      const input = parsed.data;
      if (!hasLocationManagement(request, input.originLocationId)) {
        sendError(response, 403, "LOCATION_ACCESS_DENIED", "You must manage the origin location to dispatch assets.");
        return;
      }
      if (!hasLocationAccess(request, input.destinationLocationId)) {
        sendError(response, 403, "DESTINATION_ACCESS_DENIED", "You do not have access to the destination location.");
        return;
      }

      const number = transferNumber();
      const transfer = await prisma.$transaction(async (tx) => {
        const locations = await tx.location.findMany({
          where: {
            tenantId,
            isActive: true,
            id: { in: [input.originLocationId, input.destinationLocationId] },
          },
          select: { id: true },
        });
        if (locations.length !== 2) throw new Error("TRANSFER_LOCATION_INVALID");

        const assets = await tx.asset.findMany({
          where: {
            tenantId,
            id: { in: input.assetIds },
            currentLocationId: input.originLocationId,
            status: "AVAILABLE",
          },
          select: {
            id: true,
            inventoryNumber: true,
            currentLocationId: true,
            status: true,
          },
        });
        if (assets.length !== input.assetIds.length) throw new Error("TRANSFER_ASSET_UNAVAILABLE");

        const created = await tx.assetTransfer.create({
          data: {
            tenantId,
            transferNumber: number,
            originLocationId: input.originLocationId,
            destinationLocationId: input.destinationLocationId,
            status: "IN_TRANSIT",
            notes: input.notes || undefined,
            createdByUserId: actorUserId,
            dispatchedAt: new Date(),
            lines: {
              create: assets.map((asset) => ({
                tenantId,
                assetId: asset.id,
                status: "IN_TRANSIT",
              })),
            },
          },
        });

        for (const asset of assets) {
          const changed = await tx.asset.updateMany({
            where: {
              id: asset.id,
              tenantId,
              currentLocationId: input.originLocationId,
              status: "AVAILABLE",
            },
            data: { status: "IN_TRANSIT" },
          });
          if (changed.count !== 1) throw new Error("TRANSFER_CONCURRENT_CHANGE");

          await tx.assetTransaction.create({
            data: {
              tenantId,
              assetId: asset.id,
              eventType: "TRANSFER_DISPATCHED",
              fromLocationId: input.originLocationId,
              toLocationId: input.destinationLocationId,
              actorUserId,
              notes: `Transfer ${number} dispatched.${input.notes ? ` ${input.notes}` : ""}`,
            },
          });
        }

        await tx.auditLog.create({
          data: {
            tenantId,
            actorUserId,
            action: "asset_transfer.dispatched",
            entityType: "AssetTransfer",
            entityId: created.id,
            newData: {
              transferNumber: number,
              originLocationId: input.originLocationId,
              destinationLocationId: input.destinationLocationId,
              assetIds: assets.map((asset) => asset.id),
              status: "IN_TRANSIT",
            },
            ipAddress: request.ip?.slice(0, 64),
          },
        });

        return tx.assetTransfer.findFirst({
          where: { id: created.id, tenantId },
          include: transferInclude,
        });
      });

      response.status(201).json({ data: transfer });
    } catch (error) {
      if (error instanceof Error && error.message === "TRANSFER_LOCATION_INVALID") {
        sendError(response, 400, "INVALID_LOCATION", "Choose active origin and destination locations in this workspace.");
        return;
      }
      if (error instanceof Error && error.message === "TRANSFER_ASSET_UNAVAILABLE") {
        sendError(response, 409, "ASSET_NOT_AVAILABLE", "Every selected asset must be available at the origin location.");
        return;
      }
      if (error instanceof Error && error.message === "TRANSFER_CONCURRENT_CHANGE") {
        sendError(response, 409, "ASSET_CHANGED", "An asset changed while dispatch was being processed. Refresh and try again.");
        return;
      }
      if (errorCode(error) === "P2002") {
        sendError(response, 409, "TRANSFER_NUMBER_CONFLICT", "A transfer number conflict occurred. Please retry.");
        return;
      }
      if (errorCode(error) === "P2003") {
        sendError(response, 400, "INVALID_REFERENCE", "One of the selected records is no longer available.");
        return;
      }
      next(error);
    }
  },
);

transferRouter.post(
  "/:id/receive",
  requireSession,
  requireTenant,
  requirePermission("asset.transfer.receive"),
  requireCsrf,
  async (request, response, next) => {
    try {
      const tenantId = request.auth?.tenantId;
      const actorUserId = request.auth?.userId;
      if (!tenantId || !actorUserId || !request.auth?.membershipId) {
        sendError(response, 400, "TENANT_CONTEXT_REQUIRED", "Select a workspace before continuing.");
        return;
      }

      const parsed = receiveSchema.safeParse(request.body);
      if (!parsed.success) {
        sendError(response, 400, "VALIDATION_ERROR", "Choose a valid decision for each selected transfer line.");
        return;
      }

      const input = parsed.data;
      const result = await prisma.$transaction(async (tx) => {
        // Serialize receipt decisions for this transfer so concurrent receivers
        // cannot overwrite the summary status using stale line snapshots.
        await tx.$queryRaw`SELECT id FROM AssetTransfer WHERE id = ${request.params.id} AND tenantId = ${tenantId} FOR UPDATE`;

        const transfer = await tx.assetTransfer.findFirst({
          where: { id: request.params.id, tenantId },
          include: { lines: true },
        });

        if (!transfer || !hasLocationAccess(request, transfer.destinationLocationId)) {
          throw new Error("TRANSFER_NOT_FOUND");
        }
        if (transfer.status !== "IN_TRANSIT" && transfer.status !== "PARTIALLY_RECEIVED") {
          throw new Error("TRANSFER_ALREADY_RESOLVED");
        }

        for (const decision of input.decisions) {
          const line = transfer.lines.find((candidate) => candidate.id === decision.lineId);
          if (!line || line.status !== "IN_TRANSIT") throw new Error("TRANSFER_LINE_ALREADY_RESOLVED");

          const accepted = decision.decision === "RECEIVED";
          const changed = await tx.asset.updateMany({
            where: {
              id: line.assetId,
              tenantId,
              status: "IN_TRANSIT",
              currentLocationId: transfer.originLocationId,
            },
            data: {
              status: "AVAILABLE",
              currentLocationId: accepted ? transfer.destinationLocationId : transfer.originLocationId,
              assignedEmployeeId: null,
            },
          });
          if (changed.count !== 1) throw new Error("TRANSFER_ASSET_CHANGED");

          const lineChanged = await tx.assetTransferLine.updateMany({
            where: { id: line.id, tenantId, status: "IN_TRANSIT" },
            data: {
              status: decision.decision,
              decisionReason: decision.reason || undefined,
              resolvedByUserId: actorUserId,
              resolvedAt: new Date(),
            },
          });
          if (lineChanged.count !== 1) throw new Error("TRANSFER_LINE_ALREADY_RESOLVED");

          await tx.assetTransaction.create({
            data: {
              tenantId,
              assetId: line.assetId,
              eventType: accepted ? "TRANSFER_RECEIVED" : "TRANSFER_REJECTED",
              fromLocationId: accepted ? transfer.originLocationId : transfer.destinationLocationId,
              toLocationId: accepted ? transfer.destinationLocationId : transfer.originLocationId,
              actorUserId,
              notes: accepted
                ? `Transfer ${transfer.transferNumber} received.${decision.reason ? ` ${decision.reason}` : ""}`
                : `Transfer ${transfer.transferNumber} rejected and returned to origin. Reason: ${decision.reason || "Not specified"}`,
            },
          });
        }

        const allLines = await tx.assetTransferLine.findMany({
          where: { tenantId, transferId: transfer.id },
          select: { status: true },
        });
        const lineStatuses = allLines.map((line) => line.status);
        const nextStatus = summarizeTransferStatus(lineStatuses);
        const allResolved = areAllTransferLinesResolved(lineStatuses);

        await tx.assetTransfer.update({
          where: { id: transfer.id },
          data: {
            status: nextStatus,
            completedAt: allResolved ? new Date() : null,
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId,
            actorUserId,
            action: "asset_transfer.receipt_decided",
            entityType: "AssetTransfer",
            entityId: transfer.id,
            oldData: { status: transfer.status },
            newData: {
              transferNumber: transfer.transferNumber,
              status: nextStatus,
              decisions: input.decisions,
            },
            ipAddress: request.ip?.slice(0, 64),
          },
        });

        return tx.assetTransfer.findFirst({
          where: { id: transfer.id, tenantId },
          include: transferInclude,
        });
      });

      response.status(200).json({ data: result });
    } catch (error) {
      if (error instanceof Error && error.message === "TRANSFER_NOT_FOUND") {
        sendError(response, 404, "TRANSFER_NOT_FOUND", "The requested incoming transfer was not found.");
        return;
      }
      if (error instanceof Error && error.message === "TRANSFER_ALREADY_RESOLVED") {
        sendError(response, 409, "TRANSFER_ALREADY_RESOLVED", "This transfer is already complete.");
        return;
      }
      if (error instanceof Error && error.message === "TRANSFER_LINE_ALREADY_RESOLVED") {
        sendError(response, 409, "TRANSFER_LINE_ALREADY_RESOLVED", "One of the selected lines has already been resolved.");
        return;
      }
      if (error instanceof Error && error.message === "TRANSFER_ASSET_CHANGED") {
        sendError(response, 409, "TRANSFER_ASSET_CHANGED", "An asset changed while receipt was being processed. Refresh and try again.");
        return;
      }
      next(error);
    }
  },
);
