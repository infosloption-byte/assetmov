import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireCsrf, requireSession } from "../auth/auth-middleware.js";
import { requirePermission, requireTenant } from "./tenant-context.js";

export const workspaceRouter = Router();

workspaceRouter.get("/context", requireSession, requireTenant, (request, response) => {
  const auth = request.auth;

  if (!auth?.tenantId || !auth.membershipId) {
    response.status(500).json({
      error: { code: "TENANT_CONTEXT_MISSING", message: "Workspace context could not be resolved." },
    });
    return;
  }

  response.status(200).json({
    tenant: {
      id: auth.tenantId,
      name: auth.tenantName,
      slug: auth.tenantSlug,
      status: auth.tenantStatus,
    },
    membership: {
      id: auth.membershipId,
      role: {
        id: auth.roleId,
        key: auth.roleKey,
        name: auth.roleName,
      },
      allLocationsAccess: auth.allLocationsAccess ?? false,
    },
    permissions: auth.permissions ?? [],
    locationScope: {
      accessibleLocationIds: auth.accessibleLocationIds ?? [],
      manageableLocationIds: auth.manageableLocationIds ?? [],
    },
  });
});

// Asset metrics follow the same tenant, role and location visibility rules as
// GET /api/assets. The company dashboard must not disclose hidden locations.
workspaceRouter.get("/overview",
  requireSession,
  requireTenant,
  requirePermission("asset.read"),
  async (request, response, next) => {
    try {
      const tenantId = request.auth?.tenantId;
      if (!tenantId || !request.auth?.membershipId) {
        response.status(400).json({
          error: { code: "TENANT_CONTEXT_REQUIRED", message: "Select a workspace to view asset metrics." },
        });
        return;
      }

      const locationFilter = request.auth.allLocationsAccess
        ? {}
        : { currentLocationId: { in: request.auth.accessibleLocationIds ?? [] } };
      const grouped = await prisma.asset.groupBy({
        by: ["status"],
        where: { tenantId, ...locationFilter },
        _count: { _all: true },
      });
      const byStatus = (status: string) =>
        grouped.find((item) => item.status === status)?._count._all ?? 0;

      response.status(200).json({
        data: {
          total: grouped.reduce((sum, item) => sum + item._count._all, 0),
          assigned: byStatus("ASSIGNED"),
          inService: byStatus("IN_SERVICE"),
          inTransit: byStatus("IN_TRANSIT"),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

const companyProfileSchema = z.object({
  name: z.string().trim().min(2).max(191),
  timezone: z.string().trim().min(1).max(64).refine(value => {
    try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; }
    catch { return false; }
  }, "Provide a valid IANA timezone."),
  locale: z.string().trim().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/).max(24),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  dateFormat: z.enum(["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY"]),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
}).strict();

workspaceRouter.get("/profile", requireSession, requireTenant,
  requirePermission("tenant.settings.manage"), async (request, response, next) => {
  try {
    const tenantId = request.auth?.tenantId;
    const company = await prisma.tenant.findUnique({
      where: { id: tenantId! },
      select: { id: true, name: true, slug: true, status: true, timezone: true,
        locale: true, currency: true, dateFormat: true, fiscalYearStartMonth: true },
    });
    if (!company) { response.status(404).json({ error: { code: "COMPANY_NOT_FOUND" } }); return; }
    response.json({ data: company });
  } catch (error) { next(error); }
});

workspaceRouter.patch("/profile", requireSession, requireTenant,
  requirePermission("tenant.settings.manage"), requireCsrf, async (request, response, next) => {
  const parsed = companyProfileSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: { code: "VALIDATION_ERROR",
      message: "Check your company profile, timezone and fiscal preferences." } }); return;
  }
  try {
    const tenantId = request.auth!.tenantId!;
    const data = await prisma.$transaction(async tx => {
      const before = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      const company = await tx.tenant.update({ where: { id: tenantId }, data: parsed.data });
      const snapshot = (record: typeof company) => ({ name: record.name, timezone: record.timezone,
        locale: record.locale, currency: record.currency, dateFormat: record.dateFormat,
        fiscalYearStartMonth: record.fiscalYearStartMonth });
      await tx.auditLog.create({ data: { tenantId, actorUserId: request.auth!.userId,
        action: "company.profile_updated", entityType: "Tenant", entityId: tenantId,
        oldData: snapshot(before), newData: snapshot(company),
        ipAddress: request.ip?.slice(0, 64) } });
      return company;
    });
    response.json({ data: { id: data.id, name: data.name, slug: data.slug,
      timezone: data.timezone, locale: data.locale, currency: data.currency,
      dateFormat: data.dateFormat, fiscalYearStartMonth: data.fiscalYearStartMonth } });
  } catch (error) { next(error); }
});
