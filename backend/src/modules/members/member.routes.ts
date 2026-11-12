import { Router } from "express";
import { randomBytes } from "node:crypto";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { accountEmailReady, sendAccountLink } from "../auth/account-email.js";
import { issueToken } from "../auth/account.routes.js";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { hashPassword } from "../auth/password.js";
import { requireSession, requireCsrf } from "../auth/auth-middleware.js";
import { requireTenant, requirePermission } from "../tenancy/tenant-context.js";

export const memberRouter = Router();

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(191),
  fullName: z.string().trim().min(2).max(191),
  initialPassword: z.string().min(12).max(128).optional(),
  invite: z.boolean().optional(),
  roleId: z.string().trim().min(1).max(36),
  allLocationsAccess: z.boolean().default(false),
}).strict().refine(input => input.invite === true
  ? input.initialPassword === undefined
  : Boolean(input.initialPassword),
  "Select email invitation OR an initial development password.");
const scopeSchema = z.object({
  allLocationsAccess: z.boolean(),
  locationIds: z.array(z.string().trim().min(1).max(36)).max(500),
  reason: z.string().trim().min(8).max(1000),
}).strict();
const roleChangeSchema = z.object({ roleId: z.string().trim().min(1).max(36) }).strict();
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
          locationAssignments: { select: { locationId: true, canManage: true } },
          role: { select: { id: true, key: true, name: true } },
          user: { select: { id: true, email: true, fullName: true, emailVerifiedAt: true, disabledAt: true } },
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

