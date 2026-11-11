import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireCsrf, requireSession } from "../auth/auth-middleware.js";
import { requirePlatformAdmin } from "./platform.routes.js";

/**
 * Platform control-plane APIs never use x-tenant-id or requireTenant.
 * Every route authenticates a current independent platform administrator.
 */
export const platformConsoleRouter = Router();
platformConsoleRouter.use(requireSession, requirePlatformAdmin);

const searchSchema = z.object({
  q: z.string().trim().max(191).default(""),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
}).strict();
const auditSchema = z.object({
  source: z.enum(["all","platform","tenant"]).default("all"),
  page: z.coerce.number().int().min(1).max(20).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
}).strict();
const reason = z.string().trim().min(8).max(1000);
const statusSchema = z.object({
  disabled: z.boolean(),
  reason,
}).strict();
const settingsSchema = z.object({
  companyRegistrationOpen: z.boolean(),
  supportEmail: z.union([z.string().trim().toLowerCase().email().max(191), z.null()]),
  announcement: z.union([z.string().trim().max(500), z.null()]),
  reason,
}).strict();

function fail(response: import("express").Response, code: string, message: string, status = 400) {
  response.status(status).json({ error: { code, message } });
}
function privateResult(response: import("express").Response, data: unknown) {
  response.setHeader("Cache-Control", "private, no-store");
  response.json({ data });
}

platformConsoleRouter.get("/users", async (request, response, next) => {
  const parsed = searchSchema.safeParse(request.query);
  if (!parsed.success) { fail(response, "VALIDATION_ERROR", "Invalid user search or page."); return; }
  try {
    const { q, page, pageSize } = parsed.data;
    const where = q ? {
      OR: [
        { email: { contains: q } },
        { fullName: { contains: q } },
        { memberships: { some: { tenant: { name: { contains: q } } } } },
      ],
    } : undefined;
    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where, orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize, take: pageSize,
        select: {
          id: true, email: true, fullName: true, isPlatformAdmin: true,
          disabledAt: true, emailVerifiedAt: true, createdAt: true,
          memberships: { select: {
            isActive: true, role: { select: { id: true, key: true, name: true } },
            tenant: { select: { id: true, name: true, status: true } },
          } },
          _count: { select: { sessions: true } },
        },
      }),
    ]);
    privateResult(response, {
      users: users.map(({ _count, ...user }) => ({ ...user, sessionCount: _count.sessions })),
      pagination: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
    });
  } catch (error) { next(error); }
});

/** Disable or restore a non-platform account and immediately revoke every session.
 * Elevated accounts require a separate trusted operator procedure, not a web toggle.
 */
platformConsoleRouter.patch("/users/:id/status", requireCsrf, async (request, response, next) => {
  const parsed = statusSchema.safeParse(request.body);
  const userId = request.params.id;
  if (!parsed.success || typeof userId !== "string" || !userId) {
    fail(response, "VALIDATION_ERROR", "Provide the user, status and audit reason."); return;
  }
  if (userId === request.auth?.userId) {
    fail(response, "SELF_MODIFICATION_DENIED", "You cannot change your own platform account status.", 409); return;
  }
  try {
    const updated = await prisma.$transaction(async tx => {
      const before = await tx.user.findUnique({ where: { id: userId },
        select: { id: true, disabledAt: true, isPlatformAdmin: true, email: true } });
      if (!before) throw new Error("USER_NOT_FOUND");
      if (before.isPlatformAdmin) throw new Error("PLATFORM_USER_PROTECTED");
      const disabledAt = parsed.data.disabled ? new Date() : null;
      const after = await tx.user.update({
        where: { id: userId }, data: { disabledAt },
        select: { id: true, disabledAt: true },
      });
      // Enabled accounts must sign in again; suspended sessions cannot continue.
      await tx.session.deleteMany({ where: { userId } });
      await tx.platformAuditLog.create({ data: {
        actorUserId: request.auth!.userId,
        action: parsed.data.disabled ? "user.disabled" : "user.enabled",
        entityType: "User", entityId: userId, reason: parsed.data.reason,
        oldData: { disabled: before.disabledAt !== null, email: before.email },
        newData: { disabled: parsed.data.disabled, sessionsRevoked: true },
        ipAddress: request.ip?.slice(0, 64), userAgent: request.get("user-agent")?.slice(0, 500),
      } });
      return after;
    });
    privateResult(response, updated);
  } catch (error) {
    if (error instanceof Error && error.message === "USER_NOT_FOUND") {
      fail(response, "USER_NOT_FOUND", "User not found.", 404); return;
    }
    if (error instanceof Error && error.message === "PLATFORM_USER_PROTECTED") {
      fail(response, "PLATFORM_USER_PROTECTED", "Platform administrator accounts are protected from this action.", 409); return;
    }
    next(error);
  }
});

