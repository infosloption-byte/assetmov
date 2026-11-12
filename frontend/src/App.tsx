import { useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import AuthPage from "./features/auth/AuthPage";
import AccountRecoveryPage from "./features/auth/AccountRecoveryPage";
import type { AuthMode, AuthUser } from "./features/auth/types";
import AssetRegisterPage from "./features/assets/AssetRegisterPage";
import LocationsPage from "./features/locations/LocationsPage";
import TransferPage from "./features/transfers/TransferPage";
import EmployeePage from "./features/employees/EmployeePage";
import CompanyAdminPage from "./features/company/CompanyAdminPage";
import CompanyProfilePage from "./features/company/CompanyProfilePage";
import MasterDataPage from "./features/master-data/MasterDataPage";
import PlatformConsole from "./features/platform/PlatformConsole";
import CompanyBillingPage from "./features/billing/CompanyBillingPage";
import "./features/billing/billing.css";
import ThemeSelect from "./components/ThemeSelect";
import AccountMenu from "./components/AccountMenu";
import { canOpenWorkspacePage } from "./navigation/access";
import { appRoutePath, isProtectedRoute, readAppRoute, type AppRoute, type WorkspacePage, type PlatformPage } from "./navigation/routes";

type ApiHealth = "checking" | "online" | "offline";
type BillingStatus = { allowed: boolean; reason: string | null; isCompanyAdmin: boolean; status: string | null; planName: string | null; trialEndsAt: string | null; periodEndsAt: string | null };
type OverviewMetrics = { total: number; assigned: number; inService: number; inTransit: number };
type AccountSession = { id: string; createdAt: string; lastSeenAt: string | null; expiresAt: string; ipAddress: string | null; userAgent: string | null; isCurrent: boolean };

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
  const [recoveryMode] = useState(() => ["forgot", "reset", "verify"].includes(new URLSearchParams(window.location.search).get("accountAction") ?? ""));
  const [accountNotice, setAccountNotice] = useState("");
  const [route, setRoute] = useState<AppRoute>(() => readAppRoute(window.location.pathname));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const activePage: WorkspacePage = route.kind === "workspace" ? route.page : "overview";
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [mobileMenuOpen]);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
  const [workspaceContext, setWorkspaceContext] = useState<WorkspaceContext | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [passwordDialog, setPasswordDialog] = useState(false);
  const [sessionsDialog, setSessionsDialog] = useState(false);
  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [sessionsBusy, setSessionsBusy] = useState(false);
  const [sessionsError, setSessionsError] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [workspaceError, setWorkspaceError] = useState("");
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState("");
  const [billingEpoch, setBillingEpoch] = useState(0);
  const lastBillingTenant = useRef<string | null>(null);
  const [overviewMetrics, setOverviewMetrics] = useState<OverviewMetrics | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState("");
  const [overviewEpoch, setOverviewEpoch] = useState(0);
  const refreshBilling = useCallback(() => setBillingEpoch(n => n + 1), []);
  // A passive focus/visibility event must never replace a page or unmount its
  // in-progress form. Subscription rechecks remain explicit (or after checkout).
  const navigate = useCallback((next: AppRoute, replace = false, preserveBilling = false) => {
    setMobileMenuOpen(false);
    const path = appRoutePath(next) + (preserveBilling ? "?billing=pending" : "");
    if (window.location.pathname + window.location.search !== path) {
      window.history[replace ? "replaceState" : "pushState"](null, "", path);
    }
    setRoute(next);
  }, []);

  const navigateWorkspace = (page: WorkspacePage, tenantId = activeTenantId) => {
    const tenant = user?.memberships.find(m => m.tenant.id === tenantId)
      ?? user?.memberships[0];
    if (!tenant) {
      navigate({ kind: "home" });
      return;
    }
    setActiveTenantId(tenant.tenant.id);
    navigate({ kind: "workspace", tenantSlug: tenant.tenant.slug, page });
  };
  const navigatePlatform = (page: PlatformPage) => {
    if (user?.isPlatformAdmin) navigate({ kind: "platform", page });
  };
  const setActivePage = (page: WorkspacePage) => navigateWorkspace(page);

  // popstate is raised for browser Back/Forward only; pushState is handled by
  // navigate() above. Neither path reloads the document.
  useEffect(() => {
    const onBackForward = () => {
      const next = readAppRoute(window.location.pathname);
      setRoute(next);
      setMobileMenuOpen(false);
      if (next.kind === "workspace") {
        const tenant = user?.memberships.find(m => m.tenant.slug === next.tenantSlug);
        setActiveTenantId(tenant?.tenant.id ?? null);
      }
    };
    window.addEventListener("popstate", onBackForward);
    return () => window.removeEventListener("popstate", onBackForward);
  }, [user]);

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
        if (!response.ok) {
          if (isProtectedRoute(readAppRoute(window.location.pathname))) setAuthMode("login");
          return;
        }

        const payload = await response.json() as { user?: AuthUser };
        if (!payload.user) return;

        setUser(payload.user);
        const requestedRoute = readAppRoute(window.location.pathname);
        const pendingCheckout = new URLSearchParams(window.location.search).get("billing") === "pending";
        const requestedTenant = requestedRoute.kind === "workspace"
          ? payload.user.memberships.find(m => m.tenant.slug === requestedRoute.tenantSlug)
          : undefined;
        const defaultTenant = requestedTenant ?? payload.user.memberships[0];
        setActiveTenantId(requestedRoute.kind === "workspace"
          ? requestedTenant?.tenant.id ?? null : defaultTenant?.tenant.id ?? null);
        if (requestedRoute.kind === "home") {
          if (pendingCheckout && defaultTenant) {
            navigate({ kind: "workspace", tenantSlug: defaultTenant.tenant.slug, page: "billing" }, true, true);
          } else if (payload.user.isPlatformAdmin) {
            navigate({ kind: "platform", page: "overview" }, true);
          } else if (defaultTenant) {
            navigate({ kind: "workspace", tenantSlug: defaultTenant.tenant.slug, page: "overview" }, true);
          }
        }

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
  }, [navigate]);

  useEffect(() => {
    if (!user || !activeTenantId) {
      setWorkspaceContext(null);
      setWorkspaceLoading(false);
      setWorkspaceError("");
      return;
    }

    const selectedTenantId = activeTenantId;
    const controller = new AbortController();
    setWorkspaceContext(null);
    setWorkspaceLoading(true);
    setWorkspaceError("");

    async function loadWorkspaceContext() {
      try {
        const response = await fetch(apiBaseUrl + "/workspace/context", {
          credentials: "include",
          headers: { "X-Tenant-Id": selectedTenantId },
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

  useEffect(() => {
    if (!user?.id || !activeTenantId) {
      lastBillingTenant.current = null;
      setBillingStatus(null); setBillingLoading(false); setBillingError("");
      return;
    }
    const controller = new AbortController();
    // Preserve the current screen and its in-progress form during a refresh.
    // Only a genuine tenant switch clears the previously checked status.
    if (lastBillingTenant.current !== activeTenantId) {
      lastBillingTenant.current = activeTenantId;
      setBillingStatus(null);
    }
    setBillingLoading(true); setBillingError("");
    void fetch(apiBaseUrl + "/billing/status", {
      credentials: "include", signal: controller.signal, headers: { "X-Tenant-Id": activeTenantId },
    }).then(async response => {
      const payload = await response.json().catch(() => ({})) as {
        data?: BillingStatus; error?: { message?: string };
      };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Unable to verify company subscription.");
      if (!controller.signal.aborted) setBillingStatus(payload.data);
    }).catch(error => {
      if (!controller.signal.aborted) setBillingError(error instanceof Error ? error.message : "Subscription status unavailable.");
    }).finally(() => { if (!controller.signal.aborted) setBillingLoading(false); });
    return () => controller.abort();
  }, [user?.id, activeTenantId, billingEpoch]);

  // Platform navigation is URL-driven and never grants tenant access.
  // Re-query when the selected workspace or its location permissions change.
  useEffect(() => {
    if (
      !user?.id || !activeTenantId || activePage !== "overview" ||
      billingStatus?.allowed !== true || !workspaceContext ||
      workspaceContext.tenant.id !== activeTenantId ||
      !workspaceContext.permissions.includes("asset.read")
    ) {
      setOverviewMetrics(null);
      setOverviewLoading(false);
      setOverviewError("");
      return;
    }

    const controller = new AbortController();
    const tenantId = activeTenantId;
    setOverviewMetrics(null);
    setOverviewLoading(true);
    setOverviewError("");
    void fetch(apiBaseUrl + "/workspace/overview", {
      credentials: "include",
      headers: { "X-Tenant-Id": tenantId },
      signal: controller.signal,
    }).then(async response => {
      const payload = await response.json().catch(() => ({})) as {
        data?: OverviewMetrics; error?: { message?: string };
      };
      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "Could not load the workspace snapshot.");
      }
      if (!controller.signal.aborted) setOverviewMetrics(payload.data);
    }).catch(error => {
      if (!controller.signal.aborted) {
        setOverviewError(error instanceof Error ? error.message : "Unable to load metrics.");
      }
    }).finally(() => {
      if (!controller.signal.aborted) setOverviewLoading(false);
    });
    return () => controller.abort();
  }, [user?.id, activeTenantId, activePage, billingStatus?.allowed, workspaceContext, overviewEpoch]);

  async function changeOwnPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwordBusy || !csrfToken) { setPasswordError("Please sign in again to refresh your security token."); return; }
    const data = new FormData(event.currentTarget);
    const currentPassword = String(data.get("currentPassword") ?? "");
    const newPassword = String(data.get("newPassword") ?? "");
    const confirmPassword = String(data.get("confirmPassword") ?? "");
    if (newPassword !== confirmPassword) { setPasswordError("New passwords do not match."); return; }
    setPasswordBusy(true); setPasswordError("");
    try {
      const response = await fetch(apiBaseUrl + "/auth/change-password", {
        method: "POST", credentials: "include",
        headers: { "X-CSRF-Token": csrfToken, "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Could not change password.");
      setPasswordDialog(false);
      setActionError("");
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : "Could not change password.");
    } finally { setPasswordBusy(false); }
  }

  async function loadSessions() {
    setSessionsBusy(true); setSessionsError("");
    try {
      const response = await fetch(apiBaseUrl + "/auth/sessions", { credentials: "include" });
      const payload = await response.json().catch(() => ({})) as { data?: AccountSession[]; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Could not load sessions.");
      setSessions(payload.data ?? []);
    } catch (error) { setSessionsError(error instanceof Error ? error.message : "Could not load sessions."); }
    finally { setSessionsBusy(false); }
  }

  async function revokeSession(id?: string) {
    if (!csrfToken || sessionsBusy) return;
    setSessionsBusy(true); setSessionsError("");
    try {
      const response = await fetch(apiBaseUrl + (id ? "/auth/sessions/" + encodeURIComponent(id) : "/auth/sessions/others"), {
        method: "DELETE", credentials: "include", headers: { "X-CSRF-Token": csrfToken },
      });
      const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Could not revoke session.");
      setSessions(previous => previous.filter(item => item.isCurrent || (id !== undefined && item.id !== id)));
    } catch (error) { setSessionsError(error instanceof Error ? error.message : "Could not revoke session."); }
    finally { setSessionsBusy(false); }
  }

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
      setBillingStatus(null);
      setBillingError("");
      navigate({ kind: "home" }, true);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not sign out. Please try again.");
    }
  }

  if (recoveryMode) return <AccountRecoveryPage/>;
  // Do not render a protected deep link using a temporary anonymous or
  // previously selected tenant while the session is still being restored.
  if (sessionLoading && isProtectedRoute(route)) {
    return <main className="route-access-message" role="status">
      <h1>Restoring workspace…</h1><p>Checking your session and page access.</p>
    </main>;
  }

  async function requestEmailVerification(): Promise<void> {
    if (!csrfToken) { setActionError("Please sign in again to verify your email."); return; }
    try {
      const response = await fetch(apiBaseUrl + "/auth/email/verification/request", {
        method: "POST", credentials: "include",
        headers: { "X-CSRF-Token": csrfToken, "Content-Type": "application/json" },
        body: "{}",
      });
      const result = await response.json().catch(() => ({})) as {message?:string;error?:{message?:string}};
      if (!response.ok) throw new Error(result.error?.message ?? "Unable to send verification email.");
      setAccountNotice(result.message ?? "Please check your inbox.");
      setActionError("");
    } catch (error) { setActionError(error instanceof Error ? error.message : "Verification request failed."); }
  }

  if (authMode) {
    return (
      <AuthPage
        mode={authMode}
        onModeChange={setAuthMode}
        onCancel={() => {
          setAuthMode(null);
          if (isProtectedRoute(readAppRoute(window.location.pathname))) navigate({ kind: "home" }, true);
        }}
        onAuthenticated={(authenticatedUser, token) => {
          setUser(authenticatedUser);
          setCsrfToken(token);
          const requested = readAppRoute(window.location.pathname);
          const chosen = requested.kind === "workspace"
            ? authenticatedUser.memberships.find(m => m.tenant.slug === requested.tenantSlug)
            : authenticatedUser.memberships[0];
          setActiveTenantId(chosen?.tenant.id ?? null);
          if (requested.kind === "home") {
            const pendingCheckout = new URLSearchParams(window.location.search).get("billing") === "pending";
            if (pendingCheckout && chosen) {
              navigate({ kind: "workspace", tenantSlug: chosen.tenant.slug, page: "billing" }, true, true);
            } else if (authenticatedUser.isPlatformAdmin) {
              navigate({ kind: "platform", page: "overview" }, true);
            } else if (chosen) {
              navigate({ kind: "workspace", tenantSlug: chosen.tenant.slug, page: "overview" }, true);
            }
          }
          setWorkspaceContext(null);
          setAuthMode(null);
          setActionError("");
          setWorkspaceError("");
        }}
      />
    );
  }

  if (user && route.kind === "platform" && !user.isPlatformAdmin) {
    return <main className="route-access-message" role="alert">
      <h1>Platform access denied</h1><p>This account does not have Platform Super Admin access.</p>
      <button type="button" className="primary-button" onClick={() => navigateWorkspace("overview")}>Go to your workspace</button>
    </main>;
  }
  if (user?.isPlatformAdmin && route.kind === "platform") {
    return <PlatformConsole
      user={user} csrfToken={csrfToken} apiHealth={apiHealth}
      page={route.page} onNavigate={navigatePlatform}
      error={actionError}
      onSignOut={() => { void handleLogout(); }}
      onCompanySwitch={() => { navigateWorkspace("overview"); setActionError(""); }}
    />;
  }
  if (route.kind === "notFound" ||
      (user && route.kind === "workspace" &&
       !user.memberships.some(m => m.tenant.slug === route.tenantSlug))) {
    return <main className="route-access-message" role="alert">
      <h1>Page unavailable</h1><p>This page does not exist or your account cannot access its workspace.</p>
      <button type="button" className="primary-button" onClick={() => {
        if (user?.isPlatformAdmin) navigatePlatform("overview");
        else navigateWorkspace("overview");
      }}>Go to overview</button>
    </main>;
  }

  const selectedMembership = user?.memberships.find((membership) => membership.tenant.id === activeTenantId)
    ?? user?.memberships[0];
  const activeWorkspaceContext = workspaceContext?.tenant.id === activeTenantId ? workspaceContext : null;
  const currentTenant = activeWorkspaceContext?.tenant ?? selectedMembership?.tenant;
  const workspaceSlug = currentTenant?.slug ?? selectedMembership?.tenant.slug ?? "";
  const pageHref = (page: WorkspacePage) => workspaceSlug
    ? appRoutePath({ kind: "workspace", tenantSlug: workspaceSlug, page }) : "/";
  const followWorkspaceLink = (event: MouseEvent<HTMLAnchorElement>, page: WorkspacePage) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setActivePage(page);
  };
  const initials = user?.fullName.split(/\s+/).filter(Boolean).slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "").join("") || "AM";
  const displayedError = actionError || workspaceError;
  const permissionsForMenu = activeWorkspaceContext?.permissions ?? [];
  const menuRoleKey = activeWorkspaceContext?.membership.role.key ?? selectedMembership?.role.key ?? null;
  const canSee = (page: WorkspacePage) => canOpenWorkspacePage(page, permissionsForMenu, menuRoleKey);



  return (
    <div className="app-shell">
      {mobileMenuOpen && <button className="mobile-nav-backdrop" aria-label="Close navigation"
        type="button" onClick={() => setMobileMenuOpen(false)}/>}
      <aside id="workspace-sidebar" className={"sidebar" + (mobileMenuOpen ? " mobile-open" : "")}
        aria-label="Workspace sidebar">
        <a className="brand" href="/" aria-label="AssetMov home">
          <span className="brand-mark">A<span>.</span></span>
          <span className="brand-copy"><strong>assetmov</strong><small>ASSET LIFECYCLE</small></span>
        </a>
        <div className="workspace-label">WORKSPACE
          <button className="mobile-menu-close" type="button" aria-label="Close navigation"
            onClick={() => setMobileMenuOpen(false)}>×</button>
        </div>
        <nav className="side-nav" aria-label="Main navigation">
          {(!user || billingLoading || (!billingError && billingStatus?.allowed)) && <>
          {(!user || canSee("overview")) && <a className={"nav-item " + (activePage === "overview" ? "active" : "")} href={pageHref("overview")} aria-current={activePage === "overview" ? "page" : undefined} onClick={event => followWorkspaceLink(event, "overview")}><span className="nav-icon">▦</span> Overview</a>}
          {(!user || canSee("assets")) && <a className={"nav-item " + (activePage === "assets" ? "active" : "")} href={pageHref("assets")} aria-current={activePage === "assets" ? "page" : undefined} onClick={event => followWorkspaceLink(event, "assets")}><span className="nav-icon">◫</span> Asset register</a>}
          {(!user || canSee("transfers")) && <a className={"nav-item " + (activePage === "transfers" ? "active" : "")} href={pageHref("transfers")} aria-current={activePage === "transfers" ? "page" : undefined} onClick={event => followWorkspaceLink(event, "transfers")}><span className="nav-icon">⇄</span> Transfers & receipts</a>}
          {(!user || canSee("employees")) && <a className={"nav-item " + (activePage === "employees" ? "active" : "")} href={pageHref("employees")} aria-current={activePage === "employees" ? "page" : undefined} onClick={event => followWorkspaceLink(event, "employees")}><span className="nav-icon">♙</span> Employees</a>}
          {(!user || canSee("locations")) && <a className={"nav-item " + (activePage === "locations" ? "active" : "")} href={pageHref("locations")} aria-current={activePage === "locations" ? "page" : undefined} onClick={event => followWorkspaceLink(event, "locations")}><span className="nav-icon">⌂</span> Locations</a>}
          </>}
          {user?.isPlatformAdmin && <a className="nav-item" href="/platform/overview" onClick={event => {
            if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
              event.preventDefault(); navigatePlatform("overview");
            }
          }}><span className="nav-icon">◇</span> Platform Console <span className="nav-lock">Switch ↗</span></a>}
          {billingStatus?.allowed && canSee("company") && <a className={"nav-item " + (activePage === "company" ? "active" : "")} href={pageHref("company")} aria-current={activePage === "company" ? "page" : undefined} onClick={event => followWorkspaceLink(event, "company")}><span className="nav-icon">♧</span> Users & roles</a>}
          {billingStatus?.allowed && canSee("profile") && <a className={"nav-item " + (activePage === "profile" ? "active" : "")} href={pageHref("profile")} aria-current={activePage === "profile" ? "page" : undefined} onClick={event => followWorkspaceLink(event, "profile")}><span className="nav-icon">♧</span> Company profile</a>}
          {billingStatus?.allowed && canSee("masterData") && <a className={"nav-item " + (activePage === "masterData" ? "active" : "")} href={pageHref("masterData")} aria-current={activePage === "masterData" ? "page" : undefined} onClick={event => followWorkspaceLink(event, "masterData")}><span className="nav-icon">▧</span> Master data</a>}
          {!user && <><a className="nav-item" href="#modules" onClick={() => setActivePage("overview")}><span className="nav-icon">◷</span> Maintenance <span className="nav-lock">Soon</span></a>
          <a className="nav-item" href="#modules" onClick={() => setActivePage("overview")}><span className="nav-icon">▤</span> Reports <span className="nav-lock">Soon</span></a></>}
          {user && canSee("billing") && (
            <a className={"nav-item " + (activePage === "billing" ? "active" : "")}
              href={pageHref("billing")} aria-current={activePage === "billing" ? "page" : undefined}
              onClick={event => followWorkspaceLink(event, "billing")}><span className="nav-icon">▤</span> Billing & Plan</a>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card"><div className="help-icon">✳</div><strong>Built for clarity.</strong><p>Know what you own, where it is, and what happened to it.</p></div>
          <div className="sidebar-version"><span className="status-dot" /> Foundation preview <span>v0.3</span></div>
        </div>
      </aside>

      <main className="main-area" id="overview">
        <header className="topbar">
          <button type="button" className="mobile-menu-trigger" aria-controls="workspace-sidebar"
            aria-label={mobileMenuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen(open => !open)}>☰</button>
          <div className="breadcrumb"><span>{currentTenant?.name ?? "Workspace"}</span><b>/</b><strong>{activePage === "assets" ? "Asset register" : activePage === "locations" ? "Locations" : activePage === "transfers" ? "Transfers & receipts" : activePage === "employees" ? "Employees" : activePage === "company" ? "Users & roles" : activePage === "profile" ? "Company profile" : activePage === "masterData" ? "Master data" : activePage === "billing" ? "Billing & Plan" : "Overview"}</strong></div>
          <div className="topbar-right">
            <div className={"api-pill " + apiHealth}><span className="status-dot" />{apiHealth === "checking" ? "Checking API" : apiHealth === "online" ? "API connected" : "API not connected"}</div>
            {sessionLoading ? (
              <span className="session-loading">Checking session…</span>
            ) : user ? (
              <>
                {user.memberships.length > 1 && (
                  <ThemeSelect className="workspace-select" label="Active workspace" value={activeTenantId ?? ""}
                    onChange={value => navigateWorkspace("overview", value || null)}
                    options={user.memberships.map(membership => ({
                      value: membership.tenant.id, label: membership.tenant.name,
                    }))}/>
                )}
                <AccountMenu user={user} initials={initials}
                  roleLabel={workspaceLoading ? "Loading workspace…" :
                    activeWorkspaceContext?.membership.role.name ?? selectedMembership?.role.name ?? "Member"}
                  onVerifyEmail={() => void requestEmailVerification()}
                  onPassword={() => { setPasswordError(""); setPasswordDialog(true); }}
                  onSessions={() => { setSessionsDialog(true); void loadSessions(); }}
                  onSignOut={() => void handleLogout()}/>
              </>
            ) : (
              <>
                <button className="topbar-button ghost" type="button" onClick={() => setAuthMode("login")}>Sign in</button>
                <button className="topbar-button solid" type="button" onClick={() => setAuthMode("register")}>Create workspace <span>↗</span></button>
              </>
            )}
          </div>
        </header>

        {sessionsDialog && <div className="modal-backdrop"><section className="asset-modal" role="dialog" aria-modal="true" aria-labelledby="sessionsTitle">
          <div className="asset-modal-heading"><h2 id="sessionsTitle">Signed-in sessions</h2><button className="modal-close" type="button" onClick={() => setSessionsDialog(false)}>×</button></div>
          <p className="asset-inline-hint">Review devices with access to your account. Session IP and browser details may be approximate.</p>
          {sessionsError && <div className="asset-inline-error" role="alert">{sessionsError}</div>}
          <div className="account-sessions-list">
            {sessionsBusy && sessions.length === 0 && <p>Loading sessions…</p>}
            {sessions.map(session => <div className="account-session" key={session.id}>
              <div><strong>{session.isCurrent ? "Current session" : "Other session"}</strong>
                <small>{session.userAgent?.slice(0, 95) ?? "Unknown browser"}</small>
                <small>Last used: {new Date(session.lastSeenAt ?? session.createdAt).toLocaleString()}</small>
              </div>
              {!session.isCurrent && <button type="button" className="topbar-button ghost" disabled={sessionsBusy} onClick={() => void revokeSession(session.id)}>Revoke</button>}
            </div>)}
          </div>
          <div className="asset-modal-actions"><button type="button" className="plain-button" onClick={() => setSessionsDialog(false)}>Close</button><button type="button" className="primary-button" disabled={sessionsBusy || !sessions.some(item => !item.isCurrent)} onClick={() => void revokeSession()}>Sign out other sessions</button></div>
        </section></div>}
        {passwordDialog && <div className="modal-backdrop"><section className="asset-modal" role="dialog" aria-modal="true" aria-labelledby="passwordDialogTitle">
          <div className="asset-modal-heading"><h2 id="passwordDialogTitle">Change password</h2><button className="modal-close" type="button" onClick={() => setPasswordDialog(false)}>×</button></div>
          <form className="asset-create-form" onSubmit={event => void changeOwnPassword(event)}>
            <label>Current password<input name="currentPassword" type="password" autoComplete="current-password" required /></label>
            <label>New password<input name="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
            <label>Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
            <p className="asset-inline-hint">Changing your password signs out your other sessions.</p>
            {passwordError && <div className="asset-inline-error" role="alert">{passwordError}</div>}
            <div className="asset-modal-actions"><button className="plain-button" type="button" onClick={() => setPasswordDialog(false)}>Cancel</button><button className="primary-button" disabled={passwordBusy} type="submit">Update password</button></div>
          </form></section></div>}
        {displayedError && <div className="action-error" role="alert">{displayedError}</div>}
        {billingError && billingStatus?.allowed && <div className="action-error" role="status">Unable to refresh subscription status. Your work remains open; retry from Billing &amp; Plan.</div>}
        {accountNotice && <div className="asset-success" role="status">{accountNotice}</div>}

        {user && activeTenantId && !billingStatus && !billingError ? (
          <div className="billing-gate" role="status"><div className="billing-gate-body">
            <h2>Checking company subscription…</h2><p>Verifying active trial or Paddle billing status with the API.</p>
          </div></div>
        ) : user && activeTenantId && ((billingError && !billingStatus) || billingStatus?.allowed === false) &&
          activePage !== "billing" ? (
          <section className="billing-gate" aria-label="Subscription attention required">
            <div className="billing-gate-body">
              <span className="billing-state">{billingStatus?.status ?? "Subscription required"}</span>
              <h2>Company access requires an active subscription</h2>
              <p>{billingError || billingStatus?.reason?.replaceAll("_", " ").toLowerCase() || "Open Billing & Plan to review payment and trial details."}</p>
              {(billingStatus?.isCompanyAdmin || selectedMembership?.role.key === "TENANT_OWNER") ? (
                <button className="primary-button" type="button" onClick={() => setActivePage("billing")}>Open Billing & Plan ↗</button>
              ) : <p>Contact your Company Administrator to renew the subscription. Other company roles cannot manage billing.</p>}
              <p>Your data remains in the company workspace. Sign out is available above.</p>
              <button className="topbar-button ghost" type="button" onClick={refreshBilling}>Recheck subscription</button>
            </div>
          </section>
        ) : user && activeWorkspaceContext && !canSee(activePage) ? (
          <section className="route-access-message" role="alert">
            <h1>Access not available</h1>
            <p>Your company role does not allow access to this page. Contact an administrator if you need another permission.</p>
            <button className="primary-button" type="button" onClick={() => setActivePage("overview")}>Go to overview</button>
          </section>
        ) : activePage === "billing" ? (
          <CompanyBillingPage tenantId={activeTenantId} csrfToken={csrfToken}
            isCompanyAdmin={activeWorkspaceContext?.membership.role.key === "TENANT_OWNER" || selectedMembership?.role.key === "TENANT_OWNER"}
            onChanged={refreshBilling}/>
        ) : activePage === "profile" ? (
          <CompanyProfilePage tenantId={activeTenantId} csrfToken={csrfToken} permissions={activeWorkspaceContext?.permissions ?? []} />
        ) : activePage === "masterData" ? (
          <MasterDataPage tenantId={activeTenantId} csrfToken={csrfToken} permissions={activeWorkspaceContext?.permissions ?? []} />
        ) : activePage === "company" ? (
          <CompanyAdminPage tenantId={activeTenantId} csrfToken={csrfToken} permissions={activeWorkspaceContext?.permissions ?? []} currentUserId={user?.id ?? null} isOwner={activeWorkspaceContext?.membership.role.key === "TENANT_OWNER"} allLocationsAccess={activeWorkspaceContext?.membership.allLocationsAccess ?? false} />
        ) : activePage === "assets" ? (
          <AssetRegisterPage
            tenantId={activeTenantId}
            csrfToken={csrfToken}
            permissions={activeWorkspaceContext?.permissions ?? []}
            allLocationsAccess={activeWorkspaceContext?.membership.allLocationsAccess ?? selectedMembership?.allLocationsAccess ?? false}
            manageableLocationIds={activeWorkspaceContext?.locationScope.manageableLocationIds ?? []}
          />
        ) : activePage === "transfers" ? (
          <TransferPage
            tenantId={activeTenantId}
            csrfToken={csrfToken}
            permissions={activeWorkspaceContext?.permissions ?? []}
            accessibleLocationIds={activeWorkspaceContext?.locationScope.accessibleLocationIds ?? []}
            manageableLocationIds={activeWorkspaceContext?.locationScope.manageableLocationIds ?? []}
            allLocationsAccess={activeWorkspaceContext?.membership.allLocationsAccess ?? selectedMembership?.allLocationsAccess ?? false}
          />
        ) : activePage === "employees" ? (
          <EmployeePage
            tenantId={activeTenantId}
            csrfToken={csrfToken}
            permissions={activeWorkspaceContext?.permissions ?? []}
            accessibleLocationIds={activeWorkspaceContext?.locationScope.accessibleLocationIds ?? []}
            manageableLocationIds={activeWorkspaceContext?.locationScope.manageableLocationIds ?? []}
            allLocationsAccess={activeWorkspaceContext?.membership.allLocationsAccess ?? selectedMembership?.allLocationsAccess ?? false}
          />
        ) : activePage === "locations" ? (
          <LocationsPage
            tenantId={activeTenantId}
            csrfToken={csrfToken}
            permissions={activeWorkspaceContext?.permissions ?? []}
            allLocationsAccess={activeWorkspaceContext?.membership.allLocationsAccess ?? selectedMembership?.allLocationsAccess ?? false}
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

        <section className="stats-section" aria-label="Workspace metrics" aria-busy={overviewLoading}>
          <div className="section-intro"><div><h2>Workspace snapshot</h2><p>{user && currentTenant
            ? "Asset counts for " + currentTenant.name + ", limited to locations you can access."
            : "Sign in and select a workspace to view live inventory metrics."}</p></div><span className="preview-label">{overviewLoading ? "LOADING" : overviewMetrics ? "LIVE DATA" : "NOT AVAILABLE"}</span></div>
          <div className="stats-grid">
            <Metric label="Tracked assets" value={overviewMetrics?.total ?? null} icon="◫" detail="Assets visible in your workspace" />
            <Metric label="Assigned assets" value={overviewMetrics?.assigned ?? null} icon="↗" detail="Currently assigned to custodians" />
            <Metric label="In service" value={overviewMetrics?.inService ?? null} icon="⌁" detail="Assets currently in service" />
            <Metric label="In transit" value={overviewMetrics?.inTransit ?? null} icon="⇄" detail="Assets awaiting transfer receipt" />
          </div>
          {overviewError && <p className="asset-inline-error" role="alert">{overviewError}</p>}
          {user && activeWorkspaceContext && !activeWorkspaceContext.permissions.includes("asset.read") &&
            <p className="asset-inline-hint">Your company role does not permit viewing asset totals.</p>}
          {user && activeWorkspaceContext?.permissions.includes("asset.read") &&
            <button className="topbar-button ghost overview-refresh" type="button" disabled={overviewLoading}
              onClick={() => setOverviewEpoch(value => value + 1)}>Refresh metrics</button>}
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

function Metric({ label, icon, detail, value }: { label: string; icon: string; detail: string; value: number | null }) {
  return <article className="stat-card"><div className="stat-card-top"><span className="stat-icon">{icon}</span><span className="stat-placeholder">{value === null ? "—" : value.toLocaleString()}</span></div><strong>{label}</strong><p>{detail}</p></article>;
}

export default App;
