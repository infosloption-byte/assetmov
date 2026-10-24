import { Router, type RequestHandler, type Response } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireSession, requireCsrf } from "../auth/auth-middleware.js";
import { requireTenant } from "../tenancy/tenant-context.js";
import { paddleConfig, paddleIsReady, PaddleError, paddleRequest, verifiedPaddlePrice, type PaddleInterval } from "./paddle.js";
import { subscriptionDecision } from "./subscription-access.js";

export const billingRouter = Router();
billingRouter.use(requireSession, requireTenant);

const requireCompanyAdmin: RequestHandler = (request, response, next) => {
  if (request.auth?.roleKey !== "TENANT_OWNER") {
    response.status(403).json({ error: { code: "COMPANY_ADMIN_REQUIRED", message: "Only a company administrator can manage billing." } });
    return;
  }
  next();
};
function fail(response: Response, status: number, code: string, message: string) {
  response.status(status).json({ error: { code, message } });
}
function providerFail(response: Response, error: unknown) {
  if (error instanceof PaddleError) {
    fail(response, error.httpStatus, error.code, error.message);
    return;
  }
  fail(response, 503, "BILLING_OPERATION_FAILED", "The billing operation could not be completed. Check with support before retrying.");
}
const selectSchema = z.object({
  planId: z.string().trim().min(1).max(36),
  interval: z.enum(["MONTH", "YEAR"]),
}).strict();
type Plan = { paddleSandboxMonthlyPriceId: string | null; paddleSandboxYearlyPriceId: string | null };
function priceIdFor(plan: Plan, interval: PaddleInterval) {
  return interval === "MONTH" ? plan.paddleSandboxMonthlyPriceId : plan.paddleSandboxYearlyPriceId;
}

billingRouter.get("/status", async (request, response, next) => {
  try {
    const subscription = await prisma.tenantSubscription.findUnique({
      where: { tenantId: request.auth!.tenantId! }, include: { plan: true },
    });
    const tenant = await prisma.tenant.findUnique({
      where: { id: request.auth!.tenantId! }, select: { status: true },
    });
    const decision = subscriptionDecision(subscription, tenant?.status);
    response.setHeader("Cache-Control", "private, no-store");
    response.json({ data: {
      allowed: decision.allowed, reason: decision.code, isCompanyAdmin: request.auth?.roleKey === "TENANT_OWNER",
      status: subscription?.status ?? null, billingSource: subscription?.billingSource ?? null,
      trialEndsAt: subscription?.trialEndsAt ?? null, periodEndsAt: subscription?.currentPeriodEndsAt ?? null,
      planName: subscription?.plan.name ?? null,
    } });
  } catch (error) { next(error); }
});

billingRouter.get("/plans", requireCompanyAdmin, async (_request, response, next) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      where: { isActive: true }, orderBy: [{ name: "asc" }],
    });
    let config;
    try { config = paddleConfig(); } catch { config = null; }
    const data = await Promise.all(plans.map(async plan => {
      const prices = await Promise.all((["MONTH", "YEAR"] as const).map(async interval => {
        const priceId = priceIdFor(plan, interval);
        if (!priceId || !config) return null;
        try { const verified = await verifiedPaddlePrice(priceId, interval, config);
          return plan.paddleProductId && verified.productId === plan.paddleProductId ? verified : null;
        }
        catch { return null; }
      }));
      return {
        id: plan.id, key: plan.key, name: plan.name, description: plan.description,
        maxAssets: plan.maxAssets, maxActiveUsers: plan.maxActiveUsers,
        storageLimitBytes: plan.storageLimitBytes?.toString() ?? null,
        trialDurationDays: plan.trialDurationDays,
        monthlyPrice: prices[0], yearlyPrice: prices[1],
      };
    }));
    response.setHeader("Cache-Control", "private, no-store");
    response.json({ data: { checkoutReady: paddleIsReady(), environment: "sandbox", plans: data } });
  } catch (error) { next(error); }
});

