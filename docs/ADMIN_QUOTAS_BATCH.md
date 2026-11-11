# AssetMov administration, quotas and master-data batch

**Branch:** `feature/admin-quotas-masterdata-batch`
**Review PR:** [#6](https://github.com/infosloption-byte/assetmov/pull/6)
**Status:** local frontend/backend automated checks **passed** on Windows WAMP (developer logs, 2026-10-24); **manual browser, CI and deployment acceptance still pending**.

### Local verification recorded on 2026-10-24

| Check | Result |
| --- | --- |
| Backend Prisma schema, migration status/client generation | Passed; three migrations applied to `assetmov` and `assetmov_test` |
| Backend lint, TypeScript and build | Passed |
| Backend unit tests | **32/32 passed** |
| MySQL database API acceptance | **1/1 suite passed**, real `assetmov_test` |
| Frontend lint, TypeScript and Vite build | Passed; 39 modules transformed |
| Browser end-to-end acceptance | Not yet verified |
| GitHub Actions | `startup_failure` before execution; not green |
| Case-sensitive Linux MySQL portability | Not yet verified |

After completing the integration test in PowerShell, restore development environment selection **before starting your backend**:

```powershell
Remove-Item Env:ASSETMOV_RUN_DB_INTEGRATION_TESTS -ErrorAction SilentlyContinue
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
```

If an API server remains running in a terminal that inherited the `assetmov_test` override, restart it with the normal development environment. Otherwise a browser session may accidentally modify the test database.


## Delivery map

| Requirement | Implementation | Acceptance |
| --- | --- | --- |
| Company Admin users/roles/permissions | Existing React users/roles screen, role CRUD, membership create/profile/role/status/scope routes; new guard blocks delegation of permissions the actor does not own | Unit + DB API role/member/CSRF/tenant checks; browser walkthrough required |
| Platform Admin companies/plans | New React Platform Admin tab with plans, company search, assignment, audited trial/activation/suspension, protected by existing server-side platform flag | DB platform plan/tenants audit/isolation tests exist; browser verification required |
| Asset quota | Existing serialized asset creation counter and asset-cap policy | Integration boundary test |
| Active-user quota | Existing locked create/reactivation counter; enhanced delegated-permission validation | Integration user-limit and reactivation test |
| Storage quota | New `TenantStorageObject` table, authenticated small-file upload/list/download/delete, transactionally checked storage budget, company storage usage summary | New API storage-limit/tenant isolation tests |
| Trial and status expiry | Tenant-context middleware denies normal writes when subscription is inactive or expired; reads, member deactivation and file deletion remain available | DB test for expired asset create and master-data change |
| Categories/models/custom fields | Existing category and model CRUD; new safe model edit, typed custom values on asset create/update, new React field forms | New pure validation suite and DB API tests |
| Full tenant/workflow acceptance | Existing integration suite expanded with quota, master-data, security assertions | Test suite must pass on fresh `assetmov_test`; manual transfer/assignment browser tests still required |

## Separate app architecture

Frontend: `frontend/`, React 19 + Vite, http://localhost:5176.
Backend: `backend/`, Node.js + Express + Prisma 7, http://localhost:4000.
The root is only an npm workspace convenience. Run app commands in each respective folder.

### Backend: apply additive migration safely

Back up your local `assetmov` database before applying schema changes. **Do not reset or recreate it.**
The new migration is `backend/prisma/migrations/20261024000100_tenant_storage_objects`.

```powershell
cd C:\wamp\www\html\assetmov\backend
npm run db:validate
npm run db:deploy
npm run db:status
npm run db:generate
npm run lint
npm run typecheck
npm test
npm run build
npm run dev
```

**MySQL portability:** Previous migrations were authored under WAMP case-insensitive table naming. A case-sensitive Linux MySQL migration rehearsal is still required before production.

### Frontend

```powershell
cd C:\wamp\www\html\assetmov\frontend
npm run lint
npm run typecheck
npm run build
npm run dev
```

### Disposable database acceptance suite (separate PowerShell)

Create an empty **`assetmov_test`**, not the active `assetmov` database. Only this dedicated database is permitted by the suite.

```powershell
cd C:\wamp\www\html\assetmov\backend
$env:DATABASE_URL="mysql://root:@127.0.0.1:3306/assetmov_test"
$env:ASSETMOV_RUN_DB_INTEGRATION_TESTS="1"
npm run db:deploy
npm run db:seed:plans
npm run test:integration
Remove-Item Env:ASSETMOV_RUN_DB_INTEGRATION_TESTS
Remove-Item Env:DATABASE_URL
```

If your WAMP credentials/port differ, adjust the test URL. The suite uses temporary tenant/user records and refuses any database other than a local database named `assetmov_test`. Never point these tests at customer or production data.

## Manual acceptance walkthrough

1. Start backend and frontend separately; confirm `/api/health` and registration/login work.
2. Register company A and company B, and confirm each sees only its own records.
3. As company A owner, create a custom role and member, edit scope, change member status and verify permission checks.
4. Bootstrap the platform operator **out of band**, following `PLATFORM_ADMIN_BOOTSTRAP.md`. Check the Platform Admin navigation appears only for that account. Create/update a plan, search companies, activate and suspend a disposable company. Check audit reasons and membership access.
5. Create a category and model with required number, date, boolean and select fields. Register an asset with those fields. Try missing/invalid choices and confirm the server rejects them. Edit its saved values. Confirm used model definitions cannot be changed.
6. Open an asset and add attachments. The first small PDF/image/text upload must work; files should appear on the asset and download only to authorized workspace members. Delete an attachment to release storage.
7. Apply tight test-plan asset/user/storage quotas, try going over each, and verify no extra records persist. Expire a disposable trial and confirm reads remain accessible but new writes are denied.
8. Manually exercise dispatch/partial receipt/rejection, assignment/unassignment, and permitted/denied location scope for two separate companies.

## Design and operational limits

- Attachment data is stored in MySQL and limited to **512 KiB per file**, with API JSON requests capped at 1 MiB. This is an explicitly constrained first implementation for quota acceptance, **not the final production storage architecture**. Before public launch: add streamed uploads to durable object storage, malware/content inspection, lifecycle retention, backup/restore and concurrency/billing metrics.
- Trial expiration is checked server-side per company mutation. Users can still read permitted records and remove files or deactivate other members after expiry; platform operators can change plans independently.
- Plan downgrades never silently delete existing assets/users/files. Further resource consumption is denied when already above plan limits.
- No billing or payment processor integration is part of this batch.
- CI has previously returned GitHub Actions `startup_failure` before any jobs start. A green workflow and browser acceptance remain mandatory.
