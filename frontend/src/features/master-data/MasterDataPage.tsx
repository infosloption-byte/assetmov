import { useCallback, useEffect, useState, type FormEvent } from "react";
import ThemeSelect from "../../components/ThemeSelect";
import VendorDirectory from "./VendorDirectory";
const api = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api").replace(/\/$/, "");
type Category = { id: string; name: string; code: string; description: string | null };
type Field = { key: string; label: string; type: "text"|"longText"|"number"|"date"|"boolean"|"singleSelect"|"multiSelect"; required: boolean; options?: string[] };
type AssetModel = { id: string; name: string; categoryId: string; code: string | null; fieldSchema: { version: number; fields: Field[] } | null };
type Props = { tenantId: string | null; csrfToken: string | null; permissions: string[] };
type MasterTab = "categories" | "models" | "suppliers" | "manufacturers";
const fieldTypes: Array<{ value: Field["type"]; label: string }> = [
  { value: "text", label: "Short text" }, { value: "longText", label: "Long text" },
  { value: "number", label: "Number" }, { value: "date", label: "Date" }, { value: "boolean", label: "Yes / No" },
  { value: "singleSelect", label: "Single choice" }, { value: "multiSelect", label: "Multiple choices" },
];
export default function MasterDataPage({ tenantId, csrfToken, permissions }: Props) {
  const [tab, setTab] = useState<MasterTab>("categories");
  const [categories, setCategories] = useState<Category[]>([]);
  const [models, setModels] = useState<AssetModel[]>([]);
  const [error, setError] = useState(""); const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<"category"|"model"|null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [editingModel, setEditingModel] = useState<AssetModel | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [fields, setFields] = useState<Field[]>([]);
  const canRead = permissions.includes("asset.read");
  const canManage = permissions.includes("tenant.settings.manage");
  const request = useCallback(async <T,>(path: string, method = "GET", body?: unknown): Promise<T> => {
    if (!tenantId) throw new Error("Select a company.");
    if (method !== "GET" && !csrfToken) throw new Error("Please sign in again.");
    const response = await fetch(api + path, { method, credentials: "include",
      headers: { "X-Tenant-Id": tenantId, ...(method !== "GET" ? { "X-CSRF-Token": csrfToken!, "Content-Type": "application/json" } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.json().catch(() => ({})) as T & { error?: { message?: string; code?: string } };
    if (!response.ok) throw new Error(result.error?.message ?? result.error?.code ?? "Request failed.");
    return result;
  }, [tenantId, csrfToken]);
  const reload = useCallback(async () => {
    if (!tenantId || !canRead) return;
    setLoading(true);
    try {
      const [a, b] = await Promise.all([request<{data:Category[]}>("/master-data/categories"), request<{data:AssetModel[]}>("/master-data/models")]);
      setCategories(a.data); setModels(b.data); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load master data."); }
    finally { setLoading(false); }
  }, [tenantId, canRead, request]);
  useEffect(() => { void reload(); }, [reload]);
  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(""); setSuccess("");
    try {
      await request("/master-data/categories" + (category ? "/" + category.id : ""), category ? "PATCH" : "POST", {
        name: String(form.get("name") ?? "").trim(), code: String(form.get("code") ?? "").trim(),
        description: String(form.get("description") ?? "").trim() || null,
      });
      setModal(null); setCategory(null); setSuccess(category ? "Category updated." : "Category created.");
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save category."); }
    finally { setBusy(false); }
  }
  async function saveModel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(""); setSuccess("");
    try {
      await request("/master-data/models" + (editingModel ? "/" + editingModel.id : ""), editingModel ? "PATCH" : "POST", {
        name: String(form.get("name") ?? "").trim(), code: String(form.get("code") ?? "").trim() || null,
        categoryId: selectedCategory,
        fields: fields.map(field => ({
          ...field, ...(field.type === "singleSelect" || field.type === "multiSelect"
            ? { options: field.options ?? [] } : { options: undefined }),
        })),
      });
      setModal(null); setFields([]); setEditingModel(null); setSuccess(editingModel ? "Asset model updated." : "Asset model created."); await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save model."); }
    finally { setBusy(false); }
  }
  function modifyField(index: number, changes: Partial<Field>) { setFields(previous => previous.map((field, i) => i === index ? { ...field, ...changes } : field)); }
  return <section className="asset-register-page master-data-page">
    <div className="asset-page-heading">
      <div><div className="eyebrow"><span className="eyebrow-line"/> COMPANY MASTER DATA</div>
        <h1 className="asset-page-title">Categories & master data</h1>
        <p>Manage classifications, asset models and business partners in one organized workspace.</p>
      </div>
      <button className="topbar-button ghost" type="button" onClick={() => void reload()}>Refresh ↻</button>
    </div>
    {error && <div className="theme-notice error" role="alert">{error}</div>}
    {success && <div className="theme-notice success" role="status">{success}</div>}
    {!canRead && <p>Asset read permission is required to view the catalogue.</p>}
    {canRead && <>
      <div className="master-tabs" role="tablist" aria-label="Company master data">
        {([
          ["categories", "Categories", categories.length],
          ["models", "Asset models", models.length],
          ["suppliers", "Suppliers", null],
          ["manufacturers", "Manufacturers", null],
        ] as Array<[MasterTab, string, number | null]>).map(([key, label, count]) =>
          <button key={key} id={"master-tab-" + key} type="button"
            role="tab" aria-selected={tab === key} aria-controls={"master-panel-" + key}
            className={"master-tab " + (tab === key ? "active" : "")}
            onClick={() => { setTab(key); setError(""); setSuccess(""); }}>
            <span>{label}</span>{count !== null && <small>{count}</small>}
          </button>)}
      </div>
      <div className="master-tab-panel" id={"master-panel-" + tab}
        role="tabpanel" aria-labelledby={"master-tab-" + tab} tabIndex={0}>
        {tab === "categories" && <>
          <div className="asset-register-toolbar master-section-heading"><div><h2>Asset categories</h2><p>Define the groups used to organize your asset models.</p></div>{canManage && <button className="primary-button" type="button" onClick={() => {setCategory(null);setModal("category");}}>Add category ＋</button>}</div>
      <div className="asset-table-wrap"><table className="asset-table"><thead><tr><th>Name</th><th>Code</th><th>Models</th><th>Actions</th></tr></thead>
        <tbody>{loading ? <tr><td colSpan={4}>Loading…</td></tr> : categories.length === 0 ? <tr><td colSpan={4}>No categories yet.</td></tr> :
          categories.map(item => <tr key={item.id}><td><strong>{item.name}</strong><div>{item.description}</div></td><td>{item.code}</td>
            <td>{models.filter(m => m.categoryId === item.id).length}</td>
            <td>{canManage && <button className="topbar-button ghost" type="button" onClick={() => { setCategory(item); setModal("category"); }}>Edit</button>}</td></tr>)}</tbody></table></div>
        </>}
        {tab === "models" && <>
          <div className="asset-register-toolbar master-section-heading"><div><h2>Asset models</h2><p>Set up reusable model definitions and custom attributes.</p></div>{canManage && <button className="primary-button" type="button" disabled={!categories.length} onClick={() => {setEditingModel(null);setSelectedCategory(categories[0]?.id ?? "");setFields([]);setModal("model");}}>Add model ＋</button>}</div>
      <div className="asset-table-wrap"><table className="asset-table"><thead><tr><th>Model</th><th>Category</th><th>Custom fields</th><th>Actions</th></tr></thead><tbody>
        {models.length === 0 ? <tr><td colSpan={4}>No models yet.</td></tr> :
          models.map(model => <tr key={model.id}><td><strong>{model.name}</strong><div>{model.code ?? "—"}</div></td>
            <td>{categories.find(c => c.id === model.categoryId)?.name ?? "—"}</td>
            <td>{model.fieldSchema?.fields?.map(field => field.label).join(", ") || "None"}</td>
            <td>{canManage && <button className="topbar-button ghost" type="button" onClick={() => {setEditingModel(model);setSelectedCategory(model.categoryId);setFields(model.fieldSchema?.fields ?? []);setModal("model");}}>Edit</button>}</td></tr>)}</tbody></table></div>
        </>}
        {(tab === "suppliers" || tab === "manufacturers") &&
          <VendorDirectory key={tab} kind={tab} tenantId={tenantId}
            csrfToken={csrfToken} permissions={permissions}/>}
      </div>
    </>}

    {modal === "category" && <div className="modal-backdrop"><section className="asset-modal" role="dialog" aria-modal="true" aria-labelledby="categoryTitle">
      <div className="asset-modal-heading"><h2 id="categoryTitle">{category ? "Edit category" : "New category"}</h2><button type="button" className="modal-close" onClick={() => setModal(null)}>×</button></div>
      <form className="asset-create-form" onSubmit={event => void saveCategory(event)}>
        <label>Name<input name="name" defaultValue={category?.name} required minLength={2} maxLength={191} placeholder="e.g. IT Equipment"/></label>
        <label>Code<input name="code" defaultValue={category?.code} required maxLength={100} placeholder="e.g. IT-EQUIP" pattern="(?:[a-zA-Z0-9_]|-)+" /></label>
        <label>Description<textarea name="description" defaultValue={category?.description ?? ""} placeholder="Optional category details" maxLength={3000}/></label>
        <div className="asset-modal-actions"><button type="button" className="plain-button" onClick={() => setModal(null)}>Cancel</button><button disabled={busy} className="primary-button" type="submit">Save category</button></div>
      </form></section></div>}
    {modal === "model" && <div className="modal-backdrop"><section className="asset-modal" role="dialog" aria-modal="true" aria-labelledby="modelTitle">
      <div className="asset-modal-heading"><h2 id="modelTitle">{editingModel ? "Edit asset model" : "New asset model"}</h2><button type="button" className="modal-close" onClick={() => setModal(null)}>×</button></div>
      <form className="asset-create-form" onSubmit={event => void saveModel(event)}>
        <label>Model name<input name="name" required minLength={2} maxLength={191} placeholder="e.g. Dell Latitude 7450" defaultValue={editingModel?.name ?? ""}/></label>
        <label>Model code<input name="code" maxLength={100} placeholder="e.g. LAT-7450" pattern="(?:[a-zA-Z0-9_]|-)+" defaultValue={editingModel?.code ?? ""}/></label>
        <label>Category</label><ThemeSelect label="Asset category" value={selectedCategory} onChange={setSelectedCategory}
          options={categories.map(c => ({ value: c.id, label: c.name }))}/>
        {editingModel && <p className="asset-inline-hint">For a model already used by assets, only its name and code may be changed. Existing custom-field schemas remain locked to protect recorded asset data.</p>}
        <div className="master-fields-heading"><strong>Custom fields</strong><button className="topbar-button ghost" type="button" onClick={() => setFields(p => [...p, { key: "", label: "", type: "text", required: false }])}>Add field ＋</button></div>
        {fields.map((field, index) => <div className="master-field-row" key={index}>
          <label>Field label<input required value={field.label} maxLength={120} onChange={e => modifyField(index, {label:e.target.value})}/></label>
          <label>Field key<input required value={field.key} pattern="[a-z][a-zA-Z0-9_]*" maxLength={64} onChange={e => modifyField(index, {key:e.target.value})}/></label>
          <label>Type</label><ThemeSelect label={"Type of " + (field.label || "field")} value={field.type} options={fieldTypes}
            onChange={value => modifyField(index, {type:value as Field["type"],options:undefined})}/>
          {(field.type === "singleSelect" || field.type === "multiSelect") && <label>Choices (comma separated)<input required value={(field.options ?? []).join(", ")} onChange={e => modifyField(index, { options: e.target.value.split(",").map(x => x.trim()).filter(Boolean) })}/></label>}
          <label className="master-field-check"><input type="checkbox" checked={field.required} onChange={e => modifyField(index,{required:e.target.checked})}/> Required</label>
          <button className="topbar-button ghost" type="button" onClick={() => setFields(p => p.filter((_,i) => i !== index))}>Remove</button>
        </div>)}
        <div className="asset-modal-actions"><button className="plain-button" type="button" onClick={() => setModal(null)}>Cancel</button><button className="primary-button" disabled={busy || !selectedCategory} type="submit">{editingModel ? "Save model" : "Create model"}</button></div>
      </form></section></div>}
  </section>;
}