memberRouter.post("/", requireCsrf, async (request, response, next) => {
  const parsed = createSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Check the user details, role and invitation method." } }); return;
  }
  const tenantId = request.auth!.tenantId!;
  const input = parsed.data;
  if (input.allLocationsAccess && !request.auth!.allLocationsAccess) {
    response.status(403).json({ error: { code: "LOCATION_GRANT_DENIED" } }); return;
  }
  if (input.invite && !accountEmailReady()) {
    response.status(503).json({ error: { code: "EMAIL_UNAVAILABLE",
      message: "Configure transactional email before sending invitations." } }); return;
  }
  if (!input.invite && env.NODE_ENV === "production") {
    response.status(403).json({ error: { code: "INVITATION_REQUIRED",
      message: "Production user creation requires a secure email invitation." } }); return;
  }
  try {
    const passwordHash = await hashPassword(input.invite
      ? randomBytes(48).toString("base64url") : input.initialPassword!);
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Tenant WHERE id = ${tenantId} FOR UPDATE`;
      const subscription = await tx.tenantSubscription.findUnique({
        where: { tenantId }, include: { plan: { select: { maxActiveUsers: true } } },
      });
      if (!subscription) throw new Error("SUBSCRIPTION_NOT_CONFIGURED");
      if (!["ACTIVE", "TRIALING"].includes(subscription.status)) throw new Error("SUBSCRIPTION_INACTIVE");
      if (subscription.status === "TRIALING" && (!subscription.trialEndsAt || subscription.trialEndsAt <= new Date())) throw new Error("SUBSCRIPTION_EXPIRED");
      const count = await tx.membership.count({ where: { tenantId, isActive: true } });
      if (subscription.plan.maxActiveUsers !== null && count >= subscription.plan.maxActiveUsers) throw new Error("USER_PLAN_LIMIT_REACHED");
      const role = await tx.role.findFirst({ where: { id: input.roleId, tenantId } });
      if (!role) throw new Error("ROLE_NOT_FOUND");
      const assignedPermissionKeys = await tx.rolePermission.findMany({
        where: { roleId: role.id }, select: { permission: { select: { key: true } } },
      });
      if (assignedPermissionKeys.some(entry => !request.auth!.permissions?.includes(entry.permission.key))) {
        throw new Error("ROLE_ASSIGNMENT_DENIED");
      }
      // Creating a company owner or privileged operator is restricted to an owner.
      if ((role.isSystem || await tx.rolePermission.count({
        where: { roleId: role.id, permission: { key: { in: ["members.manage", "roles.manage", "tenant.settings.manage"] } } },
      }) > 0) && request.auth!.roleKey !== "TENANT_OWNER") throw new Error("ROLE_ASSIGNMENT_DENIED");
      const userExists = await tx.user.findUnique({ where: { email: input.email }, select: { id: true } });
      // Prevent existing identities from being silently added to a company.
      if (userExists) throw new Error("EMAIL_ALREADY_EXISTS");
      const user = await tx.user.create({ data: {
        email: input.email, fullName: input.fullName, passwordHash,
      } });
      const member = await tx.membership.create({
        data: { tenantId, userId: user.id, roleId: role.id, allLocationsAccess: input.allLocationsAccess },
        include: { role: { select: { id: true, key: true, name: true } },
          user: { select: { id: true, email: true, fullName: true } } },
      });
      await tx.auditLog.create({ data: {
        tenantId, actorUserId: request.auth!.userId, action: "member.created",
        entityType: "Membership", entityId: member.id,
        newData: { email: user.email, roleId: role.id, allLocationsAccess: input.allLocationsAccess },
      } });
      return member;
    });
    let invitationDelivery = "not_requested";
    if (input.invite) {
      try {
        const raw = await issueToken(result.user.id, "INVITATION", 48 * 60);
        await sendAccountLink(result.user.email, "invite", raw);
        invitationDelivery = "sent";
      } catch {
        logger.warn("New company user invitation email failed.");
        invitationDelivery = "failed";
      }
    }
    response.status(201).json({ data: result, invitationDelivery });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const statuses: Record<string, number> = {
      SUBSCRIPTION_NOT_CONFIGURED: 409, SUBSCRIPTION_INACTIVE: 403,
      SUBSCRIPTION_EXPIRED: 403, USER_PLAN_LIMIT_REACHED: 409,
      ROLE_NOT_FOUND: 400, ROLE_ASSIGNMENT_DENIED: 403, EMAIL_ALREADY_EXISTS: 409,
    };
    if (code in statuses) {
      response.status(statuses[code]!).json({ error: { code } }); return;
    }
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      response.status(409).json({ error: { code: "EMAIL_ALREADY_EXISTS" } }); return;
    }
    next(error);
  }
});

memberRouter.post("/:id/invitation", requireCsrf, async (request, response, next) => {
  if (!accountEmailReady()) {
    response.status(503).json({ error: { code: "EMAIL_UNAVAILABLE", message: "Transactional email is not configured." } });
    return;
  }
  const membershipId = request.params.id;
  if (typeof membershipId !== "string" || !membershipId) {
    response.status(400).json({ error: { code: "VALIDATION_ERROR" } }); return;
  }
  try {
    const tenantId = request.auth!.tenantId!;
    const membership = await prisma.membership.findFirst({
      where: { id: membershipId, tenantId, isActive: true },
      include: { user: { select: { id: true, email: true, emailVerifiedAt: true, disabledAt: true } } },
    });
    if (!membership || membership.user.disabledAt || membership.user.emailVerifiedAt) {
      response.status(409).json({ error: { code: "INVITATION_NOT_ALLOWED",
        message: "Only active, unverified company users can receive an invitation." } }); return;
    }
    const since = new Date(Date.now() - 15 * 60_000);
    const previous = await prisma.accountToken.count({
      where: { userId: membership.user.id, kind: "INVITATION", createdAt: { gt: since } },
    });
    if (previous >= 3) {
      response.status(429).json({ error: { code: "INVITATION_RATE_LIMITED",
        message: "Invitation limit reached. Try again later." } }); return;
    }
    const raw = await issueToken(membership.user.id, "INVITATION", 48 * 60);
    await sendAccountLink(membership.user.email, "invite", raw);
    response.status(202).json({ message: "Invitation sent." });
  } catch (error) {
    logger.warn("Company user invitation retry failed.");
    next(error);
  }
});

const memberPasswordResetSchema = z.object({
  temporaryPassword: z.string().min(12).max(128),
  reason: z.string().trim().min(8).max(1000),
}).strict();

/** Company-managed recovery when outbound email has not been configured.
 * Never return or record plaintext passwords; revoke ALL target sessions.
 */
memberRouter.post("/:id/password/reset", requireCsrf, async (request, response, next) => {
  const parsed = memberPasswordResetSchema.safeParse(request.body);
  const memberId = request.params.id;
  if (!parsed.success || typeof memberId !== "string" || !memberId) {
    response.status(400).json({error:{code:"VALIDATION_ERROR",
      message:"Provide a temporary password (12+ characters) and an audit reason."}}); return;
  }
  try {
    const tenantId = request.auth!.tenantId!;
    const actorUserId = request.auth!.userId;
    const passwordHash = await hashPassword(parsed.data.temporaryPassword);
    await prisma.$transaction(async tx => {
      const membership = await tx.membership.findFirst({
        where: { id: memberId, tenantId, isActive: true },
        include: {
          role: { select: { key: true } },
          user: { select: { id: true, disabledAt: true,
            memberships: { select: { tenantId: true } } } },
        },
      });
      if (!membership || membership.user.disabledAt) throw new Error("MEMBER_NOT_FOUND");
      if (membership.userId === actorUserId) throw new Error("RESET_SELF_DENIED");
      if (membership.role.key === "TENANT_OWNER") throw new Error("RESET_OWNER_DENIED");
      if (membership.user.memberships.length !== 1) throw new Error("RESET_SHARED_IDENTITY_DENIED");
      await tx.user.update({ where: { id: membership.userId }, data: { passwordHash } });
      await tx.session.deleteMany({ where: { userId: membership.userId } });
      await tx.accountToken.updateMany({
        where: { userId: membership.userId, usedAt: null }, data: { usedAt: new Date() },
      });
      await tx.auditLog.create({data:{
        tenantId, actorUserId, action:"member.password_reset",
        entityType:"Membership", entityId:membership.id,
        newData:{sessionRevoked:true, reason:parsed.data.reason},
        ipAddress:request.ip?.slice(0,64),
      }});
    });
    response.json({message:"Password reset. All sessions were revoked. Deliver the temporary password privately."});
  } catch (error) {
    const code=error instanceof Error ? error.message : "";
    if (["MEMBER_NOT_FOUND","RESET_SELF_DENIED","RESET_OWNER_DENIED",
      "RESET_SHARED_IDENTITY_DENIED"].includes(code)) {
      response.status(code==="MEMBER_NOT_FOUND" ? 404 : 403).json({
        error:{code, message:code==="RESET_SHARED_IDENTITY_DENIED"
          ? "Account also belongs to another company. Use the account recovery process."
          : code==="RESET_OWNER_DENIED" ? "Owner passwords cannot be reset by company administration."
          : "This account is not eligible for company-managed password reset."},
      }); return;
    }
    next(error);
  }
});

const profileSchema = z.object({ fullName: z.string().trim().min(2).max(191) }).strict();

memberRouter.patch("/:id/profile", requireCsrf, async (request, response, next) => {
  const parsed = profileSchema.safeParse(request.body);
  const memberId = request.params.id;
  if (!parsed.success || typeof memberId !== "string" || !memberId) {
    response.status(400).json({ error: { code: "VALIDATION_ERROR" } }); return;
  }
  try {
    const tenantId = request.auth!.tenantId!;
    const result = await prisma.$transaction(async (tx) => {
      const member = await tx.membership.findFirst({
        where: { id: memberId, tenantId },
        include: { user: { select: { id: true, fullName: true, memberships: { select: { tenantId: true } } } } },
      });
      if (!member) throw new Error("MEMBER_NOT_FOUND");
      // Identity profile data is shared across tenants. Do not allow one tenant
      // administrator to modify a shared user's identity.
      if (member.user.memberships.length > 1 && member.userId !== request.auth!.userId) {
        throw new Error("SHARED_PROFILE_RESTRICTED");
      }
      const user = await tx.user.update({
        where: { id: member.userId },
        data: { fullName: parsed.data.fullName },
        select: { id: true, fullName: true, email: true },
      });
      await tx.auditLog.create({ data: {
        tenantId, actorUserId: request.auth!.userId,
        action: "member.profile_updated", entityType: "Membership", entityId: member.id,
        oldData: { fullName: member.user.fullName }, newData: { fullName: user.fullName },
      } });
      return user;
    });
    response.json({ data: result });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "MEMBER_NOT_FOUND" || code === "SHARED_PROFILE_RESTRICTED") {
      response.status(code === "MEMBER_NOT_FOUND" ? 404 : 403).json({ error: { code } }); return;
    }
    next(error);
  }
});

memberRouter.patch("/:id/role", requireCsrf, async (request, response, next) => {
  const parsed = roleChangeSchema.safeParse(request.body);
  const memberId = request.params.id;
  if (!parsed.success || typeof memberId !== "string" || !memberId) {
    response.status(400).json({ error: { code: "VALIDATION_ERROR" } }); return;
  }
  try {
    const tenantId = request.auth!.tenantId!;
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Tenant WHERE id = ${tenantId} FOR UPDATE`;
      const [member, role] = await Promise.all([
        tx.membership.findFirst({ where: { id: memberId, tenantId }, include: { role: true } }),
        tx.role.findFirst({ where: { id: parsed.data.roleId, tenantId } }),
      ]);
      if (!member) throw new Error("MEMBER_NOT_FOUND");
      if (!role) throw new Error("ROLE_NOT_FOUND");
      const targetPermissions = await tx.rolePermission.findMany({
        where: { roleId: role.id }, select: { permission: { select: { key: true } } },
      });
      if (targetPermissions.some(entry => !request.auth!.permissions?.includes(entry.permission.key))) {
        throw new Error("ROLE_ASSIGNMENT_DENIED");
      }
      if (member.role.key === "TENANT_OWNER" && role.key !== "TENANT_OWNER") {
        const count = await tx.membership.count({ where: { tenantId, isActive: true, role: { key: "TENANT_OWNER" } } });
        if (count <= 1) throw new Error("LAST_OWNER_REQUIRED");
      }
      if ((role.isSystem || member.role.isSystem || await tx.rolePermission.count({
        where: { roleId: role.id, permission: { key: { in: ["members.manage", "roles.manage", "tenant.settings.manage"] } } },
      }) > 0) && request.auth!.roleKey !== "TENANT_OWNER") throw new Error("ROLE_ASSIGNMENT_DENIED");
      if (member.userId === request.auth!.userId && role.id !== member.roleId) throw new Error("CANNOT_CHANGE_OWN_ROLE");
      const updated = await tx.membership.update({
        where: { id: member.id }, data: { roleId: role.id },
        include: { role: { select: { id: true, key: true, name: true } } },
      });
      await tx.auditLog.create({ data: {
        tenantId, actorUserId: request.auth!.userId, action: "member.role_changed",
        entityType: "Membership", entityId: member.id,
        oldData: { roleId: member.roleId }, newData: { roleId: role.id },
      } });
      return updated;
    });
    response.json({ data: result });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (["MEMBER_NOT_FOUND","ROLE_NOT_FOUND","LAST_OWNER_REQUIRED","ROLE_ASSIGNMENT_DENIED","CANNOT_CHANGE_OWN_ROLE"].includes(code)) {
      response.status(code === "MEMBER_NOT_FOUND" ? 404 : code === "ROLE_NOT_FOUND" ? 400 : 403).json({ error: { code } }); return;
    }
    next(error);
  }
});

