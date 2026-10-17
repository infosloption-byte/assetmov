import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { SESSION_COOKIE_NAME } from "./modules/auth/session.js";
import { workspaceRouter } from "./modules/tenancy/workspace.routes.js";
import { assetRouter } from "./modules/assets/asset.routes.js";
import { locationRouter } from "./modules/locations/location.routes.js";
import { transferRouter } from "./modules/transfers/transfer.routes.js";
import { employeeRouter } from "./modules/employees/employee.routes.js";
import { platformRouter } from "./modules/platform/platform.routes.js";

export const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin: env.FRONTEND_ORIGIN,
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.use("/api", (request, response, next) => {
  const origin = request.get("origin");
  if (origin && origin !== env.FRONTEND_ORIGIN) {
    response.status(403).json({
      error: { code: "ORIGIN_NOT_ALLOWED", message: "This request origin is not allowed." },
    });
    return;
  }

  const mutatingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
  const hasSessionCookie = typeof request.cookies?.[SESSION_COOKIE_NAME] === "string";
  if (mutatingMethods.has(request.method) && hasSessionCookie && origin !== env.FRONTEND_ORIGIN) {
    response.status(403).json({
      error: { code: "ORIGIN_REQUIRED", message: "A trusted browser origin is required for this action." },
    });
    return;
  }

  next();
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
app.use("/api", apiLimiter);

app.get("/api/health", async (_request, response, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    response.status(200).json({
      status: "ok",
      service: "assetmov-api",
      database: "ok",
    });
  } catch (error) {
    next(error);
  }
});

app.use("/api/auth", authRouter);
app.use("/api/platform", platformRouter);
app.use("/api/workspace", workspaceRouter);
app.use("/api/assets", assetRouter);
app.use("/api/locations", locationRouter);
app.use("/api/transfers", transferRouter);
app.use("/api/employees", employeeRouter);

app.use((_request, response) => {
  response.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "The requested API route was not found.",
    },
  });
});

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  logger.error({ err: error }, "Unhandled API error");
  response.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred.",
    },
  });
};

app.use(errorHandler);
