import { randomBytes } from "node:crypto";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { accountEmailReady } from "./account-email.js";
import { sendVerificationEmail } from "./account.routes.js";
import { requireCsrf, requireSession } from "./auth-middleware.js";
import { hashPassword, verifyPassword } from "./password.js";
import {
  clearSessionCookie,
  createOpaqueToken,
  hashToken,
  SESSION_TTL_MS,
  setSessionCookie,
} from "./session.js";

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: { code: "RATE_LIMITED", message: "Too many authentication attempts. Please try again later." },
  },
});

const registerSchema = z.object({
  tenantName: z.string().trim().min(2).max(120),
  tenantSlug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(63),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(191),
  password: z.string().min(12).max(128),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(191),
  password: z.string().min(1).max(128),
});

const reservedSlugs = new Set(["admin", "api", "www", "root", "support", "billing", "login", "register", "assets", "static"]);
const DUMMY_PASSWORD_HASH = "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$O1g02FhoC0g3XJkKsFvLrg3_6QcNlo-4z9bc0dKfjTX8n_TcVmiqHjEc7OexElF7Kw4ZRCa8ON8uuohyIvjNKQ";

const permissionDefinitions = [
  ["tenant.settings.manage", "Manage organization settings"],
  ["members.manage", "Invite and manage organization members"],
  ["roles.manage", "Manage roles and permission assignments"],
  ["location.read", "View locations"],
  ["location.manage", "Manage locations"],
  ["employee.read", "View employees and custodians"],
  ["employee.manage", "Manage employees and custodians"],
  ["asset.read", "View assets"],
  ["asset.create", "Register assets"],
  ["asset.update", "Edit asset details"],
  ["asset.financial.update", "Edit financial asset values"],
  ["asset.assign", "Assign and return assets"],
  ["asset.transfer.read", "View incoming and outgoing asset transfers"],
  ["asset.transfer.dispatch", "Dispatch asset transfers"],
  ["asset.transfer.receive", "Receive or reject asset transfers"],
  ["asset.dispose", "Dispose or retire assets"],
  ["asset.import", "Import assets in bulk"],
  ["request.create", "Submit asset requests"],
  ["request.approve", "Approve or reject requests"],
  ["service.manage", "Manage maintenance work orders"],
  ["license.manage", "Manage software licenses"],
  ["audit.manage", "Run physical asset audits"],
  ["report.read", "View reports"],
  ["report.export", "Export reports"],
] as const;

function safeUser(user: {
  id: string;
  email: string;
  fullName: string;
  emailVerifiedAt: Date | null;
  isPlatformAdmin: boolean;
  memberships: Array<{
    id: string;
    allLocationsAccess: boolean;
    role: { id: string; key: string; name: string };
    tenant: { id: string; name: string; slug: string; status: string };
  }>;
}) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    emailVerified: user.emailVerifiedAt !== null,
    isPlatformAdmin: user.isPlatformAdmin,
    memberships: user.memberships.map((membership) => ({
      id: membership.id,
      allLocationsAccess: membership.allLocationsAccess,
      role: {
        id: membership.role.id,
        key: membership.role.key,
        name: membership.role.name,
      },
      tenant: {
        id: membership.tenant.id,
        name: membership.tenant.name,
        slug: membership.tenant.slug,
        status: membership.tenant.status,
      },
    })),
  };
}

async function createSession(
  userId: string,
  request: Parameters<import("express").RequestHandler>[0],
): Promise<{ rawToken: string; csrfToken: string }> {
  const rawToken = createOpaqueToken();
  const csrfToken = randomBytes(32).toString("base64url");
  const now = new Date();

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      csrfToken,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      lastSeenAt: now,
      ipAddress: request.ip?.slice(0, 64),
      userAgent: request.get("user-agent")?.slice(0, 500),
    },
  });

  return { rawToken, csrfToken };
}

function sendError(
  response: import("express").Response,
  status: number,
  code: string,
  message: string,
): void {
  response.status(status).json({ error: { code, message } });
}

