import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { requireCsrf, requireSession } from "./auth-middleware.js";
import { accountEmailReady, sendAccountLink } from "./account-email.js";
import { hashPassword } from "./password.js";
import { createOpaqueToken, hashToken } from "./session.js";

export const accountRecoveryRouter = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Try again later." } },
});
const emailBody = z.object({ email: z.email().trim().toLowerCase().max(191) }).strict();
const redeemBody = z.object({
  token: z.string().regex(/^[a-zA-Z0-9_-]{43}$/),
}).strict();
const passwordBody = redeemBody.extend({
  newPassword: z.string().min(12).max(128),
});

type Purpose = "EMAIL_VERIFY" | "PASSWORD_RESET";

async function issueToken(userId: string, purpose: Purpose, minutes: number): Promise<string> {
  const raw = createOpaqueToken();
  const expiresAt = new Date(Date.now() + minutes * 60 * 1000);
  await prisma.$transaction(async tx => {
    // A new request replaces previous unused tokens for the same purpose.
    await tx.accountToken.deleteMany({
      where: { userId, kind: purpose, usedAt: null },
    });
    await tx.accountToken.create({ data: {
      userId, kind: purpose, tokenHash: hashToken(raw), expiresAt,
    } });
  });
  return raw;
}

export async function sendVerificationEmail(userId: string, email: string): Promise<void> {
  const raw = await issueToken(userId, "EMAIL_VERIFY", 24 * 60);
  await sendAccountLink(email, "verify", raw);
}

/** Always use the same response for known and unknown email addresses. */
accountRecoveryRouter.post("/password/forgot", limiter, async (request, response, next) => {
  const parsed = emailBody.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Provide a valid email." } }); return;
  }
  if (!accountEmailReady()) {
    response.status(503).json({ error: { code: "EMAIL_UNAVAILABLE", message: "Email recovery is not configured." } }); return;
  }
  try {
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email },
      select: { id: true, email: true, disabledAt: true } });
    if (user && !user.disabledAt) {
      const since = new Date(Date.now() - 15 * 60 * 1000);
      const count = await prisma.accountToken.count({
        where: { userId: user.id, kind: "PASSWORD_RESET", createdAt: { gt: since } },
      });
      if (count < 3) {
        const raw = await issueToken(user.id, "PASSWORD_RESET", 30);
        try { await sendAccountLink(user.email, "reset", raw); }
        catch { logger.warn("Account recovery email delivery failed."); }
      }
    }
    response.status(202).json({ message: "If the account exists, a recovery email will be sent." });
  } catch (error) { next(error); }
});

accountRecoveryRouter.post("/password/reset", limiter, async (request, response, next) => {
  const parsed = passwordBody.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Check the reset token and password." } }); return;
  }
  try {
    const passwordHash = await hashPassword(parsed.data.newPassword);
    const now = new Date();
    const updated = await prisma.$transaction(async tx => {
      const token = await tx.accountToken.findUnique({
        where: { tokenHash: hashToken(parsed.data.token) }, include: { user: true },
      });
      if (!token || token.kind !== "PASSWORD_RESET" || token.usedAt || token.expiresAt <= now ||
          token.user.disabledAt) return false;
      const consumed = await tx.accountToken.updateMany({
        where: { id: token.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now },
      });
      if (consumed.count !== 1) return false;
      await tx.user.update({ where: { id: token.userId }, data: { passwordHash } });
      await tx.session.deleteMany({ where: { userId: token.userId } });
      await tx.accountToken.updateMany({ where: { userId: token.userId, kind: "PASSWORD_RESET", usedAt: null },
        data: { usedAt: now } });
      return true;
    });
    if (!updated) {
      response.status(400).json({ error: { code: "TOKEN_INVALID", message: "This reset link is invalid or expired." } }); return;
    }
    response.json({ message: "Password updated. Sign in again on all devices." });
  } catch (error) { next(error); }
});

accountRecoveryRouter.post("/email/verification/request",
  limiter, requireSession, requireCsrf, async (request, response, next) => {
    if (!accountEmailReady()) {
      response.status(503).json({ error: { code: "EMAIL_UNAVAILABLE", message: "Email verification is not configured." } }); return;
    }
    try {
      const user = await prisma.user.findUnique({ where: { id: request.auth!.userId },
        select: { id: true, email: true, emailVerifiedAt: true, disabledAt: true } });
      if (!user || user.disabledAt) {
        response.status(403).json({ error: { code: "ACCESS_DENIED" } }); return;
      }
      if (user.emailVerifiedAt) {
        response.json({ message: "Your email is already verified." }); return;
      }
      await sendVerificationEmail(user.id, user.email);
      response.status(202).json({ message: "If delivery is available, check your inbox." });
    } catch (error) {
      logger.warn("Verification email could not be sent.");
      next(error);
    }
  },
);

accountRecoveryRouter.post("/email/verification/confirm", limiter, async (request, response, next) => {
  const parsed = redeemBody.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid verification link." } }); return;
  }
  try {
    const now = new Date();
    const verified = await prisma.$transaction(async tx => {
      const token = await tx.accountToken.findUnique({
        where: { tokenHash: hashToken(parsed.data.token) }, include: { user: true },
      });
      if (!token || token.kind !== "EMAIL_VERIFY" || token.usedAt || token.expiresAt <= now ||
          token.user.disabledAt) return false;
      const consumed = await tx.accountToken.updateMany({
        where: { id: token.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now },
      });
      if (consumed.count !== 1) return false;
      await tx.user.update({ where: { id: token.userId }, data: { emailVerifiedAt: now } });
      return true;
    });
    if (!verified) {
      response.status(400).json({ error: { code: "TOKEN_INVALID", message: "This verification link is invalid or expired." } }); return;
    }
    response.json({ message: "Email verified. You may sign in." });
  } catch (error) { next(error); }
});
