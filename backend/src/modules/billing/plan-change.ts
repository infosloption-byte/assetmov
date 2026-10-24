import { prisma } from "../../lib/prisma.js";
import { PaddleError, paddleConfig, paddleRequest, verifiedPaddlePrice, type PaddleInterval } from "./paddle.js";

export type PlanChange = { planId: string; interval: PaddleInterval };
type RemoteSubscription = {
  id: string; customer_id: string; status: string; currency_code?: string;
  items: Array<{ price: { id: string }; quantity: number }>;
};
type RemotePreview = {
  currency_code?: string;
  immediate_transaction: null | {
    currency_code?: string;
    details: { totals: { total: string; currency_code?: string } };
  };
  update_summary?: { result?: { action: "charge" | "credit"; amount: string; currency_code: string } };
};
export function parsePaddleQuote(raw: RemotePreview, expectedCurrency: string) {
  const result = raw.update_summary?.result;
  const totals = raw.immediate_transaction?.details?.totals;
  const currency = result?.currency_code ?? totals?.currency_code ??
    raw.immediate_transaction?.currency_code ?? raw.currency_code;
  if (currency !== expectedCurrency || (raw.immediate_transaction && !totals)) {
    throw new PaddleError(502, "PADDLE_QUOTE_INVALID", "Paddle quote currency or totals are invalid.");
  }
  const rawAmount = result?.amount ?? totals?.total;
  if (rawAmount === undefined && raw.immediate_transaction === null && !result) {
    return { amountMinor: 0, currency, action: "charge" as const };
  }
  if (typeof rawAmount !== "string" || !/^-?\d+$/.test(rawAmount)) {
    throw new PaddleError(502, "PADDLE_QUOTE_INVALID", "Paddle did not provide a valid price-change amount.");
  }
  const parsed = Number(rawAmount);
  if (!Number.isSafeInteger(parsed)) throw new PaddleError(502, "PADDLE_QUOTE_INVALID", "Paddle amount exceeds supported precision.");
  const action = result?.action ?? (parsed < 0 ? "credit" : "charge");
  if (action !== "charge" && action !== "credit") throw new PaddleError(502, "PADDLE_QUOTE_INVALID", "Paddle quote action is invalid.");
  return { amountMinor: action === "credit" ? -Math.abs(parsed) : Math.abs(parsed), currency, action };
}
export async function previewPlanChange(tenantId: string, target: PlanChange) {
  const config = paddleConfig();
  const sub = await prisma.tenantSubscription.findUnique({ where: { tenantId } });
  if (!sub || sub.billingSource !== "PADDLE" || sub.status !== "ACTIVE" ||
    !sub.paddleSubscriptionId || !sub.paddleCustomerId || !sub.paddlePriceId ||
    sub.paddleEnvironment !== "sandbox") {
    throw new PaddleError(409, "PADDLE_SUBSCRIPTION_REQUIRED", "An active Paddle subscription is required to change plans.");
  }
  if (sub.paddlePendingPriceId) {
    throw new PaddleError(409, "PADDLE_CHANGE_PENDING", "A plan change is awaiting Paddle webhook confirmation.");
  }
  const plan = await prisma.subscriptionPlan.findFirst({ where: { id: target.planId, isActive: true } });
  const priceId = target.interval === "MONTH" ? plan?.paddleSandboxMonthlyPriceId : plan?.paddleSandboxYearlyPriceId;
  if (!plan || !priceId || priceId === sub.paddlePriceId) {
    throw new PaddleError(400, "PADDLE_PLAN_INVALID", "Choose a different available Paddle plan and billing interval.");
  }
  const price = await verifiedPaddlePrice(priceId, target.interval, config);
  if (!plan.paddleProductId || plan.paddleProductId !== price.productId) {
    throw new PaddleError(503, "PADDLE_PRODUCT_MISMATCH", "The configured price does not belong to this AssetMov product.");
  }
  const remote = await paddleRequest<RemoteSubscription>(`/subscriptions/${sub.paddleSubscriptionId}`, config);
  if (remote.id !== sub.paddleSubscriptionId || remote.customer_id !== sub.paddleCustomerId ||
    remote.status !== "active" || remote.currency_code && remote.currency_code !== price.currency ||
    remote.items?.length !== 1 || remote.items[0]?.price?.id !== sub.paddlePriceId ||
    remote.items[0]?.quantity !== 1) {
    throw new PaddleError(409, "PADDLE_SUBSCRIPTION_CHANGED", "Paddle subscription changed outside AssetMov. Refresh or reconcile it.");
  }
  const preview = await paddleRequest<RemotePreview>(`/subscriptions/${sub.paddleSubscriptionId}/preview`, config, {
    method: "PATCH", body: {
      items: [{ price_id: priceId, quantity: 1 }],
      proration_billing_mode: "prorated_immediately",
      on_payment_failure: "prevent_change",
    },
  });
  const quote = parsePaddleQuote(preview, price.currency);
  return {
    subscriptionId: sub.id, providerSubscriptionId: sub.paddleSubscriptionId,
    planId: plan.id, planName: plan.name, interval: target.interval,
    targetPriceId: priceId, immediateAmountMinor: quote.amountMinor,
    currency: quote.currency, adjustmentAction: quote.action,
  };
}
export async function confirmPlanChange(tenantId: string, target: PlanChange, confirmedMinor: number) {
  if (!Number.isSafeInteger(confirmedMinor)) {
    throw new PaddleError(400, "INVALID_QUOTE", "Confirm the exact quoted amount.");
  }
  const quote = await previewPlanChange(tenantId, target);
  if (quote.immediateAmountMinor !== confirmedMinor) {
    throw new PaddleError(409, "QUOTE_CHANGED", "The provider's charge changed. Review the latest quote.");
  }
  const locked = await prisma.tenantSubscription.updateMany({
    where: {
      id: quote.subscriptionId, tenantId, billingSource: "PADDLE",
      status: "ACTIVE", paddlePendingPriceId: null,
    },
    data: { paddlePendingPriceId: quote.targetPriceId },
  });
  if (locked.count !== 1) throw new PaddleError(409, "PADDLE_CHANGE_PENDING", "Another plan change is in progress.");
  // If the API times out after accepting the update, keep the pending lock.
  // Only the signed provider webhook resolves the local entitlement.
  await paddleRequest(`/subscriptions/${quote.providerSubscriptionId}`, paddleConfig(), {
    method: "PATCH", body: {
      items: [{ price_id: quote.targetPriceId, quantity: 1 }],
      proration_billing_mode: "prorated_immediately", on_payment_failure: "prevent_change",
    },
  });
  return { status: "PENDING_WEBHOOK" as const, planId: quote.planId, priceId: quote.targetPriceId };
}
