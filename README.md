# AssetMov

A modern, multi-tenant SaaS asset lifecycle and inventory platform rebuilt from the legacy RDB asset-tracking application.

## Project status

**Legacy discovery completed; core foundation and first operational workflows committed.** The repository now includes identity/workspace context, location and employee directories, asset registration/detail/edit, person-level assignment/return, and location transfer/receipt flows. It is not yet a production-ready application.

- Legacy source: [asset-tracking](https://github.com/infosloption-byte/asset-tracking)
- New application: [assetmov](https://github.com/infosloption-byte/assetmov)

## Technology

- **Frontend:** React + Vite + TypeScript
- **Backend:** Node.js + Express + TypeScript
- **Database:** MySQL
- **ORM/migrations:** Prisma
- **Architecture:** modular API with tenant-aware relational data model
- **Tests:** unit tests for lifecycle, location-scope expansion and password hashing; API/database integration and browser tests remain outstanding

## Current implementation

- Responsive dashboard preview and navigation.
- Organization registration, login, logout, session restoration and CSRF-protected mutations.
- Scrypt password hashing and opaque server-side sessions with HttpOnly cookies.
- Tenant membership validation via `X-Tenant-Id`, role permission resolution, and hierarchical location access.
- Workspace context endpoint at `GET /api/workspace/context`.
- Location list/search/create API and frontend screen.
- Employee/custodian list/search/create/edit API and frontend screen with home-location scope.
- Asset list/search/status filtering, detail/history, creation and metadata update API/UI.
- Asset assign/return actions with eligible-custodian checks, transaction history and audit events.
- Transfer dispatch and receipt-decision API/UI, including partial acceptance, rejection reasons, asset transaction history and audit events.
- Tenant-scoped asset queries, inventory-number uniqueness, initial registration transaction and audit events.
- Separate permission check for financial/warranty fields.
- Prisma model foundation for movements, requests, service, software licenses, asset tags and audit logs.
- Local MySQL Compose setup, environment validation, API health check, structured logs, and a CI workflow configuration.

## Current feature gaps

Printable GRN/receipt documents, assignment/unassignment, request approval, maintenance workflows, software seat management, barcode printing, physical audits, reports/exports, imports, employee/custodian management, password reset/email verification, SaaS billing, and production operations remain to be implemented. The transfer code still needs DB-backed integration and concurrency tests. Dashboard metrics are still placeholders.

## Start locally

See [Local Development](docs/LOCAL_DEVELOPMENT.md).

From the repository root:

```sh
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
docker compose up -d mysql
npm install
npm run db:validate
npm run dev
```

Use PowerShell's `Copy-Item` instead of `cp` if preferred. Local MySQL uses host port 3307; the Compose credentials are disposable development defaults and must not be reused for a shared or production database.

## Product and engineering documents

- [SaaS product requirements and administration boundaries](docs/SAAS_PRODUCT_REQUIREMENTS.md)
- [Legacy feature audit and process flows](docs/LEGACY_FEATURE_AUDIT.md)
- [Architecture and SaaS security](docs/ARCHITECTURE.md)
- [Authentication and workspace context](docs/AUTHENTICATION.md)
- [Implementation status and verification caveats](docs/IMPLEMENTATION_STATUS.md)
- [Delivery roadmap](docs/ROADMAP.md)
- [Task checklist](docs/TASKS.md)

## Important verification note

The GitHub Actions runs observed during the last review reported `startup_failure` with no jobs, and I could not confirm a successful end-to-end CI run. The generated Prisma client, first migration, full frontend/backend build and database-backed acceptance tests must be run and verified before using real customer data. See [IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) for exact next checks.

## SaaS principles

1. AssetMov is a multi-tenant SaaS: each registered company is its own tenant/workspace.
2. Platform Super Admin operates the SaaS; Company Admin manages users, custom roles/permission grants, location hierarchy, categories, custom fields, settings and workflows only inside their company.
3. Platform permissions are separate from tenant roles. Company Admin must never be able to self-grant platform access.
4. Tenant isolation and API-side authorization are mandatory for every read/write, search, export, upload/download, background job and report.
5. Company-specific master data and custom fields are configuration, not global hard-coded values.
6. Plan entitlements and user permissions are separate checks; important business actions are audited.
7. Asset movements remain transaction records, and imports must support validation previews, row-level errors and reconciliation.

[SAAS_PRODUCT_REQUIREMENTS.md](docs/SAAS_PRODUCT_REQUIREMENTS.md) governs future design decisions. The old application is a reference for workflows and field requirements, not a source to copy legacy vulnerabilities, obsolete dependencies, database credentials, historic user accounts or customer records into AssetMov.
