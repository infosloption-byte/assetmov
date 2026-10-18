import { useCallback, useEffect, useState, type FormEvent } from "react";

const api = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api").replace(/\/$/, "");
type Role = { id: string; key: string; name: string; description: string | null; isSystem: boolean; memberCount: number; permissionKeys: string[] };
type Permission = { key: string; description: string | null };
type Location = { id: string; name: string; code: string };
type Member = { id: string; allLocationsAccess: boolean; locationAssignments: Array<{ locationId: string; canManage: boolean }>; isActive: boolean; role: { id: string; name: string; key: string }; user: { id: string; email: string; fullName: string } };
type Usage = { activeUsers: number; maxActiveUsers: number | null };
type Props = { tenantId: string | null; csrfToken: string | null; permissions: string[]; currentUserId: string | null; isOwner: boolean; allLocationsAccess: boolean };

export default function CompanyAdminPage({ tenantId, csrfToken, permissions, currentUserId, isOwner, allLocationsAccess }: Props) {
  const [tab, setTab] = useState<"users" | "roles">("users");
  const [roles, setRoles] = useState<Role[]>([]);
  const [catalog, setCatalog] = useState<Permission[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [editingScope, setEditingScope] = useState<Member | null>(null);
  const [scopeAll, setScopeAll] = useState(false);
  const [scopeIds, setScopeIds] = useState<string[]>([]);
  const [usage, setUsage] = useState<Usage>({ activeUsers: 0, maxActiveUsers: null });
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [roleFormOpen, setRoleFormOpen] = useState(false);
  const [userFormOpen, setUserFormOpen] = useState(false);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const canRoles = permissions.includes("roles.manage");
  const canMembers = permissions.includes("members.manage");

  const call = useCallback(async <T,>(path: string, method = "GET", body?: unknown): Promise<T> => {
    if (!tenantId) throw new Error("Select a company workspace.");
    if (method !== "GET" && !csrfToken) throw new Error("Session security token is missing. Sign in again.");
    const response = await fetch(api + path, {
      method, credentials: "include",
      headers: {
        "X-Tenant-Id": tenantId,
        ...(method !== "GET" ? { "X-CSRF-Token": csrfToken!, "Content-Type": "application/json" } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json().catch(() => ({})) as T & { error?: { code?: string; message?: string } };
    if (!response.ok) throw new Error(result.error?.message ?? result.error?.code ?? "Request failed.");
    return result;
  }, [tenantId, csrfToken]);

  const reload = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const results = await Promise.all([
        canRoles ? call<{ data: Role[] }>("/roles") : Promise.resolve({ data: [] as Role[] }),
        canRoles ? call<{ data: Permission[] }>("/roles/permissions") : Promise.resolve({ data: [] as Permission[] }),
        canMembers ? call<{ data: Member[]; usage: Usage }>("/members") : Promise.resolve({ data: [] as Member[], usage: { activeUsers: 0, maxActiveUsers: null } }),
        canMembers && permissions.includes("location.read") ? call<{ data: Location[] }>("/locations") : Promise.resolve({ data: [] as Location[] }),
      ]);
      setRoles(results[0].data);
      setCatalog(results[1].data);
      setMembers(results[2].data);
      setUsage(results[2].usage);
      setLocations(results[3].data);
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load administration data."); }
    finally { setLoading(false); }
  }, [tenantId, canRoles, canMembers, call, permissions]);

  useEffect(() => { void reload(); }, [reload]);

  async function run(action: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try { await action(); setMessage(success); await reload(); return true; }
    catch (e) { setError(e instanceof Error ? e.message : "Action failed."); return false; }
    finally { setBusy(false); }
  }

  async function submitRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = {
      name: String(data.get("name") ?? "").trim(),
      description: String(data.get("description") ?? "").trim(),
      permissionKeys: selectedPermissions,
    };
    const ok = await run(
      () => selectedRole
        ? call("/roles/" + encodeURIComponent(selectedRole.id), "PATCH", payload)
        : call("/roles", "POST", { ...payload, key: String(data.get("key") ?? "").trim().toUpperCase() }),
      selectedRole ? "Role updated." : "Role created.",
    );
    if (ok) { setRoleFormOpen(false); setSelectedRole(null); }
  }

  async function submitUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const ok = await run(() => call("/members", "POST", {
      fullName: String(data.get("fullName") ?? "").trim(),
      email: String(data.get("email") ?? "").trim(),
      initialPassword: String(data.get("initialPassword") ?? ""),
      roleId: String(data.get("roleId") ?? ""),
      allLocationsAccess: data.get("allLocationsAccess") === "on",
    }), "Company user created.");
    if (ok) setUserFormOpen(false);
  }

  const assignableRoles = roles.filter((role) => isOwner || (!role.isSystem && !role.permissionKeys.some((key) => ["roles.manage", "members.manage", "tenant.settings.manage"].includes(key))));
  const availablePermissions = catalog.filter((item) => permissions.includes(item.key) && (isOwner || !["roles.manage", "members.manage", "tenant.settings.manage"].includes(item.key)));

  return <section className="asset-register-page">
    <div className="asset-page-heading">
      <div><div className="eyebrow"><span className="eyebrow-line" /> COMPANY SETTINGS</div><h1 className="asset-page-title">Users & roles</h1>
        <p>Manage company accounts and define exactly which actions each role can perform.</p></div>
      <button type="button" className="topbar-button ghost" onClick={() => void reload()}>Refresh ↻</button>
    </div>
    <div className="company-admin-tabs">
      {canMembers && <button className={tab === "users" ? "active" : ""} type="button" onClick={() => setTab("users")}>Users</button>}
      {canRoles && <button className={tab === "roles" ? "active" : ""} type="button" onClick={() => setTab("roles")}>Roles & permissions</button>}
    </div>
    {message && <div className="asset-success" role="status">{message}</div>}
    {error && <div className="asset-inline-error" role="alert">{error}</div>}
    {!tenantId && <p>Select a workspace to manage its users and roles.</p>}
    {!canMembers && !canRoles && <p>Your role does not allow user or role administration.</p>}
    {tab === "users" && canMembers && tenantId && <>
      <div className="asset-register-toolbar">
        <div><strong>Active users: {usage.activeUsers} / {usage.maxActiveUsers ?? "Unlimited"}</strong><p>Only active company memberships count against your plan.</p></div>
        <button className="primary-button" type="button" disabled={!canRoles || roles.length === 0} onClick={() => setUserFormOpen(true)}>Add user ＋</button>
      </div>
      <div className="asset-table-wrap"><table className="asset-table"><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Location scope</th><th>Actions</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={5}>Loading users…</td></tr> : members.length === 0 ? <tr><td colSpan={4}>No users found.</td></tr> : members.map(member => <tr key={member.id}>
          <td><strong>{member.user.fullName}</strong><div>{member.user.email}</div></td><td>
            {canRoles ? <select aria-label={"Role for " + member.user.fullName} value={member.role.id} disabled={busy || member.user.id === currentUserId} onChange={event => {
              const nextRole = event.currentTarget.value;
              if (window.confirm("Change this user's role?")) void run(() => call("/members/" + member.id + "/role", "PATCH", { roleId: nextRole }), "Role updated.");
            }}>
              {roles.map(role => <option key={role.id} value={role.id} disabled={!assignableRoles.some(item => item.id === role.id)}>{role.name}</option>)}
            </select> : member.role.name}
          </td><td>{member.isActive ? "Active" : "Inactive"}</td>
          <td><button type="button" className="topbar-button ghost" disabled={busy || member.user.id === currentUserId || (!allLocationsAccess && locations.length === 0)} onClick={() => {
            setEditingScope(member); setScopeAll(member.allLocationsAccess);
            setScopeIds(member.locationAssignments.map(item => item.locationId));
          }}>{member.allLocationsAccess ? "All locations" : member.locationAssignments.length + " locations"} · Edit</button></td>
          <td><button type="button" className="topbar-button ghost" disabled={busy || member.user.id === currentUserId} onClick={() => {
            if (window.confirm(member.isActive ? "Deactivate this user?" : "Activate this user?")) void run(() => call("/members/" + member.id + "/status", "PATCH", { isActive: !member.isActive, reason: "Company administrator changed membership status" }), "Member status updated.");
          }}>{member.isActive ? "Deactivate" : "Activate"}</button></td>
        </tr>)}
      </tbody></table></div>
    </>}
    {tab === "roles" && canRoles && tenantId && <>
      <div className="asset-register-toolbar"><span>{roles.length} COMPANY ROLES</span><button className="primary-button" type="button" onClick={() => { setSelectedRole(null); setSelectedPermissions([]); setRoleFormOpen(true); }}>Add role ＋</button></div>
      <div className="asset-table-wrap"><table className="asset-table"><thead><tr><th>Role</th><th>Permissions</th><th>Members</th><th>Actions</th></tr></thead><tbody>
        {roles.map(role => <tr key={role.id}><td><strong>{role.name}</strong><div>{role.key}</div></td><td>{role.permissionKeys.length} permissions</td><td>{role.memberCount}</td><td>{role.isSystem ? "System role" : <button type="button" className="topbar-button ghost" onClick={() => { setSelectedRole(role); setSelectedPermissions([...role.permissionKeys]); setRoleFormOpen(true); }}>Edit role</button>}</td></tr>)}
      </tbody></table></div>
    </>}
    {editingScope && <div className="modal-backdrop"><section className="asset-modal" role="dialog" aria-modal="true" aria-labelledby="scopeTitle">
      <div className="asset-modal-heading"><h2 id="scopeTitle">Location access: {editingScope.user.fullName}</h2><button className="modal-close" type="button" onClick={() => setEditingScope(null)}>×</button></div>
      <form className="asset-create-form" onSubmit={event => {
        event.preventDefault();
        void (async () => {
          const ok = await run(() => call("/members/" + editingScope.id + "/location-access", "PATCH", {
            allLocationsAccess: scopeAll, locationIds: scopeAll ? [] : scopeIds,
            reason: "Company administrator updated user location access",
          }), "Location access updated.");
          if (ok) setEditingScope(null);
        })();
      }}>
        {allLocationsAccess && <label><input type="checkbox" checked={scopeAll} onChange={event => setScopeAll(event.target.checked)} /> All locations</label>}
        {!scopeAll && <fieldset className="company-permissions"><legend>Accessible locations</legend>
          {locations.map(location => <label key={location.id}><input type="checkbox" checked={scopeIds.includes(location.id)} onChange={event => setScopeIds(previous => event.target.checked ? [...previous, location.id] : previous.filter(id => id !== location.id))} />{location.name} ({location.code})</label>)}
        </fieldset>}
        <p className="asset-inline-hint">Only locations you are allowed to manage may be granted. Child locations inherit access.</p>
        <div className="asset-modal-actions"><button type="button" className="plain-button" onClick={() => setEditingScope(null)}>Cancel</button><button className="primary-button" disabled={busy} type="submit">Save access</button></div>
      </form></section></div>}
    {userFormOpen && <div className="modal-backdrop"><section className="asset-modal" role="dialog" aria-modal="true" aria-labelledby="newUserTitle">
      <div className="asset-modal-heading"><h2 id="newUserTitle">Add company user</h2><button className="modal-close" type="button" onClick={() => setUserFormOpen(false)}>×</button></div>
      <form className="asset-create-form" onSubmit={event => void submitUser(event)}>
        <label>Full name<input name="fullName" required minLength={2} maxLength={191} /></label>
        <label>Email<input name="email" type="email" required maxLength={191} /></label>
        <label>Initial password<input name="initialPassword" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></label>
        <p className="asset-inline-hint">Development onboarding: arrange secure delivery of the initial password. One-time password setup is planned before launch.</p>
        <label>Role<select name="roleId" required>{assignableRoles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
        {allLocationsAccess && <label><input type="checkbox" name="allLocationsAccess" /> Access all company locations</label>}
        <div className="asset-modal-actions"><button className="plain-button" type="button" onClick={() => setUserFormOpen(false)}>Cancel</button><button className="primary-button" disabled={busy} type="submit">Create user</button></div>
      </form></section></div>}
    {roleFormOpen && <div className="modal-backdrop"><section className="asset-modal" role="dialog" aria-modal="true" aria-labelledby="roleFormTitle">
      <div className="asset-modal-heading"><h2 id="roleFormTitle">{selectedRole ? "Edit role" : "Create role"}</h2><button className="modal-close" type="button" onClick={() => setRoleFormOpen(false)}>×</button></div>
      <form className="asset-create-form" onSubmit={event => void submitRole(event)}>
        {!selectedRole && <label>Role key<input name="key" required pattern="[A-Za-z][A-Za-z0-9_]{1,59}" placeholder="ASSET_MANAGER" /></label>}
        <label>Role name<input name="name" required minLength={2} defaultValue={selectedRole?.name} /></label>
        <label>Description<textarea name="description" defaultValue={selectedRole?.description ?? ""} /></label>
        <fieldset className="company-permissions"><legend>Allowed actions</legend>{availablePermissions.map(permission => <label key={permission.key}><input type="checkbox" checked={selectedPermissions.includes(permission.key)} onChange={event => setSelectedPermissions(previous => event.target.checked ? [...previous, permission.key] : previous.filter(key => key !== permission.key))} /><span><strong>{permission.key}</strong><small>{permission.description}</small></span></label>)}</fieldset>
        <div className="asset-modal-actions"><button type="button" className="plain-button" onClick={() => setRoleFormOpen(false)}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>Save role</button></div>
      </form></section></div>}
  </section>;
}
