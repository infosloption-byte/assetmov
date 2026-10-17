# Authentication and Workspace Context

The first identity and tenant-context slice is implemented in the repository, but this is not a complete identity product or a production security review.

## Endpoints currently wired

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create a user, trial tenant, owner role, initial permission grants, membership and session inside a database transaction. |
| POST | `/api/auth/login` | Verify credentials and issue a server-side session. |
| GET | `/api/auth/me` | Return the authenticated user and active tenant memberships. |
| GET | `/api/auth/csrf` | Return the CSRF token bound to the active session. |
| POST | `/api/auth/logout` | Delete the active session and clear the cookie; requires a valid CSRF header. |
| GET | `/api/workspace/context` | Resolve the selected workspace membership and return its role, permissions and location scope. |

Tenant-owned endpoints must provide the selected tenant in the `X-Tenant-Id` request header. This header only selects a tenant candidate: the API independently verifies that the signed-in user has an active membership. It is not authorization by itself.

## Session behavior

- Passwords are stored as scrypt hashes with random salts, fixed parameters and constant-time verification.
- Session tokens are random opaque values issued in an HttpOnly cookie; only their SHA-256 hashes are stored in MySQL.
- Sessions expire after 8 hours. Inactive/disabled users cannot use existing sessions.
- The session cookie uses SameSite=Lax and is Secure in production.
- Mutating requests that carry the session cookie must come from the configured frontend origin.
- A random CSRF token is stored in the server-side session and returned by register/login or `GET /api/auth/csrf`; send it in the `X-CSRF-Token` header for logout and future authenticated write routes. The token remains stable for the session so open tabs do not invalidate one another.
- Authentication endpoints are rate limited. API errors use a generic credential message to reduce account enumeration.
- Registration creates a trial workspace and an initial owner role. Owner membership has tenant-wide location access by default.

## Tenant authorization helpers

The tenant middleware performs these checks:

1. It requires a valid authenticated session.
2. It selects the membership using both the requested tenant ID and authenticated user ID.
3. It rejects missing, inactive or suspended-tenant memberships.
4. It resolves permissions from the selected membership's role.
5. It expands location assignments down the active location hierarchy.
6. It places the trusted tenant, role, permission and location scope into the request context.

Reusable `requirePermission`, `requireAnyPermission` and `requireLocationAccess` middleware helpers are available for future routes. The workspace context endpoint uses `requireSession` and `requireTenant`; future asset, movement, request, service, import, report and file endpoints must add the same tenant checks and the appropriate action/location checks.

## Still required before production

- Email verification and password reset flows.
- MFA and/or enterprise SSO according to customer needs.
- Session listing/revocation UI and explicit user-initiated revoke-all-sessions.
- Automated tests for registration, login, logout, expired sessions, CSRF, tenant isolation, permission denial and location scope.
- Apply `requireTenant` and permission policies to every future tenant-owned endpoint, including background jobs, exports and file downloads.
- Audit security review, dependency review, abuse monitoring and production-ready email delivery.

**Important:** Authentication is not sufficient authorization. Never return tenant-owned records until the API has resolved the trusted active tenant and verified membership, role permission and applicable location scope.


## Platform authority versus company authority

The currently wired registration flow creates a trial tenant and its initial **tenant owner**. It does **not** implement a complete Platform Super Admin system. Do not treat a tenant owner role as platform-wide authority.

Target policy:

- The Platform Super Admin principal/role and its permission checks are separate from tenant-scoped memberships and roles.
- Company Admin manages only the selected tenant's profile, users, custom roles/permission grants, location hierarchy/scopes, tenant master data and business records.
- Tenant admins can assign valid application permission keys from a controlled catalogue, but cannot manufacture platform permission keys or grant platform authority.
- A tenant ID passed in a header/body/query remains a selector only; verified membership is required for tenant routes.
- Platform routes require explicit platform permissions. They must not silently bypass tenant policies; exceptional support access to customer data must be justified and audited.
- Every tenant-owned route, background job, report, export and file operation must apply tenant scope, permission checks and relevant location scope.

The implementation of a separate platform-admin scope, tenant user/role management UI, invitations and the associated security tests remains outstanding. Refer to [SAAS_PRODUCT_REQUIREMENTS.md](SAAS_PRODUCT_REQUIREMENTS.md).
