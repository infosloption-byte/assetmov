# AssetMov

A modern, multi-tenant SaaS asset lifecycle and inventory platform rebuilt from the legacy RDB asset-tracking application.

## Project status

**Phase 0 — discovery and foundation.** The legacy repository has been reviewed at route, module, model, controller, and SQL-schema level. Initial feature inventory and implementation plan are in `docs/`.

- Legacy source: [asset-tracking](https://github.com/infosloption-byte/asset-tracking)
- New application: [assetmov](https://github.com/infosloption-byte/assetmov)

## Technology

- **Frontend:** React + Vite + TypeScript
- **Backend:** Node.js + Express + TypeScript
- **Database:** MySQL
- **ORM/migrations:** Prisma
- **Architecture:** modular API and a tenant-aware relational data model
- **Testing:** domain unit tests, API integration tests and end-to-end workflows as features are implemented

## Current scaffold

- Responsive React dashboard preview with placeholder metrics and API connectivity indicator
- Express API readiness endpoint at `/api/health`
- Prisma data model for tenants, memberships/roles, locations, employees, inventory, transaction history, requests, service records, software licenses, barcode tags and audit events
- Asset lifecycle transition guard and unit tests
- Local MySQL Compose configuration and environment templates
- CI workflow for lint, type checks, tests, schema validation and builds

This is a **foundation preview**, not a production-ready asset management system. Login, tenant onboarding, authorization middleware, live asset CRUD, transfer/receipt workflows, reporting, imports and SaaS billing remain to be implemented.

## Start locally

See [Local Development](docs/LOCAL_DEVELOPMENT.md).

## Product and engineering documents

- [Legacy feature audit and process flows](docs/LEGACY_FEATURE_AUDIT.md)
- [Architecture and SaaS security](docs/ARCHITECTURE.md)
- [Delivery roadmap](docs/ROADMAP.md)
- [Task checklist](docs/TASKS.md)

## SaaS principles

1. Tenant/customer data must be isolated on every request and in every database query.
2. Authorization must be enforced by the API, not only by hiding frontend controls.
3. Asset movements are transaction records; important lifecycle changes are auditable.
4. Imports must support validation previews, row-level errors, and reconciliation.
5. Legacy bank-specific behavior should be configurable, not hard-coded into the shared product.

## Scope and security note

The old application is a reference for workflows and field requirements, not a source to copy legacy vulnerabilities, obsolete dependencies, database credentials, historic user accounts or customer records into AssetMov. Tenant isolation still requires verified service-layer authorization and automated cross-tenant tests; a schema alone is not sufficient.
