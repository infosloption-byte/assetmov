import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import ThemeSelect from "../../components/ThemeSelect";
import AssetImportPanel from "./AssetImportPanel";
import AssetFilesPanel from "./AssetFilesPanel";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api").replace(/\/$/, "");

type AssetStatus = "DRAFT" | "AVAILABLE" | "ASSIGNED" | "IN_TRANSIT" | "IN_SERVICE" | "DAMAGED" | "DISPOSED" | "RETIRED";

interface LocationSummary {
  id: string;
  name: string;
  code: string;
  type?: string;
  parentId?: string | null;
}

type CustomField = { key: string; label: string; type: "text" | "longText" | "number" | "date" | "boolean" | "singleSelect" | "multiSelect"; required: boolean; options?: string[] };
type AssetModelOption = { id: string; name: string; categoryId: string; category?: {id:string;name:string}; fieldSchema: { version: number; fields: CustomField[] } | null };
type CustomValue = string | number | boolean | string[];

function collectFields(data: FormData, fields: CustomField[]): Record<string, CustomValue> {
  const result: Record<string, CustomValue> = {};
  for (const field of fields) {
    const name = "custom:" + field.key;
    const text = String(data.get(name) ?? "").trim();
    if (field.type === "boolean") { result[field.key] = data.has(name); continue; }
    if (field.type === "multiSelect") {
      const values = data.getAll(name).map(v => String(v));
      if (values.length) result[field.key] = values;
      continue;
    }
    if (text) result[field.key] = field.type === "number" ? Number(text) : text;
  }
  return result;
}

