import { useCallback, useEffect, useState } from "react";
import ThemeSelect from "../../components/ThemeSelect";
import "./billing.css";

const api = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api").replace(/\/$/, "");
type Interval = "MONTH" | "YEAR";
type Price = { id: string; amountMinor: number; currency: string; interval: Interval };
type Plan = {
  id: string; key: string; name: string; description: string | null;
  maxAssets: number | null; maxActiveUsers: number | null; storageLimitBytes: string | null;
  trialDurationDays: number; monthlyPrice: Price | null; yearlyPrice: Price | null;
};
type Catalog = { checkoutReady: boolean; environment: string; plans: Plan[] };
type Payment = { id: string; transactionId: string; status: string; amountMinor: number; currency: string; invoiceNumber: string | null; occurredAt: string };
type Attempt = { id: string; status: string; checkoutUrl: string | null; transactionId: string | null; createdAt: string; plan: { name: string } };
type History = {
  subscription: null | {
    status: string; billingSource: string; planId: string; planName: string;
    periodEndsAt: string | null; trialEndsAt: string | null; cancelAtPeriodEnd: boolean;
    paddleSubscriptionId: string | null; interval: Interval | null;
  };
  payments: Payment[]; attempts: Attempt[]; hasCustomer: boolean; billingEmail: string | null;
};
type Quote = {
  planId: string; planName: string; interval: Interval; immediateAmountMinor: number;
  currency: string; adjustmentAction: "charge" | "credit";
};
type Props = { tenantId: string | null; csrfToken: string | null; isCompanyAdmin: boolean; onChanged?: () => void };
function money(minor: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(minor / 100);
}
function storage(bytes: string | null) {
  return bytes === null ? "Unlimited" : (Number(bytes) / 1024 ** 3).toLocaleString(undefined, { maximumFractionDigits: 2 }) + " GiB";
}
export default function CompanyBillingPage({ tenantId, csrfToken, isCompanyAdmin, onChanged }: Props) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [interval, setInterval] = useState<Interval>("MONTH");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [editingEmail, setEditingEmail] = useState(false);

  const request = useCallback(async <T,>(path: string, method = "GET", body?: unknown): Promise<T> => {
    if (!tenantId) throw new Error("Select a company workspace.");
    if (method !== "GET" && !csrfToken) throw new Error("Your security token has expired. Sign in again.");
    const response = await fetch(api + "/billing" + path, {
      method, credentials: "include",
      headers: {
        "X-Tenant-Id": tenantId,
        ...(method !== "GET" ? { "X-CSRF-Token": csrfToken!, "Content-Type": "application/json" } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json().catch(() => ({})) as T & { error?: { code?: string; message?: string } };
    if (!response.ok) throw new Error(payload.error?.message ?? payload.error?.code ?? "Billing operation failed.");
    return payload;
  }, [tenantId, csrfToken]);
  const reload = useCallback(async () => {
    if (!tenantId || !isCompanyAdmin) { setLoading(false); return; }
    setLoading(true);
    try {
      const [plans, records] = await Promise.all([
        request<{ data: Catalog }>("/plans"), request<{ data: History }>("/history"),
      ]);
      setCatalog(plans.data); setHistory(records.data); setError("");
      onChanged?.();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to retrieve billing."); }
    finally { setLoading(false); }
  }, [tenantId, isCompanyAdmin, request, onChanged]);
  useEffect(() => { void reload(); }, [reload]);

  async function updateBillingEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy("email"); setError(""); setNotice("");
    try {
      await request("/customer", "PATCH", {
        email: String(data.get("billingEmail") ?? "").trim(),
        reason: String(data.get("billingReason") ?? "").trim(),
      });
      setEditingEmail(false);
      setNotice("The company billing contact has been updated.");
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Cannot update billing email."); }
    finally { setBusy(""); }
  }

  async function begin(planId: string) {
    if (busy) return;
    setBusy(planId); setError(""); setNotice("");
    try {
      const result = await request<{ data: { url: string } }>("/checkout", "POST", { planId, interval });
      // Paddle returns the registered, approved checkout domain. Do not use a
      // client-constructed payment URL, or grant access based on the redirect.
      const target = new URL(result.data.url);
      if (target.protocol !== "https:" || target.pathname !== "/checkout" ||
        !/^txn_[a-z\d]{26}$/.test(target.searchParams.get("_ptxn") ?? "")) {
        throw new Error("Paddle returned an invalid checkout link.");
      }
      window.location.assign(target.toString());
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to start checkout."); }
    finally { setBusy(""); }
  }
  async function manage() {
    if (busy) return;
    setBusy("portal"); setError("");
    try {
      const result = await request<{ data: { url: string } }>("/manage", "POST", {});
      const destination = new URL(result.data.url);
      if (destination.protocol !== "https:") throw new Error("Invalid secure portal link.");
      window.location.assign(destination.toString());
    } catch (e) { setError(e instanceof Error ? e.message : "Cannot open Paddle customer portal."); }
    finally { setBusy(""); }
  }
  async function preview(planId: string) {
    if (busy) return;
    setBusy(planId); setError(""); setQuote(null);
    try {
      const result = await request<{ data: Quote }>("/change-preview", "POST", { planId, interval });
      setQuote(result.data);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to calculate Paddle quote."); }
    finally { setBusy(""); }
  }
  async function confirm() {
    if (!quote || busy) return;
    setBusy("confirm"); setError(""); setNotice("");
    try {
      await request("/change-confirm", "POST", {
        planId: quote.planId, interval: quote.interval, confirmedAmountMinor: quote.immediateAmountMinor,
      });
      setQuote(null);
      setNotice("Paddle accepted your request. Plan limits will update only after its signed webhook is processed.");
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Plan change could not be confirmed."); }
    finally { setBusy(""); }
  }

  if (!isCompanyAdmin) return <section className="asset-register-page">
    <h1>Company billing</h1><p>Only Company Administrators may view payment information or change subscription plans.</p>
  </section>;
  const current = history?.subscription;
  const hasPaid = current?.billingSource === "PADDLE" &&
    ["ACTIVE", "TRIALING", "PAST_DUE", "SUSPENDED"].includes(current.status) &&
    !!current.paddleSubscriptionId;
  const readyAttempt = history?.attempts.find(a => a.status === "READY" && a.checkoutUrl);
  const unresolvedAttempt = history?.attempts.some(a => a.status === "PENDING");

  return <section className="asset-register-page asset-billing">
    <div className="asset-page-heading"><div>
      <div className="eyebrow"><span className="eyebrow-line"/> SUBSCRIPTION & BILLING</div>
      <h1 className="asset-page-title">Billing & Plan</h1>
      <p>Manage your company's subscription, billing interval and secure Paddle payments.</p>
    </div><button type="button" className="topbar-button ghost" onClick={() => void reload()} disabled={loading}>Refresh status ↻</button></div>
    {error && <div className="theme-notice error" role="alert">{error}</div>}
    {notice && <div className="theme-notice success" role="status">{notice}</div>}
    {new URLSearchParams(window.location.search).get("billing") === "pending" && <div className="theme-notice" role="status">
      Checkout returned to AssetMov. Your access will update only after Paddle confirms the subscription.
    </div>}
    <div className="billing-current">
      <div><span className="eyebrow">CURRENT COMPANY PLAN</span>
        <h2>{current?.planName ?? "No plan"}</h2>
        <p>{current?.billingSource === "PADDLE" ? "Paddle subscription" : "Platform-managed trial or plan"}</p>
      </div><div><span className="billing-state">{current?.status ?? "Not configured"}</span>
        <p>{current?.trialEndsAt && current.status === "TRIALING" ? "Trial ends " + new Date(current.trialEndsAt).toLocaleDateString() :
          current?.periodEndsAt ? "Current period until " + new Date(current.periodEndsAt).toLocaleDateString() :
          "Review your subscription options"}</p>
        {current?.cancelAtPeriodEnd && <p>Cancellation is scheduled at the end of the current period.</p>}
        {history?.hasCustomer && <button className="topbar-button ghost" type="button" disabled={!!busy} onClick={() => void manage()}>Open Paddle billing portal ↗</button>}
      </div>
    </div>
    <div className="billing-current">
      <div>
        <span className="eyebrow">BILLING IDENTITY</span>
        <p><strong>{history?.billingEmail ?? "Company administrator's account email"}</strong></p>
        <p>A company-specific billing email avoids conflicts with other applications using the same Paddle merchant account.</p>
      </div>
      {!history?.hasCustomer && (history?.attempts.length ?? 0) === 0 &&
        <button type="button" className="topbar-button ghost" onClick={() => setEditingEmail(true)}>Change billing email</button>}
      {editingEmail && <form className="asset-create-form" onSubmit={e => void updateBillingEmail(e)}>
        <label>Billing contact email<input name="billingEmail" type="email" required maxLength={191}
          defaultValue={history?.billingEmail ?? ""}/></label>
        <label>Audit reason<textarea name="billingReason" minLength={8} maxLength={1000}
          required placeholder="Why should this company's billing contact be updated?"/></label>
        <div className="asset-modal-actions">
          <button type="button" className="plain-button" onClick={() => setEditingEmail(false)}>Cancel</button>
          <button className="primary-button" type="submit" disabled={!!busy}>Save billing email</button>
        </div>
      </form>}
    </div>
    {readyAttempt && !hasPaid && <div className="billing-notice">
      An existing checkout is pending. <a href={readyAttempt.checkoutUrl!}>Continue secure checkout ↗</a>
    </div>}
    {unresolvedAttempt && <div className="billing-notice">A previous checkout needs reconciliation. Contact support rather than starting duplicate payments.</div>}
    <div className="asset-register-toolbar"><strong>Subscription plans</strong>
      <ThemeSelect label="Billing interval" value={interval} onChange={v => { setInterval(v as Interval); setQuote(null); }}
        options={[{value:"MONTH",label:"Monthly billing"},{value:"YEAR",label:"Yearly billing"}]}/>
    </div>
    {!catalog?.checkoutReady && <div className="billing-notice">Paddle sandbox checkout is not configured yet. A platform operator must add this app's product/price IDs and private environment settings.</div>}
    <div className="billing-plans">
      {loading ? <p>Loading plans…</p> : (catalog?.plans ?? []).map(plan => {
        const price = interval === "MONTH" ? plan.monthlyPrice : plan.yearlyPrice;
        const selected = current?.planId === plan.id;
        return <article className={"billing-plan-card" + (selected ? " selected" : "")} key={plan.id}>
          <div><span className="eyebrow">{plan.key.toUpperCase()}</span><h3>{plan.name}</h3><p>{plan.description ?? "Flexible asset management for your company."}</p></div>
          <div className="billing-amount">{price ? money(price.amountMinor, price.currency) : "Not configured"}
            {price && <small> / {interval === "MONTH" ? "month" : "year"}</small>}
          </div>
          <div className="billing-limits"><span>{plan.maxAssets ?? "Unlimited"} assets</span><span>{plan.maxActiveUsers ?? "Unlimited"} active users</span>
            <span>{storage(plan.storageLimitBytes)} storage</span></div>
          <button className={selected && hasPaid ? "topbar-button ghost" : "primary-button"} type="button"
            disabled={!price || !catalog?.checkoutReady || !!busy || (selected && hasPaid) || (!!readyAttempt && !hasPaid) || !!unresolvedAttempt}
            onClick={() => void (hasPaid ? preview(plan.id) : begin(plan.id))}>
            {busy === plan.id ? "Connecting…" : selected && hasPaid ? "Current plan" : hasPaid ? "Review change" : "Choose plan"}
          </button>
        </article>;
      })}
    </div>
    {quote && <div className="modal-backdrop"><section className="asset-modal" role="dialog" aria-modal="true" aria-labelledby="billingQuote">
      <div className="asset-modal-heading"><h2 id="billingQuote">Review Paddle plan change</h2>
        <button className="modal-close" type="button" onClick={() => setQuote(null)}>×</button></div>
      <p>Change to <strong>{quote.planName}</strong> ({quote.interval === "MONTH" ? "monthly" : "yearly"}).</p>
      <p>Paddle's immediate {quote.adjustmentAction === "credit" ? "credit" : "charge"}: <strong>{money(quote.immediateAmountMinor, quote.currency)}</strong>.</p>
      <p className="asset-inline-hint">This is a live provider preview. If Paddle changes the amount before confirmation, the request is rejected. Access changes after a signed webhook.</p>
      <div className="asset-modal-actions"><button type="button" className="plain-button" onClick={() => setQuote(null)}>Cancel</button>
        <button type="button" className="primary-button" disabled={!!busy} onClick={() => void confirm()}>Confirm amount</button></div>
    </section></div>}
    <div className="asset-register-toolbar"><strong>Payment history</strong></div>
    <div className="asset-table-wrap"><table className="asset-table"><thead><tr>
      <th>Date</th><th>Transaction</th><th>Invoice</th><th>Status</th><th>Amount</th>
    </tr></thead><tbody>
      {(history?.payments ?? []).length === 0 ? <tr><td colSpan={5}>No provider-confirmed payments yet.</td></tr> :
        history?.payments.map(payment => <tr key={payment.id}>
          <td>{new Date(payment.occurredAt).toLocaleDateString()}</td><td>{payment.transactionId}</td>
          <td>{payment.invoiceNumber ?? "—"}</td><td>{payment.status}</td>
          <td>{money(payment.amountMinor, payment.currency)}</td>
        </tr>)}
    </tbody></table></div>
    <p className="asset-inline-hint">Payment card details are handled by Paddle, not stored by AssetMov. Access is never activated by a browser redirect alone.</p>
  </section>;
}
