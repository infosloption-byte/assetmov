/**
 * One-time Platform Admin bootstrap for a trusted LOCAL development database.
 *
 * Password and confirmation are supplied ONLY over stdin (two lines). They are
 * never accepted as command-line flags, included in URLs or logged to stdout.
 */
import "dotenv/config";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { hashPassword } from "../modules/auth/password.js";

const inputSchema = z.object({
  email: z.email().max(191),
  name: z.string().trim().min(2).max(191),
}).strict();

function parseArguments(args: string[]) {
  const options = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (!key || !["--email", "--name", "--database"].includes(key) || !value ||
        value.startsWith("--") || options.has(key)) {
      throw new Error("Usage: npm run platform:bootstrap -- --email EMAIL --name NAME --database assetmov");
    }
    options.set(key, value);
  }
  if (options.get("--database") !== "assetmov") {
    throw new Error("The --database assetmov confirmation is required.");
  }
  return inputSchema.parse({
    email: options.get("--email")?.trim().toLowerCase(),
    name: options.get("--name"),
  });
}

function ensureLocalDevelopmentDatabase(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("The bootstrap command is restricted to local development.");
  }
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is missing. Configure backend/.env.");
  const url = new URL(value);
  const name = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || name !== "assetmov") {
    throw new Error("Refusing to create a platform administrator outside the local assetmov database.");
  }
  process.stdout.write("Target database: local assetmov.\n");
}

async function readPasswordFromStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    throw new Error(
      "Password must be piped through stdin as two lines (password and confirmation). " +
      "Use the documented PowerShell SecureString procedure.",
    );
  }
  let received = "";
  for await (const chunk of process.stdin) {
    received += String(chunk);
    if (Buffer.byteLength(received, "utf8") > 1024) {
      throw new Error("Password input exceeds the allowed size.");
    }
  }
  const parts = received.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const [password, confirmation] = parts;
  if (!password || !confirmation || parts.slice(2).some((value) => value.length > 0)) {
    throw new Error("Provide exactly two password lines through stdin.");
  }
  if (password !== confirmation) throw new Error("Password confirmation does not match.");
  if (password.length < 16 || password.length > 128) {
    throw new Error("Use a unique Platform Admin password between 16 and 128 characters.");
  }
  return password;
}

async function main(): Promise<void> {
  const account = parseArguments(process.argv.slice(2));
  ensureLocalDevelopmentDatabase();
  const password = await readPasswordFromStdin();
  const passwordHash = await hashPassword(password);

  const created = await prisma.$transaction(async (tx) => {
    // Do not allow this local bootstrap to silently create additional superusers.
    const existingAdminCount = await tx.user.count({ where: { isPlatformAdmin: true } });
    if (existingAdminCount > 0) {
      throw new Error("A Platform Admin already exists. Bootstrap did not modify any account.");
    }
    const existingUser = await tx.user.findUnique({ where: { email: account.email } });
    if (existingUser) {
      throw new Error("The email already belongs to an account. Bootstrap will not elevate an existing user.");
    }

    const user = await tx.user.create({
      data: {
        email: account.email,
        fullName: account.name,
        passwordHash,
        emailVerifiedAt: new Date(), // Trusted local operator bootstrap, not public registration.
        isPlatformAdmin: true,
      },
      select: { id: true, email: true, isPlatformAdmin: true },
    });

    await tx.platformAuditLog.create({
      data: {
        actorUserId: user.id,
        action: "platform_admin.bootstrapped",
        entityType: "User",
        entityId: user.id,
        reason: "Initial Platform Admin created by a trusted local terminal operator.",
        newData: { email: user.email, isPlatformAdmin: user.isPlatformAdmin },
      },
    });
    return user;
  });

  process.stdout.write(
    "Platform Admin created: " + created.email +
    "\nLogin at http://localhost:5176 with your new credentials.\n",
  );
}

main().catch((error: unknown) => {
  // Never print input or full connection details.
  const message = error instanceof Error ? error.message : "Unexpected bootstrap failure.";
  process.stderr.write("Platform Admin bootstrap failed: " + message + "\n");
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
