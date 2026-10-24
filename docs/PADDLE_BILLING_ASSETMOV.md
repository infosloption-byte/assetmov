# AssetMov — BuildHire-style SaaS Administration and Paddle Billing

**Implementation branch:** `feature/paddle-saas-billing-admin`  
**Base:** `feature/admin-quotas-masterdata-batch` (the locally validated Company Admin / master-data batch)  
**Environment:** Paddle **Sandbox only**. Production billing is intentionally disabled until commercial and security approval.  
**Status:** implementation committed for local acceptance; **not yet a production-ready payments implementation**.

## Reference architecture and deliberate differences

Source inspected: the user's `infosloption-byte/candidate` repository (BuildHire) on `main`. The relevant reference modules include `backend/src/lib/paddle.ts`, `paddleCheckout.ts`, `paddlePlanChange.ts`, `backend/src/routes/billing.ts`, `planManagement.ts`, and frontend `CompanyBillingPage.tsx`.

| Design aspect | BuildHire reference | AssetMov implementation |
| --- | --- | --- |
| Platform Super Admin | Separate platform operator with company, billing and operational overview | Independent `User.isPlatformAdmin`; company list/status, plan catalog, quota and payment oversight |
| Default company admin | Company-level administrator | System role key **`TENANT_OWNER`**, displayed as **Company Administrator** for new companies, with full company permissions |
| Custom roles | Fixed business role set | **Keep tenant-defined roles**, tenant-specific role/permission catalog and members; do not import BuildHire fixed roles |
| Company data isolation | Server-verified company context | Tenant membership plus explicit `X-Tenant-Id`, permission checks, location scopes and subscription gate on all operational API reads/writes |
| Trial | Provider-aware billing policies | Existing local onboarding trial, counted by the system; Paddle no-trial prices avoid a second free trial |
| Payments | Paddle customer, checkout, signed webhooks, invoices and portal | Separate AssetMov Paddle identity and catalog; pending checkout never unlocks data; verified subscription events control entitlements |
| Plan limits | Recruitment-specific limits | **Only assets, active users, storage, trial duration**; none of BuildHire's recruitment quotas |
| Failure and recovery | Company admin billing recovery | All company users lose operational read/write access when overdue/expired; Company Admin alone sees Billing & Plan, portal, price change, payment history |
| Plan changes | Price preview, confirmed proration, provider-driven reconciliation | Separate preview/confirm actions with exact amount; pending state until signed event |
| Platform moderation | Admin monitoring | Audited independent tenant suspension/reinstatement; does not forge Paddle subscription status |

### Company registration and role structure

1. A new tenant registers via existing `POST /api/auth/register`, which creates the company, its first user, a trial subscription and the **system Company Administrator role**. Its database key remains `TENANT_OWNER` for backwards compatibility.
2. The Company Administrator can create **their own tenant-specific custom roles**, choose permitted actions from the application catalog, and assign members to those roles.
3. Users in company A cannot inherit company B's roles, grants, records or billing identities. Permissions are checked in API middleware, not only hidden buttons.
4. Platform privileges are **not** grantable by company roles. The first Platform Super Admin is bootstrapped only through approved offline/database administration, as described in `PLATFORM_ADMIN_BOOTSTRAP.md`.
5. Only the system Company Administrator role can access billing, even if another custom role has `tenant.settings.manage`.

## Storage and migration

**New additive migration:** `backend/prisma/migrations/20261024000200_paddle_billing/migration.sql`.

It adds separate provider identities, checkout attempts, webhook event receipts, payment records, plan catalog IDs and provider metadata on the existing `TenantSubscription`. Earlier plans, trials, users, roles and assets are preserved. Historical manual platform subscriptions remain `billingSource="PLATFORM"`. Paid Paddle subscriptions use `billingSource="PADDLE"`.

**Do not edit applied migration history or drop databases.** Back up the local database before applying the new migration. The existing migration chain originated on case-insensitive WAMP MySQL; rehearse on case-sensitive Linux MySQL before production.

## Paddle account setup

