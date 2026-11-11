import { useState } from "react";
import type { AuthUser } from "../auth/types";
import PlatformAdminPage from "./PlatformAdminPage";
import {
  PlatformOverview, PlatformUsers, PlatformReports, PlatformActivity,
  PlatformBilling, PlatformSettings,
} from "./PlatformPages";
import "./platform-console.css";

export type PlatformPage =
  | "overview" | "companies" | "users" | "reports"
  | "activities" | "billing" | "plans" | "settings";

type Props = {
  user: AuthUser;
  csrfToken: string | null;
  apiHealth: "checking" | "online" | "offline";
  onCompanySwitch: () => void;
  onSignOut: () => void;
  error?: string;
};

const navigation: Array<{ label: string; items: Array<{ id: PlatformPage; label: string; symbol: string }> }> = [
  { label: "Platform", items: [
    { id: "overview", label: "Overview", symbol: "◫" },
    { id: "companies", label: "Companies", symbol: "▦" },
    { id: "users", label: "Users", symbol: "♙" },
  ] },
  { label: "Operations", items: [
    { id: "reports", label: "Platform Reports", symbol: "▥" },
    { id: "activities", label: "Activities & Security", symbol: "◎" },
  ] },
  { label: "Finance", items: [
    { id: "billing", label: "Billing & Revenue", symbol: "◈" },
    { id: "plans", label: "Plans & Limits", symbol: "▤" },
  ] },
  { label: "System", items: [
    { id: "settings", label: "Settings", symbol: "⚙" },
  ] },
];

const headings: Record<PlatformPage, { heading: string; description: string }> = {
  overview: { heading: "Platform Overview", description: "A single operational view across every company." },
  companies: { heading: "Companies", description: "Onboarding, subscription status and company oversight." },
  users: { heading: "Users", description: "Platform-wide identities, membership access and account security." },
  reports: { heading: "Platform Reports", description: "Company growth, assets, users and subscription trends." },
  activities: { heading: "Activities & Security", description: "Audit events, account access and active sessions." },
  billing: { heading: "Billing & Revenue", description: "Recorded Paddle payments and subscription health." },
  plans: { heading: "Plans & Limits", description: "Plans, entitlements and Paddle pricing configuration." },
  settings: { heading: "Settings", description: "Platform-wide registration policy and operator settings." },
};

export default function PlatformConsole({
  user, csrfToken, apiHealth, onCompanySwitch, onSignOut, error,
}: Props) {
  const [page, setPage] = useState<PlatformPage>("overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const heading = headings[page];
  const navigate = (next: PlatformPage) => {
    setPage(next); setMobileOpen(false);
  };
  const initials = user.fullName.split(/\s+/).filter(Boolean).slice(0, 2)
    .map(chunk => chunk[0]?.toUpperCase() ?? "").join("") || "PA";

  return <div className="platform-shell">
    <aside className={"platform-sidebar" + (mobileOpen ? " is-open" : "")} aria-label="Platform administration">
      <div className="platform-brand">
        <div className="platform-brand-mark">A<span>.</span></div>
        <div><strong>assetmov</strong><small>PLATFORM CONSOLE</small></div>
        <button className="platform-mobile-close" type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)}>×</button>
      </div>
      <div className="platform-instance">
        <span className="platform-instance-dot"/><span>Platform administration</span>
        <span className="platform-super-chip">SUPER ADMIN</span>
      </div>
      <nav className="platform-nav" aria-label="Platform sections">
        {navigation.map(group => <div className="platform-nav-group" key={group.label}>
          <div className="platform-nav-heading">{group.label}</div>
          {group.items.map(item => <button type="button" key={item.id}
            className={"platform-nav-item" + (page === item.id ? " active" : "")}
            aria-current={page === item.id ? "page" : undefined}
            onClick={() => navigate(item.id)}>
            <span className="platform-nav-icon" aria-hidden="true">{item.symbol}</span>
            <span>{item.label}</span>
            {page === item.id && <span className="platform-nav-indicator" aria-hidden="true"/>}
          </button>)}
        </div>)}
      </nav>
      <div className="platform-sidebar-bottom">
        <div className="platform-sidebar-note">
          <div className="platform-note-icon">◇</div>
          <strong>Platform scope</strong>
          <span>Manage every company without assuming a company role or tenant membership.</span>
        </div>
        {user.memberships.length > 0 && <button className="platform-switch" type="button" onClick={onCompanySwitch}>
          <span>↙</span> Switch to Company Workspace
        </button>}
        <button className="platform-signout" type="button" onClick={onSignOut}>⇥ Sign out</button>
      </div>
    </aside>
    {mobileOpen && <button type="button" className="platform-mobile-overlay" aria-label="Close navigation" onClick={() => setMobileOpen(false)}/>}
    <main className="platform-main">
      <header className="platform-topbar">
        <div className="platform-topbar-left">
          <button className="platform-menu-button" type="button" aria-label="Open platform navigation" onClick={() => setMobileOpen(true)}>☰</button>
          <div className="platform-breadcrumb"><span>Platform</span><span className="separator">/</span><strong>{heading.heading}</strong></div>
        </div>
        <div className="platform-topbar-actions">
          <span className={"platform-api " + apiHealth}><span className="platform-api-dot"/>{apiHealth === "online" ? "API online" : apiHealth === "checking" ? "Checking API" : "API offline"}</span>
          <button type="button" className="platform-refresh" onClick={() => setReloadKey(key => key + 1)} aria-label="Refresh current platform screen" title="Refresh">↻</button>
          <div className="platform-account"><span className="platform-account-avatar">{initials}</span><span><strong>{user.fullName}</strong><small>Super Administrator</small></span></div>
        </div>
      </header>
      <div className="platform-content">
        <div className="platform-page-intro">
          <div><div className="platform-kicker"><span/> ASSETMOV CONTROL CENTER</div>
            <h1>{heading.heading}</h1><p>{heading.description}</p>
          </div>
          <span className="platform-scope-tag">Global scope</span>
        </div>
        {error && <div role="alert" className="platform-alert error">{error}</div>}
        {page === "overview" ? <PlatformOverview key={reloadKey} onNavigate={navigate}/> :
          page === "companies" ? <PlatformAdminPage key={reloadKey} csrfToken={csrfToken} isPlatformAdmin section="companies"/> :
          page === "users" ? <PlatformUsers key={reloadKey} csrfToken={csrfToken} currentUserId={user.id}/> :
          page === "reports" ? <PlatformReports key={reloadKey}/> :
          page === "activities" ? <PlatformActivity key={reloadKey}/> :
          page === "billing" ? <PlatformBilling key={reloadKey}/> :
          page === "plans" ? <PlatformAdminPage key={reloadKey} csrfToken={csrfToken} isPlatformAdmin section="plans"/> :
          <PlatformSettings key={reloadKey} csrfToken={csrfToken}/>}
      </div>
      <footer className="platform-footer">
        <span>AssetMov · Platform administration</span>
        <span>Tenant data and company roles remain isolated</span>
      </footer>
    </main>
  </div>;
}
