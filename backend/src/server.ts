import { app } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";

const server = app.listen(env.API_PORT, "0.0.0.0", () => {
  logger.info({ port: env.API_PORT, nodeEnv: env.NODE_ENV }, "AssetMov API listening");
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down API");
  server.close(async (error) => {
    if (error) {
      logger.error({ err: error }, "HTTP server shutdown failed");
      process.exitCode = 1;
    }
    try {
      await prisma.$disconnect();
    } catch (disconnectError) {
      logger.error({ err: disconnectError }, "Database disconnect failed");
      process.exitCode = 1;
    }
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
