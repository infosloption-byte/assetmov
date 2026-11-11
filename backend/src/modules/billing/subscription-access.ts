/** Shared entitlement decision used by UI status and every tenant API route. */
export type SubscriptionSnapshot = {
  status: string;
  trialEndsAt: Date | null;
  currentPeriodEndsAt: Date | null;
  billingSource: string;
} | null;
export type SubscriptionDecision = { allowed: boolean; code: string | null; message: string };
export function subscriptionDecision(
  subscription: SubscriptionSnapshot, tenantStatus?: string | null, now = new Date(),
): SubscriptionDecision {
  if (tenantStatus === "SUSPENDED") {
    return { allowed: false, code: "TENANT_SUSPENDED", message: "The platform has suspended this company. Contact support." };
  }
  if (!subscription) {
    return { allowed: false, code: "SUBSCRIPTION_NOT_CONFIGURED", message: "Activate a subscription in Billing & Plan." };
  }
  if (subscription.status === "TRIALING") {
    if (subscription.trialEndsAt && subscription.trialEndsAt > now) {
      return { allowed: true, code: null, message: "" };
    }
    return { allowed: false, code: "SUBSCRIPTION_EXPIRED", message: "Your trial has expired. Open Billing & Plan to subscribe." };
  }
  if (subscription.status === "ACTIVE") {
    // Paddle-backed subscriptions must have a current, server-confirmed billing period.
    if (subscription.billingSource === "PADDLE" &&
      (!subscription.currentPeriodEndsAt || subscription.currentPeriodEndsAt <= now)) {
      return { allowed: false, code: "SUBSCRIPTION_PAYMENT_REQUIRED",
        message: "Your Paddle billing period needs confirmation. Open Billing & Plan." };
    }
    return { allowed: true, code: null, message: "" };
  }
  return { allowed: false, code: "SUBSCRIPTION_INACTIVE",
    message: "Company subscription is inactive or requires payment. Open Billing & Plan." };
}
