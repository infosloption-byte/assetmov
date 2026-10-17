# AssetMov Task Checklist

Use this as the working implementation checklist. Keep tasks unchecked until implemented **and tested**. Link pull requests/commits beside the relevant task when work begins.

## A. Repository and developer experience

- [x] Create `frontend/` React + TypeScript + Vite app and a responsive app shell (source committed; build still needs verification).
- [x] Create `backend/` Node.js + TypeScript + Express API (source committed; build still needs verification).
- [x] Add ESLint/formatter configs and scripts for lint, typecheck, tests and build (locally verified 2026-10-17).
- [x] Add validated environment config; commit only `.env.example`.
- [x] Add Docker Compose for local MySQL and local startup instructions.
- [ ] Add database reset and safe development seed scripts.
- [x] Add the initial Prisma schema and migration command configuration.
- [x] Generate the Prisma client locally (2026-10-17).\n- [ ] Run explicit schema validation, then generate, review and commit the first Prisma migration.
- [x] Add a CI workflow configuration for lint, typecheck, unit tests, schema validation and builds.
- [ ] Resolve the observed Actions `startup_failure`/zero-job state and obtain one successful CI run.
- [x] Add a database readiness endpoint and structured error/logging conventions (runtime verification remains).

## B. Identity, SaaS and authorization — P0

- [x] Tenant, user, session, membership, role and permission schema (schema validation remains).
- [x] Organization registration, trial tenant creation and initial owner membership.
- [ ] Add email verification and abuse protections before public launch.
- [x] Login/logout, session issuance/expiry, session restoration and CSRF-protected logout.
- [ ] Add password reset, email verification and user-visible session revocation.
- [x] Secure session cookie, CSRF middleware and authentication/API rate limits.
- [ ] Review throttling/lockout policy against production abuse scenarios.
- [x] Role/permission schema, seeded owner permission set and request permission helpers.
- [ ] Add tenant admin UI for member/role assignment and permission editing.
- [x] Tenant membership middleware, permission gates and hierarchical location-scope resolution.
- [ ] Implement a separate Platform Super Admin identity/permission scope and protected platform-admin area; never represent it as a tenant role. (API foundation is drafted on `feat/platform-subscription-foundation`; remain unchecked until verified, and the UI is still outstanding.)
- [ ] Implement tenant/company administration for company profile, settings, users and memberships.
- [ ] Add tenant admin UI to create/update/deactivate custom roles and assign permission-catalogue actions.
- [ ] Prevent privilege escalation: a tenant admin cannot grant platform permissions or permissions they cannot delegate; protect last-owner/admin recovery.
- [ ] Add invitations, membership activation/deactivation and tenant-scoped session revocation.
- [ ] Add platform tenant lifecycle controls (trial/active/suspended/cancelled), with reasons and audit.
- [ ] Keep subscription state and asset/user/storage limits separate from role permissions; enforce each relevant rule server-side.
- [ ] Add tests proving platform routes reject company admins and company routes never allow cross-tenant escalation.
- [ ] Extend audit events to all membership, role, session-revocation and security administration changes (tenant creation and asset/location writes are currently audited).
- [ ] Write cross-tenant IDOR tests for list/detail/create/update/delete/search/export/upload/download.
- [ ] Maintain a documented authorization matrix for platform roles, tenant roles, permissions, location scope and subscription status/resource limits.
- [ ] Add two-tenant regression fixtures and require isolation tests for every new module.
- [ ] Add authorization matrix and seed development roles/data.

## C. Tenant setup and master data — P0

- [ ] Tenant preferences (timezone, locale, currency, date format, fiscal year).
- [ ] Company profile/setup wizard, tenant-specific defaults and safe update policies.
- [ ] Build a tenant-owned category/model/custom-field administration UI; fields must be type-validated and drive asset forms dynamically.
- [x] Location list/search/create endpoint and frontend screen.
- [ ] Add location edit/deactivate/delete-safe flows; current location API is list/create only.
- [x] Location descendant expansion helper and tenant membership location-scope middleware.
- [x] Employee/custodian list, search, create and edit APIs/UI with tenant and location-scope checks.
- [ ] Add employee-type/designation fields and safe deactivate/reactivate flows.
- [x] Employee home-location assignment/change with before/after audit events.
- [ ] Add a dedicated employee location-history timeline.
- [ ] Asset categories and asset model CRUD.
- [ ] Typed custom-field schema (text, number, date, boolean, select, etc.).
- [ ] Supplier and manufacturer CRUD.
- [ ] Service types and depreciation settings.
- [ ] Safe archive/deactivation and referential integrity for master data.

