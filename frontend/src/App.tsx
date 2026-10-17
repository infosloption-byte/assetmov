import { useEffect, useState } from "react";
import AuthPage from "./features/auth/AuthPage";
import type { AuthMode, AuthUser } from "./features/auth/types";
import AssetRegisterPage from "./features/assets/AssetRegisterPage";
import LocationsPage from "./features/locations/LocationsPage";

type ApiHealth = "checking" | "online" | "offline";

interface WorkspaceContext {
  tenant: {
    id: string;
    name: string;
    slug: string;
    status: string;
  };
  membership: {
    id: string;
    role: { id: string; key: string; name: string };
    allLocationsAccess: boolean;
  };
  permissions: string[];
  locationScope: {
    accessibleLocationIds: string[];
    manageableLocationIds: string[];
  };
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api").replace(/\/$/, "");

const modules = [
  { number: "01", title: "Asset register", description: "A single place for every asset, its details, value, warranty and history.", tag: "Core inventory" },
  { number: "02", title: "Locations & people", description: "Organize branches, locations, employees and custodian responsibilities.", tag: "Organization" },
  { number: "03", title: "Transfers & requests", description: "Track approvals, dispatches, receipts and every handover.", tag: "Workflows" },
  { number: "04", title: "Service & lifecycle", description: "Manage repairs, maintenance, upgrades, damage and disposal.", tag: "Lifecycle" },
  { number: "05", title: "Audit & reports", description: "Reconcile physical inventory and export permission-aware reports.", tag: "Visibility" },
  { number: "06", title: "Software & tags", description: "Track software entitlements, allocations and scannable asset labels.", tag: "Additional assets" },
];

function App() {
  const [apiHealth, setApiHealth] = useState<ApiHealth>("checking");
  const [activePage, setActivePage] = useState<"overview" | "assets" | "locations">("overview");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
  const [workspaceContext, setWorkspaceContext] = useState<WorkspaceContext | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [workspaceError, setWorkspaceError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    fetch(apiBaseUrl + "/health", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("API not ready");
        return response.json() as Promise<{ status?: string; database?: string }>;
      })
      .then((health) => setApiHealth(health.status === "ok" && health.database === "ok" ? "online" : "offline"))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setApiHealth("offline");
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function restoreSession() {
      try {
        const response = await fetch(apiBaseUrl + "/auth/me", {
          credentials: "include",
          signal: controller.signal,
        });
        if (!response.ok) return;

        const payload = await response.json() as { user?: AuthUser };
        if (!payload.user) return;

        setUser(payload.user);
        setActiveTenantId(payload.user.memberships[0]?.tenant.id ?? null);

        const csrfResponse = await fetch(apiBaseUrl + "/auth/csrf", {
          credentials: "include",
          signal: controller.signal,
        });
        if (csrfResponse.ok) {
          const csrfPayload = await csrfResponse.json() as { csrfToken?: string };
          setCsrfToken(csrfPayload.csrfToken ?? null);
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setCsrfToken(null);
        }
      } finally {
        if (!controller.signal.aborted) setSessionLoading(false);
      }
    }

    void restoreSession();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!user || !activeTenantId) {
      setWorkspaceContext(null);
      setWorkspaceLoading(false);
      setWorkspaceError("");
      return;
    }

    const controller = new AbortController();
    setWorkspaceContext(null);
    setWorkspaceLoading(true);
    setWorkspaceError("");

