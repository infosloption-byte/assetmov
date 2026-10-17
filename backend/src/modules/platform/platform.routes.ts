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
const requirePlatformAdmin: RequestHandler = async (request, response, next) => {
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
      const parsed = planUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        sendError(response, 400, "VALIDATION_ERROR", "Provide valid plan fields and an audit reason.");
        return;
      }

      const { reason, ...changes } = parsed.data;
      const plan = await prisma.$transaction(async (tx) => {
        const current = await tx.subscriptionPlan.findUnique({ where: { id: request.params.id } });
        if (!current) throw new Error("PLAN_NOT_FOUND");

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

      response.status(200).json({
        data: tenants.map((tenant) => ({
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
          createdAt: tenant.createdAt,
          assetCount: tenant._count.assets,
          activeUserCount: activeUsersByTenant.get(tenant.id) ?? 0,
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
      const parsed = subscriptionChangeSchema.safeParse(request.body);
      if (!parsed.success) {
        sendError(response, 400, "VALIDATION_ERROR", "Choose a plan, an allowed action and an audit reason.");
        return;
      }

      const { planId, mode, reason } = parsed.data;
      const result = await prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.findUnique({ where: { id: request.params.tenantId } });
        if (!tenant) throw new Error("TENANT_NOT_FOUND");

        const plan = await tx.subscriptionPlan.findUnique({ where: { id: planId } });
        if (!plan || !plan.isActive) throw new Error("PLAN_NOT_AVAILABLE");
        if (mode === "trial" && plan.trialDurationDays < 1) throw new Error("TRIAL_NOT_AVAILABLE");

        const current = await tx.tenantSubscription.findUnique({
          where: { tenantId: tenant.id },
          include: { plan: true },
        });
        const now = new Date();
        const trialEndsAt = mode === "trial"
          ? new Date(now.getTime() + plan.trialDurationDays * 24 * 60 * 60 * 1000)
          : undefined;
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
