# Company Overview — live inventory metrics

**Merged:** `main` on 2026-11-11 via PR #9, after PRs #6–#8.  
**Status:** WAMP TypeScript/lint/37 unit tests/build and 1/1 MySQL API integration passed on the original feature; the later mobile navigation and role-only tab adjustments still require browser and final build verification.

## Scope

The Company Overview no longer claims that placeholder cards are live data.
It loads an authenticated, role-protected asset summary from
`GET /api/workspace/overview`:

- `total`: every retained asset visible to the caller, regardless of lifecycle status
- `assigned`: assets currently in `ASSIGNED` state
- `inService`: assets currently in `IN_SERVICE` state
- `inTransit`: assets currently in `IN_TRANSIT` state

All counts use the same tenant + location visibility as the asset register.
The endpoint requires an authenticated, active tenant membership, an eligible
subscription, and `asset.read`. The server ignores client-supplied counts.

The frontend displays a loading state, meaningful error state, per-workspace
refresh control and permission notice. Metrics are cleared when the workspace,
location permissions or subscription access changes. It never displays the
unimplemented requests module as a numeric metric.

The dedicated Platform Super Admin console remains controlled by
`platformMode`, not an `activePage === "platform"` company-page entry.
Do not restore `activePage !== "platform"` to the company billing gate; it
causes TS2367 when the company page type intentionally excludes that value.

## Safe local verification

This feature adds **no database migration**, but the parent PR stack has
three additive migrations; apply the full parent migrations using existing
non-destructive migration commands before testing.

Run from the AssetMov repository root in PowerShell:

```powershell
npm install
npm run db:validate
npm run db:generate
npm run typecheck
npm run lint
npm test
npm run build
```

For DB API acceptance, create a separate local WAMP MySQL database named
`assetmov_test`, deploy committed migrations there and seed subscription
plans. **Never** run the integration suite against `assetmov` or production.
From the repository root:

```powershell
$env:DATABASE_URL="mysql://root:@127.0.0.1:3306/assetmov_test"
$env:ASSETMOV_RUN_DB_INTEGRATION_TESTS="1"
npm run db:deploy
npm run db:seed:plans
npm run test:integration
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:ASSETMOV_RUN_DB_INTEGRATION_TESTS -ErrorAction SilentlyContinue
```

The new assertions check two isolated tenants, scoped and no-location viewers,
missing tenant context and cross-tenant denial. Manually verify the Company
Overview for a tenant owner, location-limited viewer, non-asset-reader and
expired subscription, and switch between companies in the same session.

The owner requested immediate merges with the Paddle sandbox and GitHub
Actions investigations deferred. All four PRs were merged into `main` in order.
This does **not** imply successful sandbox payment, working GitHub Actions or
a completed interactive browser walkthrough. See [BROWSER_ACCEPTANCE.md](BROWSER_ACCEPTANCE.md).