    async function loadWorkspaceContext() {
      try {
        const response = await fetch(apiBaseUrl + "/workspace/context", {
          credentials: "include",
          headers: { "X-Tenant-Id": activeTenantId },
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({})) as {
          tenant?: WorkspaceContext["tenant"];
          membership?: WorkspaceContext["membership"];
          permissions?: string[];
          locationScope?: WorkspaceContext["locationScope"];
          error?: { message?: string };
        };

        if (!response.ok || !payload.tenant || !payload.membership || !payload.locationScope) {
          throw new Error(payload.error?.message ?? "Could not load this workspace context.");
        }

        setWorkspaceContext({
          tenant: payload.tenant,
          membership: payload.membership,
          permissions: payload.permissions ?? [],
          locationScope: payload.locationScope,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setWorkspaceContext(null);
        setWorkspaceError(error instanceof Error ? error.message : "Could not load workspace context.");
      } finally {
        if (!controller.signal.aborted) setWorkspaceLoading(false);
      }
    }

    void loadWorkspaceContext();
    return () => controller.abort();
  }, [user, activeTenantId]);

  async function handleLogout() {
    setActionError("");
    try {
      let currentCsrfToken = csrfToken;
      if (!currentCsrfToken) {
        const csrfResponse = await fetch(apiBaseUrl + "/auth/csrf", { credentials: "include" });
        const csrfPayload = await csrfResponse.json() as { csrfToken?: string; error?: { message?: string } };
        if (!csrfResponse.ok || !csrfPayload.csrfToken) {
          throw new Error(csrfPayload.error?.message ?? "Your session may have expired. Please sign in again.");
        }
        currentCsrfToken = csrfPayload.csrfToken;
      }

      const response = await fetch(apiBaseUrl + "/auth/logout", {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": currentCsrfToken },
      });
      const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Could not sign out.");

      setUser(null);
      setCsrfToken(null);
      setActiveTenantId(null);
      setWorkspaceContext(null);
      setWorkspaceError("");
      setActivePage("overview");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not sign out. Please try again.");
    }
  }

  if (authMode) {
    return (
      <AuthPage
        mode={authMode}
        onModeChange={setAuthMode}
        onCancel={() => setAuthMode(null)}
        onAuthenticated={(authenticatedUser, token) => {
          setUser(authenticatedUser);
          setCsrfToken(token);
          setActiveTenantId(authenticatedUser.memberships[0]?.tenant.id ?? null);
          setWorkspaceContext(null);
          setAuthMode(null);
          setActionError("");
          setWorkspaceError("");
        }}
      />
    );
  }

  const selectedMembership = user?.memberships.find((membership) => membership.tenant.id === activeTenantId)
    ?? user?.memberships[0];
  const activeWorkspaceContext = workspaceContext?.tenant.id === activeTenantId ? workspaceContext : null;
  const currentTenant = activeWorkspaceContext?.tenant ?? selectedMembership?.tenant;
  const initials = user?.fullName.split(/\s+/).filter(Boolean).slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "").join("") || "AM";
  const displayedError = actionError || workspaceError;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="AssetMov home">
          <span className="brand-mark">A<span>.</span></span>
          <span className="brand-copy"><strong>assetmov</strong><small>ASSET LIFECYCLE</small></span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          <button className={"nav-item " + (activePage === "overview" ? "active" : "")} type="button" onClick={() => setActivePage("overview")}><span className="nav-icon">▦</span> Overview</button>
          <button className={"nav-item " + (activePage === "assets" ? "active" : "")} type="button" onClick={() => setActivePage("assets")}><span className="nav-icon">◫</span> Asset register</button>
          <a className="nav-item" href="#modules" onClick={() => setActivePage("overview")}><span className="nav-icon">⇄</span> Movements <span className="nav-lock">Soon</span></a>
          <button className={"nav-item " + (activePage === "locations" ? "active" : "")} type="button" onClick={() => setActivePage("locations")}><span className="nav-icon">⌂</span> Locations</button>
          <a className="nav-item" href="#modules" onClick={() => setActivePage("overview")}><span className="nav-icon">◷</span> Maintenance <span className="nav-lock">Soon</span></a>
          <a className="nav-item" href="#modules" onClick={() => setActivePage("overview")}><span className="nav-icon">▤</span> Reports <span className="nav-lock">Soon</span></a>
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card"><div className="help-icon">✳</div><strong>Built for clarity.</strong><p>Know what you own, where it is, and what happened to it.</p></div>
          <div className="sidebar-version"><span className="status-dot" /> Foundation preview <span>v0.3</span></div>
        </div>
      </aside>

      <main className="main-area" id="overview">
        <header className="topbar">
          <div className="breadcrumb"><span>{currentTenant?.name ?? "Workspace"}</span><b>/</b><strong>{activePage === "assets" ? "Asset register" : activePage === "locations" ? "Locations" : "Overview"}</strong></div>
          <div className="topbar-right">
            <div className={"api-pill " + apiHealth}><span className="status-dot" />{apiHealth === "checking" ? "Checking API" : apiHealth === "online" ? "API connected" : "API not connected"}</div>
            {sessionLoading ? (
              <span className="session-loading">Checking session…</span>
            ) : user ? (
              <>
                {user.memberships.length > 1 && (
                  <select
                    className="workspace-select"
                    aria-label="Active workspace"
                    value={activeTenantId ?? ""}
                    onChange={(event) => setActiveTenantId(event.currentTarget.value || null)}
                  >
                    {user.memberships.map((membership) => (
                      <option key={membership.tenant.id} value={membership.tenant.id}>{membership.tenant.name}</option>
                    ))}
                  </select>
                )}
                <div className="signed-in-copy"><strong>{user.fullName}</strong><small>{workspaceLoading ? "Loading workspace…" : activeWorkspaceContext?.membership.role.name ?? selectedMembership?.role.name ?? "Member"}</small></div>
                <div className="avatar" aria-label={user.fullName}>{initials}</div>
                <button className="topbar-button ghost" type="button" onClick={() => void handleLogout()}>Sign out</button>
              </>
            ) : (
              <>
                <button className="topbar-button ghost" type="button" onClick={() => setAuthMode("login")}>Sign in</button>
                <button className="topbar-button solid" type="button" onClick={() => setAuthMode("register")}>Create workspace <span>↗</span></button>
              </>
            )}
          </div>
        </header>

