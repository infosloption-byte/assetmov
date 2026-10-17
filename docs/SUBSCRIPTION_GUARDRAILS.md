# AssetMov Subscription Guardrails and Plan Limits

**Status: product proposal — not implemented.** The quantities below are proposed launch defaults for design and testing. They are not published prices or a final commercial commitment. Platform Super Admin must be able to configure plans and limits without deploying code.

This specification is mandatory for subscription, billing, entitlement and quota work. It complements [SAAS_PRODUCT_REQUIREMENTS.md](SAAS_PRODUCT_REQUIREMENTS.md).

## 1. The core rule

A request may proceed only when all relevant checks pass:

1. The user is authenticated and the session is valid.
2. The user is a member of the selected, active tenant, unless this is a separately authorized platform route.
3. The tenant subscription state permits the requested operation.
4. The plan includes the requested feature and has not exceeded the applicable quota.
5. The user's tenant role grants the action.
6. The target record is within the user's permitted location scope where applicable.
7. Domain validation, data integrity and safety rules pass.

**Plan entitlement, user permission, tenant lifecycle and location scope are separate gates.** A Company Admin cannot bypass a plan limit. A paid plan does not grant every user permission. A platform super admin can manage plans but does not get implicit routine access to company data.

## 2. Proposed launch plan matrix

The values below are initial defaults for planning and acceptance tests. They must be stored as plan data, editable by authorized Platform Super Admins, and versioned. Do not hard-code plan-name conditionals in route handlers. **Configurable** means set a concrete limit in the platform console; it does not mean the service has infinite capacity.

| Capability / limit | Trial | Starter | Growth | Business | Enterprise |
|---|---:|---:|---:|---:|---|
| Trial duration | 14 days | — | — | — | Negotiated |
| Registered asset records | 100 | 500 | 2,500 | 10,000 | Configurable |
| Active company users / members | 3 | 5 | 25 | 100 | Configurable |
| Active locations | 10 | 25 | 100 | 500 | Configurable |
| Custom roles | 3 | 10 | 25 | 100 | Configurable |
| Custom fields per asset model/category | 10 | 15 | 30 | 50 | Configurable |
| Private file storage | 1 GB | 5 GB | 25 GB | 100 GB | Configurable |
| Report/data exports per billing month | 100 | 500 | 5,000 | 20,000 | Configurable |
| Audit-history retention target | 30 days | 90 days | 1 year | 3 years | Configurable by agreement and policy |
| Core asset register, assignment and transfer | Yes | Yes | Yes | Yes | Yes |
| Advanced reports and bulk import/export | Limited | Basic | Yes | Yes | Yes |
| Requests / approvals | Preview only | — | Yes | Yes | Yes |
| Maintenance / service workflows | Preview only | — | Yes | Yes | Yes |
| Software-license register | Preview only | — | Yes | Yes | Yes |
| Physical audit and barcode/QR tooling | Basic preview | — | Yes | Yes | Yes |
| Public/customer API access | No | No | Optional / capped | Capped | Configurable |
| SSO / enterprise identity | No | No | No | Optional | Configurable |
| Custom retention / integration / support commitments | No | No | No | Limited options | As contracted |

Product decision note: this matrix deliberately keeps a coherent base asset register in all plans. The exact feature packaging, durations, limits and upgrade path must be reviewed before taking payment. Feature availability is enforced by named capability keys and limits, not the displayed plan title.

## 3. Limits the platform must support

Plan definitions should support independent, typed limits, rather than one hard-coded set of fields:

### Persistent resource limits
- Total registered asset records, including disposed/retired and archived records retained in the system.
- Active users/memberships in a tenant.
- Active locations and maximum location-hierarchy depth, if needed.
- Custom role count and custom-field-definition count (including per-model/category limits).
- Storage bytes and optionally file count / maximum individual upload size.
- Other tenant-owned master data only when a clear product or cost reason exists.

### Period and workload limits
- Reports/exports per billing period, with export row ceiling and maximum file size.
- Import jobs per period, rows per import, concurrent import jobs and maximum upload bytes.
- API requests per period and short-window request rate for API-enabled plans.
- Scheduled report/notification jobs or other costly features as modules are introduced.
- Audit history retention by plan, subject to legal, contractual and platform security policies.

