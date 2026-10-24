import { useCallback, useEffect, useState, type FormEvent } from "react";
import ThemeSelect from "../../components/ThemeSelect";

const api = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api").replace(/\/$/, "");
type Plan = {
  id: string; key: string; name: string; description: string | null;
  maxAssets: number | null; maxActiveUsers: number | null; storageLimitBytes: string | null;
  trialDurationDays: number; isActive: boolean;
  paddleProductId: string | null;
  paddleSandboxMonthlyPriceId: string | null;
  paddleSandboxYearlyPriceId: string | null;
  paddleLiveMonthlyPriceId: string | null;
  paddleLiveYearlyPriceId: string | null;
};
type Subscription = { id: string; status: string; planId: string; trialEndsAt: string | null; plan: Plan };
type Company = {
  id: string; name: string; slug: string; status: string; assetCount: number;
  activeUserCount: number; storageUsedBytes: string; subscription: Subscription | null;
};
type Pulse = {
  companyCount: number; planCount: number; assetCount: number; activeUserCount: number;
  storageUsedBytes: string; subscriptionStatuses: Array<{ status: string; count: number }>;
  paddle: { paidTransactionCount: number; paidAmountMinor: number; failedWebhookCount: number;
    latestPayments: Array<{ transactionId: string; tenantId: string; tenantName: string;
      status: string; amountMinor: number; currency: string; occurredAt: string }> };
};
type Props = { csrfToken: string | null; isPlatformAdmin: boolean; section?: "companies" | "plans" };

