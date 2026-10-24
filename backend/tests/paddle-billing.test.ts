import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  PaddleError, paddleConfig, paddleIsReady, subscriptionStatus,
  validatePaddlePrice, verifyPaddleSignature,
} from "../src/modules/billing/paddle.js";
import { subscriptionDecision } from "../src/modules/billing/subscription-access.js";
import { parsePaddleQuote } from "../src/modules/billing/plan-change.js";

const now = 1_782_345_678;
const body = Buffer.from('{"event_id":"evt_sample"}');
const secret = "signed-test-secret";
function header(ts: number, payload: Buffer = body) {
  return `ts=${ts};h1=${createHmac("sha256", secret).update(String(ts) + ":").update(payload).digest("hex")}`;
}
test("Paddle signature validates original bytes and rejects tampering or replay", () => {
  assert.equal(verifyPaddleSignature(secret, header(now), body, now), true);
  assert.equal(verifyPaddleSignature(secret, header(now), Buffer.from("edited"), now), false);
  assert.equal(verifyPaddleSignature(secret, header(now-6), body, now), false);
  assert.equal(verifyPaddleSignature(secret, "ts=not-a-timestamp;h1=abc", body, now), false);
  assert.equal(verifyPaddleSignature("wrong", header(now), body, now), false);
  assert.equal(verifyPaddleSignature(secret, header(now) + ";h1=garbage", body, now), true);
});
test("Paddle remains sandbox-only and fails closed when not configured", () => {
  assert.equal(paddleIsReady({ PADDLE_ENVIRONMENT: "production" }), false);
  assert.throws(() => paddleConfig({ PADDLE_ENVIRONMENT: "production" }), PaddleError);
  assert.throws(() => paddleConfig({ PADDLE_ENVIRONMENT: "sandbox", PADDLE_API_KEY: "x" }), PaddleError);
  assert.equal(paddleIsReady({
    PADDLE_ENVIRONMENT: "sandbox", PADDLE_API_KEY: "fake", PADDLE_WEBHOOK_SECRET: "fake",
    APP_PUBLIC_URL: "https://assetmov.example", PADDLE_CLIENT_TOKEN: "test_public",
  }), true);
});
test("Paddle catalog rejects wrong interval, wrong currency and second provider trial", () => {
  const base = {
    id: "pri_" + "a".repeat(26), product_id: "pro_" + "b".repeat(26), status: "active",
    billing_cycle: { interval: "month", frequency: 1 },
    trial_period: null, unit_price: { amount: "1599", currency_code: "USD" },
  };
  const ok = validatePaddlePrice(base, base.id, "MONTH");
  assert.equal(ok.amountMinor, 1599);
  assert.equal(ok.productId, base.product_id);
  assert.throws(() => validatePaddlePrice({ ...base, trial_period: { interval: "day", frequency: 14 } }, base.id, "MONTH"), PaddleError);
  assert.throws(() => validatePaddlePrice({ ...base, billing_cycle: { interval: "year", frequency: 1 } }, base.id, "MONTH"), PaddleError);
  assert.throws(() => validatePaddlePrice({ ...base, unit_price: { amount: "1599", currency_code: "LKR" } }, base.id, "MONTH"), PaddleError);
  assert.throws(() => validatePaddlePrice({ ...base, status: "archived" }, base.id, "MONTH"), PaddleError);
});
test("Paid entitlement needs a verified future Paddle billing period", () => {
  const nowDate = new Date("2026-10-24T12:00:00Z");
  const active = { status: "ACTIVE", billingSource: "PADDLE", trialEndsAt: null,
    currentPeriodEndsAt: new Date("2026-11-24T12:00:00Z") };
  assert.equal(subscriptionDecision(active, "ACTIVE", nowDate).allowed, true);
  assert.equal(subscriptionDecision({ ...active, currentPeriodEndsAt: null }, "ACTIVE", nowDate).allowed, false);
  assert.equal(subscriptionDecision({ ...active, currentPeriodEndsAt: nowDate }, "ACTIVE", nowDate).allowed, false);
  assert.equal(subscriptionDecision({ ...active, billingSource: "PLATFORM", currentPeriodEndsAt: null }, "ACTIVE", nowDate).allowed, true);
  assert.equal(subscriptionDecision(active, "SUSPENDED", nowDate).allowed, false);
  assert.equal(subscriptionDecision({ ...active, status: "PAST_DUE" }, "ACTIVE", nowDate).allowed, false);
  assert.equal(subscriptionDecision({ ...active, status: "TRIALING", trialEndsAt: nowDate }, "TRIAL", nowDate).allowed, false);
  assert.equal(subscriptionDecision(null, "ACTIVE", nowDate).allowed, false);
});
test("Paddle plan change preview parses charge, credit and rejects currency mismatch", () => {
  const preview = {
    currency_code: "USD",
    immediate_transaction: { details: { totals: { total: "500", currency_code: "USD" } } },
    update_summary: { result: { action: "charge" as const, amount: "500", currency_code: "USD" } },
  };
  assert.deepEqual(parsePaddleQuote(preview, "USD"), { amountMinor: 500, currency: "USD", action: "charge" });
  assert.equal(parsePaddleQuote({ ...preview, update_summary: { result: { action: "credit", amount: "200", currency_code: "USD" } } }, "USD").amountMinor, -200);
  assert.throws(() => parsePaddleQuote(preview, "LKR"), PaddleError);
  assert.equal(subscriptionStatus("past_due"), "PAST_DUE");
  assert.equal(subscriptionStatus("canceled"), "EXPIRED");
});