Keep abuse/rate limits distinct from subscription quotas: a paid or Enterprise tenant must still be protected by platform safety limits, and an affordable plan's quota must not replace per-user/per-IP abuse throttling.

## 4. Enforcement behavior

### Usage warnings and hard limits

- Notify Company Admins at configurable warning thresholds. Suggested defaults: 80% and 100%; use in-app notices and email when email delivery is configured.
- Show current usage, limit, reset date where applicable, and a clear upgrade or contact-admin action.
- UI checks are advisory only. The server enforces every limit on every relevant request.
- When a hard resource limit is reached, reject operations that would **increase** the counted usage. Use an explicit machine-readable error, such as PLAN_LIMIT_REACHED, including the limit key, current usage, maximum and upgrade path without exposing data from other tenants.
- When a feature is not in the plan, return a distinct PLAN_FEATURE_REQUIRED result. Do not misreport it as missing user permission.
- Maintain a consistent API error contract; for example, a plan-gated feature can use HTTP 403 with PLAN_FEATURE_REQUIRED, while a quota conflict can use HTTP 409 with PLAN_LIMIT_REACHED. Abuse rate limits return HTTP 429. Exact status mapping should be standardized before client implementation.

### What remains available at a limit

At a resource quota, allow safe reads, search, existing-record edits that do not increase usage, state-preserving workflows, and deletion/deactivation where appropriate. Block only the action that consumes additional quota. Existing inventory must not become inaccessible just because the tenant reached its asset cap.

An operation may touch multiple counters; check all relevant limits and commit the business action and usage reservation atomically. For file uploads, reserve estimated storage during upload and reconcile actual bytes before finalizing. For imports, validate and estimate row count before committing any batch.

### Accurate and race-safe usage

- Never implement a quota as only a frontend counter or a simple COUNT(*) then insert; simultaneous requests can exceed it.
- Use transaction-safe allocation/conditional updates or a dedicated quota-reservation record for concurrent create, invite, import and upload operations.
- Define one shared quota/entitlement service used by all routes, background jobs, bulk operations, imports, APIs, reports and scheduled tasks.
- The database remains authoritative. Usage caches and summaries are for performance/UI; run reconciliation jobs that compare counters to eligible records and alert on drift.
- Make async jobs idempotent and reserve their quota before processing so retries cannot consume quota twice.
- Define counting rules for each limit, including active vs disabled users, archived assets, soft deletion, failed jobs, cancelled exports and storage deduplication.
- Soft deletion or archiving must not be a way to evade a quota. Count retained records unless the plan explicitly defines another rule; only a completed permanent purge after approved retention may release record/storage usage.
- Monthly quotas use one defined billing-period timezone and period boundary. Store the period and idempotency key with every usage event; do not reset based only on the browser's local clock.

## 5. Subscription lifecycle and guardrails

The subscription is a separate record from the tenant itself. Tenant lifecycle state, subscription/payment state, feature entitlement and usage counts must not be collapsed into a single TenantStatus flag.

Target subscription states:
- **TRIALING** — trial features/limits apply until the configured end time.
- **ACTIVE** — purchased plan applies.
- **PAST_DUE** — payment retry/dunning is in progress; show billing warnings.
- **GRACE_PERIOD** — a defined, time-limited continuation after payment failure or trial end.
- **SUSPENDED** — high-risk, policy, or exhausted grace state with restricted operations; the reason and allowed actions must be explicit.
- **CANCEL_AT_PERIOD_END** — service remains active until the paid period ends.
- **CANCELLED / EXPIRED** — normal paid/trial access has ended; follow the published data access and retention policy.

Suggested default business policy to validate before launch:
- Trial lasts 14 days and has a visible expiry date. Do not silently convert to paid access without valid consent/payment authorization.
- Failed payment enters a 14-day grace window with clear notifications and retry status; the Platform Super Admin must be able to configure the window.
- During trial expiry or payment grace, preserve company data and allow normal core workflows where operationally safe while presenting a persistent upgrade/billing notice.
- After grace, restrict new writes and premium operations according to policy. Preserve sign-in to billing/support, read access and export of the company's own data for a defined recovery window; do not silently delete records.
- Cancellation takes effect according to the billing period. Provide customer data export and a documented retention/deletion schedule.
- Suspension for abuse/security/legal reasons may require immediate restriction, but must be separately auditable and not confused with a routine payment failure.
- Re-activation restores eligible access without reconstructing or silently discarding business records.