        {displayedError && <div className="action-error" role="alert">{displayedError}</div>}

        {activePage === "assets" ? (
          <AssetRegisterPage
            tenantId={activeTenantId}
            csrfToken={csrfToken}
            permissions={activeWorkspaceContext?.permissions ?? []}
            allLocationsAccess={activeWorkspaceContext?.membership.allLocationsAccess ?? selectedMembership?.allLocationsAccess ?? false}
          />
        ) : activePage === "locations" ? (
          <LocationsPage
            tenantId={workspaceContext?.tenant.id ?? null}
            csrfToken={csrfToken}
            permissions={workspaceContext?.permissions ?? []}
            allLocationsAccess={workspaceContext?.membership.allLocationsAccess ?? selectedMembership?.allLocationsAccess ?? false}
            manageableLocationIds={activeWorkspaceContext?.locationScope.manageableLocationIds ?? []}
          />
        ) : (
          <>
        <section className="welcome-section">
          <div>
            <div className="eyebrow"><span className="eyebrow-line" /> YOUR ASSET OPERATIONS, IN ONE VIEW</div>
            <h1>Good systems make<br /><em>everything</em> easier to track.</h1>
            <p className="welcome-copy">{user
              ? "Welcome, " + user.fullName + ". " + (currentTenant ? currentTenant.name + " is set up as your workspace." : "Your account is ready.") + " Live inventory and movement screens are the next implementation stage."
              : "A clear view of your asset lifecycle is taking shape. Start with the foundation, then bring your inventory, people and processes together."}</p>
            <div className="welcome-actions">
              {user ? (
                <a className="primary-button" href="#modules">Explore the platform <span>↗</span></a>
              ) : (
                <button className="primary-button" type="button" onClick={() => setAuthMode("register")}>Create your workspace <span>↗</span></button>
              )}
              <a className="text-button" href="https://github.com/infosloption-byte/assetmov" target="_blank" rel="noreferrer">View project <span>↗</span></a>
            </div>
          </div>
          <div className="welcome-art" aria-hidden="true">
            <div className="orbit orbit-one" /><div className="orbit orbit-two" />
            <div className="art-card card-back"><span className="mini-square">↗</span><div className="art-line long" /><div className="art-line short" /><div className="art-line medium" /></div>
            <div className="art-card card-front"><div className="card-heading"><span>ASSET LIFECYCLE</span><span className="card-menu">•••</span></div><div className="art-graphic"><span /><span /><span /><span /><span /><span /><span /></div><div className="graphic-footer"><span /><span /></div></div>
            <div className="floating-check">✓</div>
          </div>
        </section>

        <section className="stats-section" aria-label="Workspace metrics">
          <div className="section-intro"><div><h2>Workspace snapshot</h2><p>{user && currentTenant
            ? currentTenant.name + " is created. Live metrics will appear when inventory workflows are connected."
            : "Live metrics will appear when your organization and data are connected."}</p></div><span className="preview-label">PREVIEW</span></div>
          <div className="stats-grid">
            <Metric label="Tracked assets" icon="◫" detail="Inventory at a glance" />
            <Metric label="Assigned assets" icon="↗" detail="Custody and ownership" />
            <Metric label="In maintenance" icon="⌁" detail="Service and repair queue" />
            <Metric label="Open requests" icon="◷" detail="Items needing a decision" />
          </div>
          {activeWorkspaceContext && (
            <div className="workspace-access-summary">
              <span><strong>{activeWorkspaceContext.membership.role.name}</strong> access loaded</span>
              <span>{activeWorkspaceContext.permissions.length} permissions</span>
              <span>{activeWorkspaceContext.locationScope.accessibleLocationIds.length} locations in scope</span>
            </div>
          )}
        </section>

        <section className="modules-section" id="modules">
          <div className="section-intro"><div><h2>One platform. Every asset workflow.</h2><p>Modules are planned from the legacy process audit and will be delivered in tested stages.</p></div><span className="module-count">06 MODULE AREAS</span></div>
          <div className="module-grid">
            {modules.map((module) => (
              <article className="module-card" key={module.number}>
                <div className="module-card-top"><span className="module-number">{module.number}</span><span className="module-arrow">↗</span></div>
                <span className="module-tag">{module.tag}</span><h3>{module.title}</h3><p>{module.description}</p>
              </article>
            ))}
          </div>
        </section>

          </>
        )}
        <footer className="page-footer"><span>© {new Date().getFullYear()} AssetMov</span><span>Inventory clarity, from acquisition to retirement.</span></footer>
      </main>
    </div>
  );
}

function Metric({ label, icon, detail }: { label: string; icon: string; detail: string }) {
  return <article className="stat-card"><div className="stat-card-top"><span className="stat-icon">{icon}</span><span className="stat-placeholder">—</span></div><strong>{label}</strong><p>{detail}</p></article>;
}

export default App;