platformConsoleRouter.get("/reports", async (_request, response, next) => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [companiesByStatus, subscriptionsByStatus, assetsByStatus, plans, joined, assets,
      activeUsers, storage, joinedAt, recentCompanies] = await Promise.all([
      prisma.tenant.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.tenantSubscription.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.asset.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.tenantSubscription.groupBy({ by: ["planId"], _count: { _all: true } }),
      prisma.tenant.count({ where: { createdAt: { gte: since } } }),
      prisma.asset.count(),
      prisma.membership.count({ where: { isActive: true } }),
      prisma.tenantStorageObject.aggregate({ _sum: { sizeBytes: true } }),
      prisma.tenant.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
      prisma.tenant.findMany({ orderBy: { createdAt: "desc" }, take: 12,
        select: { id: true, name: true, status: true, createdAt: true,
          _count: { select: { assets: true, memberships: true } } } }),
    ]);
    const planIds = plans.map(p => p.planId);
    const planDetails = await prisma.subscriptionPlan.findMany({
      where: { id: { in: planIds } }, select: { id: true, name: true },
    });
    const planNames = new Map(planDetails.map(plan => [plan.id, plan.name]));
    const newCompaniesByDay: Record<string, number> = {};
    for (let d = 29; d >= 0; d--) {
      const key = new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      newCompaniesByDay[key] = 0;
    }
    for (const tenant of joinedAt) {
      const key = tenant.createdAt.toISOString().slice(0, 10);
      if (key in newCompaniesByDay) newCompaniesByDay[key]!++;
    }
    privateResult(response, {
      totals: { newCompanies30Days: joined, assets, activeMemberships: activeUsers,
        storageBytes: String(storage._sum.sizeBytes ?? 0) },
      companiesByStatus: companiesByStatus.map(x => ({ label: x.status, count: x._count._all })),
      subscriptionsByStatus: subscriptionsByStatus.map(x => ({ label: x.status, count: x._count._all })),
      assetsByStatus: assetsByStatus.map(x => ({ label: x.status, count: x._count._all })),
      planDistribution: plans.map(x => ({ label: planNames.get(x.planId) ?? "Unknown", count: x._count._all })),
      registrations: Object.entries(newCompaniesByDay).map(([date,count])=>({date,count})),
      recentCompanies: recentCompanies.map(({ _count, ...tenant }) => ({
        ...tenant, assetCount: _count.assets, membershipCount: _count.memberships,
      })),
    });
  } catch (error) { next(error); }
});

platformConsoleRouter.get("/activities", async (request, response, next) => {
  const parsed = auditSchema.safeParse(request.query);
  if (!parsed.success) { fail(response, "VALIDATION_ERROR", "Invalid security activity filter."); return; }
  try {
    const { source, page, pageSize } = parsed.data;
    const take = page * pageSize;
    const [platformTotal, tenantTotal, platformEvents, tenantEvents] = await Promise.all([
      source !== "tenant" ? prisma.platformAuditLog.count() : Promise.resolve(0),
      source !== "platform" ? prisma.auditLog.count() : Promise.resolve(0),
      source !== "tenant" ? prisma.platformAuditLog.findMany({
        take, orderBy: { createdAt: "desc" }, select: {
          id: true, action: true, entityType: true, entityId: true, reason: true,
          createdAt: true, ipAddress: true,
          actor: { select: { fullName: true, email: true } },
        },
      }) : Promise.resolve([]),
      source !== "platform" ? prisma.auditLog.findMany({
        take, orderBy: { createdAt: "desc" }, select: {
          id: true, action: true, entityType: true, entityId: true,
          createdAt: true, ipAddress: true,
          actor: { select: { fullName: true, email: true } },
          tenant: { select: { id: true, name: true } },
        },
      }) : Promise.resolve([]),
    ]);
    const entries = [
      ...platformEvents.map(row => ({
        id: row.id, scope: "platform" as const, createdAt: row.createdAt,
        action: row.action, actor: row.actor, entityType: row.entityType,
        entityId: row.entityId, company: null, ipAddress: row.ipAddress, reason: row.reason,
      })),
      ...tenantEvents.map(row => ({
        id: row.id, scope: "tenant" as const, createdAt: row.createdAt,
        action: row.action, actor: row.actor, entityType: row.entityType,
        entityId: row.entityId, company: row.tenant, ipAddress: row.ipAddress, reason: null,
      })),
    ].sort((a,b) => b.createdAt.getTime() - a.createdAt.getTime() ||
      b.id.localeCompare(a.id)).slice((page-1)*pageSize, page*pageSize);
    privateResult(response, { events: entries,
      pagination: { page, pageSize, total: platformTotal+tenantTotal,
        pageCount: Math.ceil((platformTotal+tenantTotal)/pageSize) } });
  } catch (error) { next(error); }
});

