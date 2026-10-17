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
- Subscription plan, tenant-subscription and separate platform-audit schema; protected platform plan/tenant APIs and idempotent plan seeding are source-committed but await schema/migration and CI verification.
- WAMP-based local MySQL setup guidance, environment validation, API health check, structured logs, and a CI workflow configuration.

## Current feature gaps

Printable GRN/receipt documents, assignment/unassignment, request approval, maintenance workflows, software seat management, barcode printing, physical audits, reports/exports, imports, employee/custodian management, password reset/email verification, SaaS billing, and production operations remain to be implemented. The transfer code still needs DB-backed integration and concurrency tests. Dashboard metrics are still placeholders.

## Start locally (Windows + WampServer)

See [Local Development](docs/LOCAL_DEVELOPMENT.md) for the full WAMP configuration and folder-specific commands, including the initial Prisma migration.

Start WampServer and create an empty local `assetmov` database in phpMyAdmin. Then run these commands from the repository root in PowerShell. Run the `Copy-Item` commands only if the local `.env` files do not already exist:

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
npm install
npm run db:validate
npm run db:generate
npm run db:seed:plans
npm run build
npm run dev
```

The frontend runs at http://localhost:5176 and the API runs at http://localhost:4000. Update `backend/.env` so `DATABASE_URL` matches your WAMP MySQL username, password and port. The example blank-password URL is intended for local development only.

**The root command is only a workspace convenience, not an architectural requirement.** The React app and Node.js API remain separate packages with their own `package.json` files. To run them independently, open two PowerShell terminals and run `npm run dev` from `frontend/` in one and from `backend/` in the other. You can also run `npm run lint` or `npm run typecheck` within either folder to check only that package. Run `npm install` from the repository root so npm manages the workspace dependencies together.

## Product and engineering documents

- [SaaS product requirements and administration boundaries](docs/SAAS_PRODUCT_REQUIREMENTS.md)
- [Subscription plans, limits and enforcement guardrails](docs/SUBSCRIPTION_GUARDRAILS.md)
- [Platform admin and subscription plan bootstrap](docs/PLATFORM_ADMIN_BOOTSTRAP.md)
- [Legacy feature audit and process flows](docs/LEGACY_FEATURE_AUDIT.md)
- [Architecture and SaaS security](docs/ARCHITECTURE.md)
- [Authentication and workspace context](docs/AUTHENTICATION.md)
- [Implementation status and verification caveats](docs/IMPLEMENTATION_STATUS.md)
- [Delivery roadmap](docs/ROADMAP.md)
- [Task checklist](docs/TASKS.md)

## Verification status

Local verification reported on 2026-10-17: Prisma Client generation, frontend/backend type checks, lint, all 29 backend unit tests, and the frontend production build/backend TypeScript compilation passed. The initial Prisma migration is not yet committed, and database-backed/API/browser acceptance tests remain outstanding. GitHub Actions has also reported `startup_failure` with no jobs; a successful CI run is still required. See [IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) for the exact remaining checks. Do not use real customer data until the migration and database-backed acceptance suite have been reviewed and passed.

## SaaS principles

1. AssetMov is a multi-tenant SaaS: each registered company is its own tenant/workspace.
2. Platform Super Admin operates the SaaS; Company Admin manages users, custom roles/permission grants, location hierarchy, categories, custom fields, settings and workflows only inside their company.
3. Platform permissions are separate from tenant roles. Company Admin must never be able to self-grant platform access.
4. Tenant isolation and API-side authorization are mandatory for every read/write, search, export, upload/download, background job and report.
5. Company-specific master data and custom fields are configuration, not global hard-coded values.
6. Subscription plans limit only assets, active users, storage and trial duration; role permissions and platform-wide abuse protections remain separate.
7. Asset movements remain transaction records, and imports must support validation previews, row-level errors and reconciliation.

The platform API is an implementation foundation, not full quota enforcement. Trial expiry and asset/user/storage caps still need server-side enforcement across all relevant operations and successful database-backed tests before public launch.

[SAAS_PRODUCT_REQUIREMENTS.md](docs/SAAS_PRODUCT_REQUIREMENTS.md) governs future design decisions. The old application is a reference for workflows and field requirements, not a source to copy legacy vulnerabilities, obsolete dependencies, database credentials, historic user accounts or customer records into AssetMov.
