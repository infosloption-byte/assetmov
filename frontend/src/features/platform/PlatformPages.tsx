import { useCallback, useEffect, useState, type FormEvent } from "react";
import ThemeSelect from "../../components/ThemeSelect";
import type { PlatformPage } from "./PlatformConsole";

const api = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api").replace(/\/$/, "");
type ApiError = { error?: { code?: string; message?: string } };
function usePlatformRequest(csrfToken?: string | null) {
  return useCallback(async <T,>(path: string, method = "GET", body?: unknown): Promise<T> => {
    if (method !== "GET" && !csrfToken) throw new Error("Security token missing. Sign in again.");
    const response = await fetch(api + path, {
      method, credentials: "include",
      headers: { ...(method !== "GET" ? {
        "X-CSRF-Token": csrfToken!, "Content-Type": "application/json",
      } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json().catch(() => ({})) as T & ApiError;
    if (!response.ok) throw new Error(payload.error?.message ?? payload.error?.code ?? "Platform request failed.");
    return payload;
  }, [csrfToken]);
}
function formatNumber(value: number | undefined | null) { return value === undefined || value === null ? "—" : value.toLocaleString(); }
function formatStorage(bytes: string) { return (Number(bytes) / (1024 * 1024 * 1024)).toLocaleString(undefined, {maximumFractionDigits:2}) + " GiB"; }
function money(amountMinor: number, currency: string) {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountMinor / 100); }
  catch { return currency + " " + (amountMinor / 100).toFixed(2); }
}
function date(value: string | null) { return value ? new Date(value).toLocaleDateString() : "—"; }
function dateTime(value: string | null) { return value ? new Date(value).toLocaleString() : "—"; }
function Stat({ label, value, caption, symbol }: {label:string;value:string|number;caption?:string;symbol:string}) {
  return <article className="platform-stat">
    <div className="platform-stat-heading"><span>{label}</span><span className="platform-stat-icon">{symbol}</span></div>
    <strong>{typeof value === "number" ? formatNumber(value) : value}</strong>
    <small>{caption ?? "Platform-wide total"}</small>
  </article>;
}
function Notice({ error, success }: {error?:string;success?:string}) {
  return <>{error && <div className="platform-alert error" role="alert">{error}</div>}
    {success && <div className="platform-alert success" role="status">{success}</div>}</>;
}
function Empty({ children }: { children: string }) {
  return <div className="platform-empty">{children}</div>;
}
function Table({ headings, children }: { headings: string[]; children: React.ReactNode }) {
  return <div className="platform-table-frame"><table className="platform-table">
    <thead><tr>{headings.map(heading => <th key={heading}>{heading}</th>)}</tr></thead>
    <tbody>{children}</tbody>
  </table></div>;
}
function Pagination({ page, pages, onPage }: { page:number; pages:number; onPage:(next:number)=>void }) {
  return <div className="platform-pagination"><span>Page {page} of {Math.max(1,pages)}</span>
    <div><button type="button" onClick={()=>onPage(page-1)} disabled={page<=1}>← Previous</button>
      <button type="button" onClick={()=>onPage(page+1)} disabled={page>=pages}>Next →</button></div>
  </div>;
}
type Overview = {
  companyCount:number;planCount:number;assetCount:number;activeUserCount:number;
  storageUsedBytes:string;subscriptionStatuses:Array<{status:string;count:number}>;
  paddle:{paidTransactionCount:number;paidAmountMinor:number;failedWebhookCount:number;
    latestPayments:Array<{transactionId:string;tenantName:string;amountMinor:number;currency:string;status:string;occurredAt:string}>};
};
type Security = {
  activeSessions:number;disabledUsers:number;platformAdmins:number;unverifiedUsers:number;failedProviderEvents:number;
  note:string;recentSessions:Array<{id:string;ipAddress:string|null;createdAt:string;lastSeenAt:string|null;
    user:{fullName:string;email:string;isPlatformAdmin:boolean}}>;
};
type PlatformUser = {
  id:string;email:string;fullName:string;isPlatformAdmin:boolean;
  disabledAt:string|null;emailVerifiedAt:string|null;createdAt:string;sessionCount:number;
  memberships:Array<{isActive:boolean;role:{key:string;name:string};tenant:{id:string;name:string;status:string}}>;
};
type Paginated = {page:number;pageSize:number;total:number;pageCount:number};
type Reports = {
  totals:{newCompanies30Days:number;assets:number;activeMemberships:number;storageBytes:string};
  companiesByStatus:Array<{label:string;count:number}>;
  subscriptionsByStatus:Array<{label:string;count:number}>;
  assetsByStatus:Array<{label:string;count:number}>;
  planDistribution:Array<{label:string;count:number}>;
  registrations:Array<{date:string;count:number}>;
  recentCompanies:Array<{id:string;name:string;status:string;createdAt:string;assetCount:number;membershipCount:number}>;
};
type EventItem={id:string;scope:"platform"|"tenant";createdAt:string;action:string;actor:{fullName:string;email:string}|null;
  company:{id:string;name:string}|null;entityType:string;entityId:string|null;ipAddress:string|null;reason:string|null;};
type Billing={subscriptionStatuses:Array<{status:string;count:number}>;
  paymentGroups:Array<{currency:string;status:string;amountMinor:number;count:number}>;
  failedWebhooks:number;
  payments:Array<{id:string;transactionId:string;status:string;amountMinor:number;currency:string;
    invoiceNumber:string|null;occurredAt:string;tenant:{id:string;name:string}}>;
  plans:Array<{id:string;name:string;isActive:boolean;subscriberCount:number}>;
};
type Settings={companyRegistrationOpen:boolean;supportEmail:string|null;announcement:string|null;updatedAt:string|null};

export function PlatformOverview({ onNavigate }: {onNavigate:(page:PlatformPage)=>void}) {
  const request=usePlatformRequest();
  const [data,setData]=useState<Overview|null>(null);
  const [security,setSecurity]=useState<Security|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{void Promise.all([
    request<{data:Overview}>("/platform/overview"),
    request<{data:Security}>("/platform-console/security"),
  ]).then(([a,b])=>{setData(a.data);setSecurity(b.data);}).catch(e=>setError(String(e instanceof Error?e.message:e)));},[request]);
  return <div className="platform-section">
    <Notice error={error}/>
    <div className="platform-stats">
      <Stat label="Total companies" value={data?.companyCount??"—"} symbol="▦" caption="Registered workspaces"/>
      <Stat label="Active memberships" value={data?.activeUserCount??"—"} symbol="♙" caption="Active company access"/>
      <Stat label="Tracked assets" value={data?.assetCount??"—"} symbol="◫" caption="Across all companies"/>
      <Stat label="Paid transactions" value={data?.paddle.paidTransactionCount??"—"} symbol="◈" caption="Provider-recorded payments"/>
    </div>
    <div className="platform-grid-two">
      <section className="platform-panel">
        <div className="platform-panel-heading"><div><h2>Subscription health</h2><p>Current company subscriptions</p></div>
          <button type="button" onClick={()=>onNavigate("companies")}>View companies →</button></div>
        <div className="platform-status-list">{data?.subscriptionStatuses.length ? data.subscriptionStatuses.map(status=><div key={status.status}>
          <span className="platform-status-name">{status.status.replaceAll("_"," ")}</span>
          <strong>{formatNumber(status.count)}</strong>
        </div>) : <Empty>No subscription records yet.</Empty>}</div>
      </section>
      <section className="platform-panel">
        <div className="platform-panel-heading"><div><h2>Operational health</h2><p>Security and billing signals</p></div>
          <button type="button" onClick={()=>onNavigate("activities")}>Security →</button></div>
        <div className="platform-health-row"><span>Active sessions</span><strong>{formatNumber(security?.activeSessions)}</strong></div>
        <div className="platform-health-row"><span>Platform administrators</span><strong>{formatNumber(security?.platformAdmins)}</strong></div>
        <div className="platform-health-row"><span>Disabled accounts</span><strong>{formatNumber(security?.disabledUsers)}</strong></div>
        <div className="platform-health-row"><span>Failed Paddle webhooks</span><strong className={data?.paddle.failedWebhookCount?"platform-danger":""}>{formatNumber(data?.paddle.failedWebhookCount)}</strong></div>
        <div className="platform-health-row"><span>Total stored attachments</span><strong>{data?formatStorage(data.storageUsedBytes):"—"}</strong></div>
      </section>
    </div>
    <section className="platform-panel">
      <div className="platform-panel-heading"><div><h2>Latest billing activity</h2><p>Verified transaction records, not estimated revenue</p></div>
        <button type="button" onClick={()=>onNavigate("billing")}>Finance →</button></div>
      <Table headings={["Company","Transaction","Date","Status","Amount"]}>
        {!data?.paddle.latestPayments.length ? <tr><td colSpan={5}>No payment records yet.</td></tr> :
          data.paddle.latestPayments.slice(0,8).map(row=><tr key={row.transactionId}>
            <td><strong>{row.tenantName}</strong></td><td className="platform-mono">{row.transactionId}</td>
            <td>{dateTime(row.occurredAt)}</td><td><span className="platform-tag">{row.status}</span></td>
            <td><strong>{money(row.amountMinor,row.currency)}</strong></td></tr>)}
      </Table>
    </section>
    <div className="platform-shortcuts">
      {([["Users","users","Manage accounts and company memberships"],["Platform Reports","reports","View company and asset trends"],["Plans & Limits","plans","Configure subscription entitlements"],["Settings","settings","Registration and operator settings"]] as const).map(item=>
        <button key={item[1]} type="button" onClick={()=>onNavigate(item[1])}>
          <strong>{item[0]} <span>↗</span></strong><small>{item[2]}</small>
        </button>)}
    </div>
  </div>;
}

export function PlatformUsers({csrfToken,currentUserId}:{csrfToken:string|null;currentUserId:string}) {
  const request=usePlatformRequest(csrfToken);
  const [query,setQuery]=useState("");
  const [search,setSearch]=useState("");
  const [page,setPage]=useState(1);
  const [data,setData]=useState<{users:PlatformUser[];pagination:Paginated}|null>(null);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [loading,setLoading]=useState(true);
  const [target,setTarget]=useState<PlatformUser|null>(null);
  const [busy,setBusy]=useState(false);
  const load=useCallback(async()=>{setLoading(true);try {
    const result=await request<{data:{users:PlatformUser[];pagination:Paginated}}>("/platform-console/users?"+
      new URLSearchParams({q:search,page:String(page),pageSize:"25"}));
    setData(result.data);setError("");
  }catch(e){setError(e instanceof Error?e.message:"Unable to load users.");}finally{setLoading(false);}},[request,search,page]);
  useEffect(()=>{void load();},[load]);
  async function setDisabled(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(!target||busy)return;
    const reason=String(new FormData(event.currentTarget).get("reason")??"").trim();
    setBusy(true);setError("");setSuccess("");
    try {
      await request("/platform-console/users/"+target.id+"/status","PATCH",{
        disabled:target.disabledAt===null,reason,
      });
      setSuccess("Account status updated. All existing sessions have been revoked.");
      setTarget(null);await load();
    }catch(e){setError(e instanceof Error?e.message:"Could not change account status.");}
    finally{setBusy(false);}
  }
  return <div className="platform-section">
    <Notice error={error} success={success}/>
    <div className="platform-toolbar">
      <form onSubmit={e=>{e.preventDefault();setPage(1);setSearch(query.trim());}}>
        <input value={query} onChange={e=>setQuery(e.currentTarget.value)} aria-label="Search platform users"
          placeholder="Search user, email or company…" maxLength={191}/>
        <button type="submit">Search</button>
      </form>
      <span>{data ? formatNumber(data.pagination.total)+" total users" : "Loading users…"}</span>
    </div>
    <Table headings={["Account","Platform role","Companies / membership","Sessions","Status","Actions"]}>
      {loading && !data ? <tr><td colSpan={6}>Loading platform users…</td></tr> :
        !data?.users.length ? <tr><td colSpan={6}>No matching users.</td></tr> :
          data.users.map(user=><tr key={user.id}>
            <td><strong>{user.fullName}</strong><small>{user.email}</small><small>Joined {date(user.createdAt)}</small></td>
            <td>{user.isPlatformAdmin?<span className="platform-tag prominent">Platform Admin</span>:<span className="platform-tag">Company user</span>}</td>
            <td>{user.memberships.length?user.memberships.map(m=><div className="platform-membership" key={m.tenant.id}>
              <strong>{m.tenant.name}</strong><span> · {m.role.name} {m.isActive?"":"(inactive)"}</span>
            </div>):<span className="platform-muted">No company membership</span>}</td>
            <td>{formatNumber(user.sessionCount)}</td>
            <td><span className={"platform-tag "+(user.disabledAt?"alert":"ok")}>{user.disabledAt?"Disabled":"Active"}</span></td>
            <td>{!user.isPlatformAdmin && user.id!==currentUserId ?
              <button className="platform-outline" type="button" onClick={()=>setTarget(user)}>
                {user.disabledAt?"Restore":"Disable"}</button> :
              <span className="platform-muted">Protected</span>}</td>
          </tr>)}
    </Table>
    {data && <Pagination page={page} pages={data.pagination.pageCount} onPage={setPage}/>}
    <p className="platform-hint">Platform Admin access is assigned only through trusted bootstrap, not company roles. Changes to accounts revoke all sessions and are audited.</p>
    {target && <div className="platform-modal-backdrop"><section className="platform-modal" role="dialog" aria-modal="true" aria-labelledby="platformUserTitle">
      <div className="platform-modal-heading"><h2 id="platformUserTitle">{target.disabledAt?"Restore":"Disable"} {target.fullName}</h2>
        <button type="button" onClick={()=>setTarget(null)} aria-label="Close">×</button></div>
      <p>{target.disabledAt?"Restoring this account allows it to sign in again.":"Disabling this account blocks every linked company and revokes all existing sessions."}</p>
      <form onSubmit={e=>void setDisabled(e)}>
        <label>Required audit reason<textarea name="reason" minLength={8} maxLength={1000} required placeholder="Explain why this access change is necessary"/></label>
        <div className="platform-modal-actions"><button type="button" onClick={()=>setTarget(null)}>Cancel</button>
          <button type="submit" disabled={busy}>{busy?"Applying…":"Confirm change"}</button></div>
      </form>
    </section></div>}
  </div>;
}

function Distribution({title,rows}:{title:string;rows:Array<{label:string;count:number}>}) {
  const max=Math.max(1,...rows.map(row=>row.count));
  return <section className="platform-panel"><div className="platform-panel-heading"><h2>{title}</h2></div>
    {!rows.length?<Empty>No records available.</Empty>:<div className="platform-bars">{rows.map(item=><div className="platform-bar-item" key={item.label}>
      <div><span>{item.label.replaceAll("_"," ")}</span><strong>{formatNumber(item.count)}</strong></div>
      <div className="platform-bar-track"><span style={{width:(item.count/max*100)+"%"}}/></div>
    </div>)}</div>}
  </section>;
}
export function PlatformReports(){
  const request=usePlatformRequest();
  const [data,setData]=useState<Reports|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{void request<{data:Reports}>("/platform-console/reports").then(r=>setData(r.data))
    .catch(e=>setError(e instanceof Error?e.message:"Reports unavailable."));},[request]);
  const max=Math.max(1,...(data?.registrations.map(x=>x.count)??[]));
  return <div className="platform-section"><Notice error={error}/>
    <div className="platform-stats">
      <Stat label="New companies" value={data?.totals.newCompanies30Days??"—"} caption="Last 30 days" symbol="↗"/>
      <Stat label="Tracked assets" value={data?.totals.assets??"—"} symbol="◫"/>
      <Stat label="Active members" value={data?.totals.activeMemberships??"—"} symbol="♙"/>
      <Stat label="Storage used" value={data?formatStorage(data.totals.storageBytes):"—"} symbol="▤"/>
    </div>
    <section className="platform-panel"><div className="platform-panel-heading"><div><h2>Company registrations</h2><p>Past 30 days · UTC calendar dates</p></div></div>
      <div className="platform-trend">{data?.registrations.map(row=><div key={row.date} className="platform-trend-item"
        title={row.date+": "+row.count+" new companies"}><span style={{height:(Math.max(5,row.count/max*100))+"%"}}/>
        </div>)??<Empty>Loading company registrations…</Empty>}</div>
      <div className="platform-trend-labels"><span>30 days ago</span><span>Today</span></div>
    </section>
    <div className="platform-grid-two">
      <Distribution title="Company statuses" rows={data?.companiesByStatus??[]}/>
      <Distribution title="Subscription statuses" rows={data?.subscriptionsByStatus??[]}/>
      <Distribution title="Asset lifecycle statuses" rows={data?.assetsByStatus??[]}/>
      <Distribution title="Companies by plan" rows={data?.planDistribution??[]}/>
    </div>
    <section className="platform-panel"><div className="platform-panel-heading"><h2>Recently onboarded companies</h2></div>
      <Table headings={["Company","Created","Status","Assets","Memberships"]}>
        {!data?.recentCompanies.length?<tr><td colSpan={5}>No company registrations.</td></tr>:
          data.recentCompanies.map(c=><tr key={c.id}><td><strong>{c.name}</strong></td>
            <td>{date(c.createdAt)}</td><td><span className="platform-tag">{c.status}</span></td>
            <td>{formatNumber(c.assetCount)}</td><td>{formatNumber(c.membershipCount)}</td>
          </tr>)}
      </Table>
    </section>
    <p className="platform-hint">Platform reports aggregate tenant totals without exposing individual companies' asset records.</p>
  </div>;
}