## D. Asset register — P0

- [x] Define initial lifecycle statuses, allowed transitions and unit tests (tests have not yet been executed in CI).
- [x] Add tenant-scoped inventory number uniqueness.
- [ ] Implement configurable automatic numbering sequences and concurrency-safe allocation.
- [x] Add tenant-scoped asset list/detail/create and metadata-update API routes.
- [ ] Complete status actions, archive/restore and lifecycle mutations.
- [x] Add asset profile with basic finance/warranty fields, linked master data and event timeline.
- [ ] Add typed custom-field forms and complete ownership/financial detail coverage.
- [x] Add search by inventory number, title, asset reference and serial number; status filter; pagination support in API.
- [ ] Add category/model, location, custodian and warranty filters to UI/API.
- [x] Add API pagination and initial table loading/empty/error states.
- [ ] Add sort controls and UI pagination controls (the first UI request is capped at 100).
- [ ] Attachment upload/download authorization and retention.
- [x] Add a basic asset event timeline and write initial registration/correction transactions.
- [ ] Implement movement services so every state change updates projection and ledger atomically.
- [ ] Controlled damage/disposal/archive/restore workflows with reasons.
- [ ] Bulk import preview, duplicate checks, row-level errors and retry.
- [x] Add unit tests for asset lifecycle policy, custody assignment policy, location-scope expansion, transfer status outcomes, subscription policy and password hashing (29 passed locally on 2026-10-17; CI verification remains outstanding).
- [x] Execute existing backend unit tests locally (29 passed, 0 failed on 2026-10-17).\n- [ ] Add API/DB integration tests, cross-tenant tests and browser acceptance tests.

## E. Movement, assignment and receipts — P0

- [x] Single asset assignment and return-to-stock endpoints/UI; both append lifecycle transactions and audit events.
- [ ] Run DB-backed assignment/unassignment integration tests.
- [ ] Bulk assignment with documented atomicity and per-item result.
- [x] Transfer header and transfer-line schema for asset movements.
- [x] Dispatch validation and in-transit reservation inside a database transaction, with conditional updates to prevent duplicate dispatch.
- [x] Tenant/location-scoped incoming/outgoing transfer list and detail API/UI, gated by transfer permissions.
- [x] Per-line accept/reject decisions and partial receiving; the API requires a rejection reason and returns rejected assets to origin in this first workflow.
- [ ] GRN/receipt generation and printable document.
- [x] Conditional asset updates reject duplicate/concurrent dispatch, and transfer receipt updates lock the transfer header.
- [ ] Verify movement concurrency with DB-backed integration tests.
- [x] Transfer events record actor, locations, notes and audit data; asset detail renders lifecycle history.
- [ ] Transfer end-to-end test including rejection and race conditions (unit tests cover the pure transfer-status summary only).

## F. Requests and approvals — P1

- [ ] Request header and request line schemas for asset/software requests.
- [ ] Approval policy and approver resolution.
- [ ] Pending/approved/partially approved/rejected/changes-requested/cancelled states.
- [ ] Replacement handling and decision reason/timestamps.
- [ ] Fulfillment linkage to inventory allocation or procurement follow-up.
- [ ] Notification hooks and request reports.
- [ ] Permissions and end-to-end approval tests.

## G. Maintenance and upgrade — P1

- [ ] Service/repair work orders and service-type administration.
- [ ] Start, complete, cancel, outcome and cost history.
- [ ] Prevent checkout/assignment while service rules block availability.
- [ ] Warranty context and service/provider history.
- [ ] Asset upgrade/subcomponent relationships and end/unassign operation.
- [ ] Maintenance and upgrade history/report tests.

## H. Software licensing and barcodes — P1

- [ ] Software types and entitlement/license CRUD.
- [ ] Entitlement capacity and seat assignment/unassignment.
- [ ] Expiry notifications and over-allocation checks.
- [ ] Tenant-configurable optional device/license identifiers.
- [ ] Barcode/QR generation and secure scan lookup.
- [ ] Single and bulk printable labels.
- [ ] License and barcode permission/integration tests.

