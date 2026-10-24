# AssetMov Implementation Status

## Dedicated Platform Console (2026-10-24; acceptance pending)

The stacked `feature/dedicated-platform-console` branch now routes promoted `isPlatformAdmin` accounts into an independent Platform Console rather than the company dashboard. Navigation groups: **Platform** (Overview, Companies, Users), **Operations** (Platform Reports, Activities & Security), **Finance** (Billing & Revenue, Plans & Limits), and **System** (Settings). Operators need no tenant membership; dual-role users can explicitly switch to their separate Company Workspace. New platform-only endpoints provide user oversight, account suspension/session revocation, cross-company reporting, audit/security telemetry, payment summaries, and audited global registration settings, with one additive settings migration.

This new branch has **not yet been validated by local backend/frontend builds, the new migration or MySQL integration suite**. Parent branch results do not establish new console correctness. See [PLATFORM_CONSOLE.md](PLATFORM_CONSOLE.md) for commands and acceptance gates.

## BuildHire-reference SaaS/Paddle implementation (2026-10-24; acceptance pending)

Reviewed BuildHire source from the `infosloption-byte/candidate` repository. The stacked `feature/paddle-saas-billing-admin` branch implements the reusable SaaS elements—company-scoped Paddle customers and checkout attempts, signed webhook reconciliation, provider-verified prices, payment history, quote/confirm plan changes, a responsive Company Billing & Plan screen, a Platform Admin billing activity overview and independent suspension. Existing tenant-scoped full Company Administrator (`TENANT_OWNER`) and **company-created custom roles/permissions** remain intact. BuildHire's fixed business roles are not imported.

A new **additive** Prisma migration `20261024000200_paddle_billing` is committed. Real sandbox provider credentials/products/domains are not configured in Git. The user has not run schema migration/TypeScript/lint/integration tests for this new branch yet, and no Paddle sandbox transaction was processed. Do not claim payment integration is live, validated, or production-ready. The earlier administration branch's 32 unit tests, MySQL acceptance and frontend builds were locally verified, but **these do not verify the new billing code**. Details and acceptance commands: [PADDLE_BILLING_ASSETMOV.md](PADDLE_BILLING_ASSETMOV.md).

## Coordinated administration/quota implementation (2026-10-24 — draft PR #6)

This feature branch contains a bulk set of additions: Platform Super Admin web UI, company subscription-usage display, stronger membership permission delegation, runtime custom-field validation and model editing, a tenant-scoped attachment API/storage budget, and broad database-acceptance assertions. See [ADMIN_QUOTAS_BATCH.md](ADMIN_QUOTAS_BATCH.md).

**Local automated acceptance checkpoint passed (developer logs, 2026-10-24).** The local WAMP MySQL `assetmov` and `assetmov_test` databases both have all three committed migrations applied, including the additive storage migration. Backend ESLint, TypeScript, Prisma Client generation, production build, and **32/32 unit tests** passed. The expanded opt-in `assetmov_test` MySQL API acceptance suite passed **1/1** after correcting MySQL JSON comparison of unchanged model definitions. Frontend ESLint, TypeScript and Vite build also passed (39 transformed modules).

**This is not yet a production-accepted release.** Browser walkthroughs for Platform Admin, Company Admin, custom fields, attachments, quotas and transfers are pending; GitHub Actions continues to return `startup_failure` before tests run. The final production storage architecture and case-sensitive Linux MySQL migration rehearsal are also pending.

