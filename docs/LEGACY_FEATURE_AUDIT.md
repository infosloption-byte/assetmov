# Legacy Asset-Tracking Feature Audit

**Reference repository:** [infosloption-byte/asset-tracking](https://github.com/infosloption-byte/asset-tracking)  
**Audit date:** 2026-10-17  
**Purpose:** Capture behavior evidenced in the old code so AssetMov can rebuild the business processes without carrying forward its framework, implementation debt, or customer-specific assumptions.

## 1. What was inspected

The repository is a modular Laravel application. The application manifest pins Laravel **5.1.x** and PHP **>= 5.5.9**. The tracked SQL dump describes a MySQL 5.6-era schema with approximately 48 tables. Main business logic is under `core/app/Packages/sammy/`; supporting models and helpers are under `core/app/`.

The source tree contains feature packages for assets, asset models, categories, locations, employees, suppliers, manufacturers, check-in/out, requests, services, software licensing, upgrades, barcodes, asset audit, reports, configuration, menus, users, roles, and permissions. The review covered module route files, controllers/methods, key models/helpers, and the SQL table definitions. It was a code-level discovery review, **not** a production acceptance test of every screen and role.

## 2. Legacy feature catalogue

Legend: **Confirmed** means a route, controller, model, view, or schema artifact was found. It does not necessarily mean all edge cases are correct or tested in the old system.

| Area | Evidence / observed behavior | AssetMov direction |
|---|---|---|
| Dashboard | Dashboard routes and JSON endpoints load summary/bucket/category/location/request data. | Tenant-aware dashboard cards, charts, and actionable queues. |
| Asset register | Add, edit, list, detail, delete, trash/restore methods, dispose/damage actions, warranty calculation, and lookup endpoints. | Searchable asset register with lifecycle history and controlled archive/disposal. |
| Asset identity and finance | Inventory number, asset number, description, make/manufacturer, model, category/model type, supplier, location, account code, PO number, purchase date/value, scrap value, recovery period, depreciation type, and warranty fields appear in code/schema. | Explicit typed fields plus configurable custom attributes; tenant-scoped inventory-number uniqueness. |
| Custom asset attributes | Device/model and field-set/value models; dynamic fields returned for selected asset model. | Tenant-configurable schemas with field types, validation, and version-safe forms. |
| Bulk asset upload | Asset upload view, Excel-detail lookups, and upload controller action. | Import wizard with preview, validation, duplicate detection, row-level errors, and downloadable results. |
| Assignment and unassignment | Single and bulk asset assignment/unassignment. Employee and location relationship is reflected in asset transaction history. | Assignment history, custodian acknowledgement (optional), bulk actions, and permission checks. |
| Asset movement | Asset transactions track status, location type/location, employee, actor, type, and note. | Append-only movement ledger, transactional state change, conflict handling, and full timeline. |
| Check-in/check-out | Check-in and check-out views/actions; transfer workflows use issue notes, detail rows, and receipt records. Assets in service/upgrades are excluded from normal checkout candidates in observed code paths. | Explicit transfer state machine and valid-origin/destination checks. |
| Issue notes and receipt / GRN | Issue-note list/details/print; pending receipt/check-in and reject views; GRN list/details/print. | Transfer document created at dispatch; recipient accepts or rejects; accepted receipt posts the destination movement. |
| Requests and approvals | Create/edit/list requests, asset/software checks, approve/reject, replacement details, and send-to-service actions. Request tables include requested/approved quantity, status, request type, and approval details. | Request header/items, approval policy, decision history, fulfillment linkage, notifications. |
| Employee directory | Employee add/edit/list, hierarchy/type/designation/location association, status verification/rejection, and password reset flows. | Treat employees/custodians as workforce records; user accounts and memberships are separate concerns. |
| Locations | Location/type maintenance, parent hierarchy, hierarchical queries and location-scoped filters. | Tenant-specific site/region/branch/location tree; access scope must be enforced server-side. |
| Supplier / manufacturer / categories | Separate maintenance modules with active/status handling and in some cases soft-delete/trash views. | Tenant-scoped master data with safe deactivate/archive behavior. |
| Service / maintenance | Service records have service number/type, related asset, cost, service-in/start/completed dates, provider, notes, and actor; start/complete endpoints exist. | Maintenance work orders, status history, downtime, costs, and warranty/vendor linkage. |
| Software inventory and licenses | Software type, license record, dates, manufacturer, supplier, category/description, maximum users, and assignment records including MAC/reference/note fields. | License entitlement and seat assignment with expiry/capacity warnings; don't assume MAC address is always required. |
| Asset upgrades | Upgrade relationship/history and unassign/end action; upgrade assets can affect normal availability. | Parent/child component relationship, effective dates, and history-safe upgrade/unupgrade. |
| Barcodes | Barcode type master, barcode list, single/bulk print views. | Printable barcode/QR identifiers and reliable scanning; avoid exposing internal record IDs. |
| Physical asset audit | Asset-audit listing and print-all action found. A full discrepancy/reconciliation workflow was not proven by this route/controller review. | Design audit sessions, expected-vs-scanned reconciliation, missing/extra/damaged findings, sign-off, and corrective movement as a distinct workflow. |
| Audit trail | Shared audit logger records module/event/reference, actor, time, old/new JSON and IP; reporting/export views exist. | Append-only, tenant-scoped audit log with actor, action, entity, timestamp, correlation ID and redacted diffs. |
| Reports and exports | Report routes/views cover asset summaries/details/timeline/location, user-wise and employee summaries, requests, services, software, suppliers/manufacturers, depreciation, audit trail, plus custom/dynamic reports. PDF and Excel downloads exist for many reports. | Permission-aware report catalogue, filters, CSV/XLSX/PDF exports, stable asynchronous exports for large datasets. |
| Users, roles, permissions, menus | User CRUD/status/verification/rejection; roles, permissions, permission groups, and database-backed dynamic menu packages. Authentication uses a legacy Sentinel/Laravel setup. | Role-based and scoped authorization, tenant memberships, tenant-configurable roles/permissions and navigation derived from permissions. |
| Configuration | Configuration and hierarchical menu modules exist. | Tenant settings, numbering schemes, fiscal/currency/date preferences, custom fields and feature entitlements. |

### Likely legacy data entities

The SQL dump includes tables for assets, asset transactions, asset upgrades, asset barcodes, asset models/categories/field sets, manufacturers, suppliers, employees/types/designations, locations/types, user-location assignments, issue notes/details, GRNs/details, requests/details/statuses/types, services/types, software licenses/assignments, users, roles, permissions/groups, menu, and status/config-related records. The new database should be designed from product requirements rather than copied table-for-table.

## 3. Reconstructed process flows

### 3.1 Register an asset

1. An authorized user selects an asset category/model.
2. The UI loads the selected model's applicable fields.
3. User enters identity, supplier/manufacturer, financial, purchase, warranty, depreciation, location, and custom-field details.
4. The system validates the values and generates an inventory number according to a numbering policy.
5. In one database transaction, it creates the asset, creates the initial asset-location/status ledger entry, and records an audit event.
6. The asset appears in the register and reports.

A bulk-upload path should converge on the same validation and creation service instead of bypassing lifecycle rules.

### 3.2 Assign an asset to an employee or location

1. User searches assets within their permitted tenant and location scope.
2. API rechecks asset availability and actor permission.
3. An assignment transaction updates the current assignment projection and appends a ledger event.
4. The event records the actor, prior and new holder/location, event type, timestamp, and optional note.
5. Asset detail and reports show the current state plus historical timeline.

Bulk assignment must be atomic or return explicit per-row outcomes; it must never silently partially update a selection.

### 3.3 Transfer between locations (issue note → receipt/GRN)

1. Origin user selects eligible assets and a destination location.
2. The system validates tenant, origin scope, destination, and each asset's current state.
3. A transfer/issue document and its detail rows are created as **pending**.
4. Assets are reserved/marked in-transit so a second transfer cannot be created concurrently.
5. Receiving user reviews the document and accepts or rejects each allowed unit according to policy.
6. Acceptance posts the asset transaction into the destination location and creates a receipt/GRN record; rejection records a reason and routes the asset back to the defined resolution workflow.
7. Every decision is timestamped and auditable; printable transfer/receipt documents are available.

### 3.4 Request and approval

1. A requester submits an asset or software request with type, item/model, quantity, and business reason.
2. The system resolves the appropriate approver(s) from tenant policy, employee hierarchy, location, or role.
3. An approver approves, partially approves, rejects, or requests changes; replacement details and decisions are recorded.
4. Fulfillment reserves/assigns existing stock or creates a procurement follow-up, depending on tenant configuration.
5. The request closes only when the defined fulfillment criteria are met, with links to resulting asset transactions.

### 3.5 Service / maintenance

1. Authorized staff open a service work order for an asset, with service type, provider, estimated/actual cost, dates, and notes.
2. Starting service makes the asset unavailable for ordinary assignment/checkout.
3. Completion records outcome, cost, dates and next action; return-to-stock/current-location movement is explicit.
4. Service actions and costs feed the asset history and service reports.

### 3.6 Software licenses

1. Register an entitlement with name/type, manufacturer, supplier, start/end dates, quantity or max seats, category and description.
2. Assign a seat to a permitted employee/device and capture tenant-configurable identifiers (legacy fields include MAC/reference/note).
3. Enforce capacity and prevent duplicate active assignment where policy requires.
4. Surface expiry and over-allocation warnings; preserve assignment and unassignment history.

### 3.7 Physical inventory audit

The old code proves an asset audit list and print action but not a complete reconciliation lifecycle. AssetMov should design the workflow explicitly:

1. Create an audit session scoped to selected sites/locations/categories.
2. Snapshot expected assets at a clear cutoff time.
3. Scan/search asset tag; record found location, custodian and condition.
4. Mark missing, unexpected, moved, damaged, or tag-mismatch outcomes with evidence/notes.
5. Review and sign off discrepancies.
6. Create approved correcting transactions; never silently overwrite history.

## 4. Cross-cutting rules evidenced or implied by the old system

- **Location hierarchy matters.** The old helper filters locations/employees and lists assets based on the logged-in employee's location associations and descendant locations.
- **A single current state is not enough.** Asset transactions are central to assignment, location, check-in/out, damage/disposal, and history.
- **Documents matter.** Issue notes, GRNs and reports are first-class records, not just text fields on assets.
- **Configurable fields matter.** The dynamic device/model field-set code should inform a safe custom-field design.
- **Legacy IDs/statuses must be mapped deliberately.** The old integer/enum statuses are inconsistent across modules; the new system should use explicit lifecycle enums and documented transition rules.

## 5. Risks and migration cautions

1. **Outdated runtime/dependencies:** Laravel 5.1 and its historical PHP/dependency range are obsolete for a new public SaaS. Rebuild in the chosen stack; don't expose the old runtime.
2. **Legacy schema quality:** old columns include loose text fields, mixed enums/integers, inconsistent names, and historical date/type conventions. Normalize and validate on import.
3. **Potentially sensitive repository artifacts:** the old repo includes a database dump and application log files. Treat their contents as potentially sensitive. Do not import sample rows into production, redistribute the dump, or expose customer/employee records. Review repository access and rotate any credentials/tokens that may have been committed.
4. **Route semantics:** some old state-changing operations appear under GET routes, and several names/route declarations are inconsistent or duplicated. In AssetMov, use correct HTTP methods and idempotency/authorization checks.
5. **Missing modern SaaS isolation:** the old application is not structured around customer tenants. Every new tenant-owned record, query, export, background job and uploaded file needs tenant scope.
6. **Tests are insufficient as a specification:** the visible legacy test suite is minimal. Use this inventory as discovery evidence and build acceptance tests around workflows and permissions.
7. **Audit behavior:** preserve an immutable audit record, but redact passwords, tokens, secrets, and unnecessary personal data from before/after payloads.

## 6. Questions to resolve during product decisions (defaults in the roadmap)

- Should the asset register allow serial number and inventory number to differ, and what is unique per tenant?
- Which tenant roles can approve requests, transfer assets, dispose assets, edit financial values, or sign off audits?
- Does a transfer require source approval, destination receipt, or both?
- How are partial receipts, shortages, damaged-in-transit items and rejection handled?
- Which depreciation methods/rates and fiscal-year rules are required beyond the fields in legacy code?
- Is software licensing in the first release, and which entitlement models (per-device, per-user, concurrent) are needed?
- What migration format/data export from RDB is available and authorized for use?
- Which subscription/payment provider and plan limits are required for SaaS launch?

These are product decisions; the implementation should expose tenant settings where it is safe and sensible instead of hard-coding bank rules.
