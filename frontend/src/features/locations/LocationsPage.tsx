import { useCallback, useEffect, useState, type FormEvent } from "react";
import ThemeSelect from "../../components/ThemeSelect";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api").replace(/\/$/, "");

interface LocationItem {
  id: string;
  name: string;
  code: string;
  type: string;
  address: string | null;
  parentId: string | null;
  isActive: boolean;
}

interface LocationsPageProps {
  tenantId: string | null;
  csrfToken: string | null;
  permissions: string[];
  allLocationsAccess: boolean;
  manageableLocationIds: string[];
}

function LocationsPage({
  tenantId,
  csrfToken,
  permissions,
  allLocationsAccess,
  manageableLocationIds,
}: LocationsPageProps) {
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editingLocation, setEditingLocation] = useState<LocationItem | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState("");
  const [success, setSuccess] = useState("");

  const canRead = permissions.includes("location.read");
  const canManage = permissions.includes("location.manage");
  const parentChoices = locations.filter((location) =>
    location.isActive && location.id !== editingLocation?.id &&
    (allLocationsAccess || manageableLocationIds.includes(location.id)),
  );
  const parentNames = new Map(locations.map((location) => [location.id, location.name]));

  const loadLocations = useCallback(async (signal?: AbortSignal) => {
    if (!tenantId) {
      setLocations([]);
      setError("Select a workspace to view locations.");
      setLoading(false);
      return;
    }
    if (!canRead) {
      setLocations([]);
      setError("Your role does not have permission to view locations.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (includeInactive && canManage) params.set("includeInactive", "true");
      const encodedParams = params.toString();
      const query = encodedParams ? "?" + encodedParams : "";
      const response = await fetch(apiBaseUrl + "/locations" + query, {
        credentials: "include",
        headers: { "X-Tenant-Id": tenantId },
        signal,
      });
      const payload = await response.json().catch(() => ({})) as {
        data?: LocationItem[];
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(payload.error?.message ?? "Could not load locations.");
      setLocations(payload.data ?? []);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : "Could not load locations.");
      setLocations([]);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [tenantId, canRead, search, includeInactive, canManage]);

  useEffect(() => {
    const controller = new AbortController();
    void loadLocations(controller.signal);
    return () => controller.abort();
  }, [loadLocations]);

  async function createLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId || saving) return;
    if (!csrfToken) {
      setCreateError("Your security token is missing. Sign in again and retry.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    const body: Record<string, string | boolean | null> = {
      name: String(formData.get("name") ?? "").trim(),
      code: String(formData.get("code") ?? "").trim(),
      type: String(formData.get("type") ?? "BRANCH").trim(),
    };
    const address = String(formData.get("address") ?? "").trim();
    const parentId = String(formData.get("parentId") ?? "").trim();
    if (editingLocation) {
      body.address = address || null;
      body.parentId = parentId || null;
      body.isActive = formData.get("isActive") === "on";
    } else {
      if (address) body.address = address;
      if (parentId) body.parentId = parentId;
    }

    setSaving(true);
    setCreateError("");
    setSuccess("");
    try {
      const response = await fetch(apiBaseUrl + "/locations" + (editingLocation ? "/" + encodeURIComponent(editingLocation.id) : ""), {
        method: editingLocation ? "PATCH" : "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-Id": tenantId,
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({})) as {
        data?: LocationItem;
        error?: { message?: string };
      };
      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "Could not create the location.");
      }

      setShowCreate(false);
      setEditingLocation(null);
      setSuccess(editingLocation ? "Location updated successfully." : "Location created successfully.");
      await loadLocations();
    } catch (saveError) {
      setCreateError(saveError instanceof Error ? saveError.message : "Could not create the location.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="asset-register-page locations-page">
      <div className="asset-page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> ORGANIZATION STRUCTURE</div>
          <h1 className="asset-page-title">Locations</h1>
          <p>Organize sites, offices and branches. Location scopes determine which inventory a member can see.</p>
        </div>
        {canManage && <button className="primary-button" type="button" onClick={() => { setEditingLocation(null); setShowCreate(true); setCreateError(""); }}>Add location <span>＋</span></button>}
      </div>

      <div className="asset-register-toolbar">
        <form className="asset-search-form" onSubmit={(event) => event.preventDefault()}>
          <span className="search-symbol" aria-hidden="true">⌕</span>
          <label className="sr-only" htmlFor="locationSearch">Search locations</label>
          <input id="locationSearch" value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder="Search by location name or code" />
          <button type="button" onClick={() => void loadLocations()}>Refresh</button>
        </form>
        <span className="module-count">{locations.length} LOCATIONS</span>
        {canManage && <label><input type="checkbox" checked={includeInactive} onChange={event => setIncludeInactive(event.target.checked)}/> Include inactive</label>}
      </div>

      {success && <div className="asset-success" role="status">{success}</div>}
      {error && <div className="asset-inline-error" role="alert">{error}</div>}

      <div className="asset-table-wrap">
        <table className="asset-table locations-table">
          <thead><tr><th>Location</th><th>Code</th><th>Type</th><th>Parent location</th><th>Address</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="asset-table-message"><span className="table-loader" /> Loading locations…</td></tr>
            ) : locations.length === 0 ? (
              <tr><td colSpan={7} className="asset-table-message"><span className="empty-icon">⌂</span><strong>No locations found</strong><span>Set up your first site or branch to organize asset custody.</span>{canManage && <button className="text-button" type="button" onClick={() => setShowCreate(true)}>Add a location ↗</button>}</td></tr>
            ) : locations.map((location) => (
              <tr key={location.id}>
                <td><strong className="location-name">{location.name}</strong></td>
                <td>{location.code}</td>
                <td><span className="module-tag">{location.type.replaceAll("_", " ")}</span></td>
                <td>{location.parentId ? parentNames.get(location.parentId) ?? "Parent location" : "—"}</td>
                <td>{location.address || "—"}</td>
                <td><span className={"asset-status-badge " + (location.isActive ? "available" : "retired")}>{location.isActive ? "Active" : "Inactive"}</span></td>
                <td>{canManage && (allLocationsAccess || manageableLocationIds.includes(location.id)) &&
                  <button className="row-open-button" type="button" aria-label={"Edit " + location.name}
                    onClick={() => { setEditingLocation(location); setCreateError(""); setShowCreate(true); }}>Edit</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="asset-table-footer"><span>Location access is applied separately from tenant membership.</span><span>Maximum 500 active locations shown</span></div>

      {showCreate && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setShowCreate(false); setEditingLocation(null); } }}>
          <section className="asset-modal" role="dialog" aria-modal="true" aria-labelledby="locationCreateTitle">
            <div className="asset-modal-heading"><div><span className="module-tag">ORGANIZATION SETUP</span><h2 id="locationCreateTitle">{editingLocation ? "Edit location" : "Add a location"}</h2><p>Create a site, branch, department or room in this workspace.</p></div><button type="button" className="modal-close" aria-label="Close form" onClick={() => { setShowCreate(false); setEditingLocation(null); }}>×</button></div>
            <form className="asset-create-form" key={editingLocation?.id ?? "new"} onSubmit={(event) => void createLocation(event)}>
              <label htmlFor="locationName">Location name <span>*</span></label>
              <input id="locationName" name="name" minLength={2} maxLength={191} required defaultValue={editingLocation?.name ?? ""} placeholder="e.g. Colombo Head Office" />
              <div className="asset-form-two-col">
                <div><label htmlFor="locationCode">Location code <span>*</span></label><input id="locationCode" name="code" maxLength={100} pattern="[a-zA-Z0-9](?:[a-zA-Z0-9._]|-|/)*" required defaultValue={editingLocation?.code ?? ""} placeholder="e.g. CMB-HQ" /></div>
                <div><label htmlFor="locationType">Location type <span>*</span></label><ThemeSelect label="Location type" name="type" defaultValue={editingLocation?.type ?? "BRANCH"} required options={[{value:"HEAD_OFFICE",label:"Head office"},{value:"REGION",label:"Region"},{value:"BRANCH",label:"Branch"},{value:"DEPARTMENT",label:"Department"},{value:"ROOM",label:"Room"},{value:"WAREHOUSE",label:"Warehouse"}]}/></div>
              </div>
              <label htmlFor="parentId">Parent location</label>
              <ThemeSelect label="Parent location" name="parentId" defaultValue={editingLocation?.parentId ?? ""} required={!allLocationsAccess && !editingLocation}
                options={[{value:"", label:"No parent (root location)"}, ...parentChoices.map(location => ({
                  value:location.id, label:location.name + " (" + location.code + ")",
                }))]}/>
              {!allLocationsAccess && parentChoices.length === 0 && <p className="asset-inline-hint">Your role can create locations only below a location you manage. Ask an administrator to grant a manageable location scope.</p>}
              <label htmlFor="locationAddress">Address / description</label>
              <textarea id="locationAddress" name="address" rows={3} maxLength={500} defaultValue={editingLocation?.address ?? ""} placeholder="Optional address" />
              {editingLocation && <label className="status-toggle"><input type="checkbox" role="switch" name="isActive" defaultChecked={editingLocation.isActive}/> Active location</label>}
              {editingLocation && <p className="asset-inline-hint">Archiving requires no active children, assets, active employees or member location grants. Historical records are preserved.</p>}
              {createError && <div className="asset-inline-error" role="alert">{createError}</div>}
              <div className="asset-modal-actions"><button className="plain-button" type="button" onClick={() => { setShowCreate(false); setEditingLocation(null); }}>Cancel</button><button className="primary-button" type="submit" disabled={saving || (!allLocationsAccess && parentChoices.length === 0)}>{saving ? "Saving…" : editingLocation ? "Save changes" : "Save location"} {!saving && <span>↗</span>}</button></div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}

export default LocationsPage;