Use the existing Paddle merchant account if approved, but create **new AssetMov-specific Paddle products and recurring prices**. **Do not reuse BuildHire price IDs.** Configure new USD monthly and yearly prices with **no Paddle trial period** because AssetMov already offers a local company onboarding trial. Product ID `pro_…`, price IDs `pri_…`.

All provider IDs are entered via **Platform Admin → Subscription plans → Edit → Paddle catalog** with an audit reason. A plan must match its actual Paddle product. Plan descriptions, asset/user/storage quotas and trial durations remain configurable in the AssetMov platform.

In the **backend local** `backend/.env`:

```dotenv
PADDLE_ENVIRONMENT=sandbox
PADDLE_API_KEY=YOUR_SANDBOX_API_KEY
PADDLE_WEBHOOK_SECRET=YOUR_SANDBOX_NOTIFICATION_SECRET
PADDLE_CLIENT_TOKEN=YOUR_SANDBOX_PUBLIC_CLIENT_TOKEN
APP_PUBLIC_URL=https://YOUR_APPROVED_ASSETMOV_HTTPS_HOST
```

In the **frontend local** `frontend/.env` (rebuild frontend after changing Vite variables):

```dotenv
VITE_PADDLE_CLIENT_TOKEN=YOUR_SANDBOX_PUBLIC_CLIENT_TOKEN
```

Never commit real keys, secrets, database passwords, or env files. `PADDLE_CLIENT_TOKEN` and `VITE_PADDLE_CLIENT_TOKEN` are the **public** client token; the server API key and webhook secret must **never** be sent to the browser.

Local `http://localhost:5176` remains suitable for UI/API unit and synthetic signed webhook tests, **not a complete real Paddle checkout**. Actual sandbox checkout requires an approved HTTPS frontend domain, the correct Paddle checkout domain/URL, reachable backend HTTPS webhook and approved Paddle sandbox catalog.

Register Paddle notification destination:

```text
https://YOUR_PUBLIC_API_HTTPS_HOST/api/webhooks/paddle
```

Configure relevant `subscription.created`, `subscription.updated`, `subscription.activated`, `subscription.past_due`, `subscription.paused`, `subscription.resumed`, `subscription.canceled`, `transaction.completed` and `transaction.payment_failed` notifications. Check the exact enabled events in your Paddle dashboard; notification names may evolve. The backend verifies the `Paddle-Signature` HMAC against exact original bytes with timestamp tolerance and persists each event to prevent duplicate processing.

## API overview

| Endpoint | Access | Purpose |
| --- | --- | --- |
| `GET /api/billing/status` | Authenticated tenant member | Entitlement reason and recovery policy; does not return invoices |
| `GET /api/billing/plans` | Company Administrator | Active plans and provider-verified AssetMov recurring prices |
| `GET /api/billing/history` | Company Administrator | Current plan, checkout attempts, payment records, contact email |
| `PATCH /api/billing/customer` | Company Administrator + CSRF | Change billing email before customer/checkout linking; audited |
| `POST /api/billing/checkout` | Company Administrator + CSRF | Create provider-scoped customer and verified Paddle transaction |
| `POST /api/billing/manage` | Company Administrator + CSRF | Issue one fresh secure Paddle customer portal link |
| `POST /api/billing/change-preview` | Company Administrator + CSRF | Live proration quote; exact USD amount |
| `POST /api/billing/change-confirm` | Company Administrator + CSRF | Provider price change with exact quote verification; waits for webhook |
| `POST /api/webhooks/paddle` | Signed Paddle notification (raw body) | Verify/reconcile subscription state, payment records and event replay |
| `GET /api/platform/overview` | Platform Super Admin | Companies, subscriptions, assets, members, storage, USD payments, failed events |
| `PATCH /api/platform/tenants/:id/status` | Platform Super Admin + CSRF | Audit suspension/unlock separately from Paddle payment state |

Company default role is an immutable system administrator. Custom roles remain stored separately under each tenant, and no provider billing permission is present in the custom role catalog.

### Trust boundaries

