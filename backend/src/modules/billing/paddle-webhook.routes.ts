import express, { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { prisma } from "../../lib/prisma.js";
import {
  dateOf, paddleConfig, recordOf, stringOf, subscriptionStatus, verifyPaddleSignature,
} from "./paddle.js";

export const paddleWebhookRouter = Router();
type Event = { event_id: string; event_type: string; occurred_at: string; data: Record<string, unknown> };
const priceFields = ["paddleSandboxMonthlyPriceId", "paddleSandboxYearlyPriceId"] as const;

const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 600,
  standardHeaders: "draft-8", legacyHeaders: false,
});
paddleWebhookRouter.post("/", webhookLimiter, express.raw({ type: "application/json", limit: "256kb" }), async (request, response) => {
  let secret: string;
  try { secret = paddleConfig().webhookSecret; }
  catch { response.status(503).json({ error: { code: "PADDLE_NOT_CONFIGURED" } }); return; }
  const raw = request.body;
  if (!Buffer.isBuffer(raw) || !verifyPaddleSignature(secret, request.get("paddle-signature"), raw)) {
    response.status(400).json({ error: { code: "PADDLE_SIGNATURE_INVALID" } }); return;
  }
  let event: Event;
  try {
    event = JSON.parse(raw.toString("utf8")) as Event;
    if (!/^evt_[a-z\d]{26}$/.test(event.event_id) || !event.event_type ||
        !dateOf(event.occurred_at) || !event.data || typeof event.data !== "object" ||
        Array.isArray(event.data)) throw new Error("Invalid Paddle event");
  } catch { response.status(400).json({ error: { code: "PADDLE_EVENT_INVALID" } }); return; }

  try {
    await prisma.$transaction(async tx => {
      // Serialize retries/overlapping deliveries by event ID, then mark
      // PROCESSED in the same transaction as the entitlement changes.
      let marker = await tx.paddleWebhookEvent.findUnique({ where: { eventId: event.event_id } });
      if (!marker) {
        marker = await tx.paddleWebhookEvent.create({ data: {
          eventId: event.event_id, eventType: event.event_type, environment: "sandbox",
          occurredAt: dateOf(event.occurred_at)!,
        } });
      }
      await tx.$queryRaw`SELECT id FROM PaddleWebhookEvent WHERE id = ${marker.id} FOR UPDATE`;
      marker = await tx.paddleWebhookEvent.findUniqueOrThrow({ where: { eventId: event.event_id } });
      if (marker.environment !== "sandbox" || marker.eventType !== event.event_type) {
        throw new Error("Provider event identifier conflicts with a previous event.");
      }
      if (marker.status === "PROCESSED") return;

      const body = recordOf(event.data);
      const metadata = recordOf(body.custom_data);
      let tenantId: string | null = null;

      if (event.event_type.startsWith("subscription.")) {
        const subscriptionId = stringOf(body.id);
        const customerId = stringOf(body.customer_id);
        const firstItem = recordOf(Array.isArray(body.items) ? body.items[0] : null);
        const priceId = stringOf(recordOf(firstItem.price).id);
        if (!subscriptionId || !/^sub_[a-z\d]{26}$/.test(subscriptionId) ||
            !customerId || !/^ctm_[a-z\d]{26}$/.test(customerId) || !priceId) {
          throw new Error("Paddle subscription event has incomplete provider identifiers.");
        }
        const mappedPlans = await tx.subscriptionPlan.findMany({
          where: { OR: priceFields.map(field => ({ [field]: priceId })) },
        });
        if (mappedPlans.length !== 1 || !mappedPlans[0]) {
          throw new Error("The Paddle price does not uniquely identify an AssetMov plan.");
        }
        const plan = mappedPlans[0];
        const providerProduct = stringOf(recordOf(firstItem.price).product_id);
        if (!plan.paddleProductId || (providerProduct && plan.paddleProductId !== providerProduct)) {
          throw new Error("Paddle subscription price does not belong to the AssetMov plan product.");
        }
        const attemptId = stringOf(metadata.assetmov_billing_attempt_id);
        const linked = await tx.tenantSubscription.findUnique({ where: { paddleSubscriptionId: subscriptionId } });
        const attempt = attemptId
          ? await tx.paddleCheckoutAttempt.findUnique({ where: { id: attemptId } })
          : stringOf(body.transaction_id)
            ? await tx.paddleCheckoutAttempt.findUnique({
                where: { transactionId: stringOf(body.transaction_id)! },
              })
            : null;
        tenantId = linked?.tenantId ?? attempt?.tenantId ?? null;
        if (!tenantId || (linked && attempt && linked.tenantId !== attempt.tenantId) ||
          (metadata.assetmov_tenant_id && metadata.assetmov_tenant_id !== tenantId)) {
          throw new Error("Cannot correlate Paddle subscription to a trusted company checkout.");
        }
        const customer = await tx.paddleBillingCustomer.findUnique({ where: { tenantId } });
        if (!customer || customer.paddleCustomerId !== customerId ||
          customer.environment !== "sandbox") throw new Error("Paddle customer belongs to a different company.");
        const current = await tx.tenantSubscription.findUnique({ where: { tenantId } });
        if (!current || (current.paddleSubscriptionId && current.paddleSubscriptionId !== subscriptionId)) {
          throw new Error("Another Paddle subscription is bound to this company.");
        }
        if (!linked && (!attempt || attempt.environment !== "sandbox" || attempt.priceId !== priceId ||
          attempt.customerId !== customer.id)) throw new Error("Unrecognized first Paddle subscription checkout.");
        if (current.paddleLastEventAt && current.paddleLastEventAt > dateOf(event.occurred_at)!) {
          // Never roll back access based on an older delivery.
        } else {
          const status = event.event_type === "subscription.canceled"
            ? "EXPIRED" : subscriptionStatus(body.status);
          const period = recordOf(body.current_billing_period);
          const trial = recordOf(body.trial_dates);
          const trialEnd = status === "TRIALING"
            ? dateOf(trial.ends_at) ?? dateOf(body.next_billed_at)
            : null;
          const periodEnd = dateOf(period.ends_at);
          await tx.tenantSubscription.update({ where: { tenantId }, data: {
            planId: plan.id, status, billingSource: "PADDLE",
            paddleSubscriptionId: subscriptionId, paddleCustomerId: customerId,
            paddlePriceId: priceId, paddleEnvironment: "sandbox",
            paddleInterval: plan.paddleSandboxMonthlyPriceId === priceId ? "MONTH" : "YEAR",
            paddleLastEventAt: dateOf(event.occurred_at)!,
            paddlePendingPriceId: current.paddlePendingPriceId === priceId ? null : current.paddlePendingPriceId,
            trialEndsAt: trialEnd, currentPeriodStartsAt: dateOf(period.starts_at),
            currentPeriodEndsAt: periodEnd,
            cancelAtPeriodEnd: recordOf(body.scheduled_change).action === "cancel",
            cancelledAt: status === "EXPIRED" ? dateOf(event.occurred_at) : null,
          } });
          if ((status === "ACTIVE" || status === "TRIALING")) {
            await tx.tenant.updateMany({ where: { id: tenantId, status: "TRIAL" }, data: { status: "ACTIVE" } });
          }
          await tx.platformAuditLog.create({ data: {
            action: "billing.paddle_subscription_synced", entityType: "TenantSubscription",
            entityId: current.id, reason: "Verified Paddle " + event.event_type,
            oldData: { status: current.status, planId: current.planId, billingSource: current.billingSource },
            newData: { status, planId: plan.id, paddleSubscriptionId: subscriptionId },
          } });
          if (attempt) await tx.paddleCheckoutAttempt.updateMany({
            where: { id: attempt.id, tenantId }, data: { status: "CONFIRMED" },
          });
        }
      } else if (event.event_type === "transaction.completed" || event.event_type === "transaction.payment_failed") {
        const transactionId = stringOf(body.id);
        const attemptId = stringOf(metadata.assetmov_billing_attempt_id);
        const attempt = attemptId
          ? await tx.paddleCheckoutAttempt.findUnique({ where: { id: attemptId } })
          : transactionId
            ? await tx.paddleCheckoutAttempt.findUnique({ where: { transactionId } })
            : null;
        const subscription = stringOf(body.subscription_id)
          ? await tx.tenantSubscription.findUnique({
              where: { paddleSubscriptionId: stringOf(body.subscription_id)! },
            }) : null;
        tenantId = attempt?.tenantId ?? subscription?.tenantId ?? null;
        if (!transactionId || !/^txn_[a-z\d]{26}$/.test(transactionId) || !tenantId ||
          (attempt && subscription && attempt.tenantId !== subscription.tenantId) ||
          (metadata.assetmov_tenant_id && metadata.assetmov_tenant_id !== tenantId)) {
          throw new Error("Unable to correlate Paddle transaction to an AssetMov company.");
        }
        const amountString = recordOf(recordOf(body.details).totals).total;
        const amount = typeof amountString === "string" && /^\d+$/.test(amountString) ? Number(amountString) : NaN;
        const currency = stringOf(body.currency_code);
        if (!Number.isSafeInteger(amount) || amount < 0 || amount > 2_000_000_000 || !currency ||
            !/^[A-Z]{3}$/.test(currency)) throw new Error("Invalid Paddle payment total or currency.");
        const existing = await tx.paddlePayment.findUnique({ where: { transactionId } });
        const completed = event.event_type === "transaction.completed";
        if (!existing || (! (existing.status === "PAID" && !completed) &&
            existing.occurredAt <= dateOf(event.occurred_at)!)) {
          await tx.paddlePayment.upsert({
            where: { transactionId },
            create: {
              tenantId, transactionId, subscriptionId: stringOf(body.subscription_id),
              status: completed ? "PAID" : "FAILED", amountMinor: amount, currency,
              invoiceNumber: stringOf(body.invoice_number), occurredAt: dateOf(event.occurred_at)!,
            },
            update: {
              status: completed ? "PAID" : "FAILED", amountMinor: amount, currency,
              invoiceNumber: stringOf(body.invoice_number), occurredAt: dateOf(event.occurred_at)!,
            },
          });
        }
      }

      await tx.paddleWebhookEvent.update({
        where: { eventId: event.event_id },
        data: { tenantId, status: "PROCESSED", processedAt: new Date(), lastError: null },
      });
    });
    response.status(200).json({ received: true });
  } catch (error) {
    // A signed but unrecognized event never grants access. Keep a recoverable
    // failure marker; Paddle will retry while operators resolve mismatches.
    const lastError = error instanceof Error ? error.message.slice(0, 500) : "Unknown error";
    try {
      const existing = await prisma.paddleWebhookEvent.findUnique({
        where: { eventId: event.event_id }, select: { id: true, status: true },
      });
      if (!existing) {
        await prisma.paddleWebhookEvent.create({ data: {
          eventId: event.event_id, eventType: event.event_type,
          occurredAt: dateOf(event.occurred_at)!, environment: "sandbox",
          status: "FAILED", lastError,
        } });
      } else if (existing.status !== "PROCESSED") {
        await prisma.paddleWebhookEvent.updateMany({
          where: { id: existing.id, status: { not: "PROCESSED" } },
          data: { status: "FAILED", lastError },
        });
      }
    } catch {
      // Do not suppress the failed HTTP status or downgrade a processed event.
    }
    response.status(500).json({ error: { code: "PADDLE_EVENT_RECONCILIATION_REQUIRED" } });
  }
});