**Last review:** 2026-10-18  
**Repository:** [infosloption-byte/assetmov](https://github.com/infosloption-byte/assetmov)

This document separates source code committed from build/test verification. A feature is not considered fully accepted until install, migration, automated tests, and workflow-level acceptance checks have run.

## Implemented in the current source tree

### Repository foundation
- React + TypeScript + Vite frontend workspace.
- Express + TypeScript backend workspace.
- MySQL Docker Compose service and environment templates.
- Prisma schema foundation for tenants, users, sessions, memberships, roles, permissions, locations, employees, assets, asset transactions, requests, service records, licenses, tags, and audit events.
- Environment validation, structured logging, API error handling, health/readiness endpoint, CORS/origin guard, and API rate limiting.
- GitHub Actions workflow file configured for schema validation, lint, typecheck, tests, and builds.

### Identity and workspace context
- Organization registration creates an initial trial tenant and owner membership.
- Login verifies scrypt password hashes and creates server-side sessions.
- HttpOnly session cookie, session expiry, CSRF token, logout, session restoration.
- Workspace membership checks based on authenticated user plus selected `X-Tenant-Id`; client tenant selection alone does not grant access.
- Role permissions and hierarchical location-scope calculation.
- Workspace context endpoint: `GET /api/workspace/context`.

### Locations and inventory
- Location list/search and create endpoints and frontend screen.
- Employee/custodian list/search/create/edit API and frontend screen, including home-location and audit updates.
- Tenant-scoped asset list with search, status filter and pagination.
- Asset detail view with lifecycle transactions and linked service history.
- Asset create endpoint with tenant-scoped lookup validation, initial `REGISTERED` transaction, and audit event.
- Asset metadata/financial update endpoint; financial fields require `asset.financial.update`.
- Single assign/unassign endpoint and asset-profile UI, with same-location active-employee policy and custody transaction/audit events.
- Asset lifecycle transition guard and unit tests.
- Location-aware asset visibility/creation and audit history on asset writes.
- Transfer dispatch and receiving-decision endpoints, with tenant/location scope checks, per-line accept/reject decisions, transactional asset state changes, audit history and concurrency guards.
- Pure policy unit tests cover lifecycle status, assignment eligibility, location hierarchy, transfer status, subscription limits and password hashing; local execution passed on 2026-10-17 (29 passed, 0 failed).
- Transfer list/detail/dispatch/receipt UI with asset selection, partial decisions and rejection reasons.

## SaaS platform API foundation — drafted, not yet accepted

The current `main` branch includes a subscription-plan model, a tenant-subscription model, and a separate platform audit log. It also includes protected Platform Super Admin APIs to list/create/update plans, search companies with asset/active-user counts, assign a plan, start a server-timed trial, activate a company, or suspend a company. New company registration now assigns the configured active Trial plan. A safe, idempotent plan seed command provides the proposed defaults without overwriting plan values after an administrator edits them.

The plan/subscription schema and API foundation are present on `main`. Local schema validation, migration application, client generation, type checks, lint, unit tests and builds have passed; this is still not accepted as production-ready until database-backed route tests and cross-tenant authorization tests pass. The first Platform Super Admin must be provisioned out-of-band; there is no self-promotion registration option. Setup notes are in [PLATFORM_ADMIN_BOOTSTRAP.md](PLATFORM_ADMIN_BOOTSTRAP.md).

Single-asset creation now has an initial quota/trial check: it locks the tenant subscription row, checks status and the stored trial end time, counts retained tenant assets, and returns a structured PLAN_LIMIT_REACHED error when the cap is reached. Pure policy tests for cap and trial boundaries ran locally as part of the 29-test suite and passed; database-backed boundary and concurrency tests remain outstanding.

Not included or not yet verified: Platform Admin or Company Admin UI, company usage screen, active-user quota enforcement, uploaded-file storage tracking, quota enforcement on future bulk/import paths, trial-expiry blocking across the other mutating workflows, payment integration, or DB-backed concurrency tests.

## Database-backed acceptance suite

An opt-in integration suite has been added at `backend/tests/integration/api-acceptance.test.ts`. It requires explicit opt-in and refuses to run unless `DATABASE_URL` targets a local database named `assetmov_test`. It covers health/database readiness, registration, session restoration, login/logout and revocation, CSRF rejection, tenant/workspace isolation, location create/list, and asset create/list/detail. It cleans up its uniquely named test tenant/user records. The initial suite passed locally on 2026-10-18 (1/1, zero failures). Expanded platform-admin authorization, subscription management, auditing, asset-cap boundaries, expired-trial and suspended-subscription assertions are committed. The developer confirmed the first expansion passed locally on 2026-10-18; the newly added quota/trial assertions still need a local run.

The CI workflow now provisions disposable MySQL, applies committed migrations, seeds subscription plans, and runs both unit and database-backed tests. The CI container currently uses case-insensitive table-name behavior to match the WAMP-generated migration history. Validate migration portability on a default case-sensitive Linux MySQL instance before production deployment.

## Verification status

### Locally verified on 2026-10-17

The developer ran the following commands from the repository root against the current `main` source:

- `npm run db:generate` — passed; Prisma Client 7.10.1 generated.
- `npm run typecheck` — passed for both frontend and backend.
- `npm run lint` — passed for both frontend and backend.
- `npm test` — 29 tests passed, 0 failed.
- `npm run build` — frontend production build and backend TypeScript compilation passed.

These are developer-reported local results. The developer also confirmed schema validation and successful application of the committed migration history to local MySQL. The local database reports two migrations and is up to date. This does not establish API integration, browser acceptance, production-readiness, or successful GitHub Actions.

### Still outstanding before accepting the foundation

- [x] Run `npm run db:validate`; the Prisma schema validated locally on 2026-10-17.
- [x] Generate and apply both migrations to the local `assetmov` MySQL database on 2026-10-17; `npx prisma migrate status` reports 2 migrations and the database is up to date.
- [x] Commit both migration directories, `migration_lock.toml`, and the root `package-lock.json` to `main` in commit `8989ffc`.
- [x] Replay both committed migrations on a clean WAMP MySQL `assetmov_test` database (2026-10-18). Default case-sensitive Linux portability remains unverified.
- Initial opt-in API acceptance suite passed locally on disposable MySQL (2026-10-18). Expanded platform-admin permission, subscription and audit checks passed locally on 2026-10-18. Newly added asset-cap, trial-expiry and suspended-subscription integration assertions still need local verification; next add transfer, assignment concurrency and broader permission cases.
- Add database-backed transfer/assignment concurrency tests and route integration tests.
- Resolve the observed GitHub Actions `startup_failure`/zero-job state and obtain a successful CI run before accepting this as a validated foundation.

Do not reset or drop an existing database to make migration commands pass. If the local database contains tables or valuable data, back it up and inspect its state before attempting to create/apply the initial migration.

## Outstanding major modules

- Email verification, password reset, MFA/SSO, invitations and member administration.
- Location edit/deactivate, employee/custodian screens and custom asset-model fields.
- Asset movement transfer/issue note, in-transit reservation, receipt/GRN, rejection and check-in/out.
- Full asset assignment/unassignment, damage/disposal workflow and state transition services.
- Requests/approval queues and fulfillment.
- Maintenance/service work orders, upgrades, software seat management and barcode printing.
- Physical audits and discrepancy sign-off.
- Reports and PDF/XLSX exports, dashboard metrics, bulk import, notifications.
- SaaS subscription/billing, deployment, backup/restore and operational runbooks.
- Tenant isolation and authorization integration tests across every resource route.
- Authorized legacy data mapping, importer and reconciliation/cutover plan.

The legacy feature inventory and process flows remain in [LEGACY_FEATURE_AUDIT.md](LEGACY_FEATURE_AUDIT.md); see [TASKS.md](TASKS.md) and [ROADMAP.md](ROADMAP.md) for delivery planning.


## SaaS administration scope clarified

The product target is a true multi-tenant SaaS, not a copy of the legacy single-company application. [SAAS_PRODUCT_REQUIREMENTS.md](SAAS_PRODUCT_REQUIREMENTS.md) is the product source of truth.

- **Implemented partially:** tenant creation, first owner membership, tenant-scoped roles/permissions schema and selected tenant context.
- **Partially drafted on `main`, not yet verified:** separate Platform Super Admin API authorization, plan CRUD, tenant listing and subscription assignment.
- **Still outstanding:** Platform Super Admin and Company Admin UI; Company Admin self-service for users, custom roles and permission grants; invitations; tenant preferences; category/model/custom-field configuration; full server-enforced resource quotas/trial expiry; full cross-tenant authorization regression suite.
- The first registration role is a tenant owner, not a Platform Super Admin.
- The existing tenant-aware schema and route checks are a foundation only; successful build, generated Prisma client, migrations, DB-backed integration tests and CI remain to be verified.

Do not claim that platform/company administration or full SaaS security is complete until the outstanding tasks have been implemented and accepted against the product requirements.


## Subscription guardrails — initial scaffold drafted; enforcement not implemented

The simplified subscription rules are documented in [SUBSCRIPTION_GUARDRAILS.md](SUBSCRIPTION_GUARDRAILS.md). The only plan dimensions are asset limit, active-user limit, storage allowance and trial duration. Proposed values remain planning defaults, not finalized commercial terms.

The main branch includes source for the schema, platform plan/tenant subscription APIs, audit records, safe defaults seed and Trial assignment at signup. Local schema/migration and build checks have passed; database-backed tests and successful CI remain required.

Still outstanding:
- Verify the committed plan/subscription/platform audit migrations apply successfully on a clean disposable MySQL database.
- Platform and Company Admin screens.
- Company Admin usage view.
- Server-side asset, active-user and storage enforcement with concurrency protection.
- Server-side trial expiry.
- Safe behavior for reached limits and downgrades.
- Billing lifecycle/provider integration if selected.
- DB-backed tests for limits, trial expiry, concurrency and cross-tenant isolation.

Do not describe subscription limits as implemented until they are enforced server-side and verified in successful CI.