memberRouter.patch("/:id/location-access", requireCsrf, async (request, response, next) => {
  const parsed = scopeSchema.safeParse(request.body);
  const memberId = request.params.id;
  if (!parsed.success || typeof memberId !== "string" || !memberId) {
    response.status(400).json({ error: { code: "VALIDATION_ERROR" } }); return;
  }
  const tenantId = request.auth!.tenantId!;
  const { allLocationsAccess, reason } = parsed.data;
  const locationIds = [...new Set(parsed.data.locationIds)];
  if (allLocationsAccess && (!request.auth!.allLocationsAccess || locationIds.length > 0)) {
    response.status(403).json({ error: { code: "LOCATION_GRANT_DENIED" } }); return;
  }
  if (!allLocationsAccess && locationIds.some((id) => !request.auth!.manageableLocationIds?.includes(id))
    && !request.auth!.allLocationsAccess) {
    response.status(403).json({ error: { code: "LOCATION_GRANT_DENIED" } }); return;
  }
  try {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Tenant WHERE id = ${tenantId} FOR UPDATE`;
      const member = await tx.membership.findFirst({ where: { id: memberId, tenantId }, include: { role: true, locationAssignments: true } });
      if (!member) throw new Error("MEMBER_NOT_FOUND");
      if (member.role.isSystem && request.auth!.roleKey !== "TENANT_OWNER") throw new Error("SYSTEM_MEMBER_DENIED");
      if (member.userId === request.auth!.userId) throw new Error("CANNOT_EDIT_OWN_SCOPE");
      const valid = await tx.location.count({ where: { tenantId, id: { in: locationIds }, isActive: true } });
      if (valid !== locationIds.length) throw new Error("INVALID_LOCATION_SCOPE");
      await tx.membershipLocation.deleteMany({ where: { tenantId, membershipId: member.id } });
      if (!allLocationsAccess && locationIds.length) {
        await tx.membershipLocation.createMany({ data: locationIds.map((locationId) => ({
          tenantId, membershipId: member.id, locationId, canManage: false,
        })) });
      }
      const result = await tx.membership.update({ where: { id: member.id }, data: { allLocationsAccess },
        include: { locationAssignments: { select: { locationId: true, canManage: true } } } });
      await tx.auditLog.create({ data: {
        tenantId, actorUserId: request.auth!.userId, action: "member.location_access_changed",
        entityType: "Membership", entityId: member.id,
        oldData: { allLocationsAccess: member.allLocationsAccess, locationIds: member.locationAssignments.map((item) => item.locationId) },
        newData: { allLocationsAccess, locationIds, reason },
      } });
      return result;
    });
    response.json({ data: updated });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (["MEMBER_NOT_FOUND","SYSTEM_MEMBER_DENIED","CANNOT_EDIT_OWN_SCOPE","INVALID_LOCATION_SCOPE"].includes(code)) {
      response.status(code === "MEMBER_NOT_FOUND" ? 404 : code === "INVALID_LOCATION_SCOPE" ? 400 : 403).json({ error: { code } }); return;
    }
    next(error);
  }
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
