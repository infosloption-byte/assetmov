import { useCallback, useEffect, useState, type FormEvent } from "react";
import ThemeSelect from "../../components/ThemeSelect";

const api = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api").replace(/\/$/, "");
type Company = {
  id: string; name: string; slug: string; status: string; timezone: string;
  locale: string; currency: string; dateFormat: "YYYY-MM-DD"|"DD/MM/YYYY"|"MM/DD/YYYY";
  fiscalYearStartMonth: number; inventoryPrefix: string;
};
type Props = { tenantId: string | null; csrfToken: string | null; permissions: string[] };

const fiscalOptions = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
].map((label,index)=>({value:String(index+1),label}));

export default function CompanyProfilePage({ tenantId, csrfToken, permissions }: Props) {
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [month, setMonth] = useState("1");
  const [format, setFormat] = useState<Company["dateFormat"]>("YYYY-MM-DD");
  const canManage = permissions.includes("tenant.settings.manage");

  const reload = useCallback(async () => {
    if (!tenantId || !canManage) {
      setCompany(null); setLoading(false); return;
    }
    setLoading(true); setError("");
    try {
      const response = await fetch(api + "/workspace/profile", {
        credentials:"include",headers:{"X-Tenant-Id":tenantId},
      });
      const data = await response.json().catch(()=>({})) as { data?:Company;error?:{message?:string} };
      if (!response.ok || !data.data) throw new Error(data.error?.message ?? "Cannot load company profile.");
      setCompany(data.data); setMonth(String(data.data.fiscalYearStartMonth)); setFormat(data.data.dateFormat);
    } catch (error) { setError(error instanceof Error ? error.message : "Cannot load company profile."); }
    finally { setLoading(false); }
  },[tenantId,canManage]);

  useEffect(()=>{void reload();},[reload]);

  async function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId || !csrfToken || saving) return;
    const fields = new FormData(event.currentTarget);
    const body = {
      name: String(fields.get("name") ?? "").trim(),
      timezone: String(fields.get("timezone") ?? "").trim(),
      locale: String(fields.get("locale") ?? "").trim(),
      currency: String(fields.get("currency") ?? "").trim().toUpperCase(),
      dateFormat: format,
      fiscalYearStartMonth: Number(month),
      inventoryPrefix: String(fields.get("inventoryPrefix") ?? "").trim().toUpperCase(),
    };
    setSaving(true);setError("");setMessage("");
    try {
      const response = await fetch(api + "/workspace/profile", {
        method:"PATCH",credentials:"include",
        headers:{"X-Tenant-Id":tenantId,"X-CSRF-Token":csrfToken,"Content-Type":"application/json"},
        body:JSON.stringify(body),
      });
      const result = await response.json().catch(()=>({})) as {data?:Company;error?:{message?:string}};
      if (!response.ok || !result.data) throw new Error(result.error?.message ?? "Could not save preferences.");
      setCompany(result.data);
      setMessage("Company profile and preferences saved.");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save preferences."); }
    finally { setSaving(false); }
  }

  return <section className="asset-register-page">
    <div className="asset-page-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> COMPANY SETUP</div>
      <h1 className="asset-page-title">Company profile & preferences</h1>
      <p>Manage your workspace's identity, reporting dates and default regional settings.</p></div>
      <button className="topbar-button ghost" type="button" onClick={()=>void reload()}>Refresh</button>
    </div>
    {!canManage && <p>You need company settings permission to view this screen.</p>}
    {loading && <p role="status">Loading company preferences…</p>}
    {error && <div className="asset-inline-error" role="alert">{error}</div>}
    {message && <div className="asset-success" role="status">{message}</div>}
    {company && canManage && <form key={company.id} className="asset-create-form" onSubmit={event=>void save(event)}>
      <label>Company name<input name="name" required minLength={2} maxLength={191} defaultValue={company.name}/></label>
      <label>Workspace identifier<input readOnly value={company.slug} aria-label="Workspace identifier"/></label>
      <p className="asset-inline-hint">The workspace identifier is immutable to avoid breaking tenant references.</p>
      <div className="asset-form-two-col">
        <label>Timezone (IANA identifier)
          <input name="timezone" required maxLength={64} defaultValue={company.timezone} placeholder="e.g. Asia/Colombo"/>
        </label>
        <label>Locale
          <input name="locale" required maxLength={24} defaultValue={company.locale} placeholder="e.g. en-US"/>
        </label>
      </div>
      <div className="asset-form-two-col">
        <label>Currency (ISO 4217)
          <input name="currency" required minLength={3} maxLength={3} defaultValue={company.currency}/>
        </label>
        <div><label>Date format</label>
          <ThemeSelect label="Company date format" value={format} onChange={value=>setFormat(value as Company["dateFormat"])}
            options={[{value:"YYYY-MM-DD",label:"YYYY-MM-DD"},{value:"DD/MM/YYYY",label:"DD/MM/YYYY"},
              {value:"MM/DD/YYYY",label:"MM/DD/YYYY"}]}/>
        </div>
      </div>
      <label>Automatic inventory number prefix<input name="inventoryPrefix" required minLength={2} maxLength={16}
        pattern="(?:[A-Za-z0-9_]|-){2,16}" defaultValue={company.inventoryPrefix}/></label>
      <p className="asset-inline-hint">New automatically numbered assets use this prefix. Existing inventory numbers never change.</p>
      <label>Fiscal year starts</label>
      <ThemeSelect label="Fiscal year start month" value={month} onChange={setMonth} options={fiscalOptions}/>
      <div className="asset-modal-actions"><button type="submit" className="primary-button" disabled={saving || !csrfToken}>
        {saving ? "Saving…" : "Save company settings"}</button></div>
    </form>}
  </section>;
}
