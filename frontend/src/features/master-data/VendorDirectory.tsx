import { useCallback, useEffect, useState, type FormEvent } from "react";

const api = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api").replace(/\/$/, "");

type VendorType = "suppliers" | "manufacturers";
type Vendor = {
  id: string; name: string; isActive: boolean;
  email?: string | null; phone?: string | null; address?: string | null;
};
type Props = { tenantId: string | null; csrfToken: string | null; permissions: string[] };

export default function VendorDirectory({ tenantId, csrfToken, permissions }: Props) {
  const [suppliers, setSuppliers] = useState<Vendor[]>([]);
  const [manufacturers, setManufacturers] = useState<Vendor[]>([]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [modal, setModal] = useState<VendorType | null>(null);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const canManage = permissions.includes("tenant.settings.manage");
  const canRead = permissions.includes("asset.read");
  const request = useCallback(async <T,>(path: string, method = "GET", body?: unknown): Promise<T> => {
    if (!tenantId) throw new Error("Select a company workspace.");
    if (method !== "GET" && !csrfToken) throw new Error("Sign in again to refresh the security token.");
    const response = await fetch(api + "/vendors/" + path, {
      method, credentials: "include",
      headers: { "X-Tenant-Id": tenantId,
        ...(method === "GET" ? {} : { "Content-Type": "application/json", "X-CSRF-Token": csrfToken! }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json().catch(() => ({})) as T & { error?: { message?: string } };
    if (!response.ok) throw new Error(result.error?.message ?? "Could not complete request.");
    return result;
  }, [tenantId, csrfToken]);

  const reload = useCallback(async () => {
    if (!tenantId || !canRead) { setSuppliers([]); setManufacturers([]); return; }
    setLoading(true);
    try {
      const query = includeInactive && canManage ? "?includeInactive=true" : "";
      const [s, m] = await Promise.all([
        request<{data:Vendor[]}>("suppliers" + query),
        request<{data:Vendor[]}>("manufacturers" + query),
      ]);
      setSuppliers(s.data); setManufacturers(m.data); setError("");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not load directory."); }
    finally { setLoading(false); }
  }, [tenantId, canRead, includeInactive, canManage, request]);

  useEffect(() => { void reload(); }, [reload]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal || saving) return;
    const form = new FormData(event.currentTarget);
    const payload: Record<string, string | boolean | null> = {
      name: String(form.get("name") ?? "").trim(),
    };
    if (modal === "suppliers") {
      payload.email = String(form.get("email") ?? "").trim() || null;
      payload.phone = String(form.get("phone") ?? "").trim() || null;
      payload.address = String(form.get("address") ?? "").trim() || null;
    }
    if (editing) payload.isActive = form.get("isActive") === "on";
    setSaving(true); setError(""); setMessage("");
    try {
      await request(modal + (editing ? "/" + encodeURIComponent(editing.id) : ""),
        editing ? "PATCH" : "POST", payload);
      setMessage((modal === "suppliers" ? "Supplier" : "Manufacturer") +
        (editing ? " updated." : " created."));
      setEditing(null); setModal(null);
      await reload();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save directory entry."); }
    finally { setSaving(false); }
  }

  const open = (kind: VendorType, selected: Vendor | null = null) => {
    setModal(kind); setEditing(selected); setError(""); setMessage("");
  };

  return <section className="asset-register-page" aria-label="Suppliers and manufacturers">
    <div className="asset-page-heading">
      <div><div className="eyebrow"><span className="eyebrow-line"/> TENANT MASTER DATA</div>
        <h2 className="asset-page-title">Suppliers & manufacturers</h2>
        <p>Maintain your company's purchasing partners. Inactive entries remain attached to historical assets.</p>
      </div>
      <button className="topbar-button ghost" type="button" onClick={() => void reload()}>Refresh</button>
    </div>
    {canManage && <label><input type="checkbox" checked={includeInactive} onChange={event => setIncludeInactive(event.target.checked)}/> Include inactive records</label>}
    {error && <div className="asset-inline-error" role="alert">{error}</div>}
    {message && <div className="asset-success" role="status">{message}</div>}
    {!canRead && <p>Asset read permission is required to view suppliers and manufacturers.</p>}
    {canRead && (["suppliers", "manufacturers"] as VendorType[]).map(kind =>
      <section key={kind}>
        <div className="asset-register-toolbar">
          <strong>{kind === "suppliers" ? "Suppliers" : "Manufacturers"}</strong>
          {canManage && <button className="primary-button" type="button" onClick={() => open(kind)}>Add {kind === "suppliers" ? "supplier" : "manufacturer"} ＋</button>}
        </div>
        <div className="asset-table-wrap"><table className="asset-table">
          <thead><tr><th>Name</th>{kind === "suppliers" && <><th>Email</th><th>Phone</th></>}
            <th>Status</th><th>Actions</th></tr></thead>
          <tbody>{loading ? <tr><td colSpan={kind === "suppliers" ? 5 : 3}>Loading…</td></tr> :
            (kind === "suppliers" ? suppliers : manufacturers).length === 0 ?
            <tr><td colSpan={kind === "suppliers" ? 5 : 3}>No records found.</td></tr> :
            (kind === "suppliers" ? suppliers : manufacturers).map(record => <tr key={record.id}>
              <td><strong>{record.name}</strong></td>
              {kind === "suppliers" && <><td>{record.email || "—"}</td><td>{record.phone || "—"}</td></>}
              <td>{record.isActive ? "Active" : "Inactive"}</td>
              <td>{canManage && <button className="topbar-button ghost" type="button" onClick={() => open(kind, record)}>Edit</button>}</td>
            </tr>)}
          </tbody></table></div>
      </section>)}
    {modal && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setModal(null); }}>
      <section className="asset-modal" role="dialog" aria-modal="true" aria-labelledby="vendorTitle">
        <div className="asset-modal-heading">
          <h2 id="vendorTitle">{editing ? "Edit" : "Add"} {modal === "suppliers" ? "supplier" : "manufacturer"}</h2>
          <button type="button" className="modal-close" aria-label="Close" onClick={() => setModal(null)}>×</button>
        </div>
        <form key={modal + (editing?.id ?? "new")} className="asset-create-form" onSubmit={event => void save(event)}>
          <label>Name<input name="name" required minLength={2} maxLength={191} defaultValue={editing?.name ?? ""}/></label>
          {modal === "suppliers" && <>
            <label>Email<input type="email" name="email" maxLength={191} defaultValue={editing?.email ?? ""}/></label>
            <label>Phone<input name="phone" maxLength={60} defaultValue={editing?.phone ?? ""}/></label>
            <label>Address<textarea name="address" rows={3} maxLength={2000} defaultValue={editing?.address ?? ""}/></label>
          </>}
          {editing && <label><input type="checkbox" name="isActive" defaultChecked={editing.isActive}/> Active</label>}
          <div className="asset-modal-actions">
            <button className="plain-button" type="button" onClick={() => setModal(null)}>Cancel</button>
            <button className="primary-button" disabled={saving} type="submit">{saving ? "Saving…" : "Save"}</button>
          </div>
        </form>
      </section></div>}
  </section>;
}
