# Authentication API

This is the first implementation slice for account creation and browser sessions. It is not a complete identity product yet.

## Implemented endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create a user, trial tenant, owner role, permission grants, membership and session in one database transaction. |
| POST | `/api/auth/login` | Verify credentials and issue a server-side session. |
| GET | `/api/auth/me` | Return the authenticated user and active tenant memberships. |
| GET | `/api/auth/csrf` | Rotate and return an anti-CSRF token for the authenticated session. |
| POST | `/api/auth/logout` | Delete the active session and clear the cookie; requires a valid CSRF header. |

Registration requires an organization name and slug, a person's name, an email and a password of at least 12 characters. The server rejects reserved organization slugs and duplicate email/slug values. Default permissions are created as global permission definitions; a tenant owner role receives the full initial permission set.

## Session behavior

- Passwords are stored as scrypt hashes with a random salt, fixed parameters, and constant-time verification.
- Session tokens are random opaque values issued in an HttpOnly cookie; only their SHA-256 hashes are stored in MySQL.
- Sessions expire after 8 hours. Inactive/disabled users cannot use existing sessions.
- The session cookie uses SameSite=Lax and is Secure in production.
- Mutating requests that carry the session cookie must come from the configured frontend origin.
- A random CSRF token is stored in the server-side session and returned by register/login or `GET /api/auth/csrf`; send it in the `X-CSRF-Token` header for logout and future authenticated write routes. The token remains stable across tabs for the lifetime of that session.
- Authentication endpoints are rate limited. API errors use a generic credential message to avoid disclosing whether an email address exists.

## Still required before production

- Email verification and password reset flows.
- MFA and/or enterprise SSO according to customer needs.
- Session listing/revocation UI and explicit user-initiated revoke-all-sessions.
- Tenant-selection context and middleware requiring active tenant membership on every tenant-owned API.
- Permission-checking middleware and location-scope policies for each resource/action.
- Login/register/CSRF integration tests, rate-limit tests, security review and end-to-end browser tests.
- Email delivery provider configuration, abuse protections and monitoring.

**Important:** Successful authentication is not authorization. Never return tenant-owned records until the API has resolved the trusted active tenant and verified the user's membership, role permission and applicable location scope.