The exact duration and legal wording must be confirmed before launch. The control logic must support policy configuration rather than baking all of these durations into application code.

## 6. Upgrade and downgrade behavior

### Upgrade
- The user sees the new feature/limit and effective time before confirming.
- On confirmed provider event or an authorized manual platform action, update the subscription and entitlement snapshot idempotently.
- Raise limits immediately only when the subscription/payment policy says the upgrade is effective.
- Audit actor, source, previous plan/version, new plan/version, effective time and billing event/reference.

### Downgrade
- Explain which current usages exceed the lower plan **before** confirmation.
- Normally make a scheduled downgrade effective at the next billing boundary; allow immediate downgrade only with explicit policy and confirmation.
- Never delete assets/users/locations/files/roles automatically to meet a lower limit.
- If existing usage exceeds the downgraded limits, allow reads and exports, and allow safe reductions; block new consumption of the over-limit resource until usage falls below its limit. Existing data is preserved.
- Disable plan-exclusive creation/use of new premium operations according to the agreed effective time. Preserve access to historical records needed for support, audit or export unless law or security requires otherwise.

## 7. Platform and tenant administration

### Platform Super Admin can
- Create/archive plans, edit prices/currency/tax configuration, feature keys, quotas, warning thresholds, trial rules and billing/grace policies.
- Set plan versions and future effective dates; inspect tenant plan, usage and billing state.
- Apply a documented tenant-specific commercial override only with an explicit reason, actor, scope, expiry and audit history.
- Grant time-limited support exceptions without deleting or altering usage history.
- View aggregate service/usage metrics while minimizing customer-data access.

### Company Admin can
- View current plan, usage, caps, billing period, trial/renewal/end date and restrictions.
- Manage billing contacts and payment method or request plan change through authorized billing flows.
- Export their company's data and manage resources.
- Receive warnings and identify which action/feature is plan-gated.

A Company Admin cannot edit plan definitions, change the tenant's own plan ID directly, mutate subscription state, alter counters, or bypass limits through APIs or crafted requests.

## 8. Data model / service design target

Design the schema and service layer around the following concepts (names are illustrative):
- **Plan** — stable plan identity, display metadata and active/archived/version state.
- **PlanFeature** — feature/capability keys and enabled values per plan.
- **PlanLimit** — typed limit key, value/unit, scope and policy per plan version.
- **Subscription** — tenant, selected plan/version, lifecycle state, billing-period boundaries, grace/renewal/cancellation fields and provider references.
- **SubscriptionEvent** / billing event — immutable changes and idempotent external event identifiers.
- **TenantUsageCounter** and/or **UsageEvent** — current count and period-scoped consumption; include safe concurrency behavior.
- **QuotaReservation** — optional pending holds for uploads, imports, exports and other async/high-cost operations.
- **TenantEntitlementSnapshot** — optional cached/effective entitlement view with version and recomputation rules.

Keep secrets/payment data out of application logs. Store provider customer/payment references rather than card details. Webhooks must validate signatures, handle retries idempotently, and reject replay or out-of-order state regression. Do not trust browser-supplied subscription status or usage totals.

## 9. Required tests / acceptance gates

Before launch, test at minimum:
- Plan feature present/absent; permission present/absent; location allowed/denied; each gate independently and in combination.
- At exactly the limit, one below, one above, and two concurrent creates attempting to consume the last slot.
- Company A cannot inspect or consume Company B's limits, usage, subscription or plan override.
- API/UI, background jobs, bulk imports, file uploads, exports and scheduled jobs enforce identical policies.
- Archived/soft-deleted objects, disabled members, failed jobs, retries and billing-boundary cases follow the documented counting rules.
- Trial expiration, failed-payment grace, suspension, reactivation, cancellation, downgrade-over-limit and upgrade timing.
- Platform plan edits/version changes do not unintentionally change current customers without the configured effective policy.
- Usage reconciliation detects and repairs counter drift without allowing an unauthorized tenant to mutate another tenant.
- Warnings and errors explain the limit and next step without leaking internal data or customer information.
- Successful CI, schema validation/migrations, API/database tests and browser acceptance tests.

No plan/limit feature is complete until server-side tests prove that limits cannot be bypassed.
