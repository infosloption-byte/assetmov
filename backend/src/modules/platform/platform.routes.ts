import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireCsrf, requireSession } from "../auth/auth-middleware.js";

export const platformRouter = Router();

const MAX_SIGNED_BIGINT = 9_223_372_036_854_775_807n;
const resourceLimitSchema = z.number().int().min(0).max(2_000_000_000).nullable();
const storageLimitSchema = z.string()
  .regex(/^\d{1,19}$/, "Storage limit must be a byte count.")
  .transform((value) => BigInt(value))
  .refine((value) => value <= MAX_SIGNED_BIGINT, "Storage limit is too large.")
  .nullable();
const paddleId = z.string().trim().regex(/^pri_[a-z\d]{26}$/).nullable();
const paddleProduct = z.string().trim().regex(/^pro_[a-z\d]{26}$/).nullable();
const reasonSchema = z.string().trim().min(8).max(1000);

const planCreateSchema = z.object({
  key: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(2).max(60),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(4000).nullable(),
  maxAssets: resourceLimitSchema,
  maxActiveUsers: resourceLimitSchema,
  storageLimitBytes: storageLimitSchema,
  trialDurationDays: z.number().int().min(0).max(3650),
  isActive: z.boolean(),
  paddleProductId: paddleProduct.optional(),
  paddleSandboxMonthlyPriceId: paddleId.optional(),
  paddleSandboxYearlyPriceId: paddleId.optional(),
  paddleLiveMonthlyPriceId: paddleId.optional(),
  paddleLiveYearlyPriceId: paddleId.optional(),
  reason: reasonSchema,
}).strict();

const planUpdateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  maxAssets: resourceLimitSchema.optional(),
  maxActiveUsers: resourceLimitSchema.optional(),
  storageLimitBytes: storageLimitSchema.optional(),
  trialDurationDays: z.number().int().min(0).max(3650).optional(),
  isActive: z.boolean().optional(),
  paddleProductId: paddleProduct.optional(),
  paddleSandboxMonthlyPriceId: paddleId.optional(),
  paddleSandboxYearlyPriceId: paddleId.optional(),
  paddleLiveMonthlyPriceId: paddleId.optional(),
  paddleLiveYearlyPriceId: paddleId.optional(),
  reason: reasonSchema,
}).strict().refine(
  (value) => Object.keys(value).some((key) => key !== "reason"),
  "Provide at least one plan field to update.",
);

