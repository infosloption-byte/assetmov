import { useCallback, useEffect, useState, type FormEvent } from "react";
import ThemeSelect from "../../components/ThemeSelect";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api").replace(/\/$/, "");

interface LocationItem {
  id: string;
  name: string;
  code: string;
}

interface EmployeeItem {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  designation: string | null;
  employeeType: string | null;
  email: string | null;
  phone: string | null;
  homeLocationId: string | null;
  homeLocation: LocationItem | null;
  isActive: boolean;
  _count?: { assignedAssets: number };
}

interface EmployeePageProps {
  tenantId: string | null;
  csrfToken: string | null;
  permissions: string[];
  accessibleLocationIds: string[];
  manageableLocationIds: string[];
  allLocationsAccess: boolean;
}

interface ApiError {
  error?: { message?: string };
}

function apiError(payload: ApiError, fallback: string): string {
  return payload.error?.message ?? fallback;
}

function EmployeePage({
  tenantId,
  csrfToken,
  permissions,
  accessibleLocationIds,
  manageableLocationIds,
  allLocationsAccess,
}: EmployeePageProps) {
  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [locationsError, setLocationsError] = useState("");
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [success, setSuccess] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  const [editingEmployee, setEditingEmployee] = useState<EmployeeItem | null>(null);
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const canRead = permissions.includes("employee.read");
  const canManage = permissions.includes("employee.manage");
  const canReadLocations = permissions.includes("location.read");

  const visibleLocations = locations.filter((location) =>
    allLocationsAccess || accessibleLocationIds.includes(location.id),
  );
  const manageableLocations = visibleLocations.filter((location) =>
    allLocationsAccess || manageableLocationIds.includes(location.id),
  );

  const loadEmployees = useCallback(async (signal?: AbortSignal) => {
    if (!tenantId) {
      setEmployees([]);
      setLoading(false);
      setError("Select a workspace to view employees.");
      return;
    }
    if (!canRead) {
      setEmployees([]);
      setLoading(false);
      setError("Your role does not have permission to view employees.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "100" });
      if (search) params.set("q", search);
      if (showInactive && canManage) params.set("includeInactive", "true");
      const response = await fetch(apiBaseUrl + "/employees?" + params.toString(), {
        credentials: "include",
        headers: { "X-Tenant-Id": tenantId },
        signal,
      });
      const payload = await response.json().catch(() => ({})) as {
        data?: EmployeeItem[];
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(apiError(payload, "Could not load employees."));
      setEmployees(payload.data ?? []);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : "Could not load employees.");
      setEmployees([]);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [tenantId, canRead, search, showInactive, canManage]);

  useEffect(() => {
    const controller = new AbortController();
    void loadEmployees(controller.signal);
    return () => controller.abort();
  }, [loadEmployees]);

  useEffect(() => {
    if (!tenantId || !canReadLocations) {
      setLocations([]);
      setLocationsLoading(false);
      setLocationsError(canReadLocations ? "" : "Your role does not have permission to view locations.");
      return;
    }

    const selectedTenantId = tenantId;
    const controller = new AbortController();
    setLocationsLoading(true);
    async function loadLocationOptions() {
      try {
        const response = await fetch(apiBaseUrl + "/locations", {
          credentials: "include",
          headers: { "X-Tenant-Id": selectedTenantId },
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({})) as {
          data?: LocationItem[];
          error?: { message?: string };
        };
        if (!response.ok) throw new Error(apiError(payload, "Could not load locations."));
        setLocations(payload.data ?? []);
        setLocationsError("");
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setLocationsError(loadError instanceof Error ? loadError.message : "Could not load locations.");
      } finally {
        if (!controller.signal.aborted) setLocationsLoading(false);
      }
    }

    void loadLocationOptions();
    return () => controller.abort();
  }, [tenantId, canReadLocations]);

  async function createEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId || creating) return;
    if (!csrfToken) {
      setCreateError("Your security token is missing. Sign in again and retry.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    const body: Record<string, string> = {
      employeeCode: String(formData.get("employeeCode") ?? "").trim(),
      firstName: String(formData.get("firstName") ?? "").trim(),
      lastName: String(formData.get("lastName") ?? "").trim(),
    };
    for (const field of ["email", "phone", "homeLocationId", "designation", "employeeType"] as const) {
      const value = String(formData.get(field) ?? "").trim();
      if (value) body[field] = value;
    }

    setCreating(true);
    setCreateError("");
    setSuccess("");
    try {
      const response = await fetch(apiBaseUrl + "/employees", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-Id": tenantId,
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({})) as {
        data?: EmployeeItem;
        error?: { message?: string };
      };
      if (!response.ok || !payload.data) throw new Error(apiError(payload, "Could not add employee."));
      setShowCreate(false);
      setSuccess("Employee added successfully.");
      await loadEmployees();
    } catch (saveError) {
      setCreateError(saveError instanceof Error ? saveError.message : "Could not add employee.");
    } finally {
      setCreating(false);
    }
  }

  async function updateEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId || !editingEmployee || savingEdit) return;
    if (!csrfToken) {
      setEditError("Your security token is missing. Sign in again and retry.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    const body: Record<string, string | boolean> = {
      employeeCode: String(formData.get("employeeCode") ?? "").trim(),
      firstName: String(formData.get("firstName") ?? "").trim(),
      lastName: String(formData.get("lastName") ?? "").trim(),
    };
    for (const field of ["email", "phone", "homeLocationId", "designation", "employeeType"] as const) {
      const value = String(formData.get(field) ?? "").trim();
      if (value) body[field] = value;
    }

    body.isActive = formData.get("isActive") === "on";

    setSavingEdit(true);
    setEditError("");
    setSuccess("");
    try {
      const response = await fetch(apiBaseUrl + "/employees/" + encodeURIComponent(editingEmployee.id), {
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
        data?: EmployeeItem;
        error?: { message?: string };
      };
      if (!response.ok || !payload.data) throw new Error(apiError(payload, "Could not update employee."));
      setEditingEmployee(null);
      setSuccess("Employee details updated.");
      await loadEmployees();
    } catch (saveError) {
      setEditError(saveError instanceof Error ? saveError.message : "Could not update employee.");
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <section className="asset-register-page employee-page">
      <div className="asset-page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> PEOPLE & CUSTODY</div>
          <h1 className="asset-page-title">Employees</h1>
          <p>Maintain employee and custodian records, their home locations, and how many assets are currently assigned to them.</p>
        </div>
        {canManage && <button className="primary-button" type="button" onClick={() => { setCreateError(""); setShowCreate(true); }}>Add employee <span>＋</span></button>}
      </div>

      <div className="asset-register-toolbar">
        <form className="asset-search-form" onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); }}>
          <span className="search-symbol" aria-hidden="true">⌕</span>
          <label className="sr-only" htmlFor="employeeSearch">Search employees</label>
          <input id="employeeSearch" value={searchInput} onChange={(event) => setSearchInput(event.currentTarget.value)} placeholder="Search by employee code, name or email" />
          <button type="submit">Search</button>
        </form>
        <button className="topbar-button ghost" type="button" onClick={() => void loadEmployees()}>Refresh ↻</button>
        {canManage && <label><input type="checkbox" checked={showInactive} onChange={event => setShowInactive(event.target.checked)}/> Include inactive</label>}
      </div>

      {success && <div className="asset-success" role="status">{success}</div>}
      {error && <div className="asset-inline-error" role="alert">{error}</div>}
      {locationsError && canManage && <div className="asset-inline-hint" role="status">Location choices: {locationsError}</div>}

      <div className="asset-table-wrap">
        <table className="asset-table employees-table">
          <thead><tr><th>Employee</th><th>Contact</th><th>Home location</th><th>Assigned assets</th><th>Status</th><th><span className="sr-only">Edit employee</span></th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="asset-table-message"><span className="table-loader" /> Loading employees…</td></tr>
            ) : employees.length === 0 ? (
              <tr><td colSpan={6} className="asset-table-message"><span className="empty-icon">♙</span><strong>No employees found</strong><span>Add your employees and custodians before assigning equipment.</span>{canManage && <button className="text-button" type="button" onClick={() => setShowCreate(true)}>Add the first employee ↗</button>}</td></tr>
            ) : employees.map((employee) => (
              <tr key={employee.id}>
                <td><strong className="employee-name">{employee.firstName} {employee.lastName}</strong><span className="asset-number">{employee.employeeCode}</span><span className="asset-number">{[employee.designation, employee.employeeType].filter(Boolean).join(" · ")}</span></td>
                <td>{employee.email ?? "—"}<span className="asset-number">{employee.phone ?? ""}</span></td>
                <td>{employee.homeLocation ? <>{employee.homeLocation.name}<span className="asset-number">{employee.homeLocation.code}</span></> : "Not assigned"}</td>
                <td>{employee._count?.assignedAssets ?? 0}</td>
                <td><span className={"asset-status-badge " + (employee.isActive ? "available" : "retired")}>{employee.isActive ? "Active" : "Inactive"}</span></td>
                <td>{canManage && <button className="row-open-button" type="button" aria-label={"Edit " + employee.firstName + " " + employee.lastName} onClick={() => { setEditingEmployee(employee); setEditError(""); }}>✎</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="asset-table-footer"><span>Employee records are separate from login accounts.</span><span>Up to 100 employees per search</span></div>

      {showCreate && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCreate(false); }}>
          <section className="asset-modal" role="dialog" aria-modal="true" aria-labelledby="employeeCreateTitle">
            <div className="asset-modal-heading"><div><span className="module-tag">WORKFORCE DIRECTORY</span><h2 id="employeeCreateTitle">Add employee</h2><p>Employee records can act as asset custodians without needing application login access.</p></div><button type="button" className="modal-close" aria-label="Close form" onClick={() => setShowCreate(false)}>×</button></div>
            <form className="asset-create-form" onSubmit={(event) => void createEmployee(event)}>
              <label htmlFor="employeeCode">Employee code <span>*</span></label>
              <input id="employeeCode" name="employeeCode" required maxLength={100} placeholder="e.g. EMP-0124" />
              <div className="asset-form-two-col">
                <div><label htmlFor="employeeFirstName">First name <span>*</span></label><input id="employeeFirstName" name="firstName" required maxLength={100} placeholder="First name" /></div>
                <div><label htmlFor="employeeLastName">Last name <span>*</span></label><input id="employeeLastName" name="lastName" required maxLength={100} placeholder="Last name" /></div>
              </div>
              <div className="asset-form-two-col">
                <div><label htmlFor="employeeEmail">Email</label><input id="employeeEmail" name="email" type="email" maxLength={191} placeholder="Optional" /></div>
                <div><label htmlFor="employeePhone">Phone</label><input id="employeePhone" name="phone" maxLength={50} placeholder="Optional" /></div>
              </div>
              <div className="asset-form-two-col">
                <label>Designation<input name="designation" maxLength={100} placeholder="e.g. IT Officer"/></label>
                <label>Employee type<input name="employeeType" maxLength={100} placeholder="e.g. Permanent"/></label>
              </div>
              <label htmlFor="employeeHomeLocation">Home location {!allLocationsAccess && <span>*</span>}</label>
              <ThemeSelect label="Employee home location" name="homeLocationId" defaultValue={""} required={!allLocationsAccess} options={[{value:"",label:"No home location"}, ...manageableLocations.map(location => ({ value:location.id, label:location.name + " (" + location.code + ")" }))]}/>
              {!allLocationsAccess && manageableLocations.length === 0 && <p className="asset-inline-hint">You need a manageable location to add an employee. Ask an administrator to grant location access.</p>}
              {createError && <div className="asset-inline-error" role="alert">{createError}</div>}
              <div className="asset-modal-actions"><button className="plain-button" type="button" onClick={() => setShowCreate(false)}>Cancel</button><button className="primary-button" type="submit" disabled={creating || locationsLoading || (!allLocationsAccess && manageableLocations.length === 0)}>{creating ? "Saving…" : "Save employee"} {!creating && <span>↗</span>}</button></div>
            </form>
          </section>
        </div>
      )}

      {editingEmployee && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingEmployee(null); }}>
          <section className="asset-modal" role="dialog" aria-modal="true" aria-labelledby="employeeEditTitle">
            <div className="asset-modal-heading"><div><span className="module-tag">WORKFORCE DIRECTORY</span><h2 id="employeeEditTitle">Edit employee</h2><p>{editingEmployee.employeeCode}</p></div><button type="button" className="modal-close" aria-label="Close form" onClick={() => setEditingEmployee(null)}>×</button></div>
            <form className="asset-create-form" onSubmit={(event) => void updateEmployee(event)}>
              <label htmlFor="editEmployeeCode">Employee code <span>*</span></label>
              <input id="editEmployeeCode" name="employeeCode" required maxLength={100} defaultValue={editingEmployee.employeeCode} />
              <div className="asset-form-two-col">
                <div><label htmlFor="editEmployeeFirstName">First name <span>*</span></label><input id="editEmployeeFirstName" name="firstName" required maxLength={100} defaultValue={editingEmployee.firstName} /></div>
                <div><label htmlFor="editEmployeeLastName">Last name <span>*</span></label><input id="editEmployeeLastName" name="lastName" required maxLength={100} defaultValue={editingEmployee.lastName} /></div>
              </div>
              <div className="asset-form-two-col">
                <div><label htmlFor="editEmployeeEmail">Email</label><input id="editEmployeeEmail" name="email" type="email" maxLength={191} defaultValue={editingEmployee.email ?? ""} /></div>
                <div><label htmlFor="editEmployeePhone">Phone</label><input id="editEmployeePhone" name="phone" maxLength={50} defaultValue={editingEmployee.phone ?? ""} /></div>
              </div>
              <div className="asset-form-two-col">
                <label>Designation<input name="designation" maxLength={100} placeholder="e.g. IT Officer" placeholder="e.g. IT Officer" defaultValue={editingEmployee.designation ?? ""}/></label>
                <label>Employee type<input name="employeeType" maxLength={100} placeholder="e.g. Permanent" placeholder="e.g. Permanent" defaultValue={editingEmployee.employeeType ?? ""}/></label>
              </div>
              <label htmlFor="editEmployeeHomeLocation">Home location</label>
              <ThemeSelect label="Employee home location" name="homeLocationId" defaultValue={editingEmployee.homeLocationId ?? ""} required={!allLocationsAccess} options={[{value:"",label:"No home location"}, ...manageableLocations.map(location => ({ value:location.id, label:location.name + " (" + location.code + ")" }))]}/>
              <label className="status-toggle"><input type="checkbox" role="switch" name="isActive" defaultChecked={editingEmployee.isActive}/> Active employee</label>
              <p className="asset-inline-hint">Employees with assigned assets cannot be deactivated until custody is transferred or returned.</p>
              {editError && <div className="asset-inline-error" role="alert">{editError}</div>}
              <div className="asset-modal-actions"><button className="plain-button" type="button" onClick={() => setEditingEmployee(null)}>Cancel</button><button className="primary-button" type="submit" disabled={savingEdit || locationsLoading}>{savingEdit ? "Saving…" : "Save changes"} {!savingEdit && <span>↗</span>}</button></div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}

export default EmployeePage;