authRouter.post("/register", authLimiter, async (request, response, next) => {
  try {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      sendError(response, 400, "VALIDATION_ERROR", "Check the organization, name, email and password fields.");
      return;
    }

    const input = parsed.data;
    if (reservedSlugs.has(input.tenantSlug)) {
      sendError(response, 400, "SLUG_RESERVED", "That organization URL is reserved. Choose another one.");
      return;
    }

    const passwordHash = await hashPassword(input.password);
    const rawToken = createOpaqueToken();
    const csrfToken = randomBytes(32).toString("base64url");
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const settings = await tx.platformSetting.findUnique({ where: { id: "global" } });
      if (settings?.companyRegistrationOpen === false) throw new Error("REGISTRATION_CLOSED");
      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          fullName: input.fullName,
        },
      });

      const tenant = await tx.tenant.create({
        data: {
          name: input.tenantName,
          slug: input.tenantSlug,
          status: "TRIAL",
        },
      });

      const trialPlan = await tx.subscriptionPlan.findFirst({
        where: { key: "trial", isActive: true },
      });
      if (!trialPlan || trialPlan.trialDurationDays < 1) {
        throw new Error("TRIAL_PLAN_NOT_CONFIGURED");
      }

      await tx.tenantSubscription.create({
        data: {
          tenantId: tenant.id,
          planId: trialPlan.id,
          status: "TRIALING",
          trialStartedAt: now,
          trialEndsAt: new Date(now.getTime() + trialPlan.trialDurationDays * 24 * 60 * 60 * 1000),
        },
      });

      const permissions = await Promise.all(
        permissionDefinitions.map(([key, description]) =>
          tx.permission.upsert({
            where: { key },
            create: { key, description },
            update: { description },
          }),
        ),
      );

      const ownerRole = await tx.role.create({
        data: {
          tenantId: tenant.id,
          key: "TENANT_OWNER",
          name: "Company Administrator",
          description: "Full company access including user management, configurable roles, assets and company billing.",
          isSystem: true,
        },
      });

      await tx.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: ownerRole.id,
          permissionId: permission.id,
        })),
      });

      const membership = await tx.membership.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          roleId: ownerRole.id,
          allLocationsAccess: true,
        },
        include: { tenant: true, role: true },
      });

      await tx.session.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(rawToken),
          csrfToken,
          expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
          lastSeenAt: now,
          ipAddress: request.ip?.slice(0, 64),
          userAgent: request.get("user-agent")?.slice(0, 500),
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          actorUserId: user.id,
          action: "tenant.created",
          entityType: "Tenant",
          entityId: tenant.id,
          newData: { name: tenant.name, slug: tenant.slug, status: tenant.status },
          ipAddress: request.ip?.slice(0, 64),
        },
      });

      return { user, membership };
    });

    if (accountEmailReady()) {
      try { await sendVerificationEmail(result.user.id, result.user.email); }
      catch { logger.warn("Initial account verification email delivery failed."); }
    }
    setSessionCookie(response, rawToken);
    response.status(201).json({
      user: {
        id: result.user.id,
        email: result.user.email,
        fullName: result.user.fullName,
        emailVerified: false,
        isPlatformAdmin: false,
        memberships: [{
          id: result.membership.id,
          allLocationsAccess: result.membership.allLocationsAccess,
          role: {
            id: result.membership.role.id,
            key: result.membership.role.key,
            name: result.membership.role.name,
          },
          tenant: {
            id: result.membership.tenant.id,
            name: result.membership.tenant.name,
            slug: result.membership.tenant.slug,
            status: result.membership.tenant.status,
          },
        }],
      },
      csrfToken,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "REGISTRATION_CLOSED") {
      sendError(response, 403, "REGISTRATION_CLOSED",
        "New company registration is temporarily closed. Contact platform support.");
      return;
    }
    if (error instanceof Error && error.message === "TRIAL_PLAN_NOT_CONFIGURED") {
      sendError(response, 503, "TRIAL_PLAN_NOT_CONFIGURED", "Company registration is not available until the Trial plan is configured.");
      return;
    }
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      sendError(response, 409, "ALREADY_EXISTS", "An account or organization using that value already exists.");
      return;
    }
    next(error);
  }
});

authRouter.post("/login", authLimiter, async (request, response, next) => {
  try {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      sendError(response, 400, "VALIDATION_ERROR", "Enter a valid email address and password.");
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
    });

    // Always perform one password-hash verification to reduce account-enumeration timing leaks.
    const passwordMatches = await verifyPassword(
      parsed.data.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || user.disabledAt || !passwordMatches) {
      sendError(response, 401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
      return;
    }

    if (env.REQUIRE_VERIFIED_EMAIL === "true" && !user.emailVerifiedAt) {
      sendError(response, 403, "EMAIL_VERIFICATION_REQUIRED", "Verify your email before signing in.");
      return;
    }
    const session = await createSession(user.id, request);
    setSessionCookie(response, session.rawToken);

    const userWithMemberships = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        memberships: {
          where: { isActive: true },
          include: { tenant: true, role: true },
        },
      },
    });

    if (!userWithMemberships) {
      sendError(response, 401, "INVALID_SESSION", "Please sign in again.");
      return;
    }

    response.status(200).json({
      user: safeUser(userWithMemberships),
      csrfToken: session.csrfToken,
    });
  } catch (error) {
    logger.error({ err: error }, "Login failed");
    next(error);
  }
});