export function PlatformActivity(){
  const request=usePlatformRequest();
  const [source,setSource]=useState<"all"|"platform"|"tenant">("all");
  const [page,setPage]=useState(1);
  const [data,setData]=useState<{events:EventItem[];pagination:Paginated}|null>(null);
  const [security,setSecurity]=useState<Security|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{void request<{data:Security}>("/platform-console/security").then(r=>setSecurity(r.data))
    .catch(e=>setError(e instanceof Error?e.message:"Security data unavailable."));},[request]);
  useEffect(()=>{void request<{data:{events:EventItem[];pagination:Paginated}}>("/platform-console/activities?"+
    new URLSearchParams({source,page:String(page),pageSize:"20"})).then(r=>{setData(r.data);setError("");})
    .catch(e=>setError(e instanceof Error?e.message:"Activity history unavailable."));},[request,source,page]);
  return <div className="platform-section"><Notice error={error}/>
    <div className="platform-stats">
      <Stat label="Active sessions" value={security?.activeSessions??"—"} symbol="◎"/>
      <Stat label="Platform admins" value={security?.platformAdmins??"—"} symbol="◇"/>
      <Stat label="Disabled accounts" value={security?.disabledUsers??"—"} symbol="⊘"/>
      <Stat label="Failed webhooks" value={security?.failedProviderEvents??"—"} symbol="!"/>
    </div>
    <section className="platform-panel">
      <div className="platform-panel-heading"><div><h2>Audited activity</h2><p>Company and platform operations</p></div>
        <ThemeSelect label="Audit event source" value={source} onChange={v=>{setSource(v as typeof source);setPage(1);}}
          options={[{value:"all",label:"All activities"},{value:"platform",label:"Platform activities"},{value:"tenant",label:"Company activities"}]}/></div>
      <Table headings={["Time","Scope","Action","Actor","Object","IP / Reason"]}>
        {!data?.events.length?<tr><td colSpan={6}>No recorded activities.</td></tr>:
          data.events.map(event=><tr key={event.scope+event.id}><td>{dateTime(event.createdAt)}</td>
            <td>{event.company?<strong>{event.company.name}</strong>:<span className="platform-tag prominent">Platform</span>}</td>
            <td><strong>{event.action}</strong></td><td>{event.actor?.fullName??"System"}<small>{event.actor?.email??""}</small></td>
            <td>{event.entityType}<small>{event.entityId??""}</small></td>
            <td>{event.ipAddress??"—"}<small>{event.reason??""}</small></td>
          </tr>)}
      </Table>
      {data && <Pagination page={page} pages={data.pagination.pageCount} onPage={setPage}/>}
    </section>
    <section className="platform-panel"><div className="platform-panel-heading"><div><h2>Recent authenticated sessions</h2><p>Active sessions from the identity system</p></div></div>
      <Table headings={["User","Session created","Last seen","IP","Access"]}>
        {!security?.recentSessions.length?<tr><td colSpan={5}>No active sessions.</td></tr>:
          security.recentSessions.map(session=><tr key={session.id}>
            <td><strong>{session.user.fullName}</strong><small>{session.user.email}</small></td>
            <td>{dateTime(session.createdAt)}</td><td>{dateTime(session.lastSeenAt)}</td>
            <td>{session.ipAddress??"—"}</td><td>{session.user.isPlatformAdmin?"Platform Admin":"Company user"}</td>
          </tr>)}
      </Table>
      <p className="platform-hint">{security?.note??"Login attempts and provider webhook failures require separate monitoring."}</p>
    </section>
  </div>;
}

