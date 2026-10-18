import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireSession, requireCsrf } from "../auth/auth-middleware.js";
import { requireTenant, requirePermission } from "../tenancy/tenant-context.js";

export const roleRouter = Router();
const roleSchema = z.object({
  key: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,59}$/),
  name: z.string().trim().min(2).max(191),
  description: z.string().trim().max(1000).optional(),
  permissionKeys: z.array(z.string().min(1).max(120)).max(100),
}).strict();
const editSchema = roleSchema.omit({ key: true });
roleRouter.use(requireSession, requireTenant);

roleRouter.get("/permissions", requirePermission("roles.manage"), async (_request, response, next) => {
  try {
    const data = await prisma.permission.findMany({ orderBy: { key: "asc" }, select: { key: true, description: true } });
    response.json({ data });
  } catch (error) { next(error); }
});

roleRouter.get("/", requirePermission("roles.manage"), async (request, response, next) => {
  try {
    const data = await prisma.role.findMany({
      where: { tenantId: request.auth!.tenantId! },
      include: { permissions: { include: { permission: true } }, _count: { select: { memberships: true } } },
      orderBy: { name: "asc" },
    });
    response.json({ data: data.map((role) => ({
      id: role.id, key: role.key, name: role.name, description: role.description,
      isSystem: role.isSystem, memberCount: role._count.memberships,
      permissionKeys: role.permissions.map((entry) => entry.permission.key),
    })) });
  } catch (error) { next(error); }
});

roleRouter.post("/", requirePermission("roles.manage"), requireCsrf, async (request, response, next) => {
  const parsed = roleSchema.safeParse(request.body);
  if (!parsed.success || parsed.data.key === "TENANT_OWNER") {
    response.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Check role key, name and permissions." } }); return;
  }
  try {
    const tenantId = request.auth!.tenantId!;
    const keys = [...new Set(parsed.data.permissionKeys)];
    // Only an owner may delegate administrative permissions; platform permissions are not in this catalog.
    const administrative = new Set(["roles.manage", "members.manage", "tenant.settings.manage"]);
    if (keys.some((key) => administrative.has(key)) && request.auth!.roleKey !== "TENANT_OWNER") {
      response.status(403).json({ error: { code: "PERMISSION_DELEGATION_DENIED" } }); return;
    }
    if (keys.some((key) => !request.auth!.permissions?.includes(key))) {
      response.status(403).json({ error: { code: "PERMISSION_DELEGATION_DENIED" } }); return;
    }
    const data = await prisma.$transaction(async (tx) => {
      const permissions = await tx.permission.findMany({ where: { key: { in: keys } } });
      if (permissions.length !== keys.length) throw new Error("UNKNOWN_PERMISSION");
      const role = await tx.role.create({ data: {
        tenantId, key: parsed.data.key, name: parsed.data.name, description: parsed.data.description,
      } });
      await tx.rolePermission.createMany({ data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })) });
      await tx.auditLog.create({ data: {
        tenantId, actorUserId: request.auth!.userId, action: "role.created",
        entityType: "Role", entityId: role.id,
        newData: { key: role.key, name: role.name, permissionKeys: keys },
      } });
      return role;
    });
    response.status(201).json({ data });
  } catch (error) {
    if (error instanceof Error && error.message === "UNKNOWN_PERMISSION") {
      response.status(400).json({ error: { code: "UNKNOWN_PERMISSION" } }); return;
    }
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      response.status(409).json({ error: { code: "ROLE_ALREADY_EXISTS" } }); return;
    }
    next(error);
  }
});

roleRouter.patch("/:id", requirePermission("roles.manage"), requireCsrf, async (request, response, next) => {
  const parsed = editSchema.safeParse(request.body);
  const id = request.params.id;
  if (!parsed.success || typeof id !== "string") {
    response.status(400).json({ error: { code: "VALIDATION_ERROR" } }); return;
  }
  const keys = [...new Set(parsed.data.permissionKeys)];
  const administrative = new Set(["roles.manage", "members.manage", "tenant.settings.manage"]);
  if ((keys.some((key) => administrative.has(key)) && request.auth!.roleKey !== "TENANT_OWNER")
    || keys.some((key) => !request.auth!.permissions?.includes(key))) {
    response.status(403).json({ error: { code: "PERMISSION_DELEGATION_DENIED" } }); return;
  }
  try {
    const tenantId = request.auth!.tenantId!;
    const role = await prisma.$transaction(async (tx) => {
      const existing = await tx.role.findFirst({ where: { id, tenantId } });
      if (!existing) throw new Error("ROLE_NOT_FOUND");
      if (existing.isSystem) throw new Error("SYSTEM_ROLE_IMMUTABLE");
      const permissions = await tx.permission.findMany({ where: { key: { in: keys } } });
      if (permissions.length !== keys.length) throw new Error("UNKNOWN_PERMISSION");
      const updated = await tx.role.update({ where: { id }, data: {
        name: parsed.data.name, description: parsed.data.description,
      } });
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      await tx.rolePermission.createMany({ data: permissions.map((p) => ({ roleId: id, permissionId: p.id })) });
      await tx.auditLog.create({ data: {
        tenantId, actorUserId: request.auth!.userId, action: "role.updated",
        entityType: "Role", entityId: id,
        oldData: { name: existing.name },
        newData: { name: updated.name, permissionKeys: keys },
      } });
      return updated;
    });
    response.json({ data: role });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (["ROLE_NOT_FOUND", "SYSTEM_ROLE_IMMUTABLE", "UNKNOWN_PERMISSION"].includes(code)) {
      response.status(code === "ROLE_NOT_FOUND" ? 404 : code === "UNKNOWN_PERMISSION" ? 400 : 409).json({ error: { code } }); return;
    }
    next(error);
  }
});