billingRouter.get("/history", requireCompanyAdmin, async (request, response, next) => {
  try {
    const tenantId = request.auth!.tenantId!;
    const [subscription, payments, attempts, customer] = await Promise.all([
      prisma.tenantSubscription.findUnique({ where: { tenantId }, include: { plan: true } }),
      prisma.paddlePayment.findMany({ where: { tenantId }, orderBy: { occurredAt: "desc" }, take: 30 }),
      prisma.paddleCheckoutAttempt.findMany({
        where: { tenantId }, orderBy: { createdAt: "desc" }, take: 10,
        select: {
          id: true, status: true, interval: true, checkoutUrl: true,
          transactionId: true, createdAt: true,
          plan: { select: { id: true, name: true } },
        },
      }),
      prisma.paddleBillingCustomer.findUnique({ where: { tenantId }, select: { paddleCustomerId: true } }),
    ]);
    response.setHeader("Cache-Control", "private, no-store");
    response.json({ data: {
      subscription: subscription ? {
        status: subscription.status, billingSource: subscription.billingSource,
        planId: subscription.planId, planName: subscription.plan.name,
        periodEndsAt: subscription.currentPeriodEndsAt, trialEndsAt: subscription.trialEndsAt,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        paddleSubscriptionId: subscription.paddleSubscriptionId,
        interval: subscription.paddleInterval,
      } : null,
      payments, attempts, hasCustomer: !!customer?.paddleCustomerId,
    } });
  } catch (error) { next(error); }
});

