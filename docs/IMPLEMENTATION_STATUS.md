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
- Pure policy unit-test source covers lifecycle status, assignment eligibility, location hierarchy, transfer status, and password hashing; execution remains unverified.
- Transfer list/detail/dispatch/receipt UI with asset selection, partial decisions and rejection reasons.

## Verification not yet confirmed

The GitHub Actions runs visible during the current review report `startup_failure` and have zero jobs, so there is no successful CI result to rely on. I have not confirmed a complete local `npm install`, Prisma schema validation, generated-client build, database migration, or end-to-end browser run from this environment.

Before treating this as a validated foundation:
1. Run installation from the repository root using Node.js 22.
2. Start local MySQL and copy both `.env.example` files.
3. Run `npm run db:validate`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
4. Generate and commit the first reviewed Prisma migration.
5. Exercise register/login/logout, workspace context, location create/list, asset create/list/detail/update, CSRF rejection, permission denial, and cross-tenant isolation against disposable MySQL.
6. Fix every failure and obtain a successful CI run before moving data from a real customer.

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
- **Not yet implemented/verified:** separate Platform Super Admin authorization and administration UI; complete Company Admin self-service for users, custom roles and permission grants; invitations; tenant preferences; category/model/custom-field configuration; plans and server-enforced entitlements; full cross-tenant authorization regression suite.
- The first registration role is a tenant owner, not a Platform Super Admin.
- The existing tenant-aware schema and route checks are a foundation only; successful build, generated Prisma client, migrations, DB-backed integration tests and CI remain to be verified.

Do not claim that platform/company administration or full SaaS security is complete until the outstanding tasks have been implemented and accepted against the product requirements.


## Subscription guardrails — specified, not implemented

The simplified subscription rules are documented in [SUBSCRIPTION_GUARDRAILS.md](SUBSCRIPTION_GUARDRAILS.md). The only plan dimensions are asset limit, active-user limit, storage allowance and trial duration. Proposed values remain planning defaults, not finalized commercial terms.

Still outstanding:
- Plan/subscription schema and migration.
- Platform Super Admin plan controls and tenant plan assignment.
- Company Admin usage view.
- Server-side asset, active-user and storage enforcement with concurrency protection.
- Server-side trial expiry.
- Safe behavior for reached limits and downgrades.
- Billing lifecycle/provider integration if selected.
- DB-backed tests for limits, trial expiry, concurrency and cross-tenant isolation.

Do not describe subscription limits as implemented until they are enforced server-side and verified in successful CI.