function CustomFieldInputs({ fields, values = {} }: { fields: CustomField[]; values?: Record<string, CustomValue> }) {
  return <div className="asset-custom-fields">
    {fields.length > 0 && <h3>Model-specific information</h3>}
    {fields.map(field => {
      const name = "custom:" + field.key;
      const value = values[field.key];
      if (field.type === "boolean") return <label className="master-field-check" key={field.key}>
        <input name={name} type="checkbox" defaultChecked={value === true}/> {field.label}
      </label>;
      if (field.type === "singleSelect") return <div key={field.key}>
        <label>{field.label}{field.required && " *"}</label>
        <ThemeSelect name={name} required={field.required} label={field.label} defaultValue={typeof value === "string" ? value : ""}
          options={[{value:"",label:"Choose an option"}, ...(field.options ?? []).map(option => ({value:option,label:option}))]}/>
      </div>;
      if (field.type === "multiSelect") return <div key={field.key}><label>{field.label}{field.required && " *"}</label>
        {(field.options ?? []).map(option => <label key={option} className="master-field-check">
          <input type="checkbox" name={name} value={option} defaultChecked={Array.isArray(value) && value.includes(option)}/> {option}
        </label>)}</div>;
      return <label key={field.key}>{field.label}{field.required && " *"}
        <input name={name} type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
          step={field.type === "number" ? "any" : undefined} maxLength={field.type === "text" ? 500 : 10000}
          required={field.required} defaultValue={typeof value === "string" || typeof value === "number" ? value : ""}/>
      </label>;
    })}
  </div>;
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
  accountCode?: string | null;
  purchaseOrderNumber?: string | null;
  currentLocationId: string | null;
  currentLocation: LocationSummary | null;
  assignedEmployeeId?: string | null;
  custodian?: { id: string; employeeCode: string; firstName: string; lastName: string } | null;
  model?: { id: string; name: string; category?: { name: string }; fieldSchema?: { version: number; fields: CustomField[] } | null } | null;
  customFields?: Record<string, CustomValue> | null;
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

interface AssetPageProps {
  tenantId: string | null;
  csrfToken: string | null;
  permissions: string[];
  allLocationsAccess: boolean;
  manageableLocationIds: string[];
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

function AssetRegisterPage({ tenantId, csrfToken, permissions, allLocationsAccess, manageableLocationIds }: AssetPageProps) {
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [locations, setLocations] = useState<LocationSummary[]>([]);
  const [models, setModels] = useState<AssetModelOption[]>([]);
  const [suppliers, setSuppliers] = useState<Array<{id:string;name:string}>>([]);
  const [manufacturers, setManufacturers] = useState<Array<{id:string;name:string}>>([]);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [modelError, setModelError] = useState("");
  const [loading, setLoading] = useState(true);
  const [locationsError, setLocationsError] = useState("");
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [warrantyBefore, setWarrantyBefore] = useState("");
  const [sortBy, setSortBy] = useState("inventoryNumber");
  const [sortOrder, setSortOrder] = useState("asc");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [autoInventoryNumber, setAutoInventoryNumber] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<AssetSummary | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [editingAsset, setEditingAsset] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [eligibleEmployees, setEligibleEmployees] = useState<Array<{ id: string; employeeCode: string; firstName: string; lastName: string }>>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [employeesError, setEmployeesError] = useState("");
  const [assignmentEmployeeId, setAssignmentEmployeeId] = useState("");
  const [assignmentNote, setAssignmentNote] = useState("");
  const [assignmentBusy, setAssignmentBusy] = useState(false);
  const [assignmentError, setAssignmentError] = useState("");
  const [assignmentSuccess, setAssignmentSuccess] = useState("");
  const [lifecycleAction, setLifecycleAction] = useState<"DAMAGE" | "RESTORE" | "DISPOSE" | "RETIRE" | "">("");
  const [lifecycleReason, setLifecycleReason] = useState("");
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleError, setLifecycleError] = useState("");
  const [bulkSelected, setBulkSelected] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [bulkEmployees, setBulkEmployees] = useState<Array<{id:string;firstName:string;lastName:string;employeeCode:string}>>([]);
  const [bulkEmployeeId, setBulkEmployeeId] = useState("");
  const [bulkNotes, setBulkNotes] = useState("");

  const canCreate = permissions.includes("asset.create");
  const canReadLocations = permissions.some(key => ["location.read","asset.read","asset.create","asset.assign"].includes(key));
  const canReadAssets = permissions.includes("asset.read");
  const selectedModel = models.find(item => item.id === selectedModelId);
  useEffect(() => {
    setSelectedModelId("");
    if (!tenantId || !canReadAssets) { setModels([]); return; }
    const controller = new AbortController();
    void fetch(apiBaseUrl + "/master-data/models", {
      credentials: "include", headers: { "X-Tenant-Id": tenantId }, signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error("Could not load asset models.");
      return response.json() as Promise<{ data: AssetModelOption[] }>;
    }).then(payload => { if (!controller.signal.aborted) { setModels(payload.data); setModelError(""); } })
      .catch(error => { if (!controller.signal.aborted) setModelError(error instanceof Error ? error.message : "Could not load models."); });
    return () => controller.abort();
  }, [tenantId, canReadAssets]);
  useEffect(() => {
    if (!tenantId || !canReadAssets) { setSuppliers([]); setManufacturers([]); return; }
    const controller = new AbortController();
    const load = async () => {
      try {
        const [a, b] = await Promise.all(["suppliers", "manufacturers"].map(kind =>
          fetch(apiBaseUrl + "/vendors/" + kind, {
            credentials: "include", headers: { "X-Tenant-Id": tenantId }, signal: controller.signal,
          }).then(async response => {
            if (!response.ok) throw new Error("Could not load supplier/manufacturer data.");
            return response.json() as Promise<{data:Array<{id:string;name:string}>}>;
          })));
        if (!controller.signal.aborted) { setSuppliers(a.data); setManufacturers(b.data); }
      } catch {
        if (!controller.signal.aborted) { setSuppliers([]); setManufacturers([]); }
      }
    };
    void load();
    return () => controller.abort();
  }, [tenantId, canReadAssets]);
  const canEditFinancial = permissions.includes("asset.financial.update");
  const canAssignAssets = permissions.includes("asset.assign");
  const canReadEmployees = permissions.includes("employee.read");

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
      const params = new URLSearchParams({ page: String(page), pageSize: "20", sortBy, sortOrder });
      if (search) params.set("q", search);
      if (statusFilter) params.set("status", statusFilter);
      if (modelFilter) params.set("modelId", modelFilter);
      if (categoryFilter) params.set("categoryId", categoryFilter);
      if (locationFilter) params.set("locationId", locationFilter);
      if (warrantyBefore) params.set("warrantyBefore", warrantyBefore);

      const response = await fetch(apiBaseUrl + "/assets?" + params.toString(), {
        credentials: "include",
        headers: { "X-Tenant-Id": tenantId },
        signal,
      });
      const payload = await response.json().catch(() => ({})) as {
        data?: AssetSummary[];
        pagination?: { total: number; pageCount: number };
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(payload.error?.message ?? "Could not load the asset register.");

      setAssets(payload.data ?? []);
      setTotal(payload.pagination?.total ?? 0);
      setPageCount(Math.max(1, payload.pagination?.pageCount ?? 1));
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : "Could not load the asset register.");
      setAssets([]);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [tenantId, search, statusFilter, modelFilter, categoryFilter, locationFilter, warrantyBefore, sortBy, sortOrder, page]);

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

    const selectedTenantId = tenantId;
    const controller = new AbortController();
    async function loadLocations() {
      try {
        const response = await fetch(apiBaseUrl + "/workspace/location-options", {
          credentials: "include",
          headers: { "X-Tenant-Id": selectedTenantId },
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
    setLifecycleAction(""); setLifecycleReason(""); setLifecycleError("");
    setEditingAsset(false);
    setEditError("");
    setAssignmentError("");
    setAssignmentSuccess("");
    setEmployeesError("");
    setEligibleEmployees([]);
    setAssignmentEmployeeId("");
    setAssignmentNote("");
    setSelectedAsset(null);

    try {
      const response = await fetch(apiBaseUrl + "/assets/" + encodeURIComponent(assetId), {
        credentials: "include",
        headers: { "X-Tenant-Id": tenantId },
      });
      const payload = await response.json().catch(() => ({})) as { data?: AssetSummary; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Could not load asset details.");
      const asset = payload.data;
      setSelectedAsset(asset);

      const canManageAssetLocation = allLocationsAccess ||
        Boolean(asset.currentLocationId && manageableLocationIds.includes(asset.currentLocationId));
      if (
        canAssignAssets &&
        canReadEmployees &&
        canManageAssetLocation &&
        asset.status === "AVAILABLE" &&
        asset.currentLocationId
      ) {
        setEmployeesLoading(true);
        try {
          const params = new URLSearchParams({
            locationId: asset.currentLocationId,
            page: "1",
            pageSize: "100",
          });
          const employeeResponse = await fetch(apiBaseUrl + "/employees?" + params.toString(), {
            credentials: "include",
            headers: { "X-Tenant-Id": tenantId },
          });
          const employeePayload = await employeeResponse.json().catch(() => ({})) as {
            data?: Array<{ id: string; employeeCode: string; firstName: string; lastName: string; isActive: boolean }>;
            error?: { message?: string };
          };
          if (!employeeResponse.ok) throw new Error(employeePayload.error?.message ?? "Could not load eligible custodians.");
          const options = (employeePayload.data ?? []).filter((employee) => employee.isActive);
          setEligibleEmployees(options);
          setAssignmentEmployeeId(options[0]?.id ?? "");
          setEmployeesError("");
        } catch (employeeLoadError) {
          setEmployeesError(employeeLoadError instanceof Error ? employeeLoadError.message : "Could not load eligible custodians.");
        } finally {
          setEmployeesLoading(false);
        }
      }
    } catch (detailLoadError) {
      setDetailError(detailLoadError instanceof Error ? detailLoadError.message : "Could not load asset details.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function assignSelectedAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId || !csrfToken || !selectedAsset || assignmentBusy || !assignmentEmployeeId) {
      if (!csrfToken) setAssignmentError("Your security token is missing. Sign in again and retry.");
      else if (!assignmentEmployeeId) setAssignmentError("Select an eligible employee before assigning this asset.");
      return;
    }

    setAssignmentBusy(true);
    setAssignmentError("");
    setAssignmentSuccess("");
    try {
      const response = await fetch(apiBaseUrl + "/assets/" + encodeURIComponent(selectedAsset.id) + "/assign", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-Id": tenantId,
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({
          employeeId: assignmentEmployeeId,
          notes: assignmentNote.trim() || undefined,
        }),
      });
      const payload = await response.json().catch(() => ({})) as { data?: AssetSummary; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Could not assign the asset.");
      const selectedId = selectedAsset.id;
      await loadAssets();
      await openAsset(selectedId);
      setAssignmentSuccess("Asset assigned successfully.");
    } catch (assignError) {
      setAssignmentError(assignError instanceof Error ? assignError.message : "Could not assign the asset.");
    } finally {
      setAssignmentBusy(false);
    }
  }

  async function unassignSelectedAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId || !csrfToken || !selectedAsset || assignmentBusy) {
      if (!csrfToken) setAssignmentError("Your security token is missing. Sign in again and retry.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    const notes = String(formData.get("returnNotes") ?? "").trim();
    setAssignmentBusy(true);
    setAssignmentError("");
    setAssignmentSuccess("");
    try {
      const response = await fetch(apiBaseUrl + "/assets/" + encodeURIComponent(selectedAsset.id) + "/unassign", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-Id": tenantId,
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ notes: notes || undefined }),
      });
      const payload = await response.json().catch(() => ({})) as { data?: AssetSummary; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Could not return this asset to stock.");
      const selectedId = selectedAsset.id;
      await loadAssets();
      await openAsset(selectedId);
      setAssignmentSuccess("Asset returned to available stock.");
    } catch (unassignError) {
      setAssignmentError(unassignError instanceof Error ? unassignError.message : "Could not return this asset to stock.");
    } finally {
      setAssignmentBusy(false);
    }
  }

  async function createAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId || saving) return;

    setSaving(true);
    setCreateError("");
    setSuccessMessage("");

    const formData = new FormData(event.currentTarget);
    const body: Record<string, unknown> = {
      inventoryNumber: autoInventoryNumber ? "" : String(formData.get("inventoryNumber") ?? "").trim(),
      title: String(formData.get("title") ?? "").trim(),
    };
    if (selectedModelId) {
      body.modelId = selectedModelId;
      body.customFields = collectFields(formData, selectedModel?.fieldSchema?.fields ?? []);
    }
    const optionalFields = ["assetNumber", "serialNumber", "currentLocationId", "notes", "supplierId", "manufacturerId"] as const;
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

  async function saveAssetEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId || !selectedAsset || editSaving) return;

    if (!csrfToken) {
      setEditError("Your security token is missing. Sign in again and retry.");
      return;
    }

    setEditSaving(true);
    setEditError("");
    const formData = new FormData(event.currentTarget);
    const body: Record<string, unknown> = {
      title: String(formData.get("title") ?? "").trim(),
    };

    if (selectedAsset.model) {
      body.customFields = collectFields(formData, selectedAsset.model.fieldSchema?.fields ?? []);
    }
    const optionalFields = ["assetNumber", "serialNumber", "description", "notes", "supplierId", "manufacturerId"] as const;
    for (const field of optionalFields) {
      const value = String(formData.get(field) ?? "").trim();
      if (value) body[field] = value;
    }

    if (canEditFinancial) {
      const financialTextFields = ["accountCode", "purchaseOrderNumber", "warrantyEnd"] as const;
      for (const field of financialTextFields) {
        const value = String(formData.get(field) ?? "").trim();
        if (value) body[field] = value;
      }

      const purchaseCostValue = String(formData.get("purchaseCost") ?? "").trim();
      if (purchaseCostValue) {
        const purchaseCost = Number(purchaseCostValue);
        if (!Number.isFinite(purchaseCost) || purchaseCost < 0) {
          setEditError("Enter a valid non-negative purchase cost.");
          setEditSaving(false);
          return;
        }
        body.purchaseCost = purchaseCost;
      }
    }

    try {
      const response = await fetch(apiBaseUrl + "/assets/" + encodeURIComponent(selectedAsset.id), {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-Id": tenantId,
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({})) as {
        data?: AssetSummary;
        error?: { message?: string };
      };
      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "Could not update this asset.");
      }

      setSelectedAsset({
        ...payload.data,
        transactions: selectedAsset.transactions,
        serviceRecords: selectedAsset.serviceRecords,
      });
      setEditingAsset(false);
      setSuccessMessage("Asset details updated.");
      await loadAssets();
    } catch (updateError) {
      setEditError(updateError instanceof Error ? updateError.message : "Could not update this asset.");
    } finally {
      setEditSaving(false);
    }
  }

  async function openBulkAssignment() {
    if (!tenantId || !canAssignAssets || !canReadEmployees) {
      setBulkError("Assignment requires asset and employee permissions."); return;
    }
    const selected = assets.filter(a => bulkSelected.includes(a.id) && a.status === "AVAILABLE");
    const locationId = selected[0]?.currentLocationId;
    if (!selected.length || !locationId || selected.some(a => a.currentLocationId !== locationId)) {
      setBulkError("Select available assets at one location for bulk assignment."); return;
    }
    setBulkOpen(true);setBulkError("");setBulkEmployeeId("");setBulkEmployees([]);
    try {
      const params = new URLSearchParams({locationId,page:"1",pageSize:"100"});
      const response = await fetch(apiBaseUrl + "/employees?" + params, {
        credentials:"include",headers:{"X-Tenant-Id":tenantId},
      });
      const payload = await response.json().catch(()=>({})) as {data?:typeof bulkEmployees;error?:{message?:string}};
      if (!response.ok) throw new Error(payload.error?.message ?? "Could not load employees.");
      setBulkEmployees(payload.data ?? []);
    } catch (error) { setBulkError(error instanceof Error ? error.message : "Employee lookup failed."); }
  }

  async function applyBulkAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId || !csrfToken || !bulkEmployeeId || bulkBusy) return;
    const ids = assets.filter(a => bulkSelected.includes(a.id) && a.status === "AVAILABLE").map(a => a.id);
    setBulkBusy(true);setBulkError("");
    try {
      const response = await fetch(apiBaseUrl + "/assets/bulk-assign", {
        method:"POST",credentials:"include",
        headers:{"X-Tenant-Id":tenantId,"X-CSRF-Token":csrfToken,"Content-Type":"application/json"},
        body:JSON.stringify({assetIds:ids,employeeId:bulkEmployeeId,notes:bulkNotes}),
      });
      const payload = await response.json().catch(()=>({})) as {data?:{count:number};error?:{message?:string}};
      if (!response.ok) throw new Error(payload.error?.message ?? "Bulk assignment failed.");
      setBulkOpen(false);setBulkSelected([]);setBulkNotes("");
      setSuccessMessage("Assigned " + (payload.data?.count ?? ids.length) + " assets.");
      await loadAssets();
    } catch (error) { setBulkError(error instanceof Error ? error.message : "Bulk assignment failed."); }
    finally { setBulkBusy(false); }
  }

  async function applyLifecycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId || !csrfToken || !selectedAsset || !lifecycleAction || lifecycleBusy) return;
    setLifecycleBusy(true);setLifecycleError("");
    try {
      const response = await fetch(apiBaseUrl + "/assets/" + encodeURIComponent(selectedAsset.id) + "/lifecycle", {
        method: "POST", credentials:"include",
        headers: { "Content-Type":"application/json","X-Tenant-Id":tenantId,"X-CSRF-Token":csrfToken },
        body: JSON.stringify({ action:lifecycleAction, reason:lifecycleReason.trim() }),
      });
      const payload = await response.json().catch(()=>({})) as { data?: AssetSummary; error?: {message?:string} };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Lifecycle update failed.");
      const updatedAsset = payload.data;
      setSelectedAsset(current => current ? { ...current, ...updatedAsset } : current);
      setLifecycleAction("");setLifecycleReason("");
      setSuccessMessage("Asset lifecycle updated.");
      await loadAssets();
    } catch (error) { setLifecycleError(error instanceof Error ? error.message : "Lifecycle update failed."); }
    finally { setLifecycleBusy(false); }
  }

  return (
    <section className="asset-register-page">
      <div className="asset-page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> INVENTORY CONTROL</div>
          <h1 className="asset-page-title">Asset register</h1>
          <p>Find equipment, confirm its current location and open the full lifecycle history.</p>
        </div>
        <div className="asset-heading-actions">
          {canCreate && <button className="primary-button" type="button" onClick={() => { setShowCreate(true); setCreateError(""); }}>Register asset <span>＋</span></button>}
          {canCreate && permissions.includes("asset.import") && canReadLocations && csrfToken &&
            <button className="topbar-button ghost" type="button" onClick={() => setImportOpen(true)}>Import CSV</button>}
        </div>
      </div>

      <div className="asset-search-panel" aria-label="Asset search and filters">
        <div className="asset-search-actions">
          <form className="asset-search-form" onSubmit={(event) => {
            event.preventDefault(); setPage(1); setSearch(searchInput.trim());
          }}>
            <label className="sr-only" htmlFor="assetSearch">Search assets</label>
            <span className="search-symbol" aria-hidden="true">⌕</span>
            <input id="assetSearch" value={searchInput}
              onChange={event => setSearchInput(event.currentTarget.value)}
              placeholder="Search by inventory number, asset or serial number"/>
            <button type="submit">Search</button>
          </form>
          <button className="topbar-button ghost" type="button" onClick={() => {
            setSearchInput(""); setSearch(""); setStatusFilter(""); setCategoryFilter("");
            setModelFilter(""); setLocationFilter(""); setWarrantyBefore("");
            setSortBy("inventoryNumber"); setSortOrder("asc"); setPage(1);
          }}>Clear filters</button>
        </div>
        <div className="asset-register-filters">
          <label className="asset-filter-field"><span>Status</span>
            <ThemeSelect label="Filter by asset status" value={statusFilter}
              onChange={value => { setPage(1); setStatusFilter(value); }}
              options={[{value:"",label:"All statuses"},
                ...(["AVAILABLE","ASSIGNED","IN_TRANSIT","IN_SERVICE","DAMAGED","DISPOSED","RETIRED","DRAFT"] as AssetStatus[])
                  .map(status => ({value:status,label:statusLabel(status)}))]}/>
          </label>
          <label className="asset-filter-field"><span>Category</span>
            <ThemeSelect label="Filter by category" value={categoryFilter}
              onChange={value => {setPage(1);setCategoryFilter(value);setModelFilter("");}}
              options={[{value:"",label:"All categories"},
                ...Array.from(new Map(models.filter(m => m.category)
                  .map(m => [m.categoryId,{value:m.categoryId,label:m.category!.name}])).values())]}/>
          </label>
          <label className="asset-filter-field"><span>Model</span>
            <ThemeSelect label="Filter by asset model" value={modelFilter}
              onChange={value => {setPage(1);setModelFilter(value);}}
              options={[{value:"",label:"All models"},
                ...models.filter(m => !categoryFilter || m.categoryId === categoryFilter)
                  .map(m => ({value:m.id,label:m.name}))]}/>
          </label>
          {canReadLocations && <label className="asset-filter-field"><span>Location</span>
            <ThemeSelect label="Filter by location" value={locationFilter}
              onChange={value => {setPage(1);setLocationFilter(value);}}
              options={[{value:"",label:"All accessible locations"},
                ...locations.map(l => ({value:l.id,label:l.name}))]}/>
          </label>}
          <label className="asset-filter-field"><span>Warranty ends by</span>
            <input aria-label="Warranty ending by date" type="date" value={warrantyBefore}
              onChange={event => {setPage(1);setWarrantyBefore(event.target.value);}}/>
          </label>
          <label className="asset-filter-field"><span>Sort by</span>
            <ThemeSelect label="Sort asset register" value={sortBy}
              onChange={value => {setPage(1);setSortBy(value);}}
              options={[{value:"inventoryNumber",label:"Inventory number"},
                {value:"title",label:"Title"},{value:"createdAt",label:"Created date"},
                {value:"updatedAt",label:"Updated date"},{value:"warrantyEnd",label:"Warranty date"},
                {value:"status",label:"Status"}]}/>
          </label>
          <label className="asset-filter-field"><span>Direction</span>
            <ThemeSelect label="Sort direction" value={sortOrder}
              onChange={value => {setPage(1);setSortOrder(value);}}
              options={[{value:"asc",label:"Ascending"},{value:"desc",label:"Descending"}]}/>
          </label>
        </div>
      </div>

      {canAssignAssets && canReadEmployees && bulkSelected.length > 0 && <div className="asset-bulk-bar">
        <strong>{bulkSelected.length} selected for assignment</strong>
        <button className="primary-button" type="button" disabled={bulkSelected.length === 0} onClick={() => void openBulkAssignment()}>
          Assign selected assets
        </button>
        {bulkSelected.length > 0 && <button className="topbar-button ghost" type="button" onClick={() => setBulkSelected([])}>Clear selection</button>}
      </div>}
      {!bulkOpen && bulkError && <div role="alert" className="asset-inline-error">{bulkError}</div>}
      {successMessage && <div className="asset-success" role="status">{successMessage}</div>}
      {error && <div className="asset-inline-error" role="alert">{error}</div>}
      {locationsError && <div className="asset-inline-hint" role="status">Location choices could not be loaded: {locationsError}</div>}

      <div className="asset-table-wrap" tabIndex={0} aria-label="Scrollable data table">
        <table className="asset-table">
          <thead>
            <tr>{canAssignAssets && <th><span className="sr-only">Select for bulk assignment</span></th>}<th>Asset</th><th>Serial number</th><th>Category / model</th><th>Location</th><th>Purchase cost</th><th>Status</th><th><span className="sr-only">Open details</span></th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={canAssignAssets ? 8 : 7} className="asset-table-message"><span className="table-loader" /> Loading assets…</td></tr>
            ) : assets.length === 0 ? (
              <tr><td colSpan={canAssignAssets ? 8 : 7} className="asset-table-message"><span className="empty-icon">◫</span><strong>No assets found</strong><span>Try another search or register the first asset in this workspace.</span>{canCreate && <button className="text-button" type="button" onClick={() => setShowCreate(true)}>Register an asset ↗</button>}</td></tr>
            ) : assets.map((asset) => (
              <tr key={asset.id}>
                {canAssignAssets && <td><input type="checkbox" aria-label={"Select " + asset.inventoryNumber}
                  disabled={asset.status !== "AVAILABLE" || !asset.currentLocationId ||
                    (!allLocationsAccess && !manageableLocationIds.includes(asset.currentLocationId))}
                  checked={bulkSelected.includes(asset.id)}
                  onChange={event => setBulkSelected(previous => event.target.checked ?
                    [...previous.filter(id => id !== asset.id), asset.id] : previous.filter(id => id !== asset.id))}/></td>}
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

      <div className="asset-table-footer">
        <span>Showing {assets.length} of {total} matching assets · Page {page} of {pageCount}</span>
        <div style={{display:"flex",gap:"8px"}}>
          <button className="topbar-button ghost" type="button" disabled={page <= 1 || loading} onClick={() => setPage(p => Math.max(1,p-1))}>Previous</button>
          <button className="topbar-button ghost" type="button" disabled={page >= pageCount || loading} onClick={() => setPage(p => p+1)}>Next</button>
        </div>
      </div>

      {bulkOpen && <div className="modal-backdrop" role="presentation">
        <section className="asset-modal" role="dialog" aria-modal="true" aria-labelledby="bulkAssignTitle">
          <div className="asset-modal-heading"><h2 id="bulkAssignTitle">Bulk assign {bulkSelected.length} assets</h2>
            <button className="modal-close" aria-label="Close bulk assignment" type="button" onClick={()=>setBulkOpen(false)}>×</button></div>
          <p className="asset-inline-hint">All selected assets must be available at the employee's home location. The server assigns all or none.</p>
          <form className="asset-create-form" onSubmit={event=>void applyBulkAssignment(event)}>
            <label>Employee</label>
            <ThemeSelect label="Bulk assignment employee" value={bulkEmployeeId} onChange={setBulkEmployeeId} required
              options={[{value:"",label:"Choose employee"},...bulkEmployees.map(e=>({value:e.id,label:e.firstName+" "+e.lastName+" ("+e.employeeCode+")"}))]}/>
            <label>Handover note<textarea rows={3} maxLength={4000} value={bulkNotes} onChange={event=>setBulkNotes(event.target.value)}/></label>
            {bulkError && <div className="asset-inline-error" role="alert">{bulkError}</div>}
            <div className="asset-modal-actions"><button className="plain-button" type="button" onClick={()=>setBulkOpen(false)}>Cancel</button>
              <button className="primary-button" type="submit" disabled={bulkBusy || !bulkEmployeeId}>
                {bulkBusy ? "Assigning…" : "Confirm bulk assignment"}</button></div>
          </form>
        </section></div>}
      {importOpen && tenantId && csrfToken &&
        <AssetImportPanel tenantId={tenantId} csrfToken={csrfToken}
          allLocationsAccess={allLocationsAccess} locations={locations} onFinished={() => loadAssets()}
          onClose={() => setImportOpen(false)}/>}
      {showCreate && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCreate(false); }}>
          <section className="asset-modal" role="dialog" aria-modal="true" aria-labelledby="assetCreateTitle">
            <div className="asset-modal-heading"><div><span className="module-tag">NEW INVENTORY RECORD</span><h2 id="assetCreateTitle">Register an asset</h2><p>Start with its unique inventory number and basic details.</p></div><button type="button" className="modal-close" aria-label="Close form" onClick={() => setShowCreate(false)}>×</button></div>
            <form className="asset-create-form" onSubmit={(event) => void createAsset(event)}>
              <label className="checkbox-field"><input type="checkbox" checked={autoInventoryNumber} onChange={event => setAutoInventoryNumber(event.target.checked)}/>
                Generate inventory number automatically</label>
              <label htmlFor="inventoryNumber">Inventory number {!autoInventoryNumber && <span>*</span>}</label>
              <input id="inventoryNumber" name="inventoryNumber" autoComplete="off" maxLength={191}
                disabled={autoInventoryNumber} required={!autoInventoryNumber} placeholder={autoInventoryNumber ? "Automatically assigned when saved" : "e.g. AM-000124"}/>
              <label htmlFor="assetTitle">Asset name <span>*</span></label>
              <input id="assetTitle" name="title" maxLength={191} required placeholder="e.g. Lenovo ThinkPad T14" />
              <div className="asset-form-two-col">
                <div><label htmlFor="assetNumber">Asset / reference no.</label><input id="assetNumber" name="assetNumber" maxLength={191} placeholder="Optional" /></div>
                <div><label htmlFor="serialNumber">Serial number</label><input id="serialNumber" name="serialNumber" maxLength={191} placeholder="Optional" /></div>
              </div>
              <div className="asset-form-two-col">
                <div><label htmlFor="currentLocationId">Current location</label>
                  <ThemeSelect label="Asset location" name="currentLocationId" defaultValue="" required={!allLocationsAccess} options={[{value:"",label:"No location selected"}, ...locations.map(location => ({value:location.id,label:location.name + " (" + location.code + ")"}))]}/>
                </div>
                {canEditFinancial && <div><label htmlFor="purchaseCost">Purchase cost</label><input id="purchaseCost" name="purchaseCost" type="number" min="0" step="0.01" placeholder="Optional" /></div>}
              </div>
              <div className="asset-form-two-col">
                <div><label>Supplier</label><ThemeSelect label="Asset supplier" name="supplierId" defaultValue=""
                  options={[{value:"",label:"No supplier"},...suppliers.map(v=>({value:v.id,label:v.name}))]}/></div>
                <div><label>Manufacturer</label><ThemeSelect label="Asset manufacturer" name="manufacturerId" defaultValue=""
                  options={[{value:"",label:"No manufacturer"},...manufacturers.map(v=>({value:v.id,label:v.name}))]}/></div>
              </div>
              <label>Asset model</label>
              <ThemeSelect label="Asset model" value={selectedModelId} onChange={setSelectedModelId}
                options={[{value:"",label:"No model selected"}, ...models.map(model => ({value:model.id,label:model.name}))]}/>
              {modelError && <div className="asset-inline-hint">{modelError}</div>}
              <CustomFieldInputs key={selectedModelId} fields={selectedModel?.fieldSchema?.fields ?? []}/>
              <label htmlFor="assetNotes">Notes</label><textarea id="assetNotes" name="notes" rows={3} maxLength={20000} placeholder="Optional description or notes" />
              {createError && <div className="asset-inline-error" role="alert">{createError}</div>}
              {!allLocationsAccess && !locationsError && locations.length === 0 && <p className="asset-inline-hint">This role needs an accessible location to register an asset. Ask an administrator to grant location access or create a location.</p>}
              <div className="asset-modal-actions"><button className="plain-button" type="button" onClick={() => setShowCreate(false)}>Cancel</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save asset"} {!saving && <span>↗</span>}</button></div>
            </form>
          </section>
        </div>
      )}

      {(detailLoading || selectedAsset || detailError) && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setSelectedAsset(null); setDetailError(""); } }}>
          <section className="asset-modal asset-detail-modal" role="dialog" aria-modal="true" aria-labelledby="assetDetailTitle">
            <div className="asset-modal-heading">
              <div><span className="module-tag">ASSET PROFILE</span><h2 id="assetDetailTitle">{selectedAsset?.title ?? (detailLoading ? "Loading asset…" : "Asset details")}</h2>{selectedAsset && <p>{selectedAsset.inventoryNumber}</p>}</div>
              <div className="asset-modal-heading-actions">
                {selectedAsset && permissions.includes("asset.update") && !editingAsset && <button type="button" className="topbar-button ghost" onClick={() => { setEditingAsset(true); setEditError(""); }}>Edit details</button>}
                {selectedAsset && editingAsset && <button type="button" className="topbar-button ghost" onClick={() => { setEditingAsset(false); setEditError(""); }}>Cancel edit</button>}
                <button type="button" className="modal-close" aria-label="Close details" onClick={() => { setSelectedAsset(null); setDetailError(""); setEditingAsset(false); }}>×</button>
              </div>
            </div>
            {detailLoading && <div className="asset-table-message"><span className="table-loader" /> Loading asset history…</div>}
            {detailError && <div className="asset-inline-error" role="alert">{detailError}</div>}
            {selectedAsset && !editingAsset && (selectedAsset.model?.fieldSchema?.fields.length ?? 0) > 0 && <section className="asset-history-section" aria-label="Model custom field values">
              <h3>Model-specific information</h3>
              {selectedAsset.model?.fieldSchema?.fields.map(field => {
                const value = selectedAsset.customFields?.[field.key];
                return <div className="account-session" key={field.key}>
                  <strong>{field.label}</strong><span>{Array.isArray(value) ? value.join(", ")
                    : value === true ? "Yes" : value === false ? "No" : String(value ?? "—")}</span>
                </div>;
              })}
            </section>}
            {selectedAsset && !editingAsset && <AssetFilesPanel assetId={selectedAsset.id} tenantId={tenantId} csrfToken={csrfToken} canEdit={permissions.includes("asset.update") && (allLocationsAccess || Boolean(selectedAsset.currentLocationId && manageableLocationIds.includes(selectedAsset.currentLocationId)))}/> }
            {selectedAsset && (editingAsset ? (
              <form className="asset-edit-form" onSubmit={(event) => void saveAssetEdit(event)}>
                <label htmlFor="editAssetTitle">Asset name <span>*</span></label>
                <input id="editAssetTitle" name="title" required maxLength={191} placeholder="e.g. Dell Latitude 7450" defaultValue={selectedAsset.title} />
                <div className="asset-form-two-col">
                  <div><label htmlFor="editAssetNumber">Asset / reference no.</label><input id="editAssetNumber" name="assetNumber" maxLength={191} placeholder="Optional reference" defaultValue={selectedAsset.assetNumber ?? ""} /></div>
                  <div><label htmlFor="editSerialNumber">Serial number</label><input id="editSerialNumber" name="serialNumber" maxLength={191} placeholder="e.g. SN123456" defaultValue={selectedAsset.serialNumber ?? ""} /></div>
                </div>
                <div className="asset-form-two-col">
                  <div><label>Supplier</label><ThemeSelect label="Edit supplier" name="supplierId"
                    defaultValue={selectedAsset.supplier?.id ?? ""}
                    options={[{value:"",label:"Keep or no supplier"},...suppliers.map(v=>({value:v.id,label:v.name}))]}/></div>
                  <div><label>Manufacturer</label><ThemeSelect label="Edit manufacturer" name="manufacturerId"
                    defaultValue={selectedAsset.manufacturer?.id ?? ""}
                    options={[{value:"",label:"Keep or no manufacturer"},...manufacturers.map(v=>({value:v.id,label:v.name}))]}/></div>
                </div>
                {selectedAsset.model && <CustomFieldInputs fields={selectedAsset.model.fieldSchema?.fields ?? []}
                  values={selectedAsset.customFields ?? {}}/>}
                <label htmlFor="editDescription">Description</label>
                <textarea id="editDescription" name="description" rows={3} maxLength={20000} defaultValue={selectedAsset.description ?? ""} />
                <label htmlFor="editNotes">Notes</label>
                <textarea id="editNotes" name="notes" rows={3} maxLength={20000} defaultValue={selectedAsset.notes ?? ""} />
                {canEditFinancial && (
                  <>
                    <div className="asset-edit-section-label">Financial and warranty details</div>
                    <div className="asset-form-two-col">
                      <div><label htmlFor="editPurchaseCost">Purchase cost</label><input id="editPurchaseCost" name="purchaseCost" type="number" min="0" step="0.01" placeholder="0.00" defaultValue={selectedAsset.purchaseCost == null ? "" : String(selectedAsset.purchaseCost)} /></div>
                      <div><label htmlFor="editAccountCode">Account code</label><input id="editAccountCode" name="accountCode" maxLength={100} placeholder="Optional" defaultValue={selectedAsset.accountCode ?? ""} /></div>
                    </div>
                    <div className="asset-form-two-col">
                      <div><label htmlFor="editPurchaseOrder">Purchase order</label><input id="editPurchaseOrder" name="purchaseOrderNumber" maxLength={191} placeholder="e.g. PO-2026-001" defaultValue={selectedAsset.purchaseOrderNumber ?? ""} /></div>
                      <div><label htmlFor="editWarrantyEnd">Warranty end</label><input id="editWarrantyEnd" name="warrantyEnd" type="date" defaultValue={selectedAsset.warrantyEnd?.slice(0, 10) ?? ""} /></div>
                    </div>
                  </>
                )}
                {editError && <div className="asset-inline-error" role="alert">{editError}</div>}
                <div className="asset-modal-actions"><button className="plain-button" type="button" onClick={() => { setEditingAsset(false); setEditError(""); }}>Cancel</button><button className="primary-button" type="submit" disabled={editSaving}>{editSaving ? "Saving…" : "Save changes"} {!editSaving && <span>↗</span>}</button></div>
              </form>
            ) : selectedAsset ? (
                            <>
                <div className="asset-custody-panel">
                  <div className="asset-custody-summary">
                    <span className="asset-custody-icon">♙</span>
                    <div>
                      <span className="asset-custody-label">CURRENT CUSTODY</span>
                      <strong>{selectedAsset.custodian ? selectedAsset.custodian.firstName + " " + selectedAsset.custodian.lastName : "Available for assignment"}</strong>
                      <small>{selectedAsset.custodian ? selectedAsset.custodian.employeeCode : "No employee assigned"}</small>
                    </div>
                    <span className={"asset-status-badge " + selectedAsset.status.toLowerCase().replaceAll("_", "-")}>{statusLabel(selectedAsset.status)}</span>
                  </div>
                  {canAssignAssets && (allLocationsAccess || Boolean(selectedAsset.currentLocationId && manageableLocationIds.includes(selectedAsset.currentLocationId))) && selectedAsset.status === "AVAILABLE" && (
                    <form className="asset-custody-form" onSubmit={(event) => void assignSelectedAsset(event)}>
                      <div className="asset-custody-form-fields">
                        <div>
                          <label htmlFor="assignEmployee">Assign to employee</label>
                          <select id="assignEmployee" value={assignmentEmployeeId} onChange={(event) => setAssignmentEmployeeId(event.currentTarget.value)} disabled={employeesLoading || !canReadEmployees || eligibleEmployees.length === 0}>
                            <option value="">{employeesLoading ? "Loading eligible employees…" : !canReadEmployees ? "Employee read permission required" : "Select an employee"}</option>
                            {eligibleEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.firstName} {employee.lastName} ({employee.employeeCode})</option>)}
                          </select>
                        </div>
                        <div>
                          <label htmlFor="assignmentNote">Assignment note</label>
                          <input id="assignmentNote" value={assignmentNote} onChange={(event) => setAssignmentNote(event.currentTarget.value)} maxLength={4000} placeholder="Optional handover note" />
                        </div>
                      </div>
                      {employeesError && <div className="asset-inline-hint" role="status">{employeesError}</div>}
                      {canReadEmployees && !employeesLoading && !employeesError && eligibleEmployees.length === 0 && <div className="asset-inline-hint" role="status">No active employees are assigned to this location yet. Add an employee with the same home location first.</div>}
                      <button className="primary-button" type="submit" disabled={assignmentBusy || employeesLoading || !canReadEmployees || !assignmentEmployeeId}>{assignmentBusy ? "Assigning…" : "Assign asset"} {!assignmentBusy && <span>↗</span>}</button>
                    </form>
                  )}
                  {canAssignAssets && (allLocationsAccess || Boolean(selectedAsset.currentLocationId && manageableLocationIds.includes(selectedAsset.currentLocationId))) && selectedAsset.status === "ASSIGNED" && selectedAsset.assignedEmployeeId && (
                    <form className="asset-custody-form" onSubmit={(event) => void unassignSelectedAsset(event)}>
                      <label htmlFor="returnNotes">Return note</label>
                      <div className="asset-custody-return-row">
                        <input id="returnNotes" name="returnNotes" maxLength={4000} placeholder="Optional return/condition note" />
                        <button className="topbar-button ghost" type="submit" disabled={assignmentBusy}>{assignmentBusy ? "Returning…" : "Return to stock"}</button>
                      </div>
                    </form>
                  )}
                  {assignmentError && <div className="asset-inline-error" role="alert">{assignmentError}</div>}
                  {assignmentSuccess && <div className="asset-success" role="status">{assignmentSuccess}</div>}
                </div>
                {(permissions.includes("asset.update") || permissions.includes("asset.dispose")) &&
                  (allLocationsAccess || Boolean(selectedAsset.currentLocationId && manageableLocationIds.includes(selectedAsset.currentLocationId))) &&
                  <section className="asset-custody-panel" aria-label="Asset lifecycle controls">
                    <strong>Lifecycle actions</strong>
                    <p className="asset-inline-hint">Changes are permanent history events. Return assigned equipment before changing its condition.</p>
                    <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
                      {permissions.includes("asset.update") && selectedAsset.status === "AVAILABLE" &&
                        <button type="button" className="topbar-button ghost" onClick={()=>setLifecycleAction("DAMAGE")}>Mark damaged</button>}
                      {permissions.includes("asset.update") && selectedAsset.status === "DAMAGED" &&
                        <button type="button" className="topbar-button ghost" onClick={()=>setLifecycleAction("RESTORE")}>Restore to available</button>}
                      {permissions.includes("asset.dispose") && ["AVAILABLE","DAMAGED"].includes(selectedAsset.status) &&
                        <button type="button" className="topbar-button ghost" onClick={()=>setLifecycleAction("DISPOSE")}>Dispose asset</button>}
                      {permissions.includes("asset.dispose") && ["DRAFT","AVAILABLE","DAMAGED"].includes(selectedAsset.status) &&
                        <button type="button" className="topbar-button ghost" onClick={()=>setLifecycleAction("RETIRE")}>Retire asset</button>}
                    </div>
                    {lifecycleAction && <form className="asset-custody-form" onSubmit={event=>void applyLifecycle(event)}>
                      <label>Reason for {lifecycleAction.toLowerCase()} (required)
                        <textarea value={lifecycleReason} onChange={event=>setLifecycleReason(event.target.value)}
                          minLength={8} maxLength={4000} rows={3} required placeholder="Describe the condition and approval context"/>
                      </label>
                      <div style={{display:"flex",gap:"8px"}}>
                        <button className="plain-button" type="button" onClick={()=>setLifecycleAction("")}>Cancel</button>
                        <button className="primary-button" type="submit" disabled={lifecycleBusy || lifecycleReason.trim().length < 8}>
                          {lifecycleBusy ? "Saving…" : "Confirm lifecycle change"}
                        </button>
                      </div>
                    </form>}
                    {lifecycleError && <div role="alert" className="asset-inline-error">{lifecycleError}</div>}
                  </section>}
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
            ) : null)}
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
