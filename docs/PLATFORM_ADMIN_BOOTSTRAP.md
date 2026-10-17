# Platform Admin and Subscription Plan Bootstrap

This is an implementation-stage guide for the separate AssetMov platform administration scope. It does not mean the SaaS controls are production-ready.

## Before starting

After the first reviewed Prisma migration has been generated and applied, and the Prisma client has been generated, run:

```sh
npm run db:seed:plans
```

The seed is safe to rerun. It creates the proposed Trial, Starter, Growth, Business and inactive Enterprise plan records only when their keys do not already exist. It deliberately does not overwrite values changed later by a Platform Super Admin.

The proposed starting limits are:

| Plan | Trial duration | Assets | Active users | Storage |
|---|---:|---:|---:|---:|
| Trial | 14 days | 100 | 3 | 1 GiB |
| Starter | None | 500 | 5 | 5 GiB |
| Growth | None | 2,500 | 25 | 25 GiB |
| Business | None | 10,000 | 100 | 100 GiB |
| Enterprise | Configure before activation | Configure | Configure | Configure |

These values are starting defaults from the product requirements, not final commercial commitments. Storage limits are stored and exchanged as byte counts. A `null` cap means unlimited; Enterprise starts inactive so it cannot accidentally be assigned before a platform operator configures it.

## Bootstrap the first Platform Super Admin

There is intentionally no public API or registration-field for self-promoting to Platform Super Admin. The platform admin flag is independent from all company memberships and tenant roles.

1. Register the intended administrator as a normal account using the regular signup flow.
2. Connect to the database through a trusted operator session, not through a public application endpoint.
3. Promote only the exact intended account, then verify that exactly one row was affected:

```sql
UPDATE `User`
SET `isPlatformAdmin` = TRUE
WHERE `email` = 'replace-with-the-approved-admin-email'
  AND `disabledAt` IS NULL;
```

Replace the sample email before executing. Do not commit real admin emails, passwords, database dumps or credentials. Keep access to this database operation restricted and audited under your own operational controls. To revoke platform access, set `isPlatformAdmin` to `FALSE` using the same trusted process.

## Platform API currently scaffolded

All paths use the configured API base URL and require a signed-in session. Platform writes additionally require the session CSRF token in `X-CSRF-Token`. Mutations require an audit `reason`.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/platform/plans` | List plans, including inactive plans |
| POST | `/api/platform/plans` | Create a plan |
| PATCH | `/api/platform/plans/:id` | Edit plan limits or activation state |
| GET | `/api/platform/tenants` | Search/paginate companies and view asset/active-user counts plus their plan |
| PATCH | `/api/platform/tenants/:tenantId/subscription` | Assign a plan and start a trial, activate, or suspend a company |

The supported subscription-change modes are `trial`, `activate` and `suspend`. Trial timestamps are calculated by the server from the selected plan's configured trial duration. Tenant plan changes and plan creation/updates write to the separate platform audit log.

Example plan JSON shape:

```json
{
  "key": "starter",
  "name": "Starter",
  "description": "Starter inventory plan",
  "maxAssets": 500,
  "maxActiveUsers": 5,
  "storageLimitBytes": "5368709120",
  "trialDurationDays": 0,
  "isActive": true,
  "reason": "Initial plan configuration"
}
```

The field `storageLimitBytes` is a decimal string to preserve integer precision in JSON. Use `null` for an unlimited cap, not a browser-provided usage number.

## Current limitations — do not skip

This slice creates the plan/subscription schema, a protected platform API foundation, plan seeding and Trial assignment at signup. It does **not** yet enforce asset/user/storage quotas on all write paths, block tenant operations when a trial expires, track actual uploaded-file storage, provide the platform/company admin screens, integrate payments, or complete DB-backed and cross-tenant tests. The first reviewed migration and successful CI run are still required before acceptance.
