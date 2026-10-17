# AssetMov Subscription Plans and Limits

**Status: proposed defaults — not implemented.** These values are a practical starting point for implementation, not final prices or a published commercial promise. Platform Super Admin must be able to edit them from platform settings.

The subscription system is deliberately simple: **only four plan dimensions matter: asset limit, user limit, storage limit and trial duration.** Location count, roles, custom fields, exports and other application modules are not separately limited by subscription plans. Application permissions and platform-wide security protections still apply independently.

## 1. Proposed plan defaults

| Plan | Trial duration | Maximum assets | Maximum active users | Storage |
|---|---:|---:|---:|---:|
| Trial | 14 days | 100 | 3 | 1 GB |
| Starter | Not applicable | 500 | 5 | 5 GB |
| Growth | Not applicable | 2,500 | 25 | 25 GB |
| Business | Not applicable | 10,000 | 100 | 100 GB |
| Enterprise | As agreed | Configurable | Configurable | Configurable |

Paid-plan feature access is the same across plans. The differences are only the three resource caps. Trial access uses the same application capabilities for the trial period but has the Trial caps above. No plan-specific limits for locations, custom roles, custom fields, report counts, import counts, API usage or history retention are part of this design.

The Platform Super Admin can change plan limits. Any change must be audited and its effective behavior for existing subscriptions must be defined. Do not hard-code plan names or values in route handlers.

## 2. What counts toward each limit

### Assets
Count all retained asset records for the company, including disposed, retired and archived assets. Archiving or soft-deleting an asset does not free capacity. A record only stops counting after a policy-approved permanent deletion/purge. Asset creation and bulk imports must respect the same limit.

### Users
Count active user memberships in the company. A deactivated user no longer consumes an active-user slot, but their audit history and business records must remain. Re-inviting or reactivating a user requires an available slot. Users belonging to another tenant are counted separately in each tenant where they have an active membership.

### Storage
Count actual bytes of retained files uploaded for the tenant (such as asset attachments and documents), not the database's internal storage. Include pending upload reservations while an upload is in progress. Deleting a file releases storage only when deletion is complete. Show used and available storage to the Company Admin.

### Trial duration
Store the trial start and end timestamp on the tenant subscription. Enforce the end time on the server, not in the browser. Show the remaining trial time to Company Admins. Do not silently convert a trial to a paid subscription without valid billing consent.

## 3. Enforcement rules

- The backend is authoritative. UI counters and disabled buttons are only user guidance.
- Check limits on every operation that can increase asset count, active user count or storage usage, including direct APIs, bulk operations, imports, invitations/reactivations and file uploads.
- Use transactions, conditional updates or quota reservations so simultaneous requests cannot consume the same remaining slot.
- If a limit is reached, block only the operation that would exceed it. Keep existing assets, users and files accessible. Reads, search, normal edits and safe reductions remain available.
- Downgrades must never delete assets, users or files automatically. If current usage exceeds the lower plan, keep the data, allow reads/exports and reductions, and block additional consumption of the over-limit resource.
- Return clear machine-readable errors, such as PLAN_LIMIT_REACHED, with the limit key, current usage, maximum and next step. Avoid exposing any other tenant's usage.
- The app must distinguish a subscription limit from an ordinary role-permission denial and from platform abuse rate limiting.
- Platform-wide abuse/security rate limits still apply to every plan, including Enterprise. They are security controls, not subscription features.

## 4. Subscription lifecycle

Keep subscription state separate from the tenant's general lifecycle state.

- **TRIALING:** Trial limits apply until the configured trial end.
- **ACTIVE:** Paid plan applies.
- **PAST_DUE / GRACE:** Payment retry is in progress. Show billing notices and follow the configurable grace policy.
- **CANCEL_AT_PERIOD_END:** Paid access remains until the agreed period end.
- **EXPIRED / SUSPENDED:** Apply the platform's published access policy. Preserve customer data and allow billing/support and company data export where safely permitted.

A suggested initial policy is a 14-day trial and a configurable 14-day payment grace period. These are defaults to review before launch. Do not silently delete data at trial expiry, payment failure or cancellation. Any suspension for security or legal reasons is separate from a routine billing restriction and must be audited.

## 5. Platform and Company Admin responsibilities

### Platform Super Admin
- Create and manage plan names and prices.
- Configure asset limit, active-user limit and storage allowance per plan.
- Configure trial duration and subscription/billing policy.
- Assign or change a tenant's plan using an authorized, audited action.
- View each tenant's subscription state and usage figures.
- Apply a tenant-specific exception only with actor, reason, scope, expiry and audit history.

### Company Admin
- View the current plan, trial end/renewal information, asset usage, active users, storage used and remaining capacity.
- Receive warnings at suggested 80% and 100% thresholds.
- Request or complete an upgrade using the authorized billing flow.
- Manage company records without being able to change the plan, limits, subscription state or usage counters directly.

## 6. Minimum data and service design

Keep the implementation small. A plan needs:
- Plan identity/name and active state.
- Maximum asset count.
- Maximum active-user count.
- Storage limit in bytes.
- Trial duration in days (used for trial configuration only).

A tenant subscription needs:
- Tenant and selected plan.
- Subscription status.
- Trial start/end timestamps.
- Billing period and cancellation fields when paid subscriptions are implemented.
- Provider references and audit/event history where billing integration requires them.

The shared subscription service should return effective limits and current usage for a tenant. An authoritative usage query or a simple, carefully maintained counter is sufficient initially, provided writes are concurrency-safe and usage can be reconciled. Add reservation handling for concurrent uploads; do not build a complex general-purpose entitlement engine before it is needed.

Do not trust plan IDs, usage counts, file sizes, subscription states or trial timestamps submitted by the browser. Billing webhooks must be signature-verified, idempotent and audited. Never store card details in AssetMov.

## 7. Acceptance tests

- A tenant can create assets and active users up to, but not above, its configured limit.
- Concurrent requests cannot exceed the asset or active-user cap.
- Uploading files cannot exceed tenant storage, including with concurrent uploads.
- Trial access ends based on the server's saved timestamp.
- Company A cannot read or change Company B's plan, subscription or usage.
- Deactivating a user frees an active-user slot but preserves audit history and owned business records.
- Archive/soft-delete cannot bypass asset limits; completed approved permanent purge follows the documented counting rule.
- After a downgrade, existing data stays available but new resource creation is blocked when over limit.
- All UI and API paths report the same limits, and failed/retried requests do not double-count usage.
- The subscription guardrails are accepted only after successful schema/migration validation and DB-backed API tests in CI.

This document defines target behavior. Subscription schema, plan administration, counters, trial enforcement and billing flows are not currently confirmed as implemented.
