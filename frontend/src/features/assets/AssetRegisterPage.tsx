import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api").replace(/\/$/, "");

type AssetStatus = "DRAFT" | "AVAILABLE" | "ASSIGNED" | "IN_TRANSIT" | "IN_SERVICE" | "DAMAGED" | "DISPOSED" | "RETIRED";

interface LocationSummary {
  id: string;
  name: string;
  code: string;
  type?: string;
  parentId?: string | null;
}

interface AssetSummary {
  id: string;
  inventoryNumber: string;
  assetNumber: string | null;
  serialNumber: string | null;
  title: string;
  description?: string | null;
  status: AssetStatus;
  purchaseCost: string | number | null;
  purchasedAt: string | null;
  warrantyEnd: string | null;
  currentLocationId: string | null;
  currentLocation: LocationSummary | null;
  model?: { id: string; name: string; category?: { name: string } } | null;
  manufacturer?: { id: string; name: string } | null;
  supplier?: { id: string; name: string } | null;
  notes?: string | null;
  transactions?: Array<{
    id: string;
    eventType: string;
    occurredAt: string;
    notes: string | null;
    fromLocation?: LocationSummary | null;
    toLocation?: LocationSummary | null;
  }>;
  serviceRecords?: Array<{
    id: string;
    serviceNumber: string;
    status: string;
    provider: string | null;
    cost: string | number | null;
    createdAt: string;
  }>;
}

interface ApiErrorPayload {
  error?: { code?: string; message?: string };
}

interface AssetPageProps {
  tenantId: string | null;
  csrfToken: string | null;
  permissions: string[];
}