billingRouter.post("/checkout", requireCompanyAdmin, requireCsrf, async (request, response, next) => {
  const selected = selectSchema.safeParse(request.body);
  if (!selected.success) { fail(response, 400, "INVALID_PLAN", "Select a valid subscription plan and interval."); return; }
  try {
    const config = paddleConfig();
    if (!paddleIsReady()) throw new PaddleError(503, "PADDLE_NOT_READY", "Paddle checkout requires a public client token.");
    const tenantId = request.auth!.tenantId!;
    const plan = await prisma.subscriptionPlan.findFirst({ where: { id: selected.data.planId, isActive: true } });
    if (!plan || plan.key === "trial") {
      fail(response, 404, "PLAN_NOT_AVAILABLE", "Choose a configured paid subscription plan."); return;
    }
    const priceId = priceIdFor(plan, selected.data.interval);
    const price = await verifiedPaddlePrice(priceId ?? "", selected.data.interval, config);
    if (!plan.paddleProductId || price.productId !== plan.paddleProductId) {
      throw new PaddleError(503, "PADDLE_PRODUCT_MISMATCH", "Use an AssetMov-specific Paddle product and approved price IDs.");
    }
    const user = await prisma.user.findUnique({ where: { id: request.auth!.userId }, select: { email: true } });
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
    if (!user || !tenant) { fail(response, 403, "TENANT_ACCESS_DENIED", "Account or workspace missing."); return; }
    const prepared = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM Tenant WHERE id = ${tenantId} FOR UPDATE`;
      const sub = await tx.tenantSubscription.findUnique({ where: { tenantId } });
      if (sub?.billingSource === "PADDLE" && sub.paddleSubscriptionId &&
        ["ACTIVE", "TRIALING", "PAST_DUE", "SUSPENDED"].includes(sub.status)) {
        throw new PaddleError(409, "SUBSCRIPTION_ALREADY_EXISTS", "Manage your existing Paddle subscription instead.");
      }
      const pending = await tx.paddleCheckoutAttempt.findFirst({
        where: { tenantId, environment: config.environment, status: { in: ["PENDING", "READY"] } },
        orderBy: { createdAt: "desc" },
      });
      if (pending) {
        if (pending.priceId === priceId && pending.status === "READY" && pending.checkoutUrl) {
          return { url: pending.checkoutUrl, attemptId: pending.id, customerId: null as string | null };
        }
        throw new PaddleError(409, "CHECKOUT_PENDING",
          "A billing checkout is already in progress. Complete it or contact support to reconcile it.");
      }
      const customer = await tx.paddleBillingCustomer.upsert({
        where: { tenantId },
        create: { tenantId, email: user.email, name: tenant.name, environment: config.environment },
        update: {},
      });
      if (customer.environment !== config.environment) {
        throw new PaddleError(409, "BILLING_ENVIRONMENT_CONFLICT", "This company has a billing customer in a different environment.");
      }
      const attempt = await tx.paddleCheckoutAttempt.create({
        data: { tenantId, planId: plan.id, customerId: customer.id, environment: config.environment,
          priceId: price.id, interval: selected.data.interval },
      });
      return { url: null as string | null, attemptId: attempt.id, customerId: customer.paddleCustomerId };
    });
    if (prepared.url) { response.json({ data: { url: prepared.url, status: "READY" } }); return; }

    let customerId = prepared.customerId;
    if (!customerId) {
      const matches = await paddleRequest<Array<{ id: string }>>(
        `/customers?email=${encodeURIComponent(user.email)}`, config,
      );
      // Paddle may be shared with another app/company. Never attach a preexisting
      // billing identity by matching email alone; it could expose payment history.
      if (!Array.isArray(matches) || matches.length > 0) {
        throw new PaddleError(409, "PADDLE_BILLING_EMAIL_IN_USE",
          "This email already belongs to a Paddle billing customer. Contact support for a unique company billing identity.");
      }
      const remote = await paddleRequest<{ id: string; email: string }>("/customers", config, {
        method: "POST",
        body: { email: user.email, name: tenant.name, custom_data: { assetmov_tenant_id: tenantId } },
      });
      if (!/^ctm_[a-z\d]{26}$/.test(remote.id) || remote.email.toLowerCase() !== user.email.toLowerCase()) {
        throw new PaddleError(502, "PADDLE_CUSTOMER_INVALID", "Paddle returned an unexpected customer identity.");
      }
      const linked = await prisma.paddleBillingCustomer.updateMany({
        where: { tenantId, paddleCustomerId: null, environment: config.environment },
        data: { paddleCustomerId: remote.id },
      });
      if (linked.count !== 1) throw new PaddleError(409, "PADDLE_CUSTOMER_CONFLICT", "Billing identity changed during checkout.");
      customerId = remote.id;
    }
    const transaction = await paddleRequest<{
      id: string; checkout: { url: string | null } | null;
    }>("/transactions", config, {
      method: "POST",
      body: {
        collection_mode: "automatic", customer_id: customerId,
        items: [{ price_id: price.id, quantity: 1 }],
        custom_data: {
          assetmov_tenant_id: tenantId,
          assetmov_billing_attempt_id: prepared.attemptId,
          assetmov_plan_id: plan.id,
          assetmov_interval: selected.data.interval,
        },
        checkout: { url: config.publicOrigin + "/checkout" },
      },
    });
    if (!/^txn_[a-z\d]{26}$/.test(transaction.id) || !transaction.checkout?.url) {
      throw new PaddleError(502, "PADDLE_TRANSACTION_INVALID", "Paddle did not provide a checkout transaction.");
    }
    const checkoutUrl = new URL(transaction.checkout.url);
    if (checkoutUrl.origin !== config.publicOrigin || checkoutUrl.pathname !== "/checkout" ||
      checkoutUrl.searchParams.get("_ptxn") !== transaction.id) {
      throw new PaddleError(502, "PADDLE_CHECKOUT_URL_INVALID", "Paddle returned an unexpected checkout destination.");
    }
    await prisma.paddleCheckoutAttempt.updateMany({
      where: { id: prepared.attemptId, tenantId, status: "PENDING" },
      data: { status: "READY", transactionId: transaction.id, checkoutUrl: checkoutUrl.toString() },
    });
    response.json({ data: { url: checkoutUrl.toString(), status: "READY" } });
  } catch (error) {
    if (error instanceof PaddleError) {
      fail(response, error.httpStatus, error.code, error.message);
      return;
    }
    next(error);
  }
});

billingRouter.post("/manage", requireCompanyAdmin, requireCsrf, async (request, response) => {
  try {
    const config = paddleConfig();
    const customer = await prisma.paddleBillingCustomer.findUnique({
      where: { tenantId: request.auth!.tenantId! },
    });
    if (!customer?.paddleCustomerId || customer.environment !== config.environment) {
      fail(response, 409, "BILLING_CUSTOMER_NOT_FOUND", "No Paddle customer is linked to this company."); return;
    }
    const portal = await paddleRequest<{ urls: { general: { overview: string } } }>(
      `/customers/${customer.paddleCustomerId}/portal-sessions`, config,
      { method: "POST", body: {} },
    );
    const url = portal.urls?.general?.overview;
    if (!url || new URL(url).protocol !== "https:") {
      fail(response, 502, "PADDLE_PORTAL_UNAVAILABLE", "Paddle did not return a valid secure portal link."); return;
    }
    response.setHeader("Cache-Control", "private, no-store");
    response.json({ data: { url } });
  } catch (error) { providerFail(response, error); }
});
