import { createHmac, timingSafeEqual } from "node:crypto";

export type PaddleEnvironment = "sandbox" | "production";
export class PaddleError extends Error {
  constructor(readonly httpStatus: number, readonly code: string, message: string) {
    super(message); this.name = "PaddleError";
  }
}
export type PaddleConfig = { environment: PaddleEnvironment; apiKey: string; webhookSecret: string; publicOrigin: string };
export function paddleConfig(source: NodeJS.ProcessEnv = process.env): PaddleConfig {
  const environment = source.PADDLE_ENVIRONMENT?.trim();
  if (environment !== "sandbox") {
    throw new PaddleError(503, "PADDLE_SANDBOX_ONLY", "AssetMov Paddle sandbox must be configured and tested before live billing.");
  }
  const apiKey = source.PADDLE_API_KEY?.trim() ?? "";
  const webhookSecret = source.PADDLE_WEBHOOK_SECRET?.trim() ?? "";
  const rawOrigin = source.APP_PUBLIC_URL?.trim() ?? "";
  if (!apiKey || !webhookSecret || !rawOrigin) {
    throw new PaddleError(503, "PADDLE_NOT_CONFIGURED", "AssetMov Paddle sandbox credentials or checkout origin are missing.");
  }
  let url: URL;
  try { url = new URL(rawOrigin); }
  catch { throw new PaddleError(503, "PADDLE_ORIGIN_INVALID", "Set APP_PUBLIC_URL to an approved HTTPS checkout origin."); }
  if (url.protocol !== "https:" || !!url.username || !!url.password || !!url.search || !!url.hash || url.pathname !== "/") {
    throw new PaddleError(503, "PADDLE_ORIGIN_INVALID", "Paddle checkout requires an approved HTTPS origin.");
  }
  return { environment, apiKey, webhookSecret, publicOrigin: url.origin };
}
export function paddleIsReady(source: NodeJS.ProcessEnv = process.env): boolean {
  try { paddleConfig(source); return !!source.PADDLE_CLIENT_TOKEN?.trim(); }
  catch { return false; }
}
export async function paddleRequest<T>(
  path: `/${string}`, config: PaddleConfig,
  options: { method?: "GET" | "POST" | "PATCH"; body?: Record<string, unknown> } = {},
): Promise<T> {
  if (!path.startsWith("/") || path.startsWith("//")) throw new PaddleError(400, "PADDLE_INVALID_PATH", "Invalid provider request.");
  let response: Response;
  try {
    response = await fetch("https://sandbox-api.paddle.com" + path, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${config.apiKey}`, Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch { throw new PaddleError(502, "PADDLE_UNAVAILABLE", "Unable to reach Paddle."); }
  const json = await response.json().catch(() => null) as { data?: T; error?: { code?: string; detail?: string } } | null;
  if (!response.ok) throw new PaddleError(response.status >= 500 ? 502 : response.status,
    json?.error?.code ?? "PADDLE_PROVIDER_REJECTED", json?.error?.detail ?? "Paddle rejected the request.");
  if (!json || json.data === undefined) throw new PaddleError(502, "PADDLE_INVALID_RESPONSE", "Paddle returned an invalid response.");
  return json.data;
}
/** Exact original request bytes; prevents spoofed and replayed notifications. */
export function verifyPaddleSignature(
  secret: string, header: string | string[] | undefined, rawBody: Buffer,
  nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = 5,
): boolean {
  if (!secret || !Buffer.isBuffer(rawBody) || toleranceSeconds < 0) return false;
  const rawHeader = Array.isArray(header) ? header[0] : header;
  if (!rawHeader) return false;
  const parts = rawHeader.split(";").map(part => part.trim());
  const timestamps = parts.filter(part => part.startsWith("ts=")).map(part => part.slice(3));
  const signatures = parts.filter(part => part.startsWith("h1=")).map(part => part.slice(3));
  if (timestamps.length !== 1 || signatures.length === 0 || !/^\d{10,}$/.test(timestamps[0]!)) return false;
  const timestamp = Number(timestamps[0]);
  if (!Number.isSafeInteger(timestamp) || Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;
  const computed = createHmac("sha256", secret).update(timestamps[0]! + ":", "utf8").update(rawBody).digest();
  let match = false;
  for (const hex of signatures) {
    if (!/^[a-f\d]{64}$/i.test(hex)) continue;
    match = timingSafeEqual(computed, Buffer.from(hex, "hex")) || match;
  }
  return match;
}

export type PaddleInterval = "MONTH" | "YEAR";
type Price = {
  id: string; status: string; product_id: string;
  billing_cycle: { interval: string; frequency: number } | null;
  trial_period: { interval: string; frequency: number } | null;
  unit_price: { amount: string; currency_code: string };
  quantity?: { minimum: number; maximum: number };
};
export type VerifiedPrice = { id: string; productId: string; amountMinor: number; currency: string; interval: PaddleInterval };
export function validatePaddlePrice(price: Price, priceId: string, interval: PaddleInterval): VerifiedPrice {
  const amount = Number(price.unit_price?.amount);
  if (price.id !== priceId || price.status !== "active" || !/^pro_[a-z\d]{26}$/.test(price.product_id) ||
      price.billing_cycle?.interval !== (interval === "MONTH" ? "month" : "year") ||
      price.billing_cycle?.frequency !== 1 ||
      !/^\d+$/.test(price.unit_price?.amount ?? "") || !Number.isSafeInteger(amount) ||
      price.unit_price?.currency_code !== "USD" ||
      (price.quantity && price.quantity.minimum > 1) ||
      // AssetMov already starts a locally timed signup trial. Avoid giving another Paddle trial.
      price.trial_period !== null) {
    throw new PaddleError(503, "PADDLE_PRICE_INVALID",
      "Paddle price is not an active no-trial recurring price matching the selected billing interval.");
  }
  return { id: priceId, productId: price.product_id, amountMinor: amount, currency: price.unit_price.currency_code, interval };
}
export async function verifiedPaddlePrice(priceId: string, interval: PaddleInterval, config: PaddleConfig) {
  if (!/^pri_[a-z\d]{26}$/.test(priceId)) throw new PaddleError(503, "PADDLE_PRICE_UNCONFIGURED", "Configure AssetMov's own recurring Paddle price IDs.");
  const price = await paddleRequest<Price>(`/prices/${priceId}`, config);
  return validatePaddlePrice(price, priceId, interval);
}
export function subscriptionStatus(providerStatus: unknown): "ACTIVE" | "TRIALING" | "PAST_DUE" | "SUSPENDED" | "EXPIRED" {
  switch (providerStatus) {
    case "active": return "ACTIVE";
    case "trialing": return "TRIALING";
    case "past_due": return "PAST_DUE";
    case "paused": return "SUSPENDED";
    default: return "EXPIRED";
  }
}
export function recordOf(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function stringOf(value: unknown): string | null { return typeof value === "string" && value.length > 0 ? value : null; }
export function dateOf(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const valueDate = new Date(value);
  return Number.isNaN(valueDate.getTime()) ? null : valueDate;
}
