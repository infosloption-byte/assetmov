# AssetMov Delivery Roadmap

The roadmap combines reusable legacy capabilities with SaaS foundations missing from the old bank-specific app. Tasks are tracked in [TASKS.md](TASKS.md).

## Phase 0 — Discovery and foundation

**Goal:** Establish an auditable specification and a reproducible development baseline.

- [x] Inspect the legacy Laravel repository structure, major modules, routes, models, controller actions and SQL schema.
- [x] Catalogue confirmed feature areas and reconstruct primary process flows.
- [x] Identify modernization risks and tenant-isolation requirements.
- [ ] Create monorepo scaffold for React frontend and Node API.
- [ ] Establish local MySQL, Prisma migration workflow and validated environment configuration.
- [ ] Add lint, formatting, type-check and CI checks.

**Exit criteria:** Developers can start both apps locally, connect to disposable MySQL, run migrations and tests, and understand the product scope.

## Phase 1 — SaaS identity and tenant boundaries (P0)

- Tenant creation and owner onboarding.
- User account verification, login/logout, password reset, session expiry/rotation.
- Tenant memberships, invitations and tenant-scoped role/permission model.
- API middleware for trusted tenant context and location-scope policies.
- Cross-tenant isolation tests for read/write/delete/export/file access.
- Platform administration separated from customer tenant roles.

**Exit criteria:** A user can belong to one or more organizations; all tenant APIs prove isolation in automated tests.

## Phase 2 — Organization and master data (P0)

- Tenant settings and numbering conventions.
- Location types and parent-child location hierarchy.
- Employees/custodians, workforce type/designation and location association.
- Categories, asset models, manufacturers, suppliers, service types, depreciation configuration.
- Typed custom-field definitions per asset model/category.
- Master-data status/deactivation, validation and referential-integrity behavior.

**Exit criteria:** An administrator can configure a tenant's organization and masters without code changes.

## Phase 3 — Asset register (P0)

- Asset create/edit/list/detail with search, filters, sorting and pagination.
- Inventory number policy and duplicate handling.
- Financial, purchase, warranty, supplier/manufacturer, model/category and custom fields.
- Asset image/document attachment with secure private storage.
- Current state/location/custodian and chronological transaction timeline.
- Status-safe archive/restore, damage and disposal with reason/permission/audit.
- Bulk import wizard, dry-run validation, row-level failures and import summary.

**Exit criteria:** Assets can be created and maintained safely; key fields and listing filters match the legacy business need.

## Phase 4 — Assignment, transfer, check-in/out and receipts (P0)

- Single/bulk assignment to employee/location.
- Unassignment and return-to-stock rules.
- Transfer/issue notes with selected asset lines and origin/destination validation.
- In-transit reservation and duplicate-transfer protection.
- Receive/accept/reject with partial-receipt policy and GRN/receipt generation.
- Printable transfer/receipt documents and status queues.
- Location-scope authorization and movement audit history.

**Exit criteria:** One asset cannot be concurrently assigned/transferred twice; accepted transfers reconcile ledger and current state.

## Phase 5 — Requests and approvals (P1)

- Asset/software request create/list/detail/edit/cancel.
- Tenant configurable approval route and notifications.
- Approve/partial approve/reject/return-for-changes decisions with reason history.
- Replacement handling and stock/procurement fulfillment links.
- Send-to-service or fulfillment handoff as an explicit supported decision.
- Request ageing and approval queue reporting.

**Exit criteria:** Each request has a reconstructable decision trail and clear fulfillment status.

## Phase 6 — Service, repairs and upgrades (P1)

- Service work order create/update/list/detail.
- Start/complete/cancel service with dates, cost, provider, notes and result.
- Availability rules while an asset is in service.
- Repair/release, warranty context, history, cost totals and reports.
- Upgrade/subcomponent relationship, history and controlled unassign/end behavior.

**Exit criteria:** Maintenance and upgrade operations cannot silently corrupt assignment/location history.

## Phase 7 — Software licenses and barcodes (P1)

- Software types and entitlement/license register.
- Supplier/manufacturer, start/end/expiry, capacity and assignment records.
- Seat-capacity/duplicate-assignment controls and expiry warnings.
- Barcode/QR generation, print layouts and scan-to-asset lookup.
- Barcoded bulk print and label layout settings.

**Exit criteria:** License capacity and tag assignment history are reliable and exportable.

## Phase 8 — Physical audits and reporting (P1)

- Physical audit sessions and expected inventory snapshots.
- Scan/search workflows and discrepancy classifications.
- Review/sign-off, evidence/notes, approved corrective transactions.
- Dashboard summaries and operational queues.
- Asset detail/timeline/location, user-wise, employee, request, service, software, supplier/manufacturer, depreciation and audit-trail reports.
- Permission-aware filters and CSV/XLSX/PDF exports; asynchronous exports for large reports.
- Saved report presets/custom report builder after core reports are stable.

**Exit criteria:** Users can reconcile physical inventory and export tenant/location-scoped evidence without cross-tenant leakage.

## Phase 9 — Notifications, operations and SaaS launch (P1/P2)

- Email notifications and in-app notification centre.
- Data-driven, versioned subscription plans and feature entitlements configured by Platform Super Admin.
- Resource and period limits for assets, users, locations, roles, custom fields, file storage, imports, exports and API usage as appropriate.
- Shared server-side feature/quota enforcement across UI/API, bulk actions, files, reports, exports and background jobs.
- Usage dashboard and warning thresholds, concurrency-safe quota accounting and reconciliation.
- Subscription lifecycle and billing provider, signed/idempotent webhooks, trials, payment grace, suspension/reactivation, upgrade/downgrade/cancel flows.
- Safe over-limit behavior preserving data after downgrade; documented export and retention policy.
- Full entitlement/quota tests for boundary values, concurrent consumption, tenant isolation and billing transitions.
- See [SUBSCRIPTION_GUARDRAILS.md](SUBSCRIPTION_GUARDRAILS.md) for proposed default plan limits.
- Security review, dependency scanning, backups and restore drill, observability, rate limits, retention policy and incident playbooks.
- Production deployment, managed secrets, monitoring, runbooks and user help content.

**Exit criteria:** Production onboarding, support and recovery processes are documented and tested.

## Phase 10 — Legacy migration and adoption (P1 before first real customer cutover)

- Authorized export and data-protection approval.
- Mapping workbook for table/field/status conversion.
- Dry-run importer with resumability and deterministic idempotency.
- User invitation rather than credential migration.
- Data reconciliation by tenant/location/status and finance totals.
- User acceptance test, backup/rollback plan and cutover checklist.
- Training and support procedure.

**Exit criteria:** Customer signs off reconciliation and can run day-to-day processes in the new system.
