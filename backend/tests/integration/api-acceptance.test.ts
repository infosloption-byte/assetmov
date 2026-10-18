import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { Server } from "node:http";
import { app } from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";

if (process.env.ASSETMOV_RUN_DB_INTEGRATION_TESTS !== "1") {
  throw new Error(
    "Database acceptance tests are opt-in. Set ASSETMOV_RUN_DB_INTEGRATION_TESTS=1 to run them.",
  );
}

const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ""));
if (
  databaseName !== "assetmov_test" ||
  !["127.0.0.1", "localhost"].includes(databaseUrl.hostname)
) {
  throw new Error(
    "Refusing to run API acceptance tests. DATABASE_URL must point to a local database named assetmov_test.",
  );
}

const frontendOrigin = "http://localhost:5176";

interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  status: string;
}

interface RegistrationResponse {
  user: {
    id: string;
    email: string;
    memberships: Array<{
      id: string;
      tenant: TenantSummary;
    }>;
  };
  csrfToken: string;
}

interface LoginResponse {
  user: { id: string; email: string };
  csrfToken: string;
}

interface ErrorResponse {
  error?: { code?: string; message?: string };
}

interface WorkspaceResponse {
  tenant: { id: string; slug: string };
  membership: { id: string; role: { key: string } };
  permissions: string[];
}

interface LocationResponse {
  data: { id: string; name: string; code: string };
}

interface AssetResponse {
  data: { id: string; inventoryNumber: string; title: string };
}

interface AssetListResponse {
  data: Array<{ id: string; inventoryNumber: string; title: string }>;
}

interface ApiSession {
  cookie: string;
  csrfToken: string;
  userId: string;
  tenant: TenantSummary;
  email: string;
  password: string;
}

function sessionCookie(response: Response): string {
  const value = response.headers.get("set-cookie");
  assert.ok(value, "Expected the API to issue a session cookie.");
  const pair = value.split(";")[0];
  assert.ok(pair?.startsWith("assetmov_session="), "Expected the AssetMov session cookie.");
  return pair;
}

function requestHeaders(options: {
  cookie?: string;
  tenantId?: string;
  csrfToken?: string;
  json?: boolean;
  origin?: boolean;
} = {}): Record<string, string> {
  const headers: Record<string, string> = {};
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.tenantId) headers["X-Tenant-Id"] = options.tenantId;
  if (options.csrfToken) headers["X-CSRF-Token"] = options.csrfToken;
  if (options.json) headers["Content-Type"] = "application/json";
  if (options.origin) headers.Origin = frontendOrigin;
  return headers;
}

