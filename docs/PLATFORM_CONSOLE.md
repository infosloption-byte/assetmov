# AssetMov Dedicated Platform Console

**Merged:** `main` on 2026-11-11 via PR #8, following #6 and #7.  
**Status:** WAMP TypeScript/lint/37 unit tests/build and API MySQL acceptance passed on the combined PR #9 stack; browser walkthrough, Paddle sandbox and GitHub Actions were deferred by the owner.

## Required behavior

After an operator is promoted in the database using `User.isPlatformAdmin = true`, the next login or session restoration must enter the **independent Platform Console**, not the company asset dashboard. A Platform Admin needs no company membership. If that operator also has a company membership, a deliberate **Switch to Company Workspace** button opens the company's existing interface; the company sidebar has a **Platform Console** button to switch back.

The two environments share secure sign-in but not tenant privileges or menus. Platform access is enforced via the current `isPlatformAdmin` database flag on every API request. A company cannot create a custom role that inherits platform rights.

## Platform Console navigation

| Group | Screen | Functionality |
|---|---|---|
| Platform | **Overview** | Cross-tenant companies, active memberships, asset totals, recent paid transactions, subscription/operational health and shortcuts |
| Platform | **Companies** | Search/paginate all companies; inspect subscriptions, plan, assets, active users and storage; audit manual subscription changes and independently suspend/reinstate tenant access |
| Platform | **Users** | Search users across companies; show platform status, tenant memberships/roles and session counts; disable/restore ordinary accounts with mandatory audit reason and immediate session revocation; protected platform-admin accounts |
| Operations | **Platform Reports** | 30-day registration trend; asset, subscription, tenant-status and plan distributions; recent companies and total storage |
| Operations | **Activities & Security** | Paginated, filtered platform and company audit logs; active session telemetry, disabled/unverified accounts, platform operators and failed provider event counts |
| Finance | **Billing & Revenue** | Provider-recorded paid revenue grouped by currency, other payment statuses, subscriptions needing attention, plans/subscriber counts and recent transactions |
| Finance | **Plans & Limits** | Existing audited plan CRUD, asset/user/storage/trial limits and AssetMov-specific Paddle sandbox/live product/price mappings |
| System | **Settings** | Registration enabled/disabled (enforced in onboarding transaction), platform support email, internal operator note; CSRF and audit reason required |

All dropdown controls reuse the themed `ThemeSelect` rather than native browser select styling. A responsive, separate sidebar includes the exact group headings and menu labels above.

## New additive database migration

`backend/prisma/migrations/20261024000300_platform_console_settings/migration.sql` adds a singleton global `PlatformSetting` table and seeds a registration-open default. No existing user, company, asset, role or billing rows are replaced.

The branch is stacked on previous PRs: earlier migrations **must apply in order**. Back up the development database before deployment. Never run destructive resets on `assetmov`.

## Platform APIs

All paths below require a valid session with `isPlatformAdmin=true`. No `X-Tenant-Id` is necessary or used. Sensitive writes require CSRF and a reason.

| Endpoint | Use |
|---|---|
| `GET /api/platform-console/users` | Global user list with `q`, `page`, `pageSize`, tenant memberships and status |
| `PATCH /api/platform-console/users/:id/status` | Disable/restore ordinary account, revoke all sessions and audit |
| `GET /api/platform-console/reports` | Aggregated cross-tenant statistics and trends |
| `GET /api/platform-console/activities` | Paginated global audit stream with `source=all|platform|tenant` |
| `GET /api/platform-console/security` | Session and security operational overview |
| `GET /api/platform-console/billing` | Paddle billing transaction statuses, revenue grouped by currency, subscription health |
| `GET /api/platform-console/settings` | Read current global registration/support/operator configuration |
| `PATCH /api/platform-console/settings` | Save global settings with audit reason |

Companies and Plans & Limits reuse authorized `/api/platform/*` endpoints implemented in the prior administration branch. The existing `/api/platform/overview` drives the new cross-tenant Overview.

No company-level role can read or mutate those APIs. Platform admins cannot self-disable or disable other platform-admin accounts using the console; the latter require a separate trusted operator procedure.

## Acceptance checklist

1. Switch to latest `feature/dedicated-platform-console` branch.
2. Validate Prisma schema and deploy its additive migration into the **development** `assetmov` database; generate Prisma client.
3. Backend `lint`, `typecheck`, `typecheck:tests`, `test` and `build` must pass.
4. Frontend `lint`, `typecheck` and `build` must pass.
5. Run MySQL integration suite against **local `assetmov_test` only**, after applying the same additive migration and seeding plans. The suite tests a platform operator **with zero memberships**, denial of platform endpoints to company admins, all eight menu APIs, protected admin accounts, session revocation and registration closure.
6. Sign in as a promoted Platform Admin. Verify the **Platform** / **Operations** / **Finance** / **System** menus and eight screens; company asset navigation must not be shown.
7. On a dual-role account, confirm **Switch to Company Workspace** and **Platform Console** work in both directions without granting new permissions.
8. Verify user disabled/restored status, global registration control, reporting, activities and revenue against the test dataset.
9. Verify direct API use as a company admin gets 403 for every console endpoint.
10. Run desktop/tablet/mobile layout smoke tests and accessibility checks.
11. Address GitHub Actions `startup_failure` and re-run CI; follow the separate Linux MySQL portability and Paddle sandbox acceptance gates.

### Windows PowerShell commands

```powershell
cd C:\wamp\www\html\assetmov
git fetch origin
git switch --track origin/feature/dedicated-platform-console

cd backend
npm run db:validate
npm run db:deploy
npm run db:status
npm run db:generate
npm run lint
npm run typecheck
npm run typecheck:tests
npm test
npm run build

cd ..\frontend
npm run lint
npm run typecheck
npm run build
```

Integration, strictly on a local test database:

```powershell
cd C:\wamp\www\html\assetmov\backend
$env:DATABASE_URL="mysql://root:@127.0.0.1:3306/assetmov_test"
$env:ASSETMOV_RUN_DB_INTEGRATION_TESTS="1"
npm run db:deploy
npm run db:seed:plans
npm run test:integration
Remove-Item Env:DATABASE_URL
Remove-Item Env:ASSETMOV_RUN_DB_INTEGRATION_TESTS
```

Adjust the connection string for your local MySQL credentials. Restore overrides before starting the real local development API.

The final Platform Console mobile drawer now closes on Escape, exposes
`aria-expanded`, hides the closed drawer from keyboard focus and marks
background content inert while open. Company Admin role-only navigation also
falls back to an authorized tab. Both need real-browser verification using
[BROWSER_ACCEPTANCE.md](BROWSER_ACCEPTANCE.md).

## Not yet production accepted

- The merged stack was executed against the user's WAMP setup: all reported typecheck, lint, 37 unit tests, build and API integration checks passed before the latest browser-oriented UX changes. Live mobile/browser acceptance remains open.
- Platform reports and revenue pages provide factual operational aggregates from current DB records, not downloadable accounting reports, external SIEM events or a ledger.
- The security page shows sessions and recorded audit actions; it is **not** a complete failed-login, intrusion-detection or breach-monitoring service.
- Platform support email and internal operator notice are stored configuration; the notice is not a public tenant broadcast.
- Paddle live mode remains disabled until independently approved and tested on a real sandbox.
