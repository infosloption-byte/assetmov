import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireSession, requireCsrf } from "../auth/auth-middleware.js";
import { requireTenant, requirePermission } from "../tenancy/tenant-context.js";

export const memberRouter = Router();

const updateSchema = z.object({
  isActive: z.boolean(),
  reason: z.string().trim().min(8).max(1000),
}).strict();

memberRouter.use(requireSession, requireTenant, requirePermission("members.manage"));

memberRouter.get("/", async (request, response, next) => {
  try {
    const tenantId = request.auth!.tenantId!;
    const [members, subscription] = await Promise.all([
      prisma.membership.findMany({
        where: { tenantId },
        select: {
          id: true, isActive: true, allLocationsAccess: true, createdAt: true,
          role: { select: { id: true, key: true, name: true } },
          user: { select: { id: true, email: true, fullName: true, disabledAt: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.tenantSubscription.findUnique({
        where: { tenantId },
        include: { plan: { select: { maxActiveUsers: true } } },
      }),
    ]);
    response.json({
      data: members,
      usage: {
        activeUsers: members.filter((member) => member.isActive).length,
        maxActiveUsers: subscription?.plan.maxActiveUsers ?? null,
      },
    });
  } catch (error) { next(error); }
});

memberRouter.patch("/:id/status", requireCsrf, async (request, response, next) => {
  const parsed = updateSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Provide an activation status and an audit reason." } });
    return;
  }
  const tenantId = request.auth!.tenantId!;
  const memberId = request.params.id;
  if (typeof memberId !== "string" || !memberId) {
    response.status(400).json({ error: { code: "INVALID_ROUTE_PARAMETER", message: "A membership ID is required." } });
    return;
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      // The tenant row serializes membership-count changes for this company.
      // Future invite/member-creation paths must acquire this same lock.
      await tx.$queryRaw`SELECT id FROM Tenant WHERE id = ${tenantId} FOR UPDATE`;
      const member = await tx.membership.findFirst({
        where: { id: memberId, tenantId },
        include: { role: true, user: { select: { disabledAt: true } } },
      });
      if (!member) throw new Error("MEMBER_NOT_FOUND");
      if (member.isActive === parsed.data.isActive) return member;
      if (!parsed.data.isActive) {
        if (member.userId === request.auth!.userId) throw new Error("CANNOT_DEACTIVATE_SELF");
        if (member.role.key === "TENANT_OWNER") {
          const remainingOwners = await tx.membership.count({
            where: { tenantId, isActive: true, role: { key: "TENANT_OWNER" } },
          });
          if (remainingOwners <= 1) throw new Error("LAST_OWNER_REQUIRED");
        }
      } else {
        if (member.user.disabledAt) throw new Error("USER_DISABLED");
        const subscription = await tx.tenantSubscription.findUnique({
          where: { tenantId },
          include: { plan: { select: { maxActiveUsers: true } } },
        });
        if (!subscription) throw new Error("SUBSCRIPTION_NOT_CONFIGURED");
        if (subscription.status !== "ACTIVE" && subscription.status !== "TRIALING") throw new Error("SUBSCRIPTION_INACTIVE");
        if (subscription.status === "TRIALING" && (!subscription.trialEndsAt || subscription.trialEndsAt.getTime() <= Date.now())) throw new Error("SUBSCRIPTION_EXPIRED");
        const count = await tx.membership.count({ where: { tenantId, isActive: true } });
        if (subscription.plan.maxActiveUsers !== null && count >= subscription.plan.maxActiveUsers) throw new Error("USER_PLAN_LIMIT_REACHED");
      }
      const updated = await tx.membership.update({
        where: { id: member.id },
        data: { isActive: parsed.data.isActive },
        include: { role: { select: { id: true, key: true, name: true } }, user: { select: { id: true, email: true, fullName: true } } },
      });
      if (!parsed.data.isActive) {
        // Sessions may belong to other companies; revoke all to ensure the
        // deactivated member's existing authentication cannot retain access.
        await tx.session.deleteMany({ where: { userId: member.userId } });
      }
      await tx.auditLog.create({
        data: {
          tenantId, actorUserId: request.auth!.userId,
          action: parsed.data.isActive ? "member.activated" : "member.deactivated",
          entityType: "Membership", entityId: member.id,
          oldData: { isActive: member.isActive },
          newData: { isActive: updated.isActive, reason: parsed.data.reason },
          ipAddress: request.ip?.slice(0, 64),
        },
      });
      return updated;
    });
    response.json({ data: result });
  } catch (error) {
    const codes: Record<string, number> = {
      MEMBER_NOT_FOUND: 404, CANNOT_DEACTIVATE_SELF: 409, LAST_OWNER_REQUIRED: 409,
      USER_DISABLED: 409, SUBSCRIPTION_NOT_CONFIGURED: 409,
      SUBSCRIPTION_INACTIVE: 403, SUBSCRIPTION_EXPIRED: 403, USER_PLAN_LIMIT_REACHED: 409,
    };
    const code = error instanceof Error ? error.message : "";
    if (code in codes) {
      response.status(codes[code]!).json({ error: { code, message: code.replaceAll("_", " ").toLowerCase() } });
    } else next(error);
  }
});
