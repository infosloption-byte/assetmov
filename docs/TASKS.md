# AssetMov Task Checklist

Use this as the working implementation checklist. Keep tasks unchecked until implemented **and tested**. Link pull requests/commits beside the relevant task when work begins.

## A. Repository and developer experience

- [x] Create `frontend/` React + TypeScript + Vite app and a responsive app shell (source committed; build still needs verification).
- [x] Create `backend/` Node.js + TypeScript + Express API (source committed; build still needs verification).
- [x] Add ESLint/formatter configs and scripts for lint, typecheck, tests and build (not yet confirmed passing).
- [x] Add validated environment config; commit only `.env.example`.
- [x] Add Docker Compose for local MySQL and local startup instructions.
- [ ] Add database reset and safe development seed scripts.
- [x] Add the initial Prisma schema and migration command configuration.
- [ ] Validate the schema, generate the Prisma client and commit the first reviewed migration.
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
- [ ] Separate platform-admin capabilities from tenant roles.
- [ ] Extend audit events to all membership, role, session-revocation and security administration changes (tenant creation and asset/location writes are currently audited).
- [ ] Write cross-tenant IDOR tests for list/detail/create/update/delete/search/export/upload/download.
- [ ] Add authorization matrix and seed development roles/data.

## C. Tenant setup and master data — P0

- [ ] Tenant preferences (timezone, locale, currency, date format, fiscal year).
- [x] Location list/search/create endpoint and frontend screen.
- [ ] Add location edit/deactivate/delete-safe flows; current location API is list/create only.
- [x] Location descendant expansion helper and tenant membership location-scope middleware.
- [ ] Employee/custodian CRUD and employee-type/designation support.
- [ ] Employee-to-location assignment and history.
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
- [x] Add unit tests for pure asset lifecycle policy, location-scope expansion and password hashing.
- [ ] Execute tests and add API/DB integration tests, cross-tenant tests and browser acceptance tests.

## E. Movement, assignment and receipts — P0

- [ ] Single assignment and unassignment.
- [ ] Bulk assignment with documented atomicity and per-item result.
- [ ] Transfer/issue note and transfer line models.
- [ ] Dispatch validation and in-transit reservation under DB transaction/locking.
- [ ] Receiving queues scoped to destination and receiving permission.
- [ ] Accept, partial accept, reject and discrepancy/reason policy.
- [ ] GRN/receipt generation and printable document.
- [ ] Prevent concurrent assignment/transfer of the same asset.
- [ ] Movement timeline, actor attribution and audit records.
- [ ] Transfer end-to-end test including rejection and race conditions.

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

- [ ] Subscription/plan/entitlement models and platform admin screens.
- [ ] Payment provider integration, signed webhooks and idempotency.
- [ ] Trial, plan limits, upgrade/downgrade, cancellation and grace states.
- [ ] Email/in-app notifications and template management.
- [ ] Dependency/security scans and threat model review.
- [ ] DB backup/restore drill, retention and disaster recovery procedures.
- [ ] Metrics/alerts, request correlation IDs and redacted logs.
- [ ] Production configuration, deployment workflow and runbooks.
- [ ] Accessibility, responsive UX and supported-browser review.

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

## Suggested next pull request

**Foundation PR:** monorepo scaffold, frontend app shell, backend health API, Prisma tenant-aware core schema, local MySQL setup, environment examples, CI baseline, and updated startup instructions. Do not implement workflow endpoints until tenant context and authorization scaffolding are in place.