platformConsoleRouter.get("/security", async (_request, response, next) => {
  try {
    const [activeSessions, disabledUsers, platformAdmins, unverifiedUsers,
      failedProviderEvents, recentSessions] = await Promise.all([
      prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
      prisma.user.count({ where: { disabledAt: { not: null } } }),
      prisma.user.count({ where: { isPlatformAdmin: true, disabledAt: null } }),
      prisma.user.count({ where: { emailVerifiedAt: null } }),
      prisma.paddleWebhookEvent.count({ where: { status: "FAILED" } }),
      prisma.session.findMany({
        where: { expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" }, take: 15,
        select: { id: true, ipAddress: true, createdAt: true, lastSeenAt: true, expiresAt: true,
          user: { select: { id: true, email: true, fullName: true, isPlatformAdmin: true } } },
      }),
    ]);
    privateResult(response, {
      activeSessions, disabledUsers, platformAdmins, unverifiedUsers,
      failedProviderEvents, recentSessions,
      note: "Session telemetry is not a complete login/failed-login audit trail.",
    });
  } catch (error) { next(error); }
});

platformConsoleRouter.get("/billing", async (_request, response, next) => {
  try {
    const [subscriptionStatuses, paymentGroups, failedWebhooks, payments, plans] = await Promise.all([
      prisma.tenantSubscription.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.paddlePayment.groupBy({ by: ["currency","status"],
        _sum: { amountMinor: true }, _count: { _all: true } }),
      prisma.paddleWebhookEvent.count({ where: { status: "FAILED" } }),
      prisma.paddlePayment.findMany({ orderBy: { occurredAt: "desc" }, take: 30,
        select: { id: true, transactionId: true, status: true, amountMinor: true, currency: true,
          invoiceNumber: true, occurredAt: true,
          tenant: { select: { id: true, name: true } } } }),
      prisma.subscriptionPlan.findMany({
        select: { id: true, name: true, isActive: true, _count: { select: { subscriptions: true } } },
      }),
    ]);
    privateResult(response, {
      subscriptionStatuses: subscriptionStatuses.map(x=>({status:x.status,count:x._count._all})),
      paymentGroups: paymentGroups.map(x=>({ currency:x.currency,status:x.status,
        amountMinor:x._sum.amountMinor??0, count:x._count._all })),
      failedWebhooks, payments,
      plans: plans.map(({_count,...plan})=>({...plan,subscriberCount:_count.subscriptions})),
    });
  } catch (error) { next(error); }
});

platformConsoleRouter.get("/settings", async (_request, response, next) => {
  try {
    const settings = await prisma.platformSetting.findUnique({ where: { id: "global" } });
    privateResult(response, {
      companyRegistrationOpen: settings?.companyRegistrationOpen ?? true,
      supportEmail: settings?.supportEmail ?? null,
      announcement: settings?.announcement ?? null,
      updatedAt: settings?.updatedAt ?? null,
    });
  } catch (error) { next(error); }
});

platformConsoleRouter.patch("/settings", requireCsrf, async (request, response, next) => {
  const parsed = settingsSchema.safeParse(request.body);
  if (!parsed.success) { fail(response, "VALIDATION_ERROR", "Check settings and the audit reason."); return; }
  try {
    const { reason: changeReason, ...values } = parsed.data;
    const updated = await prisma.$transaction(async tx => {
      const old = await tx.platformSetting.findUnique({ where: { id: "global" } });
      const settings = await tx.platformSetting.upsert({
        where: { id: "global" }, create: { id: "global", ...values }, update: values,
      });
      await tx.platformAuditLog.create({ data: {
        actorUserId: request.auth!.userId, action: "platform.settings_changed",
        entityType: "PlatformSetting", entityId: "global", reason: changeReason,
        oldData: { companyRegistrationOpen: old?.companyRegistrationOpen??true,
          supportEmail: old?.supportEmail??null, announcement: old?.announcement??null },
        newData: values, ipAddress: request.ip?.slice(0, 64),
        userAgent: request.get("user-agent")?.slice(0, 500),
      } });
      return settings;
    });
    privateResult(response, {
      companyRegistrationOpen: updated.companyRegistrationOpen,
      supportEmail: updated.supportEmail, announcement: updated.announcement,
      updatedAt: updated.updatedAt,
    });
  } catch (error) { next(error); }
});
