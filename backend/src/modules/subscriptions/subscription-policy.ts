export type SubscriptionStatus =
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "GRACE"
  | "CANCEL_AT_PERIOD_END"
  | "EXPIRED"
  | "SUSPENDED";

export interface AssetCreationSubscriptionPolicy {
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  maxAssets: number | null;
  currentAssetCount: number;
  now?: Date;
}

export class SubscriptionAccessError extends Error {
  constructor(
    public readonly code:
      | "SUBSCRIPTION_NOT_CONFIGURED"
      | "SUBSCRIPTION_INACTIVE"
      | "SUBSCRIPTION_EXPIRED",
    message: string,
  ) {
    super(message);
    this.name = "SubscriptionAccessError";
  }
}

export class AssetPlanLimitError extends Error {
  readonly code = "PLAN_LIMIT_REACHED";
  readonly limit = "assets";

  constructor(
    public readonly current: number,
    public readonly maximum: number,
  ) {
    super("The asset limit for this plan has been reached.");
    this.name = "AssetPlanLimitError";
  }
}

/**
 * Shared policy for any future asset-creating path (single create, import, and bulk create).
 * Call inside a transaction after serializing all asset-count-increasing operations for the tenant.
 */
export function assertAssetCreationAllowed(
  policy: AssetCreationSubscriptionPolicy | null,
): asserts policy is AssetCreationSubscriptionPolicy {
  if (!policy) {
    throw new SubscriptionAccessError(
      "SUBSCRIPTION_NOT_CONFIGURED",
      "This company does not have a configured subscription.",
    );
  }

  if (policy.status !== "ACTIVE" && policy.status !== "TRIALING") {
    throw new SubscriptionAccessError(
      "SUBSCRIPTION_INACTIVE",
      "This company subscription does not currently allow new assets.",
    );
  }

  const now = policy.now ?? new Date();
  if (policy.status === "TRIALING" && (!policy.trialEndsAt || policy.trialEndsAt.getTime() <= now.getTime())) {
    throw new SubscriptionAccessError(
      "SUBSCRIPTION_EXPIRED",
      "The trial has expired. Contact your platform administrator to continue adding assets.",
    );
  }

  if (policy.maxAssets !== null && policy.currentAssetCount >= policy.maxAssets) {
    throw new AssetPlanLimitError(policy.currentAssetCount, policy.maxAssets);
  }
}
