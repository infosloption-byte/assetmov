# Company-owned user and role management

Company administrators define tenant-specific roles by selecting from the application's permission catalog. Each company has an immutable system `TENANT_OWNER` role; a company cannot define platform-administrator permissions. Platform administrators are separate user identities, not tenant roles.

## Intended administration workflow

1. Company owner creates a custom role under `POST /api/roles`, choosing an internal role key, name and permitted actions.
2. Company owner or a delegated manager with `members.manage` creates a company user under `POST /api/members`, providing email, name, initial password, role ID and location-access flag. The request runs within the selected tenant context.
3. The backend checks the company's active-user limit and subscription status under a tenant row lock, validates the role belongs to the company and denies assignment of administrative/system roles by non-owners.
4. The new user signs in and selects their company. Every protected request re-derives current role permissions from the database.
5. Company admins manage membership state via `PATCH /api/members/:id/status` and role via `PATCH /api/members/:id/role`. Deactivation revokes authentication sessions; roles and permission changes are read on subsequent requests.

## API routes now committed

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| GET | /api/roles | roles.manage | Company role listing |
| GET | /api/roles/permissions | roles.manage | Available permission catalog |
| POST | /api/roles | roles.manage | Create a company role |
| PATCH | /api/roles/:id | roles.manage | Edit a non-system role |
| GET | /api/members | members.manage | List company members and active-user usage |
| POST | /api/members | members.manage | Directly create a new company user and membership |
| PATCH | /api/members/:id/role | members.manage | Assign an existing tenant role |
| PATCH | /api/members/:id/status | members.manage | Activate/deactivate membership |
| PATCH | /api/members/:id/profile | members.manage | Edit member full name (shared-identity safeguard) |
| PATCH | /api/members/:id/location-access | members.manage | Edit tenant-specific location grants |
| POST | /api/auth/change-password | Signed-in account + current password | Change password and revoke other sessions |

Mutations require authenticated sessions, valid CSRF tokens and origin restrictions. None of these endpoints grant platform-admin privileges. Company administrators cannot change their own role or disable themselves, and the final active company owner is protected.

## Important unfinished safeguards

This first version requires the administrator to provide the user's initial password. Before public deployment, replace this with an expiring, single-use password-setup link or enforce secure first-login password rotation. Never distribute initial passwords in email or store them in logs. Existing email addresses are intentionally rejected rather than silently linked to a different company.

Basic React user/role screens, location-grant editing, display-name changes and the authenticated password-change API are implemented but require browser/local acceptance. First-login password setup, reset-by-email, email address changes, session management UI, custom-role deletion and concurrency/limit boundary tests remain outstanding. The source was committed but has not yet been run locally by the developer. Do not treat the administration module as production-ready.
