# AssetMov

A modern, multi-tenant SaaS asset lifecycle and inventory platform, rebuilt from the legacy RDB asset-tracking application.

## Project status

**Phase 0 — discovery and foundation.** The legacy repository has been reviewed at the route, module, model, controller, and SQL-schema level. The initial feature inventory and implementation plan live in `docs/`.

- Legacy source: [asset-tracking](https://github.com/infosloption-byte/asset-tracking)
- New application: [assetmov](https://github.com/infosloption-byte/assetmov)

## Technology direction

- **Frontend:** React + Vite + TypeScript
- **Backend:** Node.js + Express + TypeScript
- **Database:** MySQL
- **ORM and migrations:** Prisma
- **Architecture:** API-backed frontend with tenant-aware data access
- **Testing:** unit, API/integration, and end-to-end tests as each feature is built

## SaaS principles

1. Tenant/customer data must be isolated on every request and in every database query.
2. Authorization must be enforced by the API, not only by hiding frontend controls.
3. Asset movements are recorded as transactions; important lifecycle changes are auditable.
4. Imports must support validation, dry-run previews, row-level errors, and reconciliation.
5. Legacy bank-specific details must be configurable, not hard-coded into the shared product.

## Repository layout

```text
frontend/       React web application
backend/        Express API, Prisma schema, migrations and tests
docs/           Legacy feature audit, architecture and implementation tasks
```

## Local development

The frontend and backend setup instructions will be expanded as the foundation is added. Copy environment examples to local `.env` files; never commit secrets or real customer data.

## Discovery documents

- [Legacy feature audit and process flows](docs/LEGACY_FEATURE_AUDIT.md)
- [Architecture and SaaS security](docs/ARCHITECTURE.md)
- [Delivery roadmap](docs/ROADMAP.md)
- [Task checklist](docs/TASKS.md)

## Scope note

This repository will implement behavior intentionally. The old application is a reference for workflows and field requirements, not a source to copy legacy vulnerabilities, outdated dependencies, database credentials, historic user accounts, or bank data into the SaaS product.
