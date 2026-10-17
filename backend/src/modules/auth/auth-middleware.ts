import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { hashToken, SESSION_COOKIE_NAME } from "./session.js";

export interface AuthContext {
  sessionId: string;
  csrfToken: string;
  userId: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

function hashesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export async function requireSession(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = request.cookies?.[SESSION_COOKIE_NAME];
    if (typeof token !== "string" || token.length < 32) {
      response.status(401).json({
        error: { code: "UNAUTHENTICATED", message: "Please sign in to continue." },
      });
      return;
    }

    const session = await prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });

    if (!session || session.expiresAt <= new Date() || session.user.disabledAt) {
      if (session) {
        await prisma.session.deleteMany({ where: { id: session.id } });
      }
      response.clearCookie(SESSION_COOKIE_NAME, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });
      response.status(401).json({
        error: { code: "SESSION_EXPIRED", message: "Your session has expired. Please sign in again." },
      });
      return;
    }

    request.auth = {
      sessionId: session.id,
      csrfTokenHash: session.csrfTokenHash,
      userId: session.userId,
    };
    await prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
    next();
  } catch (error) {
    next(error);
  }
}

export function requireCsrf(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const suppliedToken = request.get("x-csrf-token");
  const expectedHash = request.auth?.csrfTokenHash;

  if (!suppliedToken || !expectedHash || !hashesMatch(hashToken(suppliedToken), expectedHash)) {
    response.status(403).json({
      error: { code: "CSRF_INVALID", message: "The security token is missing or expired. Refresh and try again." },
    });
    return;
  }

  next();
}
