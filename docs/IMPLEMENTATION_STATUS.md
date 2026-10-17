# AssetMov Implementation Status

**Last review:** 2026-10-17  
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

The current feature branch adds a subscription-plan model, a tenant-subscription model, and a separate platform audit log. It also adds protected Platform Super Admin APIs to list/create/update plans, search companies with asset/active-user counts, assign a plan, start a server-timed trial, activate a company, or suspend a company. New company registration now assigns the configured active Trial plan. A safe, idempotent plan seed command provides the proposed defaults without overwriting plan values after an administrator edits them.

These changes are source-committed on `feat/platform-subscription-foundation`; they must not be treated as accepted until the schema is validated, the initial Prisma migration is reviewed/applied, client generation/build/lint/tests pass, and database-backed route tests pass. The first Platform Super Admin must be provisioned out-of-band; there is no self-promotion registration option. Setup notes are in [PLATFORM_ADMIN_BOOTSTRAP.md](PLATFORM_ADMIN_BOOTSTRAP.md).

Single-asset creation now has an initial quota/trial check: it locks the tenant subscription row, checks status and the stored trial end time, counts retained tenant assets, and returns a structured PLAN_LIMIT_REACHED error when the cap is reached. Pure policy tests for cap and trial boundaries are committed to the backend test script but have not been executed.

Not included or not yet verified: Platform Admin or Company Admin UI, company usage screen, active-user quota enforcement, uploaded-file storage tracking, quota enforcement on future bulk/import paths, trial-expiry blocking across the other mutating workflows, payment integration, or DB-backed concurrency tests.

## Verification status

### Locally verified on 2026-10-17

The developer ran the following commands from the repository root against the current `main` source:

- `npm run db:generate` — passed; Prisma Client 7.10.1 generated.
- `npm run typecheck` — passed for both frontend and backend.
- `npm run lint` — passed for both frontend and backend.
- `npm test` — 29 tests passed, 0 failed.
- `npm run build` — frontend production build and backend TypeScript compilation passed.

These are developer-reported local results. They do not establish database migration, API integration, browser acceptance, production-readiness, or successful GitHub Actions.

### Still outstanding before accepting the foundation

- Run `npm run db:validate` and confirm the schema validates in the local environment.
- Review/apply and commit the initial Prisma migration. As of this review, `backend/prisma/migrations/` is not present on `main`.
- Against a disposable MySQL database, exercise register/login/logout, workspace context, location create/list, asset create/list/detail/update, CSRF rejection, permission denial, subscription/trial behavior, and cross-tenant isolation.
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
- **Partially drafted on the feature branch, not yet verified:** separate Platform Super Admin API authorization, plan CRUD, tenant listing and subscription assignment.
- **Still outstanding:** Platform Super Admin and Company Admin UI; Company Admin self-service for users, custom roles and permission grants; invitations; tenant preferences; category/model/custom-field configuration; full server-enforced resource quotas/trial expiry; full cross-tenant authorization regression suite.
- The first registration role is a tenant owner, not a Platform Super Admin.
- The existing tenant-aware schema and route checks are a foundation only; successful build, generated Prisma client, migrations, DB-backed integration tests and CI remain to be verified.

Do not claim that platform/company administration or full SaaS security is complete until the outstanding tasks have been implemented and accepted against the product requirements.


## Subscription guardrails — initial scaffold drafted; enforcement not implemented

The simplified subscription rules are documented in [SUBSCRIPTION_GUARDRAILS.md](SUBSCRIPTION_GUARDRAILS.md). The only plan dimensions are asset limit, active-user limit, storage allowance and trial duration. Proposed values remain planning defaults, not finalized commercial terms.

The feature branch includes source for the schema, platform plan/tenant subscription APIs, audit records, a safe defaults seed and Trial assignment at signup. It is not accepted until schema/migration, build/CI and database-backed tests pass.

Still outstanding:
- Review and apply the initial migration containing plan/subscription/platform audit tables.
- Platform and Company Admin screens.
- Company Admin usage view.
- Server-side asset, active-user and storage enforcement with concurrency protection.
- Server-side trial expiry.
- Safe behavior for reached limits and downgrades.
- Billing lifecycle/provider integration if selected.
- DB-backed tests for limits, trial expiry, concurrency and cross-tenant isolation.

Do not describe subscription limits as implemented until they are enforced server-side and verified in successful CI.