const tenantListSchema = z.object({
  q: z.string().trim().max(191).optional(),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

const subscriptionChangeSchema = z.object({
  planId: z.string().trim().min(1).max(191),
  mode: z.enum(["trial", "activate", "suspend"]),
  reason: reasonSchema,
}).strict();

type SerializablePlan = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  maxAssets: number | null;
  maxActiveUsers: number | null;
  storageLimitBytes: bigint | null;
  trialDurationDays: number;
  isActive: boolean;
  paddleProductId: string | null;
  paddleSandboxMonthlyPriceId: string | null;
  paddleSandboxYearlyPriceId: string | null;
  paddleLiveMonthlyPriceId: string | null;
  paddleLiveYearlyPriceId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function serializePlan(plan: SerializablePlan) {
  return {
    ...plan,
    storageLimitBytes: plan.storageLimitBytes?.toString() ?? null,
  };
}

function planAuditSnapshot(plan: SerializablePlan) {
  return {
    ...serializePlan(plan),
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

function sendError(response: import("express").Response, status: number, code: string, message: string): void {
  response.status(status).json({ error: { code, message } });
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return undefined;
}

/**
 * Platform authority is deliberately independent of tenant roles and membership.
 * Re-read the flag for every platform request so removing an operator's access
 * takes effect without waiting for their browser session to expire.
 */
export const requirePlatformAdmin: RequestHandler = async (request, response, next) => {
  try {
    const userId = request.auth?.userId;
    if (!userId) {
      sendError(response, 401, "UNAUTHENTICATED", "Please sign in to continue.");
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isPlatformAdmin: true, disabledAt: true },
    });

    if (!user || user.disabledAt || !user.isPlatformAdmin) {
      sendError(response, 403, "PLATFORM_ACCESS_DENIED", "Platform administrator access is required.");
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
};

platformRouter.get(
  "/plans",
  requireSession,
  requirePlatformAdmin,
  async (_request, response, next) => {
    try {
      const plans = await prisma.subscriptionPlan.findMany({
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
      });
      response.status(200).json({ data: plans.map(serializePlan) });
    } catch (error) {
      next(error);
    }
  },
);

platformRouter.post(
  "/plans",
  requireSession,
  requirePlatformAdmin,
  requireCsrf,
  async (request, response, next) => {
    try {
      const parsed = planCreateSchema.safeParse(request.body);
      if (!parsed.success) {
        sendError(response, 400, "VALIDATION_ERROR", "Check the plan details and audit reason.");
        return;
      }

      const { reason, ...input } = parsed.data;
      const chosenPrices = [
        input.paddleSandboxMonthlyPriceId, input.paddleSandboxYearlyPriceId,
        input.paddleLiveMonthlyPriceId, input.paddleLiveYearlyPriceId,
      ].filter((value): value is string => typeof value === "string");
      if (new Set(chosenPrices).size !== chosenPrices.length ||
          (chosenPrices.length > 0 && !input.paddleProductId)) {
        sendError(response, 400, "PADDLE_CATALOG_INVALID", "Choose one AssetMov product and distinct Paddle prices."); return;
      }
      const plan = await prisma.$transaction(async (tx) => {
        const created = await tx.subscriptionPlan.create({
          data: {
            ...input,
            storageLimitBytes: input.storageLimitBytes,
          },
        });
        await tx.platformAuditLog.create({
          data: {
            actorUserId: request.auth!.userId,
            action: "subscription_plan.created",
            entityType: "SubscriptionPlan",
            entityId: created.id,
            reason,
            newData: planAuditSnapshot(created),
            ipAddress: request.ip?.slice(0, 64),
            userAgent: request.get("user-agent")?.slice(0, 500),
          },
        });
        return created;
      });

      response.status(201).json({ data: serializePlan(plan) });
    } catch (error) {
      if (errorCode(error) === "P2002") {
        sendError(response, 409, "PLAN_KEY_EXISTS", "A plan with that key already exists.");
        return;
      }
      next(error);
    }
  },
);

platformRouter.patch(
  "/plans/:id",
  requireSession,
  requirePlatformAdmin,
  requireCsrf,
  async (request, response, next) => {
    try {
      const planId = request.params.id;
      if (typeof planId !== "string" || planId.length === 0) {
        sendError(response, 400, "INVALID_ROUTE_PARAMETER", "A valid subscription plan ID is required.");
        return;
      }

      const parsed = planUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        sendError(response, 400, "VALIDATION_ERROR", "Provide valid plan fields and an audit reason.");
        return;
      }

      const { reason, ...changes } = parsed.data;
      const plan = await prisma.$transaction(async (tx) => {
        const current = await tx.subscriptionPlan.findUnique({ where: { id: planId } });
        if (!current) throw new Error("PLAN_NOT_FOUND");
        const finalProduct = changes.paddleProductId === undefined ? current.paddleProductId : changes.paddleProductId;
        const fields = [
          "paddleSandboxMonthlyPriceId", "paddleSandboxYearlyPriceId",
          "paddleLiveMonthlyPriceId", "paddleLiveYearlyPriceId",
        ] as const;
        const finalPrices = fields.map(field => changes[field] === undefined ? current[field] : changes[field])
          .filter((price): price is string => typeof price === "string");
        if (new Set(finalPrices).size !== finalPrices.length ||
            (finalPrices.length > 0 && !finalProduct)) throw new Error("PADDLE_CATALOG_INVALID");
        if (current.paddleProductId !== finalProduct ||
            fields.some(field => (changes[field] ?? null) !== current[field] && changes[field] !== undefined)) {
          const boundSubscribers = await tx.tenantSubscription.count({
            where: { planId: current.id, billingSource: "PADDLE" },
          });
          if (boundSubscribers > 0) {
            throw new Error("PADDLE_PRICE_MAPPING_LOCKED");
          }
        }

        const updated = await tx.subscriptionPlan.update({
          where: { id: current.id },
          data: changes,
        });
        await tx.platformAuditLog.create({
          data: {
            actorUserId: request.auth!.userId,
            action: "subscription_plan.updated",
            entityType: "SubscriptionPlan",
            entityId: updated.id,
            reason,
            oldData: planAuditSnapshot(current),
            newData: planAuditSnapshot(updated),
            ipAddress: request.ip?.slice(0, 64),
            userAgent: request.get("user-agent")?.slice(0, 500),
          },
        });
        return updated;
      });

      response.status(200).json({ data: serializePlan(plan) });
    } catch (error) {
      if (error instanceof Error && error.message === "PADDLE_PRICE_MAPPING_LOCKED") {
        sendError(response, 409, "PADDLE_PRICE_MAPPING_LOCKED",
          "Existing Paddle subscriptions rely on this product/price mapping. Contact support for a planned migration.");
        return;
      }
      if (error instanceof Error && error.message === "PADDLE_CATALOG_INVALID") {
        sendError(response, 400, "PADDLE_CATALOG_INVALID", "Paddle plan needs one AssetMov product and distinct prices."); return;
      }
      if (error instanceof Error && error.message === "PLAN_NOT_FOUND") {
        sendError(response, 404, "PLAN_NOT_FOUND", "The requested plan was not found.");
        return;
      }
      next(error);
    }
  },
);

platformRouter.get(
  "/tenants",
  requireSession,
  requirePlatformAdmin,
  async (request, response, next) => {
    try {
      const parsed = tenantListSchema.safeParse(request.query);
      if (!parsed.success) {
        sendError(response, 400, "VALIDATION_ERROR", "Check the tenant search and pagination values.");
        return;
      }

      const { q, page, pageSize } = parsed.data;
      const where = q
        ? { OR: [{ name: { contains: q } }, { slug: { contains: q } }] }
        : undefined;

      const [total, tenants] = await Promise.all([
        prisma.tenant.count({ where }),
        prisma.tenant.findMany({
          where,
          orderBy: [{ createdAt: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            subscription: { include: { plan: true } },
            _count: { select: { assets: true } },
          },
        }),
      ]);

      const tenantIds = tenants.map((tenant) => tenant.id);
      const activeMembershipCounts = tenantIds.length
        ? await prisma.membership.groupBy({
            by: ["tenantId"],
            where: { tenantId: { in: tenantIds }, isActive: true },
            _count: { _all: true },
          })
        : [];
      const activeUsersByTenant = new Map(
        activeMembershipCounts.map((item) => [item.tenantId, item._count._all]),
      );
      const storageCounts = tenantIds.length
        ? await prisma.tenantStorageObject.groupBy({
            by: ["tenantId"], where: { tenantId: { in: tenantIds } },
            _sum: { sizeBytes: true },
          })
        : [];
      const storageByTenant = new Map(
        storageCounts.map(item => [item.tenantId, String(item._sum.sizeBytes ?? 0)]),
      );

      response.status(200).json({
        data: tenants.map((tenant) => ({
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
          createdAt: tenant.createdAt,
          assetCount: tenant._count.assets,
          activeUserCount: activeUsersByTenant.get(tenant.id) ?? 0,
          storageUsedBytes: storageByTenant.get(tenant.id) ?? "0",
          subscription: tenant.subscription
            ? {
                ...tenant.subscription,
                plan: serializePlan(tenant.subscription.plan),
              }
            : null,
        })),
        pagination: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
      });
    } catch (error) {
      next(error);
    }
  },
);

platformRouter.patch(
  "/tenants/:tenantId/subscription",
  requireSession,
  requirePlatformAdmin,
  requireCsrf,
  async (request, response, next) => {
    try {
      const targetTenantId = request.params.tenantId;
      if (typeof targetTenantId !== "string" || targetTenantId.length === 0) {
        sendError(response, 400, "INVALID_ROUTE_PARAMETER", "A valid tenant ID is required.");
        return;
      }

      const parsed = subscriptionChangeSchema.safeParse(request.body);
      if (!parsed.success) {
        sendError(response, 400, "VALIDATION_ERROR", "Choose a plan, an allowed action and an audit reason.");
        return;
      }

      const { planId, mode, reason } = parsed.data;
      const result = await prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.findUnique({ where: { id: targetTenantId } });
        if (!tenant) throw new Error("TENANT_NOT_FOUND");

        const plan = await tx.subscriptionPlan.findUnique({ where: { id: planId } });
        if (!plan || !plan.isActive) throw new Error("PLAN_NOT_AVAILABLE");
        if (mode === "trial" && plan.trialDurationDays < 1) throw new Error("TRIAL_NOT_AVAILABLE");

        const current = await tx.tenantSubscription.findUnique({
          where: { tenantId: tenant.id },
          include: { plan: true },
        });
        if (current?.billingSource === "PADDLE" || current?.paddleSubscriptionId) {
          throw new Error("PADDLE_SUBSCRIPTION_MANAGED");
        }
        const now = new Date();
        const trialEndsAt = new Date(now.getTime() + plan.trialDurationDays * 24 * 60 * 60 * 1000);
        const status = mode === "trial" ? "TRIALING" : mode === "activate" ? "ACTIVE" : "SUSPENDED";

        const subscription = await tx.tenantSubscription.upsert({
          where: { tenantId: tenant.id },
          create: {
            tenantId: tenant.id,
            planId: plan.id,
            status,
            trialStartedAt: mode === "trial" ? now : null,
            trialEndsAt: mode === "trial" ? trialEndsAt : null,
          },
          update: {
            planId: plan.id,
            status,
            cancelAtPeriodEnd: false,
            ...(mode === "trial" ? { trialStartedAt: now, trialEndsAt } : {}),
          },
          include: { plan: true },
        });

        const tenantStatus = mode === "trial" ? "TRIAL" : mode === "activate" ? "ACTIVE" : "SUSPENDED";
        await tx.tenant.update({ where: { id: tenant.id }, data: { status: tenantStatus } });

        await tx.platformAuditLog.create({
          data: {
            actorUserId: request.auth!.userId,
            action: "tenant.subscription_changed",
            entityType: "TenantSubscription",
            entityId: subscription.id,
            reason,
            oldData: {
              tenantStatus: tenant.status,
              subscriptionStatus: current?.status ?? null,
              planKey: current?.plan.key ?? null,
              trialEndsAt: current?.trialEndsAt?.toISOString() ?? null,
            },
            newData: {
              tenantStatus,
              subscriptionStatus: subscription.status,
              planKey: subscription.plan.key,
              trialStartedAt: subscription.trialStartedAt?.toISOString() ?? null,
              trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
            },
            ipAddress: request.ip?.slice(0, 64),
            userAgent: request.get("user-agent")?.slice(0, 500),
          },
        });

        return subscription;
      });

      response.status(200).json({
        data: {
          ...result,
          plan: serializePlan(result.plan),
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message === "PADDLE_SUBSCRIPTION_MANAGED") {
        sendError(response, 409, "PADDLE_SUBSCRIPTION_MANAGED",
          "Paddle subscriptions may be changed only by the provider. Suspend or unsuspend company access separately.");
        return;
      }
      if (error instanceof Error && error.message === "TENANT_NOT_FOUND") {
        sendError(response, 404, "TENANT_NOT_FOUND", "The requested company was not found.");
        return;
      }
      if (error instanceof Error && error.message === "PLAN_NOT_AVAILABLE") {
        sendError(response, 400, "PLAN_NOT_AVAILABLE", "Choose an active subscription plan.");
        return;
      }
      if (error instanceof Error && error.message === "TRIAL_NOT_AVAILABLE") {
        sendError(response, 400, "TRIAL_NOT_AVAILABLE", "The selected plan does not offer a trial.");
        return;
      }
      next(error);
    }
  },
);

/** Platform-only operational and billing pulse; no tenant-scoped permissions apply. */
platformRouter.get("/overview", requireSession, requirePlatformAdmin, async (_request, response, next) => {
  try {
    const [
      companyCount, planCount, subscriptionStatuses, assetCount, activeUserCount,
      stored, payments, failedWebhooks, latestPayments,
    ] = await Promise.all([
      prisma.tenant.count(),
      prisma.subscriptionPlan.count(),
      prisma.tenantSubscription.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.asset.count(),
      prisma.membership.count({ where: { isActive: true } }),
      prisma.tenantStorageObject.aggregate({ _sum: { sizeBytes: true } }),
      prisma.paddlePayment.aggregate({
        where: { status: "PAID" }, _sum: { amountMinor: true }, _count: { _all: true },
      }),
      prisma.paddleWebhookEvent.count({ where: { status: "FAILED" } }),
      prisma.paddlePayment.findMany({
        orderBy: { occurredAt: "desc" }, take: 15,
        include: { tenant: { select: { id: true, name: true } } },
      }),
    ]);
    response.setHeader("Cache-Control", "private, no-store");
    response.json({ data: {
      companyCount, planCount,
      subscriptionStatuses: subscriptionStatuses.map(entry => ({
        status: entry.status, count: entry._count._all,
      })),
      assetCount, activeUserCount, storageUsedBytes: String(stored._sum.sizeBytes ?? 0),
      paddle: {
        paidTransactionCount: payments._count._all,
        paidAmountMinor: payments._sum.amountMinor ?? 0,
        failedWebhookCount: failedWebhooks,
        latestPayments: latestPayments.map(item => ({
          tenantId: item.tenantId,
          // Historical or inconsistent payment records may have no resolvable tenant.
          // Keep the transaction visible for reconciliation instead of crashing the overview.
          tenantName: item.tenant?.name ?? "Unavailable company",
          transactionId: item.transactionId, status: item.status,
          amountMinor: item.amountMinor, currency: item.currency, occurredAt: item.occurredAt,
        })),
      },
    } });
  } catch (error) { next(error); }
});

const platformTenantStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
  reason: reasonSchema,
}).strict();

/** Platform suspension never forges a successful Paddle payment. */
platformRouter.patch("/tenants/:tenantId/status", requireSession, requirePlatformAdmin,
  requireCsrf, async (request, response, next) => {
  const parsed = platformTenantStatusSchema.safeParse(request.body);
  const id = request.params.tenantId;
  if (!parsed.success || typeof id !== "string" || !id) {
    sendError(response, 400, "VALIDATION_ERROR", "Provide a company status and audit reason."); return;
  }
  try {
    const result = await prisma.$transaction(async tx => {
      const tenant = await tx.tenant.findUnique({ where: { id } });
      if (!tenant) throw new Error("TENANT_NOT_FOUND");
      const updated = await tx.tenant.update({ where: { id }, data: { status: parsed.data.status } });
      await tx.platformAuditLog.create({ data: {
        actorUserId: request.auth!.userId, action: "tenant.platform_status_changed",
        entityType: "Tenant", entityId: id, reason: parsed.data.reason,
        oldData: { status: tenant.status }, newData: { status: updated.status },
      } });
      return updated;
    });
    response.json({ data: { id: result.id, status: result.status } });
  } catch (error) {
    if (error instanceof Error && error.message === "TENANT_NOT_FOUND") {
      sendError(response, 404, "TENANT_NOT_FOUND", "Company not found."); return;
    }
    next(error);
  }
});
