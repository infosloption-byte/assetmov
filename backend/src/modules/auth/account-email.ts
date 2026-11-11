import { env } from "../../config/env.js";

/**
 * Minimal transactional email adapter. Sends only plain text and never logs
 * reset/verification tokens. Provider can be changed without API changes.
 */
export function accountEmailReady(): boolean {
  return Boolean(env.EMAIL_DELIVERY_API_KEY && env.EMAIL_FROM_ADDRESS);
}

export async function sendAccountLink(
  recipient: string, action: "reset" | "verify" | "invite", rawToken: string,
): Promise<void> {
  if (!env.EMAIL_DELIVERY_API_KEY || !env.EMAIL_FROM_ADDRESS) {
    throw new Error("ACCOUNT_EMAIL_NOT_CONFIGURED");
  }
  const url = new URL(env.FRONTEND_ORIGIN);
  url.searchParams.set("accountAction", action === "invite" ? "reset" : action);
  url.searchParams.set("token", rawToken);
  const subject = action === "reset" ? "Reset your AssetMov password" :
    action === "invite" ? "You have been invited to AssetMov" : "Verify your AssetMov email";
  const introduction = action === "reset" ?
    "Use this secure link to reset your AssetMov password. It expires in 30 minutes." :
    action === "invite" ?
      "You have been invited to AssetMov. Use this secure link to set your password. It expires in 48 hours." :
      "Use this secure link to verify your AssetMov email address. It expires in 24 hours.";
  const message = introduction + "\n\n" + url.toString() +
    "\n\nIf you did not request this email, no action is necessary.\n";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.EMAIL_DELIVERY_API_KEY,
      "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM_ADDRESS, to: [recipient], subject, text: message,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("ACCOUNT_EMAIL_DELIVERY_FAILED");
}
