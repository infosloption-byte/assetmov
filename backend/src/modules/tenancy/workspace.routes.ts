import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireCsrf, requireSession } from "../auth/auth-middleware.js";
import { requireAnyPermission, requirePermission, requireTenant } from "./tenant-context.js";

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

// Read-only scope choices: asset operators need location names in forms
// without acquiring location.read or location.manage (no location admin menu).
workspaceRouter.get("/location-options", requireSession, requireTenant,
  requireAnyPermission(["asset.read","asset.create","asset.assign",
    "asset.transfer.read","asset.transfer.dispatch","asset.transfer.receive",
    "employee.read","employee.manage"]), async(request,response,next)=>{
    try {
      const auth=request.auth!;
      const data=await prisma.location.findMany({
        where:{tenantId:auth.tenantId!,isActive:true,
          ...(auth.allLocationsAccess ? {} : {id:{in:auth.accessibleLocationIds??[]}})},
        select:{id:true,name:true,code:true,type:true,parentId:true,isActive:true},
        orderBy:[{type:"asc"},{name:"asc"}],
      });
      response.json({data});
    }catch(error){next(error);}
  },
);

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
  inventoryPrefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,16}$/),
}).strict();

workspaceRouter.get("/profile", requireSession, requireTenant,
  requirePermission("tenant.settings.manage"), async (request, response, next) => {
  try {
    const tenantId = request.auth?.tenantId;
    const company = await prisma.tenant.findUnique({
      where: { id: tenantId! },
      select: { id: true, name: true, slug: true, status: true, timezone: true,
        locale: true, currency: true, dateFormat: true, fiscalYearStartMonth: true,
        assetNumberSequence: { select: { prefix: true } } },
    });
    if (!company) { response.status(404).json({ error: { code: "COMPANY_NOT_FOUND" } }); return; }
    response.json({ data: { ...company, inventoryPrefix: company.assetNumberSequence?.prefix ?? "AM", assetNumberSequence: undefined } });
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
      const { inventoryPrefix, ...preferences } = parsed.data;
      const company = await tx.tenant.update({ where: { id: tenantId }, data: preferences });
      const sequence = await tx.assetNumberSequence.update({
        where: { tenantId }, data: { prefix: inventoryPrefix },
      });
      const snapshot = (record: typeof company) => ({ name: record.name, timezone: record.timezone,
        locale: record.locale, currency: record.currency, dateFormat: record.dateFormat,
        fiscalYearStartMonth: record.fiscalYearStartMonth });
      await tx.auditLog.create({ data: { tenantId, actorUserId: request.auth!.userId,
        action: "company.profile_updated", entityType: "Tenant", entityId: tenantId,
        oldData: snapshot(before), newData: { ...snapshot(company), inventoryPrefix: sequence.prefix },
        ipAddress: request.ip?.slice(0, 64) } });
      return { company, inventoryPrefix: sequence.prefix };
    });
    response.json({ data: { id: data.company.id, name: data.company.name, slug: data.company.slug,
      timezone: data.company.timezone, locale: data.company.locale, currency: data.company.currency,
      dateFormat: data.company.dateFormat, fiscalYearStartMonth: data.company.fiscalYearStartMonth,
      inventoryPrefix: data.inventoryPrefix } });
  } catch (error) { next(error); }
});
