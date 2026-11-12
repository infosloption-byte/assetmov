import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireCsrf, requireSession } from "../auth/auth-middleware.js";
import { requirePermission, requireTenant } from "../tenancy/tenant-context.js";

export const vendorRouter = Router();
vendorRouter.use(requireSession, requireTenant);

const supplierSchema = z.object({
  name: z.string().trim().min(2).max(191),
  email: z.union([z.email().max(191), z.literal(""), z.null()]).optional(),
  phone: z.string().trim().max(60).nullable().optional(),
  address: z.string().trim().max(2000).nullable().optional(),
}).strict();
const manufacturerSchema = z.object({ name: z.string().trim().min(2).max(191) }).strict();
const supplierPatchSchema = supplierSchema.partial().extend({ isActive: z.boolean().optional() })
  .refine(value => Object.keys(value).length > 0);
const manufacturerPatchSchema = manufacturerSchema.partial().extend({ isActive: z.boolean().optional() })
  .refine(value => Object.keys(value).length > 0);
const listSchema = z.object({ includeInactive: z.enum(["true", "false"]).default("false") }).strict();

function fail(response: import("express").Response, status: number, code: string, message: string): void {
  response.status(status).json({ error: { code, message } });
}
function isConflict(error: unknown): boolean {
  return Boolean(typeof error === "object" && error !== null && "code" in error && error.code === "P2002");
}
function readList(request: import("express").Request) {
  const parsed = listSchema.safeParse(request.query);
  if (!parsed.success) return null;
  return { tenantId: request.auth!.tenantId!,
    includeInactive: parsed.data.includeInactive === "true" &&
      (request.auth?.permissions ?? []).includes("tenant.settings.manage") };
}

vendorRouter.get("/suppliers", requirePermission("asset.read"), async (request, response, next) => {
  const filter = readList(request);
  if (!filter) { fail(response, 400, "VALIDATION_ERROR", "Invalid supplier filters."); return; }
  try {
    const data = await prisma.supplier.findMany({ where: {
      tenantId: filter.tenantId, ...(filter.includeInactive ? {} : { isActive: true }),
    }, orderBy: { name: "asc" }, take: 500 });
    response.json({ data });
  } catch (error) { next(error); }
});
vendorRouter.get("/manufacturers", requirePermission("asset.read"), async (request, response, next) => {
  const filter = readList(request);
  if (!filter) { fail(response, 400, "VALIDATION_ERROR", "Invalid manufacturer filters."); return; }
  try {
    const data = await prisma.manufacturer.findMany({ where: {
      tenantId: filter.tenantId, ...(filter.includeInactive ? {} : { isActive: true }),
    }, orderBy: { name: "asc" }, take: 500 });
    response.json({ data });
  } catch (error) { next(error); }
});

vendorRouter.post("/suppliers", requirePermission("tenant.settings.manage"), requireCsrf, async (request, response, next) => {
  const parsed = supplierSchema.safeParse(request.body);
  if (!parsed.success) { fail(response, 400, "VALIDATION_ERROR", "Check supplier details."); return; }
  try {
    const tenantId = request.auth!.tenantId!;
    const data = await prisma.$transaction(async tx => {
      const record = await tx.supplier.create({ data: {
        tenantId, ...parsed.data, email: parsed.data.email || null,
      } });
      await tx.auditLog.create({ data: { tenantId, actorUserId: request.auth!.userId,
        action: "supplier.created", entityType: "Supplier", entityId: record.id,
        newData: { name: record.name, isActive: true } } });
      return record;
    });
    response.status(201).json({ data });
  } catch (error) { if (isConflict(error)) fail(response, 409, "SUPPLIER_EXISTS", "Supplier name already exists."); else next(error); }
});
vendorRouter.post("/manufacturers", requirePermission("tenant.settings.manage"), requireCsrf, async (request, response, next) => {
  const parsed = manufacturerSchema.safeParse(request.body);
  if (!parsed.success) { fail(response, 400, "VALIDATION_ERROR", "Check manufacturer name."); return; }
  try {
    const tenantId = request.auth!.tenantId!;
    const data = await prisma.$transaction(async tx => {
      const record = await tx.manufacturer.create({ data: { tenantId, ...parsed.data } });
      await tx.auditLog.create({ data: { tenantId, actorUserId: request.auth!.userId,
        action: "manufacturer.created", entityType: "Manufacturer", entityId: record.id,
        newData: { name: record.name, isActive: true } } });
      return record;
    });
    response.status(201).json({ data });
  } catch (error) { if (isConflict(error)) fail(response, 409, "MANUFACTURER_EXISTS", "Manufacturer name already exists."); else next(error); }
});

vendorRouter.patch("/suppliers/:id", requirePermission("tenant.settings.manage"), requireCsrf, async (request, response, next) => {
  const id = request.params.id;
  const parsed = supplierPatchSchema.safeParse(request.body);
  if (typeof id !== "string" || !id || !parsed.success) {
    fail(response, 400, "VALIDATION_ERROR", "Check supplier changes."); return;
  }
  try {
    const tenantId = request.auth!.tenantId!;
    const data = await prisma.$transaction(async tx => {
      const before = await tx.supplier.findFirst({ where: { id, tenantId } });
      if (!before) return null;
      const { email, ...fields } = parsed.data;
      const record = await tx.supplier.update({ where: { id }, data: {
        ...fields, ...(email !== undefined ? { email: email || null } : {}),
      } });
      await tx.auditLog.create({ data: { tenantId, actorUserId: request.auth!.userId,
        action: record.isActive === before.isActive ? "supplier.updated" : "supplier.status_changed",
        entityType: "Supplier", entityId: id,
        oldData: { name: before.name, isActive: before.isActive },
        newData: { name: record.name, isActive: record.isActive } } });
      return record;
    });
    if (!data) { fail(response, 404, "SUPPLIER_NOT_FOUND", "Supplier not found."); return; }
    response.json({ data });
  } catch (error) { if (isConflict(error)) fail(response, 409, "SUPPLIER_EXISTS", "Supplier name already exists."); else next(error); }
});
vendorRouter.patch("/manufacturers/:id", requirePermission("tenant.settings.manage"), requireCsrf, async (request, response, next) => {
  const id = request.params.id;
  const parsed = manufacturerPatchSchema.safeParse(request.body);
  if (typeof id !== "string" || !id || !parsed.success) {
    fail(response, 400, "VALIDATION_ERROR", "Check manufacturer changes."); return;
  }
  try {
    const tenantId = request.auth!.tenantId!;
    const data = await prisma.$transaction(async tx => {
      const before = await tx.manufacturer.findFirst({ where: { id, tenantId } });
      if (!before) return null;
      const record = await tx.manufacturer.update({ where: { id }, data: parsed.data });
      await tx.auditLog.create({ data: { tenantId, actorUserId: request.auth!.userId,
        action: record.isActive === before.isActive ? "manufacturer.updated" : "manufacturer.status_changed",
        entityType: "Manufacturer", entityId: id,
        oldData: { name: before.name, isActive: before.isActive },
        newData: { name: record.name, isActive: record.isActive } } });
      return record;
    });
    if (!data) { fail(response, 404, "MANUFACTURER_NOT_FOUND", "Manufacturer not found."); return; }
    response.json({ data });
  } catch (error) { if (isConflict(error)) fail(response, 409, "MANUFACTURER_EXISTS", "Manufacturer name already exists."); else next(error); }
});