function getErrorMessage(payload: ApiErrorPayload, fallback: string): string {
  return payload.error?.message ?? fallback;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function formatCost(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? numericValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : String(value);
}

function statusLabel(status: AssetStatus): string {
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function AssetRegisterPage({ tenantId, csrfToken, permissions }: AssetPageProps) {
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [locations, setLocations] = useState<LocationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationsError, setLocationsError] = useState("");
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<AssetSummary | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const canCreate = permissions.includes("asset.create");
  const canReadLocations = permissions.includes("location.read");

  const loadAssets = useCallback(async (signal?: AbortSignal) => {
    if (!tenantId) {
      setAssets([]);
      setLoading(false);
      setError("Select a workspace to view its assets.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "100" });
      if (search) params.set("q", search);
      if (statusFilter) params.set("status", statusFilter);

      const response = await fetch(apiBaseUrl + "/assets?" + params.toString(), {
        credentials: "include",
        headers: { "X-Tenant-Id": tenantId },
        signal,
      });
      const payload = await response.json().catch(() => ({})) as {
        data?: AssetSummary[];
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(payload.error?.message ?? "Could not load the asset register.");

      setAssets(payload.data ?? []);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : "Could not load the asset register.");
      setAssets([]);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [tenantId, search, statusFilter]);

  useEffect(() => {
    const controller = new AbortController();
    void loadAssets(controller.signal);
    return () => controller.abort();
  }, [loadAssets]);

  useEffect(() => {
    if (!tenantId || !canReadLocations) {
      setLocations([]);
      setLocationsError("");
      return;
    }

    const controller = new AbortController();
    async function loadLocations() {
      try {
        const response = await fetch(apiBaseUrl + "/locations", {
          credentials: "include",
          headers: { "X-Tenant-Id": tenantId },
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({})) as {
          data?: LocationSummary[];
          error?: { message?: string };
        };
        if (!response.ok) throw new Error(payload.error?.message ?? "Could not load locations.");
        setLocations(payload.data ?? []);
        setLocationsError("");
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setLocationsError(loadError instanceof Error ? loadError.message : "Could not load locations.");
      }
    }

    void loadLocations();
    return () => controller.abort();
  }, [tenantId, canReadLocations]);

  async function openAsset(assetId: string) {
    if (!tenantId) return;
    setDetailLoading(true);
    setDetailError("");
    setSelectedAsset(null);

    try {
      const response = await fetch(apiBaseUrl + "/assets/" + encodeURIComponent(assetId), {
        credentials: "include",
        headers: { "X-Tenant-Id": tenantId },
      });
      const payload = await response.json().catch(() => ({})) as { data?: AssetSummary; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Could not load asset details.");
      setSelectedAsset(payload.data);
    } catch (detailLoadError) {
      setDetailError(detailLoadError instanceof Error ? detailLoadError.message : "Could not load asset details.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function createAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId || saving) return;

    setSaving(true);
    setCreateError("");
    setSuccessMessage("");

    const formData = new FormData(event.currentTarget);
    const body: Record<string, string | number> = {
      inventoryNumber: String(formData.get("inventoryNumber") ?? "").trim(),
      title: String(formData.get("title") ?? "").trim(),
    };
    const optionalFields = ["assetNumber", "serialNumber", "currentLocationId", "notes"] as const;
    for (const field of optionalFields) {
      const value = String(formData.get(field) ?? "").trim();
      if (value) body[field] = value;
    }

    const purchaseCostValue = String(formData.get("purchaseCost") ?? "").trim();
    if (purchaseCostValue) {
      const purchaseCost = Number(purchaseCostValue);
      if (!Number.isFinite(purchaseCost) || purchaseCost < 0) {
        setCreateError("Enter a valid non-negative purchase cost.");
        setSaving(false);
        return;
      }
      body.purchaseCost = purchaseCost;
    }

    try {
      if (!csrfToken) throw new Error("Your security token is missing. Sign in again and retry.");

      const response = await fetch(apiBaseUrl + "/assets", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-Id": tenantId,
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({})) as { data?: AssetSummary; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Could not register the asset.");

      setShowCreate(false);
      setSuccessMessage("Asset registered successfully.");
      await loadAssets();
    } catch (createLoadError) {
      setCreateError(createLoadError instanceof Error ? createLoadError.message : "Could not register the asset.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="asset-register-page">
      <div className="asset-page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> INVENTORY CONTROL</div>
          <h1 className="asset-page-title">Asset register</h1>
          <p>Find equipment, confirm its current location and open the full lifecycle history.</p>
        </div>
        {canCreate && <button className="primary-button" type="button" onClick={() => { setShowCreate(true); setCreateError(""); }}>Register asset <span>＋</span></button>}
      </div>

      <div className="asset-register-toolbar">
        <form className="asset-search-form" onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); }}>
          <label className="sr-only" htmlFor="assetSearch">Search assets</label>
          <span className="search-symbol" aria-hidden="true">⌕</span>
          <input id="assetSearch" value={searchInput} onChange={(event) => setSearchInput(event.currentTarget.value)} placeholder="Search inventory no., title or serial no." />
          <button type="submit">Search</button>
        </form>
        <label className="asset-status-filter">
          <span>Status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.currentTarget.value)}>
            <option value="">All statuses</option>
            {(["AVAILABLE", "ASSIGNED", "IN_TRANSIT", "IN_SERVICE", "DAMAGED", "DISPOSED", "RETIRED", "DRAFT"] as AssetStatus[]).map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
          </select>
        </label>
      </div>

      {successMessage && <div className="asset-success" role="status">{successMessage}</div>}
      {error && <div className="asset-inline-error" role="alert">{error}</div>}
      {locationsError && <div className="asset-inline-hint" role="status">Location choices could not be loaded: {locationsError}</div>}

      <div className="asset-table-wrap">
        <table className="asset-table">
          <thead>
            <tr><th>Asset</th><th>Serial number</th><th>Category / model</th><th>Location</th><th>Purchase cost</th><th>Status</th><th><span className="sr-only">Open details</span></th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="asset-table-message"><span className="table-loader" /> Loading assets…</td></tr>
            ) : assets.length === 0 ? (
              <tr><td colSpan={7} className="asset-table-message"><span className="empty-icon">◫</span><strong>No assets found</strong><span>Try another search or register the first asset in this workspace.</span>{canCreate && <button className="text-button" type="button" onClick={() => setShowCreate(true)}>Register an asset ↗</button>}</td></tr>
            ) : assets.map((asset) => (
              <tr key={asset.id}>
                <td><button className="asset-name-button" type="button" onClick={() => void openAsset(asset.id)}>{asset.title}</button><span className="asset-number">{asset.inventoryNumber}</span></td>
                <td>{asset.serialNumber || "—"}</td>
                <td>{asset.model ? <>{asset.model.category?.name ?? "—"}<span className="asset-number">{asset.model.name}</span></> : "—"}</td>
                <td>{asset.currentLocation ? <>{asset.currentLocation.name}<span className="asset-number">{asset.currentLocation.code}</span></> : "Unassigned"}</td>
                <td>{formatCost(asset.purchaseCost)}</td>
                <td><span className={"asset-status-badge " + asset.status.toLowerCase().replaceAll("_", "-")}>{statusLabel(asset.status)}</span></td>
                <td><button className="row-open-button" type="button" aria-label={"Open " + asset.title} onClick={() => void openAsset(asset.id)}>↗</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="asset-table-footer"><span>Showing {assets.length} asset{assets.length === 1 ? "" : "s"} from this workspace</span><span>List currently capped at 100 records per query</span></div>

      {showCreate && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCreate(false); }}>
          <section className="asset-modal" role="dialog" aria-modal="true" aria-labelledby="assetCreateTitle">
            <div className="asset-modal-heading"><div><span className="module-tag">NEW INVENTORY RECORD</span><h2 id="assetCreateTitle">Register an asset</h2><p>Start with its unique inventory number and basic details.</p></div><button type="button" className="modal-close" aria-label="Close form" onClick={() => setShowCreate(false)}>×</button></div>
            <form className="asset-create-form" onSubmit={(event) => void createAsset(event)}>
              <label htmlFor="inventoryNumber">Inventory number <span>*</span></label>
              <input id="inventoryNumber" name="inventoryNumber" autoComplete="off" maxLength={191} required placeholder="e.g. AM-IT-000124" />
              <label htmlFor="assetTitle">Asset name <span>*</span></label>
              <input id="assetTitle" name="title" maxLength={191} required placeholder="e.g. Lenovo ThinkPad T14" />
              <div className="asset-form-two-col">
                <div><label htmlFor="assetNumber">Asset / reference no.</label><input id="assetNumber" name="assetNumber" maxLength={191} placeholder="Optional" /></div>
                <div><label htmlFor="serialNumber">Serial number</label><input id="serialNumber" name="serialNumber" maxLength={191} placeholder="Optional" /></div>
              </div>
              <div className="asset-form-two-col">
                <div><label htmlFor="currentLocationId">Current location</label>
                  <select id="currentLocationId" name="currentLocationId" defaultValue="">
                    <option value="">No location selected</option>
                    {locations.map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code})</option>)}
                  </select>
                </div>
                <div><label htmlFor="purchaseCost">Purchase cost</label><input id="purchaseCost" name="purchaseCost" type="number" min="0" step="0.01" placeholder="Optional" /></div>
              </div>
              <label htmlFor="assetNotes">Notes</label><textarea id="assetNotes" name="notes" rows={3} maxLength={20000} placeholder="Optional description or notes" />
              {createError && <div className="asset-inline-error" role="alert">{createError}</div>}
              {!locationsError && locations.length === 0 && <p className="asset-inline-hint">If your role is restricted to selected locations, choose a location to register this asset or ask an administrator to grant location access.</p>}
              <div className="asset-modal-actions"><button className="plain-button" type="button" onClick={() => setShowCreate(false)}>Cancel</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save asset"} {!saving && <span>↗</span>}</button></div>
            </form>
          </section>
        </div>
      )}

      {(detailLoading || selectedAsset || detailError) && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setSelectedAsset(null); setDetailError(""); } }}>
          <section className="asset-modal asset-detail-modal" role="dialog" aria-modal="true" aria-labelledby="assetDetailTitle">
            <div className="asset-modal-heading"><div><span className="module-tag">ASSET PROFILE</span><h2 id="assetDetailTitle">{selectedAsset?.title ?? (detailLoading ? "Loading asset…" : "Asset details")}</h2>{selectedAsset && <p>{selectedAsset.inventoryNumber}</p>}</div><button type="button" className="modal-close" aria-label="Close details" onClick={() => { setSelectedAsset(null); setDetailError(""); }}>×</button></div>
            {detailLoading && <div className="asset-table-message"><span className="table-loader" /> Loading asset history…</div>}
            {detailError && <div className="asset-inline-error" role="alert">{detailError}</div>}
            {selectedAsset && (
              <>
                <div className="asset-detail-grid">
                  <Detail label="Status"><span className={"asset-status-badge " + selectedAsset.status.toLowerCase().replaceAll("_", "-")}>{statusLabel(selectedAsset.status)}</span></Detail>
                  <Detail label="Serial number">{selectedAsset.serialNumber || "—"}</Detail>
                  <Detail label="Location">{selectedAsset.currentLocation?.name ?? "Unassigned"}</Detail>
                  <Detail label="Model">{selectedAsset.model?.name ?? "—"}</Detail>
                  <Detail label="Manufacturer">{selectedAsset.manufacturer?.name ?? "—"}</Detail>
                  <Detail label="Supplier">{selectedAsset.supplier?.name ?? "—"}</Detail>
                  <Detail label="Purchase cost">{formatCost(selectedAsset.purchaseCost)}</Detail>
                  <Detail label="Purchased on">{formatDate(selectedAsset.purchasedAt)}</Detail>
                  <Detail label="Warranty ends">{formatDate(selectedAsset.warrantyEnd)}</Detail>
                </div>
                {selectedAsset.notes && <p className="asset-detail-notes">{selectedAsset.notes}</p>}
                <div className="asset-history-section"><h3>Lifecycle history</h3>
                  {selectedAsset.transactions?.length ? (
                    <ol className="asset-history-list">
                      {selectedAsset.transactions.map((event) => <li key={event.id}><span className="history-dot" /><div><strong>{event.eventType.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())}</strong><p>{event.fromLocation?.name ? event.fromLocation.name + " → " : ""}{event.toLocation?.name ?? ""}{event.notes ? (event.toLocation?.name ? " · " : "") + event.notes : ""}</p><time>{formatDate(event.occurredAt)}</time></div></li>)}
                    </ol>
                  ) : <p className="asset-detail-empty">No lifecycle events were returned for this asset.</p>}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return <div className="asset-detail-cell"><span>{label}</span><strong>{children}</strong></div>;
}

export default AssetRegisterPage;
