# AssetMov

A modern, multi-tenant SaaS asset lifecycle and inventory platform rebuilt from the legacy RDB asset-tracking application.

## Project status

**Discovery completed; foundation and identity slice in progress.** The legacy repository has been reviewed at route, module, model, controller and SQL-schema level. The initial feature inventory and implementation plan are in `docs/`.

- Legacy source: [asset-tracking](https://github.com/infosloption-byte/asset-tracking)
- New application: [assetmov](https://github.com/infosloption-byte/assetmov)

## Technology

- **Frontend:** React + Vite + TypeScript
- **Backend:** Node.js + Express + TypeScript
- **Database:** MySQL
- **ORM/migrations:** Prisma
- **Architecture:** modular API with tenant-aware relational models
- **Testing:** domain unit tests are being added; API and browser tests remain to be built

## Current implementation

- Responsive React dashboard preview
- Organization registration and login screens connected to the API
- Scrypt password hashing and server-side sessions with HttpOnly cookies
- Login/logout/session restoration and CSRF protection
- Tenant membership validation using the `X-Tenant-Id` header
- Role permission resolution and hierarchical location-scope helpers
- Workspace context endpoint at `GET /api/workspace/context`
- Prisma model foundation for tenants, roles, memberships, locations, employees, assets, movements, requests, maintenance, software licenses, tags and audit events
- Asset lifecycle policy and unit tests
- Local MySQL Compose setup and CI workflow

This is **not yet a production-ready asset-tracking system**. Actual asset CRUD, live dashboard metrics, transfer/receipt workflow, approval screens, maintenance operations, imports, reporting, account verification/reset and SaaS billing remain outstanding. Tenant/permission middleware must be applied to each future tenant-owned endpoint; a middleware module and schema do not substitute for endpoint-level enforcement and tests.

## Start locally

See [Local Development](docs/LOCAL_DEVELOPMENT.md). The repository currently has no committed generated Prisma migration or lockfile, and the GitHub Actions runs have not produced jobs in the observed checks. Run schema validation, installation and tests locally before relying on the scaffold.

## Product and engineering documents

- [Legacy feature audit and process flows](docs/LEGACY_FEATURE_AUDIT.md)
- [Architecture and SaaS security](docs/ARCHITECTURE.md)
- [Authentication and workspace context](docs/AUTHENTICATION.md)
- [Delivery roadmap](docs/ROADMAP.md)
- [Task checklist](docs/TASKS.md)

## SaaS principles

1. Tenant/customer data must be isolated on every request and in every database query.
2. Authorization is enforced by the API, not only by hiding frontend controls.
3. Asset movements are transaction records; important lifecycle changes are auditable.
4. Imports must support validation previews, row-level errors and reconciliation.
5. Legacy bank-specific behavior should be configurable, not hard-coded into the shared product.

## Scope and security note

The old application is a reference for workflows and field requirements, not a source to copy legacy vulnerabilities, obsolete dependencies, database credentials, historic user accounts or customer records into AssetMov. Tenant isolation still requires verified service-layer authorization and automated cross-tenant tests; a schema alone is not sufficient.