export function PlatformBilling(){
  const request=usePlatformRequest();
  const [data,setData]=useState<Billing|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{void request<{data:Billing}>("/platform-console/billing").then(r=>setData(r.data))
    .catch(e=>setError(e instanceof Error?e.message:"Billing data unavailable."));},[request]);
  const paid = data?.paymentGroups.filter(p=>p.status==="PAID")??[];
  const other = data?.paymentGroups.filter(p=>p.status!=="PAID")??[];
  const active=data?.subscriptionStatuses.find(x=>x.status==="ACTIVE")?.count??0;
  const overdue=data?.subscriptionStatuses.filter(x=>["PAST_DUE","GRACE","EXPIRED","SUSPENDED"].includes(x.status))
    .reduce((sum,x)=>sum+x.count,0)??0;
  return <div className="platform-section"><Notice error={error}/>
    <div className="platform-stats">
      <Stat label="Active subscriptions" value={data?active:"—"} symbol="◈"/>
      <Stat label="Subscriptions requiring attention" value={data?overdue:"—"} symbol="!"/>
      <Stat label="Paid Paddle transactions" value={data?paid.reduce((s,x)=>s+x.count,0):"—"} symbol="✓"/>
      <Stat label="Failed webhooks" value={data?.failedWebhooks??"—"} symbol="⊘"/>
    </div>
    <section className="platform-panel"><div className="platform-panel-heading"><div><h2>Recorded revenue by currency</h2>
      <p>Completed Paddle transactions only. Not a payout or financial ledger.</p></div></div>
      <div className="platform-finance-grid">
        {!paid.length?<Empty>No completed Paddle payments have been recorded.</Empty>:paid.map(record=>
          <div className="platform-finance-item" key={record.currency}><span>{record.currency} paid revenue</span>
            <strong>{money(record.amountMinor,record.currency)}</strong><small>{record.count} paid transactions</small></div>)}
      </div>
      {other.map(record=><div className="platform-health-row" key={record.currency+record.status}>
        <span>{record.currency} · {record.status}</span><strong>{record.count} records ({money(record.amountMinor,record.currency)})</strong>
      </div>)}
    </section>
    <div className="platform-grid-two">
      <Distribution title="Subscription statuses" rows={(data?.subscriptionStatuses??[]).map(x=>({label:x.status,count:x.count}))}/>
      <Distribution title="Subscribers by plan" rows={(data?.plans??[]).map(x=>({label:x.name,count:x.subscriberCount}))}/>
    </div>
    <section className="platform-panel"><div className="platform-panel-heading"><h2>Recent Paddle transactions</h2></div>
      <Table headings={["Company","Date","Transaction","Invoice","Status","Amount"]}>
        {!data?.payments.length?<tr><td colSpan={6}>No Paddle transactions yet.</td></tr>:data.payments.map(p=>
          <tr key={p.id}><td><strong>{p.tenant.name}</strong></td><td>{dateTime(p.occurredAt)}</td>
            <td className="platform-mono">{p.transactionId}</td><td>{p.invoiceNumber??"—"}</td>
            <td><span className="platform-tag">{p.status}</span></td><td><strong>{money(p.amountMinor,p.currency)}</strong></td>
          </tr>)}
      </Table>
    </section>
    <p className="platform-hint">Subscriptions remain Paddle-controlled; manually changing a company plan cannot forge a provider payment.</p>
  </div>;
}

