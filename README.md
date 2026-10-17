# AssetMov

A modern, multi-tenant SaaS asset lifecycle and inventory platform rebuilt from the legacy RDB asset-tracking application.

## Project status

**Legacy discovery completed; foundation and first inventory screens committed.** This repository has the first identity, workspace-context, location, and asset-register slice. It is not yet a production-ready application.

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
- Asset list/search/status filtering, detail/history, creation and metadata update API/UI.
- Tenant-scoped asset queries, inventory-number uniqueness, initial registration transaction and audit events.
- Separate permission check for financial/warranty fields.
- Prisma model foundation for movements, requests, service, software licenses, asset tags and audit logs.
- Local MySQL Compose setup, environment validation, API health check, structured logs, and a CI workflow configuration.

## Current feature gaps

Transfer dispatch/receipt and GRN processing, assignment/unassignment, request approval, maintenance workflows, software seat management, barcode printing, physical audits, reports/exports, imports, employee/custodian management, password reset/email verification, SaaS billing, and production operations remain to be implemented. Dashboard metrics are still placeholders.

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

- [Legacy feature audit and process flows](docs/LEGACY_FEATURE_AUDIT.md)
- [Architecture and SaaS security](docs/ARCHITECTURE.md)
- [Authentication and workspace context](docs/AUTHENTICATION.md)
- [Implementation status and verification caveats](docs/IMPLEMENTATION_STATUS.md)
- [Delivery roadmap](docs/ROADMAP.md)
- [Task checklist](docs/TASKS.md)

## Important verification note

The GitHub Actions runs observed during the last review reported `startup_failure` with no jobs, and I could not confirm a successful end-to-end CI run. The generated Prisma client, first migration, full frontend/backend build and database-backed acceptance tests must be run and verified before using real customer data. See [IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) for exact next checks.

## SaaS principles

1. Tenant/customer data must be isolated on every request and database query.
2. Authorization is enforced by the API, not only by hiding frontend controls.
3. Asset movements are transaction records; important lifecycle changes are auditable.
4. Imports must support validation previews, row-level errors and reconciliation.
5. Legacy bank-specific behavior should be configurable, not hard-coded into the shared product.

The old application is a reference for workflows and field requirements, not a source to copy legacy vulnerabilities, obsolete dependencies, database credentials, historic user accounts or customer records into AssetMov.
