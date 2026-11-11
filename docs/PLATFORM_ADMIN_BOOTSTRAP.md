# Initial Platform Admin — local WAMP bootstrap

Platform administrators are regular `User` records with
`isPlatformAdmin=true`. They are **not** tenant roles; no company or
`Membership` row is needed. The plan seed (`db:seed:plans`) intentionally
creates subscription plans only, never user accounts.

The trusted CLI `backend/src/scripts/bootstrap-platform-admin.ts` creates
the **first** Platform Admin in a local development database. It uses the same
scrypt hashing as the application's login service, writes a bootstrap audit
event, and marks the new operator's email verified. It never accepts or logs
passwords as command-line arguments.

## Guardrails

- Only the `assetmov` database at `localhost` or `127.0.0.1` may be targeted;
  remote/production targets and `assetmov_test` are refused.
- Requires explicit `--database assetmov` confirmation.
- Refuses if any Platform Admin exists or if the requested email already
  belongs to an account. It never silently elevates an existing company user.
- Requires a unique 16–128 character password and matching confirmation,
  provided through stdin, not flags, committed files or the chat.
- Does not create company membership, subscription or Paddle records.

## Create the first administrator on Windows WAMP

Make sure MySQL is running and `backend/.env` refers to the local
`assetmov` database. From PowerShell:

```powershell
cd C:\wamp\www\html\assetmov
git pull --ff-only origin main
npm run db:status
npm run db:generate

$adminEmail = Read-Host "New Platform Admin email"
$adminName = Read-Host "Platform Admin full name"
$securePassword = Read-Host "New password (16+ characters)" -AsSecureString
$secureConfirmation = Read-Host "Confirm new password" -AsSecureString

$password = [System.Net.NetworkCredential]::new("", $securePassword).Password
$confirmation = [System.Net.NetworkCredential]::new("", $secureConfirmation).Password
try {
    if ($password -cne $confirmation) { throw "Passwords do not match" }
    "$password`n$confirmation" | npm run platform:bootstrap --workspace @assetmov/backend -- --email "$adminEmail" --name "$adminName" --database assetmov
    if ($LASTEXITCODE -ne 0) { throw "Platform Admin bootstrap failed" }
} finally {
    $password = $null
    $confirmation = $null
    $securePassword = $null
    $secureConfirmation = $null
}
```

PowerShell prompts for `SecureString` without echoing the characters; the
plaintext conversion is short-lived and used only to pipe into Node. Do not
record the terminal or save the plaintext variables to a file. Close the shell
when finished.

The command refuses to create a second Platform Admin. To promote an existing
user instead, use a separately approved, auditable operator procedure; do not
run a public registration flow or manually edit password hashes.

## Verify access

Start the app with `npm run dev`, open
`http://localhost:5176/`, and sign in with the new credentials. The dedicated
Platform Console should open with Platform, Operations, Finance and System
menus. The new operator has no company memberships and therefore no company
workspace switch until membership is explicitly granted.

To inspect the local MySQL data via phpMyAdmin:

```sql
SELECT email, fullName, isPlatformAdmin, emailVerifiedAt
FROM User
WHERE isPlatformAdmin = 1;
```

Expected: one operator record with `isPlatformAdmin=1`, and a matching
`platform_admin.bootstrapped` event in `PlatformAuditLog`.

## Subscription plan seed

Run `npm run db:seed:plans` separately when you need to seed the plan
catalog (Trial, Starter, Growth, Business and inactive Enterprise). The seed
is idempotent and does **not** reset manually changed plan values or bootstrap
a Platform Admin. See [PLATFORM_CONSOLE.md](PLATFORM_CONSOLE.md) and
[PADDLE_BILLING_ASSETMOV.md](PADDLE_BILLING_ASSETMOV.md).

**Important:** GitHub code changes do not create accounts in the local
Windows database. The operator needs to run the command on the WAMP machine.