export function PlatformSettings({csrfToken}:{csrfToken:string|null}){
  const request=usePlatformRequest(csrfToken);
  const [settings,setSettings]=useState<Settings|null>(null);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [busy,setBusy]=useState(false);
  useEffect(()=>{void request<{data:Settings}>("/platform-console/settings").then(r=>setSettings(r.data))
    .catch(e=>setError(e instanceof Error?e.message:"Settings unavailable."));},[request]);
  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!settings||busy)return;
    const form=new FormData(event.currentTarget);
    setBusy(true);setError("");setSuccess("");
    try{
      const result=await request<{data:Settings}>("/platform-console/settings","PATCH",{
        companyRegistrationOpen:settings.companyRegistrationOpen,
        supportEmail:settings.supportEmail?.trim()||null,
        announcement:settings.announcement?.trim()||null,
        reason:String(form.get("reason")??"").trim(),
      });
      setSettings(result.data);setSuccess("Platform settings saved and audited.");
      event.currentTarget.reset();
    }catch(e){setError(e instanceof Error?e.message:"Settings could not be saved.");}
    finally{setBusy(false);}
  }
  return <div className="platform-section"><Notice error={error} success={success}/>
    {!settings?<Empty>Loading system settings…</Empty>:<div className="platform-grid-two platform-settings-layout">
      <section className="platform-panel">
        <div className="platform-panel-heading"><div><h2>Platform configuration</h2>
          <p>Global settings; not company-specific master data</p></div></div>
        <form className="platform-settings-form" onSubmit={e=>void save(e)}>
          <label className="platform-settings-toggle">
            <input type="checkbox" checked={settings.companyRegistrationOpen} onChange={e=>
              setSettings({...settings,companyRegistrationOpen:e.currentTarget.checked})}/>
            <span><strong>Allow new company registration</strong>
              <small>When disabled, POST /api/auth/register rejects new workspaces. Existing accounts can still sign in.</small></span>
          </label>
          <label>Platform support email<input type="email" maxLength={191}
            value={settings.supportEmail??""} placeholder="support@example.com" onChange={e=>
              setSettings({...settings,supportEmail:e.currentTarget.value})}/></label>
          <label>Internal operator notice<textarea maxLength={500} rows={4}
            value={settings.announcement??""} onChange={e=>
              setSettings({...settings,announcement:e.currentTarget.value})}
            placeholder="Notes for platform operators; not shown to tenants"/></label>
          <label>Change reason (required)<textarea name="reason" required minLength={8} maxLength={1000}
            placeholder="Describe the reason for changing global settings"/></label>
          <div className="platform-form-footer">
            <span>Last updated: {dateTime(settings.updatedAt)}</span>
            <button type="submit" disabled={busy}>{busy?"Saving…":"Save settings"}</button>
          </div>
        </form>
      </section>
      <div className="platform-settings-aside">
        <section className="platform-panel"><div className="platform-panel-heading"><h2>Security boundaries</h2></div>
          <div className="platform-guideline"><strong>Platform-only administration</strong>
            <p>Only pre-approved platform accounts can access this console. Company roles cannot grant these permissions.</p></div>
          <div className="platform-guideline"><strong>Tenant ownership</strong>
            <p>Each company manages its own users, custom roles, permissions and asset data in its separate workspace.</p></div>
          <div className="platform-guideline"><strong>Paddle payment authority</strong>
            <p>Payment status is reconciled from verified provider events. Live payment mode remains separately controlled.</p></div>
        </section>
        <section className="platform-panel"><div className="platform-panel-heading"><h2>System status</h2></div>
          <div className="platform-health-row"><span>Company onboarding</span>
            <strong>{settings.companyRegistrationOpen?"Open":"Closed"}</strong></div>
          <div className="platform-health-row"><span>Configuration scope</span><strong>Global</strong></div>
          <p className="platform-hint">Security-critical changes require an audit reason and a valid session CSRF token.</p>
        </section>
      </div>
    </div>}
  </div>;
}
