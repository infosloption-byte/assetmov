import { Router, type Response } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireCsrf, requireSession } from "../auth/auth-middleware.js";
import { requirePermission, requireTenant } from "../tenancy/tenant-context.js";

export const fileRouter = Router();
fileRouter.use(requireSession, requireTenant);

const MAX_FILE_SIZE = 512 * 1024;
const uploadSchema = z.object({
  assetId: z.string().min(1).max(36),
  filename: z.string().trim().min(1).max(191).refine(
    (name) => !name.includes("/") && !name.includes("\\") &&
      Array.from(name).every((character) => {
        const code = character.codePointAt(0);
        return code !== undefined && code >= 32 && code !== 127;
      }),
    "Filename cannot contain path separators or control characters.",
  ),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain"]),
  contentBase64: z.string().min(4).max(Math.ceil(MAX_FILE_SIZE * 4 / 3) + 8),
}).strict();

function fail(response: Response, status: number, code: string) {
  response.status(status).json({ error: { code, message: code.replaceAll("_", " ").toLowerCase() } });
}

async function accessibleAsset(tenantId: string, assetId: string, allAccess: boolean, scope: string[]) {
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, tenantId },
    select: { id: true, currentLocationId: true },
  });
  if (!asset || (!allAccess && (!asset.currentLocationId || !scope.includes(asset.currentLocationId)))) return null;
  return asset;
}

fileRouter.get("/usage", requirePermission("tenant.settings.manage"), async (request, response, next) => {
  try {
    const tenantId = request.auth!.tenantId!;
    const [subscription, assets, activeUsers, bytes] = await Promise.all([
      prisma.tenantSubscription.findUnique({ where: { tenantId }, include: { plan: true } }),
      prisma.asset.count({ where: { tenantId } }),
      prisma.membership.count({ where: { tenantId, isActive: true } }),
      prisma.tenantStorageObject.aggregate({ where: { tenantId }, _sum: { sizeBytes: true } }),
    ]);
    response.json({ data: {
      subscription: subscription ? {
        status: subscription.status,
        trialEndsAt: subscription.trialEndsAt,
        plan: {
          id: subscription.plan.id, name: subscription.plan.name,
          maxAssets: subscription.plan.maxAssets,
          maxActiveUsers: subscription.plan.maxActiveUsers,
          storageLimitBytes: subscription.plan.storageLimitBytes?.toString() ?? null,
          trialDurationDays: subscription.plan.trialDurationDays,
        },
      } : null,
      assets, activeUsers, storageUsedBytes: String(bytes._sum.sizeBytes ?? 0),
    } });
  } catch (error) { next(error); }
});

fileRouter.get("/assets/:assetId", requirePermission("asset.read"), async (request, response, next) => {
  try {
    const tenantId = request.auth!.tenantId!;
    const assetId = request.params.assetId;
    if (typeof assetId !== "string" || !await accessibleAsset(
      tenantId, assetId, !!request.auth!.allLocationsAccess, request.auth!.accessibleLocationIds ?? [],
    )) { fail(response, 404, "ASSET_NOT_FOUND"); return; }
    const data = await prisma.tenantStorageObject.findMany({
      where: { tenantId, assetId }, orderBy: { createdAt: "desc" },
      select: { id: true, filename: true, mimeType: true, sizeBytes: true, createdAt: true },
    });
    response.json({ data });
  } catch (error) { next(error); }
});