function displayLimit(value: number | string | null): string {
  return value === null ? "Unlimited" : Number(value).toLocaleString();
}
function storageLabel(bytes: string | null) {
  return bytes === null ? "Unlimited" : (Number(bytes) / 1024 ** 3).toLocaleString(undefined, { maximumFractionDigits: 2 }) + " GiB";
}
export default function PlatformAdminPage({ csrfToken, isPlatformAdmin, section }: Props) {
  const [tab, setTab] = useState<"overview" | "companies" | "plans">(section ?? "overview");
  useEffect(() => { if (section) setTab(section); }, [section]);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editingPlan, setEditingPlan] = useState<Plan | "new" | null>(null);
  const [editingTenant, setEditingTenant] = useState<Company | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [platformStatus, setPlatformStatus] = useState<"ACTIVE" | "SUSPENDED">("ACTIVE");
  const [mode, setMode] = useState<"trial" | "activate" | "suspend">("activate");

  const request = useCallback(async <T,>(url: string, method = "GET", body?: unknown): Promise<T> => {
    if (!isPlatformAdmin) throw new Error("Platform administrator access is required.");
    if (method !== "GET" && !csrfToken) throw new Error("Session security token is missing. Sign in again.");
    const response = await fetch(api + "/platform" + url, {
      method, credentials: "include",
      headers: {
        ...(method !== "GET" ? { "X-CSRF-Token": csrfToken!, "Content-Type": "application/json" } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json().catch(() => ({})) as T & { error?: { message?: string; code?: string } };
    if (!response.ok) throw new Error(result.error?.message ?? result.error?.code ?? "Platform operation failed.");
    return result;
  }, [csrfToken, isPlatformAdmin]);

  const reload = useCallback(async () => {
    if (!isPlatformAdmin) return;
    setLoading(true);
    try {
      const [a, b, overview] = await Promise.all([
        request<{ data: Plan[] }>("/plans"),
        request<{ data: Company[]; pagination: { pageCount: number } }>(
          "/tenants?" + new URLSearchParams({ q: search, page: String(page), pageSize: "25" }).toString(),
        ),
        request<{ data: Pulse }>("/overview"),
      ]);
      setPlans(a.data); setCompanies(b.data); setPulse(overview.data); setPageCount(Math.max(1, b.pagination.pageCount)); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load platform administration."); }
    finally { setLoading(false); }
  }, [isPlatformAdmin, request, search, page]);
  useEffect(() => { void reload(); }, [reload]);

  async function savePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const existing = editingPlan !== "new" ? editingPlan : null;
    const parseLimit = (key: string) => {
      const text = String(data.get(key) ?? "").trim();
      return text === "" ? null : Number(text);
    };
    const parseStorage = () => {
      const text = String(data.get("storageGiB") ?? "").trim();
      if (text === "") return null;
      const gib = Number(text);
      if (!Number.isFinite(gib) || gib < 0 || gib > 1_048_576) {
        throw new Error("Storage quota must be a non-negative number of GiB.");
      }
      return String(BigInt(Math.round(gib * 1024 ** 3)));
    };
    const body = {
      ...(existing ? {} : { key: String(data.get("key") ?? "").trim().toLowerCase() }),
      name: String(data.get("name") ?? "").trim(),
      description: String(data.get("description") ?? "").trim() || null,
      maxAssets: parseLimit("maxAssets"),
      maxActiveUsers: parseLimit("maxActiveUsers"),
      storageLimitBytes: parseStorage(),
      trialDurationDays: Number(data.get("trialDurationDays")),
      isActive: data.get("isActive") === "on",
      paddleProductId: String(data.get("paddleProductId") ?? "").trim() || null,
      paddleSandboxMonthlyPriceId: String(data.get("paddleSandboxMonthlyPriceId") ?? "").trim() || null,
      paddleSandboxYearlyPriceId: String(data.get("paddleSandboxYearlyPriceId") ?? "").trim() || null,
      paddleLiveMonthlyPriceId: String(data.get("paddleLiveMonthlyPriceId") ?? "").trim() || null,
      paddleLiveYearlyPriceId: String(data.get("paddleLiveYearlyPriceId") ?? "").trim() || null,
      reason: String(data.get("reason") ?? "").trim(),
    };
    setBusy(true); setError(""); setSuccess("");
    try {
      await request(existing ? "/plans/" + existing.id : "/plans", existing ? "PATCH" : "POST", body);
      setEditingPlan(null);
      setSuccess(existing ? "Subscription plan updated and audited." : "Subscription plan created and audited.");
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save subscription plan."); }
    finally { setBusy(false); }
  }

  async function saveSubscription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTenant || busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true); setError(""); setSuccess("");
    try {
      await request("/tenants/" + editingTenant.id + "/subscription", "PATCH", {
        planId: selectedPlanId, mode, reason: String(data.get("reason") ?? "").trim(),
      });
      setEditingTenant(null); setSuccess("Company subscription updated and audited.");
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update company subscription."); }
    finally { setBusy(false); }
  }

  async function savePlatformStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTenant || busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true); setError(""); setSuccess("");
    try {
      await request("/tenants/" + editingTenant.id + "/status", "PATCH", {
        status: platformStatus, reason: String(data.get("platformReason") ?? "").trim(),
      });
      setEditingTenant(null);
      setSuccess("Platform company status updated and audited. Paddle payment state was not modified.");
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not change company status."); }
    finally { setBusy(false); }
  }

  if (!isPlatformAdmin) return <section className="asset-register-page"><h1>Access denied</h1><p>Only platform administrators can manage companies and plans.</p></section>;
  return <section className="asset-register-page">
    <div className="asset-page-heading">
      <div><div className="eyebrow"><span className="eyebrow-line"/> PLATFORM CONTROL</div>
        <h1 className="asset-page-title">{section === "companies" ? "Companies" : section === "plans" ? "Plans & Limits" : "Platform administration"}</h1>
        <p>{section === "companies" ? "Review tenants, subscriptions and resource use; suspend platform access or manage manual plans." : section === "plans" ? "Configure plan quotas and Paddle product pricing with audited changes." : "Manage registered companies, subscription plans, trials and suspension with mandatory audit reasons."}</p></div>
      <button type="button" className="topbar-button ghost" onClick={() => void reload()} disabled={loading}>Refresh ↻</button>
    </div>
    {error && <div className="theme-notice error" role="alert">{error}</div>}
    {success && <div className="theme-notice success" role="status">{success}</div>}
    {!section && <div className="transfer-tabs" role="tablist" aria-label="Platform administration section">
      <button type="button" role="tab" aria-selected={tab === "overview"} className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>Platform overview</button>
      <button type="button" role="tab" aria-selected={tab === "companies"} className={tab === "companies" ? "active" : ""} onClick={() => setTab("companies")}>Companies</button>
      <button type="button" role="tab" aria-selected={tab === "plans"} className={tab === "plans" ? "active" : ""} onClick={() => setTab("plans")}>Subscription plans</button>
    </div>}
    {tab === "overview" ? <>
      <div className="stats-grid">
        {[
          ["Companies", pulse?.companyCount], ["Plans", pulse?.planCount],
          ["Assets", pulse?.assetCount], ["Active memberships", pulse?.activeUserCount],
          ["Paid transactions", pulse?.paddle.paidTransactionCount],
          ["Recorded revenue", pulse ? new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(pulse.paddle.paidAmountMinor/100) : "—"],
          ["Failed webhooks", pulse?.paddle.failedWebhookCount],
          ["Stored files", pulse ? (Number(pulse.storageUsedBytes)/1024**2).toFixed(2)+" MiB" : "—"],
        ].map(([label, value]) => <div className="stat-card" key={label}><span className="eyebrow">{label}</span>
          <strong style={{fontSize:20,marginTop:14}}>{value ?? "—"}</strong></div>)}
      </div>
      <div className="asset-register-toolbar"><strong>Company subscription states</strong></div>
      <div className="billing-limits">{pulse?.subscriptionStatuses.map(item =>
        <span key={item.status}>{item.status}: {item.count.toLocaleString()} companies</span>)}</div>
      <div className="asset-register-toolbar"><strong>Recent Paddle payments</strong></div>
      <div className="asset-table-wrap"><table className="asset-table">
        <thead><tr><th>Company</th><th>Event time</th><th>Transaction</th><th>Status</th><th>Amount</th></tr></thead>
        <tbody>{!pulse?.paddle.latestPayments.length ? <tr><td colSpan={5}>No Paddle payment records.</td></tr> :
          pulse.paddle.latestPayments.map(payment => <tr key={payment.transactionId}>
            <td>{payment.tenantName}</td><td>{new Date(payment.occurredAt).toLocaleString()}</td>
            <td>{payment.transactionId}</td><td>{payment.status}</td>
            <td>{new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(payment.amountMinor/100)}</td>
          </tr>)}</tbody></table></div>
      <p className="asset-inline-hint">Revenue reflects recorded Paddle USD transactions, not a payout or accounting statement. Provider webhooks remain authoritative.</p>
    </> : tab === "companies" ? <>
      <div className="asset-register-toolbar"><form className="asset-search-form" onSubmit={e => { e.preventDefault(); setPage(1); setSearch(query.trim()); }}>
        <label htmlFor="companyQuery" className="sr-only">Search companies</label>
        <input id="companyQuery" value={query} onChange={e => setQuery(e.currentTarget.value)} placeholder="Search company name or slug"/>
        <button type="submit">Search</button></form></div>
      <div className="asset-table-wrap"><table className="asset-table">
        <thead><tr><th>Company</th><th>Status</th><th>Subscription</th><th>Assets</th><th>Users</th><th>Storage used</th><th>Trial expiry</th><th>Action</th></tr></thead>
        <tbody>{loading ? <tr><td colSpan={8}>Loading companies…</td></tr> : companies.length === 0
          ? <tr><td colSpan={8}>No matching companies found.</td></tr>
          : companies.map(company => <tr key={company.id}>
            <td><strong>{company.name}</strong><span className="asset-number">{company.slug}</span></td>
            <td>{company.status}</td><td>{company.subscription?.plan.name ?? "Not configured"}<span className="asset-number">{company.subscription?.status ?? ""}</span></td>
            <td>{company.assetCount.toLocaleString()}</td><td>{company.activeUserCount.toLocaleString()}</td><td>{(Number(company.storageUsedBytes) / 1024 ** 2).toFixed(2)} MiB</td>
            <td>{company.subscription?.trialEndsAt ? new Date(company.subscription.trialEndsAt).toLocaleDateString() : "—"}</td>
            <td><button className="topbar-button ghost" type="button" onClick={() => {
              setEditingTenant(company); setSelectedPlanId(company.subscription?.planId ?? plans.find(p => p.isActive)?.id ?? "");
              setMode("activate"); setPlatformStatus(company.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED");
            }}>Manage</button></td>
          </tr>)}</tbody>
      </table></div>
      <div className="asset-table-footer"><span>25 companies per page</span><span>
        <button className="topbar-button ghost" type="button" disabled={page <= 1 || loading} onClick={() => setPage(v => v - 1)}>Previous</button>
        {" "}Page {page} of {pageCount}{" "}
        <button className="topbar-button ghost" type="button" disabled={page >= pageCount || loading} onClick={() => setPage(v => v + 1)}>Next</button>
      </span></div>
    </> : <>
      <div className="asset-register-toolbar"><strong>{plans.length} subscription plans</strong>
        <button className="primary-button" type="button" onClick={() => setEditingPlan("new")}>Add plan ＋</button></div>
      <div className="asset-table-wrap"><table className="asset-table">
        <thead><tr><th>Plan</th><th>Assets</th><th>Active users</th><th>Storage</th><th>Trial days</th><th>Paddle sandbox</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>{plans.map(plan => <tr key={plan.id}>
          <td><strong>{plan.name}</strong><span className="asset-number">{plan.key}</span></td>
          <td>{displayLimit(plan.maxAssets)}</td><td>{displayLimit(plan.maxActiveUsers)}</td>
          <td>{storageLabel(plan.storageLimitBytes)}</td><td>{plan.trialDurationDays}</td>
          <td>{plan.paddleSandboxMonthlyPriceId && plan.paddleSandboxYearlyPriceId && plan.paddleProductId ? "Monthly + Yearly" : plan.paddleProductId ? "Partial" : "Not configured"}</td>
          <td>{plan.isActive ? "Active" : "Disabled"}</td>
          <td><button className="topbar-button ghost" type="button" onClick={() => setEditingPlan(plan)}>Edit</button></td>
        </tr>)}</tbody>
      </table></div>
    </>}
    {editingTenant && <div className="modal-backdrop"><section className="asset-modal" role="dialog" aria-modal="true" aria-labelledby="tenantModalTitle">
      <div className="asset-modal-heading"><div><h2 id="tenantModalTitle">Manage {editingTenant.name}</h2><p>Company {editingTenant.slug}</p></div>
        <button className="modal-close" type="button" onClick={() => setEditingTenant(null)}>×</button></div>
      {editingTenant.subscription?.status && editingTenant.subscription.plan && <p className="asset-inline-hint">
        Subscription source and payment state are provider-authoritative when a Paddle subscription is present.
        Platform suspension is managed independently.
      </p>}
      <form className="asset-create-form" onSubmit={e => void saveSubscription(e)}>
        <label>Subscription plan</label>
        <ThemeSelect label="Subscription plan" value={selectedPlanId} onChange={setSelectedPlanId}
          options={plans.filter(p => p.isActive).map(p => ({value:p.id,label:p.name}))}/>
        <label>Action</label>
        <ThemeSelect label="Subscription action" value={mode} onChange={v => setMode(v as typeof mode)}
          options={[{value:"activate",label:"Activate company"},{value:"trial",label:"Start a new trial"},{value:"suspend",label:"Suspend company"}]}/>
        <label>Audit reason<textarea name="reason" required minLength={8} maxLength={1000} placeholder="Why is this subscription changing?"/></label>
        {mode === "suspend" && <p className="asset-inline-hint">Suspending immediately blocks company workspace access.</p>}
        <div className="asset-modal-actions"><button type="button" className="plain-button" onClick={() => setEditingTenant(null)}>Cancel</button>
          <button type="submit" className="primary-button" disabled={busy || !selectedPlanId}>{busy ? "Saving…" : "Apply change"}</button></div>
      </form>
      <div className="asset-edit-section-label">Platform company access</div>
      <form className="asset-create-form" onSubmit={e => void savePlatformStatus(e)}>
        <label>Platform access status</label>
        <ThemeSelect label="Platform access status" value={platformStatus}
          onChange={value => setPlatformStatus(value as "ACTIVE" | "SUSPENDED")}
          options={[{value:"ACTIVE",label:"Allow access subject to subscription"},
            {value:"SUSPENDED",label:"Suspend company access"}]}/>
        <label>Audit reason<textarea name="platformReason" required minLength={8} maxLength={1000}
          placeholder="Reason for suspending or restoring platform access"/></label>
        <p className="asset-inline-hint">This action does not activate a failed payment, extend a trial or override Paddle billing.</p>
        <div className="asset-modal-actions"><button className="primary-button" type="submit"
          disabled={busy}>{busy ? "Updating…" : "Update platform access"}</button></div>
      </form>
    </section></div>}
    {editingPlan && <div className="modal-backdrop"><section className="asset-modal" role="dialog" aria-modal="true" aria-labelledby="planModalTitle">
      <div className="asset-modal-heading"><h2 id="planModalTitle">{editingPlan === "new" ? "Create plan" : "Edit plan"}</h2>
        <button type="button" className="modal-close" onClick={() => setEditingPlan(null)}>×</button></div>
      <form className="asset-create-form" onSubmit={e => void savePlan(e)}>
        {editingPlan === "new" && <label>Plan key<input name="key" required pattern="[a-z0-9]+(-[a-z0-9]+)*" minLength={2} maxLength={60}/></label>}
        <label>Plan name<input name="name" required minLength={2} maxLength={100} defaultValue={editingPlan === "new" ? "" : editingPlan.name}/></label>
        <label>Description<textarea name="description" maxLength={4000} defaultValue={editingPlan === "new" ? "" : editingPlan.description ?? ""}/></label>
        <div className="asset-form-two-col">
          <label>Asset limit (blank = unlimited)<input name="maxAssets" type="number" min={0} max={2000000000} defaultValue={editingPlan === "new" ? "" : editingPlan.maxAssets ?? ""}/></label>
          <label>Active-user limit (blank = unlimited)<input name="maxActiveUsers" type="number" min={0} max={2000000000} defaultValue={editingPlan === "new" ? "" : editingPlan.maxActiveUsers ?? ""}/></label>
        </div>
        <div className="asset-form-two-col">
          <label>Storage (GiB; blank = unlimited)<input name="storageGiB" type="number" min={0} max={1048576} step="0.001" defaultValue={editingPlan === "new" ? "" : editingPlan.storageLimitBytes === null ? "" : Number(editingPlan.storageLimitBytes) / 1024 ** 3}/></label>
          <label>Trial duration (days)<input name="trialDurationDays" required type="number" min={0} max={3650} defaultValue={editingPlan === "new" ? 14 : editingPlan.trialDurationDays}/></label>
        </div>
        <div className="asset-edit-section-label">Paddle catalog — AssetMov products only</div>
        <p className="asset-inline-hint">Create separate AssetMov recurring prices in Paddle Sandbox. Never reuse BuildHire prices. Live billing stays disabled pending launch approval.</p>
        <label>AssetMov Paddle product ID<input name="paddleProductId" maxLength={80}
          pattern="pro_[a-z0-9]{26}" placeholder="pro_…" defaultValue={editingPlan === "new" ? "" : editingPlan.paddleProductId ?? ""}/></label>
        <div className="asset-form-two-col">
          <label>Sandbox monthly price ID<input name="paddleSandboxMonthlyPriceId" maxLength={80} pattern="pri_[a-z0-9]{26}"
            placeholder="pri_…" defaultValue={editingPlan === "new" ? "" : editingPlan.paddleSandboxMonthlyPriceId ?? ""}/></label>
          <label>Sandbox yearly price ID<input name="paddleSandboxYearlyPriceId" maxLength={80} pattern="pri_[a-z0-9]{26}"
            placeholder="pri_…" defaultValue={editingPlan === "new" ? "" : editingPlan.paddleSandboxYearlyPriceId ?? ""}/></label>
        </div>
        <div className="asset-form-two-col">
          <label>Live monthly ID (inactive)<input name="paddleLiveMonthlyPriceId" maxLength={80} pattern="pri_[a-z0-9]{26}"
            defaultValue={editingPlan === "new" ? "" : editingPlan.paddleLiveMonthlyPriceId ?? ""}/></label>
          <label>Live yearly ID (inactive)<input name="paddleLiveYearlyPriceId" maxLength={80} pattern="pri_[a-z0-9]{26}"
            defaultValue={editingPlan === "new" ? "" : editingPlan.paddleLiveYearlyPriceId ?? ""}/></label>
        </div>
        <label className="master-field-check"><input type="checkbox" name="isActive" defaultChecked={editingPlan === "new" || editingPlan.isActive}/> Available for assignment</label>
        <label>Audit reason<textarea name="reason" required minLength={8} maxLength={1000}/></label>
        <div className="asset-modal-actions"><button className="plain-button" type="button" onClick={() => setEditingPlan(null)}>Cancel</button>
          <button className="primary-button" type="submit" disabled={busy}>{busy ? "Saving…" : "Save plan"}</button></div>
      </form>
    </section></div>}
  </section>;
}
