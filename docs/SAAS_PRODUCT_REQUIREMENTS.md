# AssetMov SaaS Product Requirements

This document is the product and architecture source of truth for AssetMov. It defines the SaaS transformation from the legacy single-company asset tracker. New modules, APIs, permissions, schemas, and screens must follow these boundaries.

## 1. Product model

AssetMov is one SaaS platform serving many independent companies. Each registered company is a tenant/workspace. The legacy application served one company's records; the new product must not assume one global company, one fixed company structure, or one hard-coded set of customer roles.

There are two distinct administration levels:

1. **Platform Super Admin** — operates the AssetMov service itself.
2. **Company Admin** — administers one registered company and everything configured or recorded inside that company's tenant, within the platform's security and subscription rules.

These are separate authority scopes. A Company Admin is not a Platform Super Admin. A Platform Super Admin does not need routine unrestricted access to customer asset/personnel data just because they operate the platform.

## 2. Administration boundaries

### Platform Super Admin / Platform Operator

The platform administration area is responsible for service-level operations, including:

- View and manage tenant lifecycle: registered, trial, active, suspended, cancelled/deletion-pending.
- View plan, subscription, billing status, usage/quotas and account-level health.
- Create and manage plans, feature entitlements, tenant limits and platform-wide defaults.
- Review platform-level security events, abuse/risk signals, operational health and support cases.
- Manage platform notices, feature flags and shared reference catalogues where appropriate.
- Trigger controlled support or recovery operations with reason, limited duration/scope where applicable, and immutable audit evidence.
- Manage platform staff accounts and platform permissions independently from company users.

The platform admin must **not** be modeled as a normal company role, and Company Admin screens must never expose platform controls. Any exceptional customer-data access for support must be explicit, minimal, reasoned, time-bounded where practical, and audited. Platform operators should use metadata and customer-authorized diagnostic tools where possible.

### Company Admin / Tenant Owner

The first user who successfully registers a company becomes its initial Company Admin/tenant owner. After registration and setup, that administrator owns configuration and operations for their tenant, including:

- Company profile and preferences: name, timezone, locale, currency, date/number formats, financial year and relevant retention preferences.
- Members/users: invite, activate/deactivate, update membership, revoke sessions where authorized, and assign roles.
- Custom roles and role permissions, assembled from the platform-defined permission catalogue. Company admins may grant only permissions that are allowed in that tenant and that they are authorized to delegate. Tenants do not invent arbitrary backend permission keys.
- Location hierarchy: create nested regions, branches, departments, floors, rooms, warehouses or other location types; update/deactivate locations safely; assign memberships/users to permitted location scopes and inherit scope according to policy.
- Asset master data: categories, models/types, typed custom-field definitions, numbering rules, suppliers, manufacturers, service types, depreciation options and tenant-specific lists.
- Company records and workflows: employees/custodians, assets, assignment/return, transfers/receipts, requests/approvals, maintenance/upgrade, software/license records, barcodes/tags, physical audits, reports, imports/exports and audit history according to permissions.
- Company-specific notifications, approval routing and other configurable workflow rules as those modules are implemented.
- Company data export and lifecycle actions subject to platform policy, plan entitlements and appropriate confirmation/audit requirements.

Tenant users may be authorized for narrower responsibilities. The Company Admin's broad administrative authority is tenant-scoped and must never bypass tenant isolation or global safety controls.

## 3. Company registration and onboarding

Expected flow:

1. Visitor registers a user and company/workspace.
2. The backend validates input, applies anti-abuse controls and creates a tenant in trial/pending-verification state according to the launch policy.
3. The registering user is created and becomes the first Company Admin/tenant owner membership.
4. A tenant-scoped default role and initial permission grants are attached to that membership; these are tenant-level permissions only.
5. The company admin verifies their email and completes the company profile/setup wizard.
6. The admin builds the location hierarchy, configures categories/models/custom fields, invites staff and creates tenant roles.
7. Invited users join the correct tenant, receive an explicitly assigned role and any permitted location scope, then use only the screens/APIs allowed by those permissions.
8. Subscription/plan entitlements govern feature availability and limits, but do not replace authorization checks.

Registration must not allow a request body, client header, URL, or manipulated role ID to grant Platform Super Admin access.

## 4. Roles and permission design

- Maintain a **platform permission catalogue** for platform-only actions and a **tenant permission catalogue** for application actions, or otherwise enforce an equally strong namespace/scope boundary.
- Platform roles are assigned only through a protected platform administration process.
- Company roles are tenant-owned. A company admin can create, rename, copy, configure and deactivate custom roles subject to safeguards.
- Permissions are explicit action keys (examples: `user.invite`, `role.manage`, `location.create`, `asset.read`, `asset.create`, `asset.financial.update`, `asset.assign`, `transfer.dispatch`, `transfer.receive`, `request.approve`, `audit.signoff`, `report.export`).
- Role management must prevent privilege escalation: a delegator cannot grant permissions they cannot delegate; reserved owner/admin protections cannot be removed accidentally; the last tenant owner/admin cannot be disabled or stripped of all recovery access without a controlled transfer.
- Permissions must be checked in the API/service layer on every request. Frontend visibility is only a usability aid.
- Location-scoped rights are an additional boundary beneath the tenant boundary.
- Sensitive membership/role/scope changes require audit entries with actor, tenant, target, old/new values where safe, timestamp, reason and request correlation ID.

