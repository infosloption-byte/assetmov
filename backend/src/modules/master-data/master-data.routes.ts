import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireSession, requireCsrf } from "../auth/auth-middleware.js";
import { requireTenant, requirePermission } from "../tenancy/tenant-context.js";

export const masterDataRouter = Router();
masterDataRouter.use(requireSession, requireTenant);

const categorySchema = z.object({
  name: z.string().trim().min(2).max(191),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{0,99}$/),
  description: z.string().trim().max(3000).nullable().optional(),
}).strict();

const fieldDefinition = z.object({
  key: z.string().regex(/^[a-z][a-zA-Z0-9_]{0,63}$/),
  label: z.string().trim().min(1).max(120),
  type: z.enum(["text", "longText", "number", "date", "boolean", "singleSelect", "multiSelect"]),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
}).strict().superRefine((field, context) => {
  const select = field.type === "singleSelect" || field.type === "multiSelect";
  if (select && (!field.options?.length || new Set(field.options).size !== field.options.length)) {
    context.addIssue({ code: "custom", message: "Select fields require unique choices." });
  }
  if (!select && field.options !== undefined) {
    context.addIssue({ code: "custom", message: "Only select fields accept choices." });
  }
});
const modelSchema = z.object({
  categoryId: z.string().min(1).max(36),
  name: z.string().trim().min(2).max(191),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{0,99}$/).nullable().optional(),
  fields: z.array(fieldDefinition).max(100).default([]),
}).strict().superRefine((model, context) => {
  if (new Set(model.fields.map(field => field.key)).size !== model.fields.length) {
    context.addIssue({ code: "custom", message: "Field keys must be unique." });
  }
});

function sendError(response: import("express").Response, status: number, code: string) {
  response.status(status).json({ error: { code, message: code.replaceAll("_", " ").toLowerCase() } });
}

masterDataRouter.get("/categories", requirePermission("asset.read"), async (request, response, next) => {
  try {
    const data = await prisma.assetCategory.findMany({
      where: { tenantId: request.auth!.tenantId! },
      include: { _count: { select: { models: true } } }, orderBy: { name: "asc" },
    });
    response.json({ data });
  } catch (error) { next(error); }
});

masterDataRouter.post("/categories", requirePermission("tenant.settings.manage"), requireCsrf, async (request, response, next) => {
  const parsed = categorySchema.safeParse(request.body);
  if (!parsed.success) { sendError(response, 400, "VALIDATION_ERROR"); return; }
  try {
    const tenantId = request.auth!.tenantId!;
    const data = await prisma.$transaction(async tx => {
      const category = await tx.assetCategory.create({ data: { ...parsed.data, tenantId } });
      await tx.auditLog.create({ data: { tenantId, actorUserId: request.auth!.userId,
        action: "asset_category.created", entityType: "AssetCategory", entityId: category.id,
        newData: { name: category.name, code: category.code } } });
      return category;
    });
    response.status(201).json({ data });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      sendError(response, 409, "CATEGORY_ALREADY_EXISTS"); return;
    }
    next(error);
  }
});

masterDataRouter.patch("/categories/:id", requirePermission("tenant.settings.manage"), requireCsrf, async (request, response, next) => {
  const parsed = categorySchema.safeParse(request.body);
  const id = request.params.id;
  if (!parsed.success || typeof id !== "string") { sendError(response, 400, "VALIDATION_ERROR"); return; }
  try {
    const tenantId = request.auth!.tenantId!;
    const data = await prisma.$transaction(async tx => {
      const old = await tx.assetCategory.findFirst({ where: { id, tenantId } });
      if (!old) return null;
      const category = await tx.assetCategory.update({ where: { id }, data: parsed.data });
      await tx.auditLog.create({ data: { tenantId, actorUserId: request.auth!.userId,
        action: "asset_category.updated", entityType: "AssetCategory", entityId: id,
        oldData: { name: old.name, code: old.code }, newData: { name: category.name, code: category.code } } });
      return category;
    });
    if (!data) { sendError(response, 404, "CATEGORY_NOT_FOUND"); return; }
    response.json({ data });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      sendError(response, 409, "CATEGORY_ALREADY_EXISTS"); return;
    }
    next(error);
  }
});