authRouter.get("/me", requireSession, async (request, response, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: request.auth!.userId },
      include: {
        memberships: {
          where: { isActive: true },
          include: { tenant: true, role: true },
        },
      },
    });

    if (!user || user.disabledAt) {
      sendError(response, 401, "UNAUTHENTICATED", "Please sign in to continue.");
      return;
    }

    response.status(200).json({ user: safeUser(user) });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/csrf", requireSession, async (request, response, next) => {
  try {
    response.status(200).json({ csrfToken: request.auth!.csrfToken });
  } catch (error) {
    next(error);
  }
});

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(128),
}).strict();

authRouter.post("/change-password", requireSession, requireCsrf, async (request, response, next) => {
  const parsed = passwordChangeSchema.safeParse(request.body);
  if (!parsed.success || parsed.data.currentPassword === parsed.data.newPassword) {
    sendError(response, 400, "VALIDATION_ERROR", "Provide your current password and a different new password of at least 12 characters.");
    return;
  }
  try {
    const userId = request.auth!.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.disabledAt || !await verifyPassword(parsed.data.currentPassword, user.passwordHash)) {
      sendError(response, 403, "CURRENT_PASSWORD_INVALID", "The current password is incorrect.");
      return;
    }
    const passwordHash = await hashPassword(parsed.data.newPassword);
    await prisma.$transaction(async (tx) => {
      const changed = await tx.user.updateMany({ where: { id: userId, passwordHash: user.passwordHash }, data: { passwordHash } });
      if (changed.count !== 1) throw new Error("PASSWORD_CHANGED_CONCURRENTLY");
      await tx.session.deleteMany({ where: { userId, id: { not: request.auth!.sessionId } } });
    });
    response.status(200).json({ success: true, message: "Password changed. Other sessions were signed out." });
  } catch (error) {
    if (error instanceof Error && error.message === "PASSWORD_CHANGED_CONCURRENTLY") {
      sendError(response, 409, "PASSWORD_CHANGED_CONCURRENTLY", "Your password changed in another session. Please retry.");
      return;
    }
    next(error);
  }
});

authRouter.get("/sessions", requireSession, async (request, response, next) => {
  try {
    const now = new Date();
    const sessions = await prisma.session.findMany({
      where: { userId: request.auth!.userId, expiresAt: { gt: now } },
      select: { id: true, createdAt: true, lastSeenAt: true, expiresAt: true, ipAddress: true, userAgent: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    response.status(200).json({ data: sessions.map((session) => ({
      ...session,
      isCurrent: session.id === request.auth!.sessionId,
    })) });
  } catch (error) { next(error); }
});

authRouter.delete("/sessions/others", requireSession, requireCsrf, async (request, response, next) => {
  try {
    const result = await prisma.session.deleteMany({
      where: { userId: request.auth!.userId, id: { not: request.auth!.sessionId } },
    });
    response.status(200).json({ revoked: result.count });
  } catch (error) { next(error); }
});

authRouter.delete("/sessions/:id", requireSession, requireCsrf, async (request, response, next) => {
  try {
    const sessionId = request.params.id;
    if (typeof sessionId !== "string" || !sessionId || sessionId.length > 36) {
      sendError(response, 400, "VALIDATION_ERROR", "A valid session ID is required.");
      return;
    }
    if (sessionId === request.auth!.sessionId) {
      sendError(response, 409, "CURRENT_SESSION", "Use Sign out to end this session.");
      return;
    }
    const result = await prisma.session.deleteMany({
      where: { id: sessionId, userId: request.auth!.userId },
    });
    if (!result.count) {
      sendError(response, 404, "SESSION_NOT_FOUND", "The session was not found.");
      return;
    }
    response.status(200).json({ revoked: result.count });
  } catch (error) { next(error); }
});

authRouter.post("/logout", requireSession, requireCsrf, async (request, response, next) => {
  try {
    await prisma.session.deleteMany({ where: { id: request.auth!.sessionId } });
    clearSessionCookie(response);
    response.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
});
