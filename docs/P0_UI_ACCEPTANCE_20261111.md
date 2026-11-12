# P0 UX regression acceptance — responsive cleanup (2026-11-11)

**Scope:** Browser-only polish on PR #12. No database or API migrations are introduced by this UI patch.

## Input and browser-compatibility changes

- Company Profile's auto-number prefix input accepts two to sixteen letters,
  numbers, underscores or hyphens using a browser-compatible HTML pattern
  `(?:[A-Za-z0-9_]|-){2,16}`, rather than a Unicode-v-invalid character class.
- Category/model/location patterns use compatible syntax.
- Form checkboxes and radios no longer inherit the full-width text-input
  styling; active-status checkboxes use compact, keyboard-focusable switches.
- Date/datetime-local fields retain native picker accessibility but receive
  consistent spacing, border, focus states and calendar indicator styling.
- Form placeholders, primary/secondary actions, modal headers, footer spacing
  and CSV import controls use a common visual treatment.

## Screens and behaviour to verify

| Screen | Acceptance |
| --- | --- |
| Asset Register | Search and clear actions align; status/category/model/location/warranty/sort/order inputs occupy a responsive grid; no overlapping labels; bulk-assignment action bar only when selected; empty states and row actions share theme |
| Categories & Models | Four tabs (Categories / Asset models / Suppliers / Manufacturers). Only active section is displayed. Add/edit operations remain usable. Tabs work via keyboard. |
| Employee and Locations modals | Active status is a compact switch; labels and inputs align; no oversized default checkbox. Archival protections remain operational. |
| Supplier/Manufacturer modals | Themed input controls and status switch; no excessive scrolling or double headers. |
| Company Profile | No `Invalid regular expression` error in console when entering inventory prefix; date/other preferences save as before. |
| Account top bar | Click name/avatar opens menu with Verify Email (when unverified), Change Password, Sessions and Sign out. Menu closes on Escape or outside click; arrow keyboard navigation works. |
| CSV import | Themed file chooser, location dropdown, preview table and progress controls. |
| All modals | Correct width and internal scrolling; buttons reachable at 390px width and 200% zoom. |
| All pages | No unintended horizontal document overflow; wide data tables scroll inside their own table panels. |

### Device widths
- Desktop 1440px and 1024px
- Tablet 768px
- Phone 390px and 320px
- Keyboard only (Tab / Shift+Tab / arrows / Escape) and 200% browser zoom

**Prior acceptance reported by the developer:** nine P0 functional workflows succeeded before this UI patch; responsive/mobile acceptance was still failing. Automated typecheck, lint and build previously passed **before** the UI patch; the updated UI commits require a new run. Do not treat the patch as browser-verified until screenshots/tests have been reviewed.

### Local commands
```powershell
cd C:\wamp\www\html\assetmov
git pull --ff-only origin feature/p0-hardening-company-assets-20261111
npm run typecheck
npm run lint
npm test
npm run build
```

Keep the PR in draft until responsive acceptance passes. Do not reset or modify the existing `assetmov` database for CSS-only testing.


## Fixed-height company sidebar regression — November 12, 2026

User screenshot shows the authenticated company sidebar exceeding viewport height:
the lower navigation links and help card are inaccessible because the desktop
`.sidebar` was `position: fixed` with no vertical overflow policy.

- Desktop (>780px): the fixed sidebar now scrolls **within its own viewport**
  using `overflow-y: auto`, `height: 100dvh` (100vh fallback), visible slim
  scrollbar, and non-shrinking branding/nav/footer sections.
- Tablet and phone (<=780px): preserve the existing horizontal navigation
  rail; no constrained vertical sidebar height.

### Browser acceptance
1. At 1440×900 and a 1366×768 viewport, sign in as Company Administrator.
   Mouse-wheel over the **left sidebar**. Reach Billing & Plan, the help card,
   and the version line without scrolling the main content.
2. With the mouse over the main page, scroll the page: the desktop sidebar
   remains fixed. Repeated wheel/trackpad scrolling over the menu works normally.
3. Test a short-height browser (e.g. 900×550) and browser zoom 125%, 150% and
   200%. All menu links stay reachable and the selected page remains legible.
4. Use Tab/Shift+Tab with keyboard only: focusing an off-screen sidebar link
   scrolls it into view; focus ring is visible.
5. At 768px and 390px viewport widths, the sidebar becomes a horizontal
   scrolling navigation rail, with no forced vertical scrollbar.

**Verification state:** CSS fix committed but not yet confirmed on the local
browser; automated TypeScript/lint/build for subsequent navigation commits also
require a fresh WAMP run. No database changes are involved.
