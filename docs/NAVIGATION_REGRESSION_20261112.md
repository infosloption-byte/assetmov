# AssetMov navigation and form-state regression checks

## Why this patch exists

Two problems were reported during local WAMP browser acceptance:

1. Switching away from the browser and returning closed an unsaved New Asset form.
   The root app had registered `window.focus` and `visibilitychange` listeners
   that incremented `billingEpoch`. The billing effect cleared `billingStatus`
   and the render gate replaced the current screen; React unmounted the modal.
2. The app used only component state for the active page (and separate Platform
   Console state), so every refresh returned to Overview and the URL stayed `/`.

## Changes

- Remove focus/visibility-triggered billing refresh. Explicit refreshes keep
  the last verified billing result while the next result is loading.
- Canonical tenant pages: `/workspace/<tenant-slug>/overview`,
  `/assets`, `/transfers`, `/employees`, `/locations`, `/users`,
  `/profile`, `/master-data`, `/billing`.
- Canonical platform pages: `/platform/overview`, `/companies`, `/users`,
  `/reports`, `/activities`, `/billing`, `/plans`, `/settings`.
- Sidebar uses real links, History API pushState, and popstate restoration.
  Ctrl/Cmd-click can open a new browser tab; Back/Forward stays in sync.
- Initial login/session recovery resolves a route's company slug against the
  **authenticated** membership list. Non-members and non-platform-admin users
  cannot switch authority merely by typing a URL. API permission enforcement
  remains mandatory.
- Existing `/checkout` Paddle integration and `/?billing=pending` return
  behavior are preserved.
- `npm test` also runs route mapping tests in
  `frontend/src/navigation/routes.test.ts`.

## Functional acceptance checklist

1. Visit a company Asset Register page; start creating an asset, enter values
   and open the New Asset modal. Alt-Tab to another application for at least
   30 seconds, then return. Modal **and entered values must remain**. Repeat
   with employee editing, CSV import and transfer creation.
2. Navigate from Overview to Asset Register. Address bar must become
   `http://localhost:5176/workspace/<your-tenant-slug>/assets`.
   Press F5: the same Asset Register page should reopen after session restore.
   **F5 does not promise to retain unsubmitted modal fields.**
3. Navigate to Employees, Locations, Master Data, Profile, Users & Roles and
   Billing. Copy each URL into a new tab and confirm the requested page opens.
4. Navigate through 3+ screens and press browser Back and Forward. The URL,
   active sidebar state and content must agree after each movement.
5. For a Platform Super Admin, navigate to Companies, Users, Reports, Billing
   and Settings. Copy a direct `/platform/companies` link, refresh and use Back.
   A user with **no company memberships** must still enter the Platform Console.
6. Switch between two authorized companies: both URL slugs and API tenant
   context must switch; Back must restore the correct prior company.
7. Paste a workspace URL for a company outside the account's memberships.
   App must not load that company's data. Paste a `/platform/companies` URL
   as an ordinary tenant user: access must be denied.
8. Open a protected deep link while signed out. Sign in with an authorized
   account; the requested page must open instead of reverting to Overview.
9. Click explicit Recheck subscription while a company form is open. If the
   status remains valid, its modal must not disappear due merely to loading.
10. Verify `/?accountAction=reset&token=...` still opens account recovery,
    `/checkout?_ptxn=...` still opens hosted checkout, and
    `/?billing=pending` still opens company billing after authenticated return.

## Server fallback

Vite development mode normally serves `index.html` for SPA deep links.
For a static deployment, the web server **must** route unknown frontend paths
to `index.html` (while leaving actual assets and `/api` routes intact).
Example Nginx frontend location:

```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

Apache deployments need the equivalent frontend-only rewrite. Without this,
typing `/workspace/<slug>/assets` directly could return a server 404 even
though in-app navigation works. Do not forward API requests to `index.html`.

## Commands

```powershell
cd C:\wamp\www\html\assetmov
git pull --ff-only origin feature/p0-hardening-company-assets-20261111
npm run typecheck
npm run lint
npm test
npm run build
```

This is a frontend-only change. No Prisma migrations or database reset are
required. It does **not** implement draft persistence across intentional page
reloads; that remains a separate feature. Do not merge PR #12 until static and
manual browser checks pass.
