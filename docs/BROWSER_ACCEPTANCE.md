# Browser acceptance: Company Overview and Platform Console

## Current verification state (2026-11-11)

The developer's WAMP checks on the earlier PR #9 commit passed typecheck, lint,
37 unit tests, build and the single comprehensive MySQL integration test.
After the lockfile patch, typecheck, lint and builds also passed. **The mobile
navigation and role-only Company Admin fixes added afterward still need a new
build and browser walkthrough.**

There is no remotely accessible WAMP browser in this development workflow.
Source review and database API tests **are not** a claim that browser acceptance
has been performed. GitHub Actions and Paddle sandbox checks have been
deferred at the repository owner's request.

## Start locally

1. Pull the latest `main` after the stacked merges.
2. Apply any outstanding *additive* Prisma migrations to the local development
   database using `npm run db:deploy`; do **not** reset `assetmov`.
3. Run `npm install`, `npm run db:generate`, `npm run typecheck`,
   `npm run lint`, `npm test` and `npm run build`.
4. Run `npm run dev`, open `http://localhost:5176`, and use
   the browser's responsive viewport tools at 1440px, 1024px, 768px and 390px.
5. Use separate test users with appropriate roles and memberships; don't
   change security flags on real customer records.

## Company Overview

- [ ] Active company owner with `asset.read`: all four cards show numeric
      counts matching the asset register (tracked / assigned / in service / in transit).
- [ ] Zero-asset company: numeric zeros, not perpetual loading.
- [ ] Limited-location employee: only assigned locations and descendants are
      counted; assets in another location are not leaked.
- [ ] Role without `asset.read`: metrics remain hidden and notice is shown.
- [ ] Switch between two companies: no stale counts from the previous company.
- [ ] After expiry or subscription failure: the billing gate takes precedence;
      the normal asset dashboard does not bypass restrictions.
- [ ] Refresh metrics works, and a failed API request presents an error
      without showing stale totals.
- [ ] With a role that has `roles.manage` but not `members.manage`,
      Users & roles opens to the Roles tab, rather than a blank tab.
- [ ] With only `members.manage`, the Users tab remains usable.
- [ ] On 390px and 768px viewports, cards wrap and critical navigation can
      be reached without off-screen inaccessible controls.

## Independent Platform Console

- [ ] Platform-only account (zero memberships) starts at dedicated Platform
      Overview; Company Workspace switch is not shown.
- [ ] Dual-role Platform Admin starts at Platform Console, switches explicitly
      to Company Workspace and back, without sharing company privileges.
- [ ] Ordinary company admin cannot view any platform navigation/API screen.
- [ ] All eight Platform/Operations/Finance/System screens are reachable with
      data, loading and empty states; company menu items aren't in console nav.
- [ ] Disable/restore ordinary user requires a reason and invalidates sessions;
      changing a Platform Admin's account is protected.
- [ ] Desktop sidebar stays visible. At <=800px a menu button opens the
      drawer with `aria-expanded=true` and focuses Close navigation.
- [ ] Press Escape: drawer closes and focus returns to the trigger.
- [ ] Closed drawer links are not keyboard-focusable; with drawer open the
      underlying content is inert, and navigation closes the drawer.
- [ ] Sidebar table content scrolls horizontally inside its container at 390px,
      without expanding the entire document width.
- [ ] Repeat using keyboard-only Tab/Shift+Tab and 200% zoom; verify
      visible focus and no clipped action buttons.

## Sign-off

Record screenshots, the test user roles and any failed scenario. Do not
interpret skipped browser/Paddle/CI work as a passing test. Any browser
failure should become a focused new bugfix PR after merger.