## I. Physical audit — P1

- [ ] Audit session, location scope and expected inventory snapshot.
- [ ] Scan/search asset identification workflow.
- [ ] Found, missing, extra, moved, damaged and tag-mismatch findings.
- [ ] Evidence/comments and reviewer sign-off.
- [ ] Approved corrective transactions instead of silent state overwrite.
- [ ] Audit exports and reconciliation tests.

## J. Reports, dashboard and exports — P1

- [ ] Tenant-scoped dashboard cards and operational queues.
- [ ] Asset summary, detail/timeline and location reports.
- [ ] Employee/user asset reports.
- [ ] Request/approval and service reports.
- [ ] Software/license, supplier/manufacturer and depreciation reports.
- [ ] Audit trail and physical audit reports.
- [ ] CSV/XLSX/PDF exports with permission checks.
- [ ] Saved filters/report presets; custom query builder only after safe query contracts.
- [ ] Test report filters and cross-tenant export boundaries.

## K. SaaS readiness and operations — P1/P2

- [ ] Add simple subscription/plan schema: asset limit, active-user limit, storage limit and trial duration. (Schema/API source is drafted on `feat/platform-subscription-foundation`; remain unchecked until migration, build and DB tests pass.)
- [ ] Add dedicated Platform Super Admin plan management and tenant plan assignment screens.
- [ ] Add Company Admin plan/usage view showing asset count, active users, storage usage and trial/renewal information.
- [ ] Enforce asset caps across API, bulk actions and imports with concurrency-safe behavior. (Single-asset creation now has a tenant-subscription row lock and quota/trial policy check on `feat/platform-subscription-foundation`; keep this unchecked until tests pass and every asset-creating path is covered.)
- [ ] Enforce active-user caps across invitations, membership creation and reactivation.
- [ ] Enforce storage caps during uploads, including concurrent upload reservations and cleanup on failure.
- [ ] Enforce trial expiry using server-side timestamps and the configured trial policy.
- [ ] Preserve existing data after a limit is reached or plan is downgraded; block only additional consumption over the cap.
- [ ] Add usage warnings at configurable thresholds and a clear upgrade path.
- [ ] Add subscription status, billing-period and cancellation fields when billing integration is implemented.
- [ ] Add verified, idempotent payment webhooks if a payment provider is integrated.
- [ ] Add database-backed tests for limit boundaries, concurrency, trial expiry, over-limit downgrade and tenant isolation.
- [ ] Complete accessibility, responsive UX, security review, dependency scans, backup/restore, observability and production runbooks.

## L. Legacy data migration

- [ ] Confirm approved customer export and permitted personal-data use.
- [ ] Profile legacy tables/status values without committing exported rows.
- [ ] Produce legacy-to-new field/status mapping and exception rules.
- [ ] Build idempotent staged import with dry-run and resumability.
- [ ] Import tenant masters and location/employee hierarchy first.
- [ ] Import assets, current state and available movement history.
- [ ] Import requests, service, license and audit history as permitted.
- [ ] Invite users to reset credentials; never copy legacy sessions/tokens.
- [ ] Reconcile row counts and key totals; obtain customer sign-off.
- [ ] Document rollback and cutover.

## Product architecture rule

The authoritative SaaS requirements are in [SAAS_PRODUCT_REQUIREMENTS.md](SAAS_PRODUCT_REQUIREMENTS.md); subscription enforcement details are in [SUBSCRIPTION_GUARDRAILS.md](SUBSCRIPTION_GUARDRAILS.md). This checklist must be interpreted through its Platform Super Admin / Company Admin boundary. No company-owned feature is complete without tenant isolation, tenant-configurable data, server-side permissions, location scope where relevant and tests.

## Current implementation branch

**Draft PR:** `feat/platform-subscription-foundation` adds the plan/subscription schema, protected Platform Super Admin plan and tenant-subscription APIs, platform audit records, safe proposed-plan seeding and Trial assignment during registration.

This is not accepted work yet. Keep the related checklist items unchecked until the initial Prisma migration is reviewed and committed, schema/client generation/build/lint/tests pass, and DB-backed tests prove platform-vs-company authorization, trial dates, tenant assignment and audit behavior. Single-asset creation now has a serialized cap check and pure policy tests, but the tests have not run and active-user/storage limits plus trial enforcement across the other write paths remain outstanding.