test("registration, session security, tenant isolation, locations and assets work against MySQL", async () => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const tenantSlugs = [`it-${suffix}-a`, `it-${suffix}-b`];
  const emails = [`it.a.${suffix}@example.test`, `it.b.${suffix}@example.test`];
  const password = "AssetMov-Test-Password-2026!";
  const locationIds: string[] = [];
  let server: Server | undefined;
  let baseUrl = "";

  try {
    await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`;
    const trialPlan = await prisma.subscriptionPlan.findUnique({ where: { key: "trial" } });
    assert.ok(trialPlan?.isActive && trialPlan.trialDurationDays > 0,
      "Seed the active Trial plan into assetmov_test before running acceptance tests.");

    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string", "Expected an ephemeral TCP address.");
    baseUrl = `http://127.0.0.1:${address.port}`;

    const register = async (index: 0 | 1): Promise<ApiSession> => {
      const response = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: requestHeaders({ json: true, origin: true }),
        body: JSON.stringify({
          tenantName: `AssetMov Integration ${suffix} ${index}`,
          tenantSlug: tenantSlugs[index],
          fullName: `Integration Owner ${index}`,
          email: emails[index],
          password,
        }),
      });
      assert.equal(response.status, 201, `Registration failed: ${await response.text()}`);
      const body = await response.json() as RegistrationResponse;
      const tenant = body.user.memberships[0]?.tenant;
      assert.ok(tenant?.id, "Registration should return the new workspace.");
      assert.ok(body.csrfToken, "Registration should return a CSRF token.");
      return {
        cookie: sessionCookie(response),
        csrfToken: body.csrfToken,
        userId: body.user.id,
        tenant,
        email: emails[index],
        password,
      };
    };

    const ownerA = await register(0);
    const ownerB = await register(1);

    const me = await fetch(`${baseUrl}/api/auth/me`, {
      headers: requestHeaders({ cookie: ownerA.cookie }),
    });
    assert.equal(me.status, 200, "The registration session should authenticate /me.");
    const meBody = await me.json() as { user: { id: string } };
    assert.equal(meBody.user.id, ownerA.userId);

    const ownContext = await fetch(`${baseUrl}/api/workspace/context`, {
      headers: requestHeaders({ cookie: ownerA.cookie, tenantId: ownerA.tenant.id }),
    });
    assert.equal(ownContext.status, 200);
    const ownContextBody = await ownContext.json() as WorkspaceResponse;
    assert.equal(ownContextBody.tenant.id, ownerA.tenant.id);
    assert.equal(ownContextBody.tenant.slug, tenantSlugs[0]);
    assert.equal(ownContextBody.membership.role.key, "TENANT_OWNER");
    assert.ok(ownContextBody.permissions.includes("location.manage"));

    const missingTenant = await fetch(`${baseUrl}/api/workspace/context`, {
      headers: requestHeaders({ cookie: ownerA.cookie }),
    });
    assert.equal(missingTenant.status, 400);
    assert.equal((await missingTenant.json() as ErrorResponse).error?.code, "TENANT_REQUIRED");

    const crossTenantContext = await fetch(`${baseUrl}/api/workspace/context`, {
      headers: requestHeaders({ cookie: ownerA.cookie, tenantId: ownerB.tenant.id }),
    });
    assert.equal(crossTenantContext.status, 403);
    assert.equal(
      (await crossTenantContext.json() as ErrorResponse).error?.code,
      "TENANT_ACCESS_DENIED",
      "A valid session must not be able to select another company's workspace.",
    );

    const rejectedWithoutCsrf = await fetch(`${baseUrl}/api/locations`, {
      method: "POST",
      headers: requestHeaders({
        cookie: ownerA.cookie,
        tenantId: ownerA.tenant.id,
        json: true,
        origin: true,
      }),
      body: JSON.stringify({ name: "Must Not Persist", code: `BAD-${suffix}` }),
    });
    assert.equal(rejectedWithoutCsrf.status, 403);
    assert.equal(
      (await rejectedWithoutCsrf.json() as ErrorResponse).error?.code,
      "CSRF_INVALID",
    );

    const locationResponse = await fetch(`${baseUrl}/api/locations`, {
      method: "POST",
      headers: requestHeaders({
        cookie: ownerA.cookie,
        tenantId: ownerA.tenant.id,
        csrfToken: ownerA.csrfToken,
        json: true,
        origin: true,
      }),
      body: JSON.stringify({
        name: `Integration HQ ${suffix}`,
        code: `IT-${suffix}`,
        type: "HEAD_OFFICE",
      }),
    });
    assert.equal(locationResponse.status, 201, `Location creation failed: ${await locationResponse.text()}`);
    const createdLocation = (await locationResponse.json()) as LocationResponse;
    assert.ok(createdLocation.data.id);
    locationIds.push(createdLocation.data.id);

    const locationList = await fetch(`${baseUrl}/api/locations?q=${encodeURIComponent(suffix)}`, {
      headers: requestHeaders({ cookie: ownerA.cookie, tenantId: ownerA.tenant.id }),
    });
    assert.equal(locationList.status, 200);
    const locationListBody = await locationList.json() as { data: Array<{ id: string; code: string }> };
    assert.ok(locationListBody.data.some((item) => item.id === createdLocation.data.id));

    const crossTenantLocations = await fetch(`${baseUrl}/api/locations`, {
      headers: requestHeaders({ cookie: ownerB.cookie, tenantId: ownerA.tenant.id }),
    });
    assert.equal(crossTenantLocations.status, 403);
    assert.equal(
      (await crossTenantLocations.json() as ErrorResponse).error?.code,
      "TENANT_ACCESS_DENIED",
    );

    const inventoryNumber = `IT-${suffix}`;
    const assetResponse = await fetch(`${baseUrl}/api/assets`, {
      method: "POST",
      headers: requestHeaders({
        cookie: ownerA.cookie,
        tenantId: ownerA.tenant.id,
        csrfToken: ownerA.csrfToken,
        json: true,
        origin: true,
      }),
      body: JSON.stringify({
        inventoryNumber,
        title: `Acceptance Test Asset ${suffix}`,
        currentLocationId: createdLocation.data.id,
      }),
    });
    assert.equal(assetResponse.status, 201, `Asset creation failed: ${await assetResponse.text()}`);
    const createdAsset = await assetResponse.json() as AssetResponse;
    assert.ok(createdAsset.data.id);

    const assetDetail = await fetch(`${baseUrl}/api/assets/${createdAsset.data.id}`, {
      headers: requestHeaders({ cookie: ownerA.cookie, tenantId: ownerA.tenant.id }),
    });
    assert.equal(assetDetail.status, 200);
    assert.equal((await assetDetail.json() as AssetResponse).data.inventoryNumber, inventoryNumber);

    const assetList = await fetch(`${baseUrl}/api/assets?q=${encodeURIComponent(inventoryNumber)}`, {
      headers: requestHeaders({ cookie: ownerA.cookie, tenantId: ownerA.tenant.id }),
    });
    assert.equal(assetList.status, 200);
    const assetListBody = await assetList.json() as AssetListResponse;
    assert.ok(assetListBody.data.some((item) => item.id === createdAsset.data.id));

    const crossTenantAsset = await fetch(`${baseUrl}/api/assets/${createdAsset.data.id}`, {
      headers: requestHeaders({ cookie: ownerB.cookie, tenantId: ownerA.tenant.id }),
    });
    assert.equal(crossTenantAsset.status, 403);
    assert.equal(
      (await crossTenantAsset.json() as ErrorResponse).error?.code,
      "TENANT_ACCESS_DENIED",
    );

    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: requestHeaders({ json: true, origin: true }),
      body: JSON.stringify({ email: ownerA.email, password: ownerA.password }),
    });
    assert.equal(loginResponse.status, 200);
    const loginBody = await loginResponse.json() as LoginResponse;
    const loginCookie = sessionCookie(loginResponse);
    assert.equal(loginBody.user.id, ownerA.userId);

    const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: requestHeaders({ cookie: loginCookie, csrfToken: loginBody.csrfToken, json: true, origin: true }),
    });
    assert.equal(logoutResponse.status, 200);
    const revokedSession = await fetch(`${baseUrl}/api/auth/me`, {
      headers: requestHeaders({ cookie: loginCookie }),
    });
    assert.equal(revokedSession.status, 401);
  } finally {
    try {
      const tenants = await prisma.tenant.findMany({
        where: { slug: { in: tenantSlugs } },
        select: { id: true },
      });
      const tenantIds = tenants.map((tenant) => tenant.id);
      if (tenantIds.length > 0) {
        await prisma.assetTransaction.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await prisma.asset.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await prisma.location.deleteMany({ where: { tenantId: { in: tenantIds } } });
        await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
      }
      await prisma.user.deleteMany({ where: { email: { in: emails } } });
    } finally {
      if (server) {
        await new Promise<void>((resolve, reject) => {
          server!.close((error) => error ? reject(error) : resolve());
        });
      }
      await prisma.$disconnect();
    }
  }
});