- Never activate a subscription based on a checkout callback, redirect, user-supplied transaction ID, unverified webhook, or provider invoice alone.
- A signed, correlated Paddle `subscription.*` event is authoritative for `TenantSubscription` entitlements. `transaction.*` events only record payment results; they do not bypass subscription/access checks.
- Provider customer IDs and transaction IDs are always tied to a **single verified AssetMov tenant** and verified product/price. Merely matching emails cannot attach another app's Paddle customer portal.
- Checkout and plan-change attempts are serialized or fail closed on ambiguous retries; reconciliation may require an operator rather than risking duplicate billing.
- `PADDLE_ENVIRONMENT=production` returns an error; live provider credentials and prices are stored for future configuration, not used yet.
- Provider-managed plan/price IDs cannot be swapped by a platform admin after subscriptions depend on them, and manual platform subscription changes cannot overwrite Paddle source-of-truth.
- A suspended or expired tenant is denied both operational GET and mutations. Billing recovery remains available, with sensitive billing management reserved for the company owner; platform oversight remains independently accessible.
- Paddle trial terms: no-trial prices only while AssetMov grants its own default signup trial. Trial end at the exact stored timestamp blocks all operational access.

## Local acceptance — two workspaces

Current Windows WAMP codebase:

```powershell
cd C:\wamp\www\html\assetmov
git switch feature/paddle-saas-billing-admin

cd backend
npm run db:validate
npm run db:deploy
npm run db:status
npm run db:generate
npm run lint
npm run typecheck
npm run typecheck:tests
npm test
npm run build
```

For React:

```powershell
cd C:\wamp\www\html\assetmov\frontend
npm run lint
npm run typecheck
npm run build
```

Use **only** local `assetmov_test` for database acceptance (do not run tests against `assetmov`):

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

After running tests, restart the backend with the normal development database. The API acceptance suite refuses any database not named `assetmov_test` on `127.0.0.1` or `localhost`. The new synthetic signed Paddle events use **local HMAC fixtures and fake provider IDs**, never initiate a real financial transaction, and exercise new entitlement, retry, overdue and payment history behavior.

### Browser QA

1. Register company A and company B; company administrators must have `TENANT_OWNER` / Company Administrator full permissions and **company-specific** configurable roles.
2. Company A owner creates roles, assigns permissions and creates users; company B never sees or accesses those IDs.
3. Verify Platform Admin company/plan overview and independently audited suspension/reinstate controls.
4. Company owner opens **Billing & Plan** and verifies product-specific monthly/yearly prices; arbitrary custom roles must receive 403 from all sensitive company billing endpoints.
5. Configure a distinct billing email if the same administrator email exists in the shared BuildHire Paddle account.
6. Start a **real Paddle sandbox** checkout with a separate approved HTTPS AssetMov host, then verify access changes **only** after a signed webhook. Test provider portal, failed payments, renewal and replay.
7. Expire a test tenant's trial; company users must be denied asset/location/employee/transfer API reads and writes. Owner can still open billing; others see a recovery message and can sign out.
8. Confirm that an overdue `PAST_DUE` subscription denies asset access and that a verified provider return to active restores access without changing custom roles.
9. Test plan changes with provider quotation, expected amount confirmation and later subscription webhook; verify no local entitlement moves early.
10. Test separate platform suspension while a company has a paid Paddle subscription; it must block operational access without falsely changing Paddle state.
11. Finish case-sensitive Linux MySQL migration rehearsal and GitHub Actions CI. The repository's workflow has returned `startup_failure` previously and does not currently evidence validation.

## Known limitations and next steps

- **No real Paddle sandbox checkout or webhook has been verified in this branch.** Synthetic tests are not equivalent to Paddle's actual event payloads or checkout approval. Confirm against dashboard events and licensed domains before any real payments.
- **Live Paddle mode is intentionally disabled**. Live billing needs a separate approved release, verified product/price catalog, webhook destination, secure company transition from sandbox to live identity, and merchant/legal/refund configuration.
- Existing AssetMov file attachments are a small MySQL BLOB prototype with a 512 KiB per-file limit, not production-grade object storage/malware scanning.
- Email verification, invitation/password setup, billing webhook operational alerting, full revenue reconciliation, and Linux migration portability remain outstanding launch milestones.
- Existing BuildHire `Paddle` reference is staging-oriented and is not itself proof that production Paddle payment processing is complete.