masterDataRouter.get("/models", requirePermission("asset.read"), async (request, response, next) => {
  try {
    const data = await prisma.assetModel.findMany({
      where: { tenantId: request.auth!.tenantId! },
      include: { category: { select: { id: true, name: true } }, _count: { select: { assets: true } } },
      orderBy: { name: "asc" },
    });
    response.json({ data });
  } catch (error) { next(error); }
});

masterDataRouter.post("/models", requirePermission("tenant.settings.manage"), requireCsrf, async (request, response, next) => {
  const parsed = modelSchema.safeParse(request.body);
  if (!parsed.success) { sendError(response, 400, "VALIDATION_ERROR"); return; }
  try {
    const tenantId = request.auth!.tenantId!;
    const data = await prisma.$transaction(async tx => {
      const category = await tx.assetCategory.findFirst({ where: { id: parsed.data.categoryId, tenantId, isActive: true } });
      if (!category) return null;
      const model = await tx.assetModel.create({ data: {
        tenantId, categoryId: category.id, name: parsed.data.name,
        code: parsed.data.code, fieldSchema: { version: 1, fields: parsed.data.fields },
      } });
      await tx.auditLog.create({ data: { tenantId, actorUserId: request.auth!.userId,
        action: "asset_model.created", entityType: "AssetModel", entityId: model.id,
        newData: { name: model.name, categoryId: model.categoryId } } });
      return model;
    });
    if (!data) { sendError(response, 400, "CATEGORY_NOT_FOUND"); return; }
    response.status(201).json({ data });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      sendError(response, 409, "MODEL_ALREADY_EXISTS"); return;
    }
    next(error);
  }
});

masterDataRouter.patch("/models/:id", requirePermission("tenant.settings.manage"), requireCsrf, async (request, response, next) => {
  const parsed = modelSchema.safeParse(request.body);
  const id = request.params.id;
  if (!parsed.success || typeof id !== "string" || !id) {
    sendError(response, 400, "VALIDATION_ERROR"); return;
  }
  try {
    const tenantId = request.auth!.tenantId!;
    const result = await prisma.$transaction(async tx => {
      const existing = await tx.assetModel.findFirst({ where: { id, tenantId } });
      if (!existing) throw new Error("MODEL_NOT_FOUND");
      const category = await tx.assetCategory.findFirst({
        where: { id: parsed.data.categoryId, tenantId, isActive: true },
      });
      if (!category) throw new Error("CATEGORY_NOT_FOUND");
      const assetCount = await tx.asset.count({ where: { tenantId, modelId: id } });
      const previousSchema = JSON.stringify(existing.fieldSchema ?? { version: 1, fields: [] });
      const nextSchema = { version: 1, fields: parsed.data.fields };
      if (assetCount > 0 && (
        previousSchema !== JSON.stringify(nextSchema) || existing.categoryId !== category.id
      )) throw new Error("MODEL_IN_USE");
      const model = await tx.assetModel.update({
        where: { id }, data: {
          categoryId: category.id, name: parsed.data.name, code: parsed.data.code,
          fieldSchema: nextSchema,
        },
      });
      await tx.auditLog.create({ data: {
        tenantId, actorUserId: request.auth!.userId,
        action: "asset_model.updated", entityType: "AssetModel", entityId: id,
        oldData: { name: existing.name, categoryId: existing.categoryId },
        newData: { name: model.name, categoryId: model.categoryId, fieldSchema: nextSchema },
      } });
      return model;
    });
    response.json({ data: result });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (["MODEL_NOT_FOUND", "CATEGORY_NOT_FOUND", "MODEL_IN_USE"].includes(code)) {
      sendError(response, code === "MODEL_NOT_FOUND" ? 404 : code === "CATEGORY_NOT_FOUND" ? 400 : 409, code);
      return;
    }
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      sendError(response, 409, "MODEL_ALREADY_EXISTS"); return;
    }
    next(error);
  }
});
