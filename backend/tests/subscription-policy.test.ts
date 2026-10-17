import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAssetCreationAllowed,
  AssetPlanLimitError,
  SubscriptionAccessError,
} from "../src/modules/subscriptions/subscription-policy.js";

const now = new Date("2026-10-17T12:00:00.000Z");

test("active subscriptions can create assets below the configured cap", () => {
  assert.doesNotThrow(() => assertAssetCreationAllowed({
    status: "ACTIVE",
    trialEndsAt: null,
    maxAssets: 5,
    currentAssetCount: 4,
    now,
  }));
});

test("trial subscriptions are allowed before their saved trial end", () => {
  assert.doesNotThrow(() => assertAssetCreationAllowed({
    status: "TRIALING",
    trialEndsAt: new Date("2026-10-18T12:00:00.000Z"),
    maxAssets: 100,
    currentAssetCount: 0,
    now,
  }));
});

test("trial subscriptions are blocked at and after the trial end", () => {
  for (const trialEndsAt of [
    new Date("2026-10-17T12:00:00.000Z"),
    new Date("2026-10-17T11:59:59.999Z"),
  ]) {
    assert.throws(
      () => assertAssetCreationAllowed({
        status: "TRIALING",
        trialEndsAt,
        maxAssets: 100,
        currentAssetCount: 0,
        now,
      }),
      (error: unknown) => error instanceof SubscriptionAccessError && error.code === "SUBSCRIPTION_EXPIRED",
    );
  }
});

test("trial subscriptions without an end timestamp fail closed", () => {
  assert.throws(
    () => assertAssetCreationAllowed({
      status: "TRIALING",
      trialEndsAt: null,
      maxAssets: 100,
      currentAssetCount: 0,
      now,
    }),
    (error: unknown) => error instanceof SubscriptionAccessError && error.code === "SUBSCRIPTION_EXPIRED",
  );
});

test("missing or inactive subscriptions fail closed", () => {
  assert.throws(
    () => assertAssetCreationAllowed(null),
    (error: unknown) => error instanceof SubscriptionAccessError && error.code === "SUBSCRIPTION_NOT_CONFIGURED",
  );
  assert.throws(
    () => assertAssetCreationAllowed({
      status: "SUSPENDED",
      trialEndsAt: null,
      maxAssets: 100,
      currentAssetCount: 0,
      now,
    }),
    (error: unknown) => error instanceof SubscriptionAccessError && error.code === "SUBSCRIPTION_INACTIVE",
  );
});

test("asset creation is blocked when the tenant has reached its cap", () => {
  assert.throws(
    () => assertAssetCreationAllowed({
      status: "ACTIVE",
      trialEndsAt: null,
      maxAssets: 5,
      currentAssetCount: 5,
      now,
    }),
    (error: unknown) => error instanceof AssetPlanLimitError
      && error.limit === "assets"
      && error.current === 5
      && error.maximum === 5,
  );
});

test("null asset caps are unlimited and a zero cap allows no assets", () => {
  assert.doesNotThrow(() => assertAssetCreationAllowed({
    status: "ACTIVE",
    trialEndsAt: null,
    maxAssets: null,
    currentAssetCount: 50_000,
    now,
  }));
  assert.throws(
    () => assertAssetCreationAllowed({
      status: "ACTIVE",
      trialEndsAt: null,
      maxAssets: 0,
      currentAssetCount: 0,
      now,
    }),
    AssetPlanLimitError,
  );
});
