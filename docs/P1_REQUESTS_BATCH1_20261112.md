# P1 Batch 1 — Requests and approvals (stacked on P0)

**Branch:** `feature/p1-requests-approvals-20261112`  
**Base:** `feature/p0-hardening-company-assets-20261111`  
**State:** implementation committed, NOT YET validated on WAMP/MySQL/browser.

## Initial user stories

- A user granted `request.create` submits an ASSET, SOFTWARE or SERVICE request
  with 1–30 line items and an 8+ character business reason.
- A requester sees only their own requests. A user granted
  `request.approve` sees the company approval queue.
- An approver can approve, reject or request changes, recording a mandatory
  explanation. A requester cannot approve their own request.
- A requester may cancel their own pending or change-requested request.
- All requests and decisions are tenant-filtered, permission-checked, CSRF
  protected and written to the existing audit log.
- Stale/competing decisions return a conflict rather than overwriting status.
- React workspace navigation exposes `/workspace/<tenant>/requests` only to
  users with request permissions.
- Existing Prisma `AssetRequest` and `AssetRequestItem` models are reused.
  **No new P1 database migration is introduced in this initial batch.**

## Current limitations — required to complete P1

- Configurable multistep approval chains, partial quantities and SLA reminders.
- Fulfillment allocation/reservations and purchase or service handoff.
- Request changes/resubmission, file evidence, notification delivery and
  delegated approver coverage.
- Full browser/mobile/role/permission acceptance, integration race tests with
  two real approvers, accessibility and error-state sign-off.
- P0 branch must pass its own migrations/tests and land in main before this
  stacked PR can be retargeted or merged.

## Validation

On a clean WAMP checkout of this branch, before modifying `assetmov`:

```powershell
npm run db:validate
npm run db:generate
npm run typecheck
npm run lint
npm test
npm run build
```

Use local disposable `assetmov_test` for `db:deploy`, seed and
`npm run test:integration`. Confirm the new employee-history P0 migration
succeeds there first. Never use `prisma migrate reset` on `assetmov`.

### Browser matrix

1. Assign one role `request.create` only and another `request.approve` only.
2. Check the menu appears only to those users. Direct URLs for others deny entry.
3. A requester creates a request, sees it in their queue and cancels it.
4. An approver sees that company's requests but not other tenants'.
5. Owner/approver cannot decide their own submitted request.
6. The decision reason appears in the queue and audit history.
7. Mobile 390px: form actions and decision buttons are usable, tables scroll
   internally, and the workspace side drawer opens/closes.
8. Concurrent decisions produce exactly one valid final decision.

Do not claim P1 complete until those checks and remaining P1 workflows pass.