## 5. Tenant isolation rules — non-negotiable

- Every company-owned row and relation must be tenant-scoped, either with an explicit tenant key or through a provably tenant-scoped parent relation and constraints.
- The server derives the active tenant from the authenticated user's verified membership; a client-supplied tenant ID only selects a candidate and never grants access.
- Include the authenticated tenant in every tenant-owned list, detail, create, update, delete, search, bulk operation, report, export, file download, background task and notification query.
- Foreign-key relationships between company-owned entities must not permit cross-tenant links. Prefer composite tenant-aware keys/constraints where practical.
- A tenant admin may only affect their own tenant, even when they know another tenant's IDs.
- Platform access uses its own permission checks and routes/services, not an implicit bypass of tenant middleware.
- Automated security tests must seed at least two tenants with overlapping business identifiers and attempt cross-tenant access and mutation across all modules.
- Do not expose one tenant's counts, employee names, asset details, filenames, errors or exports to another tenant.

## 6. Tenant-configurable asset data

The product must not reproduce the legacy app's single-company assumptions as global constants.

- Asset categories and asset models are created and managed per tenant.
- Custom-field definitions are configurable by a tenant admin and attach to appropriate tenant-owned categories/models.
- Supported field types should include at minimum text, long text, number/decimal, date, boolean, single-select and multi-select; add validation, required/optional, ordering, default and searchable/reportable flags as the product requires.
- Asset create/edit/detail/search/import/export forms derive their fields from the active tenant's definitions and validate values on the server.
- Tenant-specific numbering sequences, suppliers, manufacturers, service types, depreciation options, location types and workflow settings are data/configuration, not hard-coded per customer.
- Changes to a field definition must have a documented policy for existing values and historical records; never silently corrupt stored custom-field data.

## 7. Core company functional domains

The migrated feature inventory should become configurable multi-tenant modules:

- **Organization and security:** company profile, members, roles, permissions, sessions, invitations and location access.
- **Locations and custodians:** arbitrary-depth location hierarchy, employee/custodian records, user-to-employee association and assignment scope.
- **Asset register:** registration, editable details, financial/warranty data, category/model fields, identifiers, status lifecycle, tags, attachments, timeline and full audit history.
- **Movement and custody:** assign/return, issue/receipt documents, transfers between locations, dispatch/accept/reject, check-in/out, handover acknowledgment and ledger.
- **Requests and approvals:** configurable approvers, decisions, decision reasons, fulfillment and notification history.
- **Maintenance and upgrades:** work orders, service provider/type, warranty context, dates, costs, outcomes, asset availability and component/upgrade relationships.
- **Software and licenses:** entitlement inventory, capacity, seat assignment/release, device identifiers and expiry alerts.
- **Physical audits:** expected snapshots, scans, found/missing/moved/damaged/tag mismatch, evidence and reviewed corrective transactions.
- **Reporting:** dashboard, inventory/location/employee/service/license/financial/depreciation/audit reports, saved filters and authorized CSV/XLSX/PDF exports.
- **Data exchange:** validated import previews, row-level errors, resumable/idempotent jobs, reconciliation and controlled exports.
- **SaaS controls:** trial and subscription lifecycle, plan entitlements, quotas, billing events, notifications and tenant lifecycle administration.

Each module must inherit tenant context, role permissions, location scope, audit policy and plan entitlements rather than inventing inconsistent access logic.

## 8. Platform plans and entitlements

Subscription entitlements are separate from role permissions:

- **Entitlements** answer whether a tenant's plan includes a module/capability and its limits.
- **Permissions** answer whether this user may perform the action.
- An operation is allowed only when tenant status/plan allows the feature, the authenticated membership has permission, the relevant location scope allows it, and domain validation succeeds.
- Platform Super Admin can manage plans/limits and tenant lifecycle; company users cannot edit plan definitions or grant themselves paid entitlements.
- Payment webhooks must be signature-verified, idempotent and auditable. Billing must never trust browser-only status values.

## 9. UX expectations

- Company-facing screens must clearly show the active company/workspace when users belong to more than one tenant.
- Provide a dedicated, separately authorized platform-admin area; do not mix platform operations into the company navigation.
- Tenant setup should guide an administrator through company profile, locations, categories/custom fields, users/roles and imports.
- Settings and lists must be tenant-specific, respect permissions and location scope, and display useful loading/empty/error states.
- Module availability and quotas should be explained without implying that an unavailable feature is a user-permission failure when it is actually a plan limit.

## 10. Engineering acceptance criteria

A feature is not done until applicable checks cover:

1. Platform Super Admin versus Company Admin authorization.
2. Two-tenant isolation for list/detail/mutations/search/bulk/report/export/file paths.
3. Custom role permissions and prevention of privilege escalation.
4. Location hierarchy, inherited scopes and boundary cases.
5. Tenant-specific configuration and custom-field validation.
6. Audit coverage for security/admin actions.
7. Plan/entitlement behavior where relevant.
8. Unit, API/database integration and browser workflow tests.
9. Schema validation, migrations, typecheck, lint, tests and build in successful CI.

The present codebase is a partial foundation. These requirements describe the target design and must not be confused with features already implemented.