fileRouter.post("/", requirePermission("asset.update"), requireCsrf, async (request, response, next) => {
  const parsed = uploadSchema.safeParse(request.body);
  if (!parsed.success) { fail(response, 400, "INVALID_UPLOAD"); return; }
  const { assetId, filename, mimeType, contentBase64 } = parsed.data;
  const bytes = Buffer.from(contentBase64, "base64");
  if (!bytes.length || bytes.length > MAX_FILE_SIZE ||
      bytes.toString("base64").replace(/=+$/, "") !== contentBase64.replace(/=+$/, "")) {
    fail(response, 400, "INVALID_UPLOAD"); return;
  }
  const tenantId = request.auth!.tenantId!;
  try {
    const asset = await accessibleAsset(
      tenantId, assetId, !!request.auth!.allLocationsAccess, request.auth!.manageableLocationIds ?? [],
    );
    if (!asset) { fail(response, 404, "ASSET_NOT_FOUND"); return; }
    const item = await prisma.$transaction(async tx => {
      // All storage-consuming writes for the company must take this same lock.
      await tx.$queryRaw`SELECT id FROM TenantSubscription WHERE tenantId = ${tenantId} FOR UPDATE`;
      const subscription = await tx.tenantSubscription.findUnique({
        where: { tenantId }, include: { plan: { select: { storageLimitBytes: true } } },
      });
      if (!subscription) throw new Error("SUBSCRIPTION_NOT_CONFIGURED");
      if (subscription.status !== "ACTIVE" && subscription.status !== "TRIALING") throw new Error("SUBSCRIPTION_INACTIVE");
      if (subscription.status === "TRIALING" && (!subscription.trialEndsAt || subscription.trialEndsAt <= new Date())) {
        throw new Error("SUBSCRIPTION_EXPIRED");
      }
      const used = await tx.tenantStorageObject.aggregate({
        where: { tenantId }, _sum: { sizeBytes: true },
      });
      if (subscription.plan.storageLimitBytes !== null &&
          BigInt(used._sum.sizeBytes ?? 0) + BigInt(bytes.length) > subscription.plan.storageLimitBytes) {
        throw new Error("STORAGE_LIMIT_REACHED");
      }
      // Repeat the tenant/asset condition inside the transaction.
      const matchingAsset = await tx.asset.findFirst({ where: { id: assetId, tenantId }, select: { id: true } });
      if (!matchingAsset) throw new Error("ASSET_NOT_FOUND");
      const saved = await tx.tenantStorageObject.create({
        data: { tenantId, assetId, filename, mimeType, sizeBytes: bytes.length, content: bytes },
        select: { id: true, filename: true, mimeType: true, sizeBytes: true, createdAt: true },
      });
      await tx.auditLog.create({ data: {
        tenantId, actorUserId: request.auth!.userId, action: "asset_file.uploaded",
        entityType: "TenantStorageObject", entityId: saved.id,
        newData: { assetId, filename, sizeBytes: bytes.length },
      } });
      return saved;
    });
    response.status(201).json({ data: item });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const status: Record<string, number> = {
      SUBSCRIPTION_NOT_CONFIGURED: 409, SUBSCRIPTION_INACTIVE: 403,
      SUBSCRIPTION_EXPIRED: 403, STORAGE_LIMIT_REACHED: 409, ASSET_NOT_FOUND: 404,
    };
    if (code in status) { fail(response, status[code]!, code); return; }
    next(error);
  }
});

fileRouter.get("/:id/download", requirePermission("asset.read"), async (request, response, next) => {
  try {
    const id = request.params.id;
    if (typeof id !== "string") { fail(response, 404, "FILE_NOT_FOUND"); return; }
    const tenantId = request.auth!.tenantId!;
    const file = await prisma.tenantStorageObject.findFirst({ where: { id, tenantId } });
    if (!file || !await accessibleAsset(
      tenantId, file.assetId, !!request.auth!.allLocationsAccess, request.auth!.accessibleLocationIds ?? [],
    )) { fail(response, 404, "FILE_NOT_FOUND"); return; }
    response.setHeader("Content-Type", file.mimeType);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Content-Disposition", "attachment; filename*=UTF-8''" + encodeURIComponent(file.filename));
    response.setHeader("Cache-Control", "private, no-store");
    response.status(200).send(Buffer.from(file.content));
  } catch (error) { next(error); }
});

fileRouter.delete("/:id", requirePermission("asset.update"), requireCsrf, async (request, response, next) => {
  try {
    const id = request.params.id;
    if (typeof id !== "string") { fail(response, 404, "FILE_NOT_FOUND"); return; }
    const tenantId = request.auth!.tenantId!;
    const file = await prisma.tenantStorageObject.findFirst({
      where: { id, tenantId }, select: { id: true, assetId: true, filename: true, sizeBytes: true },
    });
    if (!file || !await accessibleAsset(
      tenantId, file.assetId, !!request.auth!.allLocationsAccess, request.auth!.manageableLocationIds ?? [],
    )) { fail(response, 404, "FILE_NOT_FOUND"); return; }
    await prisma.$transaction(async tx => {
      const removed = await tx.tenantStorageObject.deleteMany({ where: { id, tenantId, assetId: file.assetId } });
      if (removed.count) {
        await tx.auditLog.create({ data: {
          tenantId, actorUserId: request.auth!.userId, action: "asset_file.deleted",
          entityType: "TenantStorageObject", entityId: id,
          oldData: { assetId: file.assetId, filename: file.filename, sizeBytes: file.sizeBytes },
        } });
      }
    });
    response.status(204).end();
  } catch (error) { next(error); }
});
