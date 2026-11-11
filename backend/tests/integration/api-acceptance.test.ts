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
  if (!pair || !pair.startsWith("assetmov_session=")) {
    assert.fail("Expected the AssetMov session cookie.");
  }
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
  const tenantSlugs: [string, string] = [`it-${suffix}-a`, `it-${suffix}-b`];
  const emails: [string, string] = [`it.a.${suffix}@example.test`, `it.b.${suffix}@example.test`];
  const password = "AssetMov-Test-Password-2026!";
  const managedEmail = `it.managed.${suffix}@example.test`;
  const anotherMemberEmail = `it.extra.${suffix}@example.test`;
  let server: Server | undefined;
  let baseUrl = "";
  let createdPlanId: string | undefined;

  try {
    await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`;
    const trialPlan = await prisma.subscriptionPlan.findUnique({ where: { key: "trial" } });
    if (!trialPlan || !trialPlan.isActive || trialPlan.trialDurationDays <= 0) {
      assert.fail("Seed the active Trial plan into assetmov_test before running acceptance tests.");
    }

    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") {
      assert.fail("Expected an ephemeral TCP address.");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;

    const healthResponse = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthResponse.status, 200);
    const healthBody = await healthResponse.json() as { status: string; service: string; database: string };
    assert.deepEqual(healthBody, { status: "ok", service: "assetmov-api", database: "ok" });

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
      if (response.status !== 201) {
        assert.fail(`Registration failed (${response.status}): ${await response.text()}`);
      }
      const body = await response.json() as RegistrationResponse;
      const tenant = body.user.memberships[0]?.tenant;
      if (!tenant?.id) assert.fail("Registration should return the new workspace.");
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

    const newCategory = await fetch(`${baseUrl}/api/master-data/categories`, {
      method: "POST",
      headers: requestHeaders({ cookie: ownerA.cookie, tenantId: ownerA.tenant.id,
        csrfToken: ownerA.csrfToken, json: true, origin: true }),
      body: JSON.stringify({ name: "IT Equipment", code: `IT_${suffix.toUpperCase()}`, description: "Company IT hardware" }),
    });
    assert.equal(newCategory.status, 201);
    const category = await newCategory.json() as { data: { id: string } };

    const visibleCategories = await fetch(`${baseUrl}/api/master-data/categories`, {
      headers: requestHeaders({ cookie: ownerA.cookie, tenantId: ownerA.tenant.id }),
    });
    assert.equal(visibleCategories.status, 200);
    assert.ok((await visibleCategories.json() as { data: Array<{ id: string }> }).data.some(item => item.id === category.data.id));
    const anotherCompanyCategories = await fetch(`${baseUrl}/api/master-data/categories`, {
      headers: requestHeaders({ cookie: ownerB.cookie, tenantId: ownerB.tenant.id }),
    });
    assert.equal(anotherCompanyCategories.status, 200);
    assert.ok(!(await anotherCompanyCategories.json() as { data: Array<{ id: string }> }).data.some(item => item.id === category.data.id));

    const foreignModel = await fetch(`${baseUrl}/api/master-data/models`, {
      method: "POST",
      headers: requestHeaders({ cookie: ownerB.cookie, tenantId: ownerB.tenant.id,
        csrfToken: ownerB.csrfToken, json: true, origin: true }),
      body: JSON.stringify({ categoryId: category.data.id, name: "Invalid foreign model", fields: [] }),
    });
    assert.equal(foreignModel.status, 400);

    const newModel = await fetch(`${baseUrl}/api/master-data/models`, {
      method: "POST",
      headers: requestHeaders({ cookie: ownerA.cookie, tenantId: ownerA.tenant.id,
        csrfToken: ownerA.csrfToken, json: true, origin: true }),
      body: JSON.stringify({ categoryId: category.data.id, name: `Laptop-${suffix}`,
        fields: [{ key: "ramGb", label: "RAM (GB)", type: "number", required: true }] }),
    });
    assert.equal(newModel.status, 201);
    const model = await newModel.json() as { data: { id: string } };
    const savedModel = await prisma.assetModel.findUniqueOrThrow({ where: { id: model.data.id } });
    assert.equal(savedModel.tenantId, ownerA.tenant.id);

    const ownerSubscription = await prisma.tenantSubscription.findUnique({
      where: { tenantId: ownerA.tenant.id },
      include: { plan: true },
    });
    if (!ownerSubscription) assert.fail("Company registration should create a tenant subscription.");
    assert.equal(ownerSubscription.status, "TRIALING");
    assert.equal(ownerSubscription.plan.key, "trial");
    assert.ok(
      ownerSubscription.trialEndsAt && ownerSubscription.trialEndsAt.getTime() > Date.now(),
      "The registered trial must have a future end time.",
    );

    const me = await fetch(`${baseUrl}/api/auth/me`, {
      headers: requestHeaders({ cookie: ownerA.cookie }),
    });
    assert.equal(me.status, 200, "The registration session should authenticate /me.");
    const meBody = await me.json() as { user: { id: string } };
    assert.equal(meBody.user.id, ownerA.userId);

    const otherLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: requestHeaders({ json: true, origin: true }),
      body: JSON.stringify({ email: ownerA.email, password: ownerA.password }),
    });
    assert.equal(otherLogin.status, 200);
    const otherCookie = sessionCookie(otherLogin);
    const sessionsResponse = await fetch(`${baseUrl}/api/auth/sessions`, {
      headers: requestHeaders({ cookie: ownerA.cookie }),
    });
    assert.equal(sessionsResponse.status, 200);
    const sessionData = await sessionsResponse.json() as { data: Array<{ id: string; isCurrent: boolean }> };
    assert.ok(sessionData.data.some(item => item.isCurrent));
    assert.ok(sessionData.data.some(item => !item.isCurrent));

    const noCsrfRevocation = await fetch(`${baseUrl}/api/auth/sessions/others`, {
      method: "DELETE",
      headers: requestHeaders({ cookie: ownerA.cookie, origin: true }),
    });
    assert.equal(noCsrfRevocation.status, 403);
    const revokeOtherSessions = await fetch(`${baseUrl}/api/auth/sessions/others`, {
      method: "DELETE",
      headers: requestHeaders({ cookie: ownerA.cookie, csrfToken: ownerA.csrfToken, origin: true }),
    });
    assert.equal(revokeOtherSessions.status, 200);
    const revokedMe = await fetch(`${baseUrl}/api/auth/me`, {
      headers: requestHeaders({ cookie: otherCookie }),
    });
    assert.equal(revokedMe.status, 401);
    const currentStillValid = await fetch(`${baseUrl}/api/auth/me`, {
      headers: requestHeaders({ cookie: ownerA.cookie }),
    });
    assert.equal(currentStillValid.status, 200);

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
    if (locationResponse.status !== 201) {
      assert.fail(`Location creation failed (${locationResponse.status}): ${await locationResponse.text()}`);
    }
    const createdLocation = (await locationResponse.json()) as LocationResponse;
    assert.ok(createdLocation.data.id);

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
    if (assetResponse.status !== 201) {
      assert.fail(`Asset creation failed (${assetResponse.status}): ${await assetResponse.text()}`);
    }
    const createdAsset = await assetResponse.json() as AssetResponse;
    assert.ok(createdAsset.data.id);

    // Dynamic custom values are validated server-side, including tenant ownership.
    const createModelAsset = async (values: unknown, code: string) => fetch(`${baseUrl}/api/assets`, {
      method: "POST", headers: requestHeaders({ cookie: ownerA.cookie, tenantId: ownerA.tenant.id,
        csrfToken: ownerA.csrfToken, json: true, origin: true }),
      body: JSON.stringify({ inventoryNumber: code, title: "Model validated asset",
        currentLocationId: createdLocation.data.id, modelId: model.data.id, customFields: values }),
    });
    const missingCustom = await createModelAsset({}, `IT-MISS-${suffix}`);
    assert.equal(missingCustom.status, 400);
    assert.equal((await missingCustom.json() as ErrorResponse).error?.code, "CUSTOM_FIELD_INVALID");
    assert.equal((await createModelAsset({ ramGb: "bad" }, `IT-BAD-${suffix}`)).status, 400);
    assert.equal((await createModelAsset({ ramGb: 16, foreign: true }, `IT-UNKNOWN-${suffix}`)).status, 400);
    const validCustom = await createModelAsset({ ramGb: 16 }, `IT-CUSTOM-${suffix}`);
    assert.equal(validCustom.status, 201);
    assert.equal((await validCustom.json() as { data: { customFields: { ramGb: number } } }).data.customFields.ramGb, 16);
    const foreignModelAsset = await fetch(`${baseUrl}/api/assets`, {
      method: "POST", headers: requestHeaders({ cookie: ownerB.cookie, tenantId: ownerB.tenant.id,
        csrfToken: ownerB.csrfToken, json: true, origin: true }),
      body: JSON.stringify({ inventoryNumber: `IT-FOREIGN-${suffix}`,
        title: "Cross tenant model", modelId: model.data.id, customFields: { ramGb: 16 } }),
    });
    assert.equal(foreignModelAsset.status, 400);
    const editModel = (fields: unknown) => fetch(`${baseUrl}/api/master-data/models/${model.data.id}`, {
      method: "PATCH", headers: requestHeaders({ cookie: ownerA.cookie, tenantId: ownerA.tenant.id,
        csrfToken: ownerA.csrfToken, json: true, origin: true }),
      body: JSON.stringify({ categoryId: category.data.id, name: "Updated integration model", fields }),
    });
    const unsafeEdit = await editModel([]);
    assert.equal(unsafeEdit.status, 409);
    assert.equal((await unsafeEdit.json() as ErrorResponse).error?.code, "MODEL_IN_USE");
    const safeEdit = await editModel([{ key: "ramGb", label: "RAM (GB)", type: "number", required: true }]);
    if (safeEdit.status !== 200) {
      assert.fail(`Unchanged field definition must allow model rename (${safeEdit.status}): ${await safeEdit.text()}`);
    }

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

    // Platform administration must be independent of a company's owner role.
    const ownMembers = await fetch(`${baseUrl}/api/members`, {
      headers: requestHeaders({ cookie: ownerA.cookie, tenantId: ownerA.tenant.id }),
    });
    assert.equal(ownMembers.status, 200);
    const memberList = await ownMembers.json() as {
      data: Array<{ id: string; user: { id: string }; isActive: boolean }>;
      usage: { activeUsers: number; maxActiveUsers: number | null };
    };
    assert.equal(memberList.usage.activeUsers, 1);
    const ownerMembership = memberList.data.find((member) => member.user.id === ownerA.userId);
    assert.ok(ownerMembership?.isActive);

    const createRole = await fetch(`${baseUrl}/api/roles`, {
      method: "POST",
      headers: requestHeaders({ cookie: ownerA.cookie, tenantId: ownerA.tenant.id,
        csrfToken: ownerA.csrfToken, json: true, origin: true }),
      body: JSON.stringify({
        key: `IT_VIEWER_${suffix.toUpperCase()}`,
        name: "Integration Viewer", permissionKeys: ["asset.read", "location.read"],
      }),
    });
    if (createRole.status !== 201) assert.fail(`Role creation failed: ${createRole.status} ${await createRole.text()}`);
    const customRole = await createRole.json() as { data: { id: string } };
    const createMember = await fetch(`${baseUrl}/api/members`, {
      method: "POST",
      headers: requestHeaders({ cookie: ownerA.cookie, tenantId: ownerA.tenant.id,
        csrfToken: ownerA.csrfToken, json: true, origin: true }),
      body: JSON.stringify({
        email: managedEmail, fullName: "Integration Managed User",
        initialPassword: password, roleId: customRole.data.id, allLocationsAccess: true,
      }),
    });
    if (createMember.status !== 201) assert.fail(`User creation failed: ${createMember.status} ${await createMember.text()}`);
    const managed = await createMember.json() as { data: { id: string } };
    // Trial user capacity: creation and reactivation share tenant locking.
    const createExtraUser = (email: string) => fetch(`${baseUrl}/api/members`, {
      method: "POST", headers: requestHeaders({ cookie: ownerA.cookie, tenantId: ownerA.tenant.id,
        csrfToken: ownerA.csrfToken, json: true, origin: true }),
      body: JSON.stringify({ email, fullName: "Quota Test User", initialPassword: password,
        roleId: customRole.data.id, allLocationsAccess: false }),
    });
    const extraUser = await createExtraUser(anotherMemberEmail);
    assert.equal(extraUser.status, 201);
    const extraMember = await extraUser.json() as { data: { id: string } };
    const fourthMember = await createExtraUser(`it.denied.${suffix}@example.test`);
    assert.equal(fourthMember.status, 409);
    assert.equal((await fourthMember.json() as ErrorResponse).error?.code, "USER_PLAN_LIMIT_REACHED");
    const changeMemberActive = (active: boolean) => fetch(`${baseUrl}/api/members/${extraMember.data.id}/status`, {
      method: "PATCH", headers: requestHeaders({ cookie: ownerA.cookie, tenantId: ownerA.tenant.id,
        csrfToken: ownerA.csrfToken, json: true, origin: true }),
      body: JSON.stringify({ isActive: active, reason: "Integration test changes membership active status" }),
    });
    assert.equal((await changeMemberActive(false)).status, 200);
    assert.equal((await changeMemberActive(true)).status, 200);

    const editProfile = await fetch(`${baseUrl}/api/members/${managed.data.id}/profile`, {
      method: "PATCH",
      headers: requestHeaders({ cookie: ownerA.cookie, tenantId: ownerA.tenant.id,
        csrfToken: ownerA.csrfToken, json: true, origin: true }),
      body: JSON.stringify({ fullName: "Integration Renamed User" }),
    });
    assert.equal(editProfile.status, 200);
    const updatedProfile = await prisma.user.findUniqueOrThrow({ where: { email: managedEmail } });
    assert.equal(updatedProfile.fullName, "Integration Renamed User");
    const foreignProfile = await fetch(`${baseUrl}/api/members/${managed.data.id}/profile`, {
      method: "PATCH",
      headers: requestHeaders({ cookie: ownerB.cookie, tenantId: ownerB.tenant.id,
        csrfToken: ownerB.csrfToken, json: true, origin: true }),
      body: JSON.stringify({ fullName: "Unauthorized Change" }),
    });
    assert.equal(foreignProfile.status, 404);

    const scopeDenied = await fetch(`${baseUrl}/api/members/${managed.data.id}/location-access`, {
      method: "PATCH",
      headers: requestHeaders({ cookie: ownerB.cookie, tenantId: ownerB.tenant.id,
        csrfToken: ownerB.csrfToken, json: true, origin: true }),
      body: JSON.stringify({ allLocationsAccess: true, locationIds: [], reason: "Cross tenant access should fail" }),
    });
    assert.equal(scopeDenied.status, 404);
    const editScope = await fetch(`${baseUrl}/api/members/${managed.data.id}/location-access`, {
      method: "PATCH",
      headers: requestHeaders({ cookie: ownerA.cookie, tenantId: ownerA.tenant.id,
        csrfToken: ownerA.csrfToken, json: true, origin: true }),
      body: JSON.stringify({
        allLocationsAccess: false, locationIds: [createdLocation.data.id],
        reason: "Grant a restricted location to this user",
      }),
    });
    assert.equal(editScope.status, 200);
    const scopedMember = await prisma.membership.findUniqueOrThrow({
      where: { id: managed.data.id }, include: { locationAssignments: true },
    });
    assert.equal(scopedMember.allLocationsAccess, false);
    assert.deepEqual(scopedMember.locationAssignments.map((item) => item.locationId), [createdLocation.data.id]);

    const managedLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST", headers: requestHeaders({ json: true, origin: true }),
      body: JSON.stringify({ email: managedEmail, password }),
    });
    assert.equal(managedLogin.status, 200);
    const managedCookie = sessionCookie(managedLogin);
    const managedContext = await fetch(`${baseUrl}/api/workspace/context`, {
      headers: requestHeaders({ cookie: managedCookie, tenantId: ownerA.tenant.id }),
    });
    assert.equal(managedContext.status, 200);
    const managedBody = await managedContext.json() as WorkspaceResponse;
    assert.ok(managedBody.permissions.includes("asset.read"));
    assert.ok(!managedBody.permissions.includes("members.manage"));
    const deniedRoleCreation = await fetch(`${baseUrl}/api/roles`, {
      method: "POST",
      headers: requestHeaders({ cookie: managedCookie, tenantId: ownerA.tenant.id,
        csrfToken: (await managedLogin.json() as LoginResponse).csrfToken, json: true, origin: true }),
      body: JSON.stringify({ key: "DENIED_ROLE", name: "Denied", permissionKeys: ["asset.create"] }),
    });
    assert.equal(deniedRoleCreation.status, 403);
    const deniedCrossTenantRole = await fetch(`${baseUrl}/api/members/${managed.data.id}/role`, {
      method: "PATCH",
      headers: requestHeaders({ cookie: ownerB.cookie, tenantId: ownerB.tenant.id,
        csrfToken: ownerB.csrfToken, json: true, origin: true }),
      body: JSON.stringify({ roleId: customRole.data.id }),
    });
    assert.equal(deniedCrossTenantRole.status, 404);

    const crossTenantMembers = await fetch(`${baseUrl}/api/members`, {
      headers: requestHeaders({ cookie: ownerB.cookie, tenantId: ownerA.tenant.id }),
    });
    assert.equal(crossTenantMembers.status, 403);

    const refuseSelfDeactivation = await fetch(
      `${baseUrl}/api/members/${ownerMembership.id}/status`,
      {
        method: "PATCH",
        headers: requestHeaders({
          cookie: ownerA.cookie, tenantId: ownerA.tenant.id,
          csrfToken: ownerA.csrfToken, json: true, origin: true,
        }),
        body: JSON.stringify({
          isActive: false, reason: "Integration must preserve the company owner",
        }),
      },
    );
    assert.equal(refuseSelfDeactivation.status, 409);
    assert.equal(
      (await refuseSelfDeactivation.json() as ErrorResponse).error?.code,
      "CANNOT_DEACTIVATE_SELF",
    );

    const deniedPlatform = await fetch(`${baseUrl}/api/platform/plans`, {
      headers: requestHeaders({ cookie: ownerA.cookie, tenantId: ownerA.tenant.id }),
    });
    assert.equal(deniedPlatform.status, 403);
    assert.equal((await deniedPlatform.json() as ErrorResponse).error?.code, "PLATFORM_ACCESS_DENIED");

    const deniedTenantList = await fetch(`${baseUrl}/api/platform/tenants`, {
      headers: requestHeaders({ cookie: ownerB.cookie }),
    });
    assert.equal(deniedTenantList.status, 403);

    // Controlled test-only bootstrap: never expose platform promotion through signup or tenant APIs.
    await prisma.user.update({ where: { id: ownerA.userId }, data: { isPlatformAdmin: true } });

    const platformPlans = await fetch(`${baseUrl}/api/platform/plans`, {
      headers: requestHeaders({ cookie: ownerA.cookie }),
    });
    assert.equal(platformPlans.status, 200);
    const plansBody = await platformPlans.json() as { data: Array<{ id: string; key: string }> };
    assert.ok(plansBody.data.some((plan) => plan.key === "trial"));

    const noCsrfPlan = await fetch(`${baseUrl}/api/platform/plans`, {
      method: "POST",
      headers: requestHeaders({ cookie: ownerA.cookie, json: true, origin: true }),
      body: JSON.stringify({}),
    });
    assert.equal(noCsrfPlan.status, 403);
    assert.equal((await noCsrfPlan.json() as ErrorResponse).error?.code, "CSRF_INVALID");

    const planKey = `it-${suffix}`;
    const newPlan = await fetch(`${baseUrl}/api/platform/plans`, {
      method: "POST",
      headers: requestHeaders({
        cookie: ownerA.cookie, csrfToken: ownerA.csrfToken, json: true, origin: true,
      }),
      body: JSON.stringify({
        key: planKey,
        name: "Integration Limited Plan",
        description: "Temporary DB integration plan",
        maxAssets: 3,
        maxActiveUsers: 2,
        storageLimitBytes: "1048576",
        trialDurationDays: 7,
        isActive: true,
        reason: "Integration test creates a temporary plan",
      }),
    });
    if (newPlan.status !== 201) {
      assert.fail(`Plan creation failed (${newPlan.status}): ${await newPlan.text()}`);
    }
    const planBody = await newPlan.json() as {
      data: { id: string; key: string; storageLimitBytes: string; maxAssets: number };
    };
    createdPlanId = planBody.data.id;
    assert.equal(planBody.data.key, planKey);
    assert.equal(planBody.data.storageLimitBytes, "1048576");

    const updatedPlan = await fetch(`${baseUrl}/api/platform/plans/${createdPlanId}`, {
      method: "PATCH",
      headers: requestHeaders({
        cookie: ownerA.cookie, csrfToken: ownerA.csrfToken, json: true, origin: true,
      }),
      body: JSON.stringify({
        maxAssets: 4,
        reason: "Integration test checks audited plan update",
      }),
    });
    assert.equal(updatedPlan.status, 200);
    assert.equal((await updatedPlan.json() as { data: { maxAssets: number } }).data.maxAssets, 4);

    const deniedSubscription = await fetch(
      `${baseUrl}/api/platform/tenants/${ownerB.tenant.id}/subscription`,
      {
        method: "PATCH",
        headers: requestHeaders({
          cookie: ownerB.cookie, csrfToken: ownerB.csrfToken, json: true, origin: true,
        }),
        body: JSON.stringify({
          planId: createdPlanId, mode: "activate",
          reason: "Company owner must not modify platform subscriptions",
        }),
      },
    );
    assert.equal(deniedSubscription.status, 403);
    assert.equal((await deniedSubscription.json() as ErrorResponse).error?.code, "PLATFORM_ACCESS_DENIED");

    const assignSubscription = await fetch(
      `${baseUrl}/api/platform/tenants/${ownerB.tenant.id}/subscription`,
      {
        method: "PATCH",
        headers: requestHeaders({
          cookie: ownerA.cookie, csrfToken: ownerA.csrfToken, json: true, origin: true,
        }),
        body: JSON.stringify({
          planId: createdPlanId, mode: "activate",
          reason: "Integration test activates a second company",
        }),
      },
    );
    if (assignSubscription.status !== 200) {
      assert.fail(`Subscription assignment failed (${assignSubscription.status}): ${await assignSubscription.text()}`);
    }
    const assignedBody = await assignSubscription.json() as {
      data: { planId: string; status: string };
    };
    assert.equal(assignedBody.data.planId, createdPlanId);
    assert.equal(assignedBody.data.status, "ACTIVE");
    const updatedTenant = await prisma.tenant.findUniqueOrThrow({ where: { id: ownerB.tenant.id } });
    assert.equal(updatedTenant.status, "ACTIVE");

    const platformTenants = await fetch(
      `${baseUrl}/api/platform/tenants?q=${encodeURIComponent(tenantSlugs[1])}`,
      { headers: requestHeaders({ cookie: ownerA.cookie }) },
    );
    assert.equal(platformTenants.status, 200);
    const tenantListBody = await platformTenants.json() as {
      data: Array<{ id: string; subscription: { planId: string } | null }>;
    };
    assert.ok(tenantListBody.data.some((tenant) =>
      tenant.id === ownerB.tenant.id && tenant.subscription?.planId === createdPlanId));

    // Real MySQL quota enforcement: the fifth asset must not persist on a four-asset plan.
    const registerLimitedAsset = (index: number) => fetch(`${baseUrl}/api/assets`, {
      method: "POST",
      headers: requestHeaders({
        cookie: ownerB.cookie, tenantId: ownerB.tenant.id,
        csrfToken: ownerB.csrfToken, json: true, origin: true,
      }),
      body: JSON.stringify({
        inventoryNumber: `IT-LIMIT-${suffix}-${index}`,
        title: `Subscription limit test asset ${index}`,
      }),
    });
    let limitedAssetId = "";
    for (let index = 0; index < 4; index += 1) {
      const allowed = await registerLimitedAsset(index);
      if (allowed.status !== 201) assert.fail(`Asset ${index + 1} creation failed: ${await allowed.text()}`);
      const registered = await allowed.json() as { data: { id: string } };
      if (index === 0) limitedAssetId = registered.data.id;
    }
    const blockedByCap = await registerLimitedAsset(4);
    assert.equal(blockedByCap.status, 409);
    const capBody = await blockedByCap.json() as {
      error: { code: string; current: number; maximum: number; limit: string };
    };
    assert.equal(capBody.error.code, "PLAN_LIMIT_REACHED");
    assert.equal(capBody.error.current, 4);
    assert.equal(capBody.error.maximum, 4);
    assert.equal(capBody.error.limit, "assets");
    assert.equal(await prisma.asset.count({ where: { tenantId: ownerB.tenant.id } }), 4);
    // Transactional storage usage: two 400 KiB uploads fit a 1 MiB plan; the third does not.
    const testPayload = Buffer.alloc(400 * 1024, 65).toString("base64");
    const uploadFile = () => fetch(`${baseUrl}/api/files`, {
      method: "POST", headers: requestHeaders({ cookie: ownerB.cookie, tenantId: ownerB.tenant.id,
        csrfToken: ownerB.csrfToken, json: true, origin: true }),
      body: JSON.stringify({ assetId: limitedAssetId, filename: "attachment.txt",
        mimeType: "text/plain", contentBase64: testPayload }),
    });
    const firstUpload = await uploadFile();
    assert.equal(firstUpload.status, 201);
    const firstFile = await firstUpload.json() as { data: { id: string; sizeBytes: number } };
    assert.equal(firstFile.data.sizeBytes, 400 * 1024);
    const authorizedDownload = await fetch(`${baseUrl}/api/files/${firstFile.data.id}/download`, {
      headers: requestHeaders({ cookie: ownerB.cookie, tenantId: ownerB.tenant.id }),
    });
    assert.equal(authorizedDownload.status, 200);
    assert.equal((await authorizedDownload.arrayBuffer()).byteLength, 400 * 1024);
    const noCsrfUpload = await fetch(`${baseUrl}/api/files`, {
      method: "POST", headers: requestHeaders({ cookie: ownerB.cookie, tenantId: ownerB.tenant.id,
        json: true, origin: true }),
      body: JSON.stringify({ assetId: limitedAssetId, filename: "must-not-persist.txt",
        mimeType: "text/plain", contentBase64: testPayload }),
    });
    assert.equal(noCsrfUpload.status, 403);

    assert.equal((await uploadFile()).status, 201);
    const blockedUpload = await uploadFile();
    assert.equal(blockedUpload.status, 409);
    assert.equal((await blockedUpload.json() as ErrorResponse).error?.code, "STORAGE_LIMIT_REACHED");

    const otherTenantFiles = await fetch(`${baseUrl}/api/files/assets/${limitedAssetId}`, {
      headers: requestHeaders({ cookie: ownerA.cookie, tenantId: ownerA.tenant.id }),
    });
    assert.equal(otherTenantFiles.status, 404);
    const otherTenantDownload = await fetch(`${baseUrl}/api/files/${firstFile.data.id}/download`, {
      headers: requestHeaders({ cookie: ownerA.cookie, tenantId: ownerA.tenant.id }),
    });
    assert.equal(otherTenantDownload.status, 404);
    const usage = await fetch(`${baseUrl}/api/files/usage`, {
      headers: requestHeaders({ cookie: ownerB.cookie, tenantId: ownerB.tenant.id }),
    });
    assert.equal(usage.status, 200);
    assert.equal(Number((await usage.json() as { data: { storageUsedBytes: string } }).data.storageUsedBytes), 800 * 1024);
    const deletedFile = await fetch(`${baseUrl}/api/files/${firstFile.data.id}`, {
      method: "DELETE", headers: requestHeaders({ cookie: ownerB.cookie, tenantId: ownerB.tenant.id,
        csrfToken: ownerB.csrfToken, origin: true }),
    });
    assert.equal(deletedFile.status, 204);
    assert.equal((await uploadFile()).status, 201, "Delete must restore storage allowance.");


    // Trial expiry and suspension are checked by the API, not just by UI controls.
    await prisma.tenantSubscription.update({
      where: { tenantId: ownerA.tenant.id },
      data: { trialEndsAt: new Date(Date.now() - 60_000) },
    });
    const attemptOwnerAAsset = (tag: string) => fetch(`${baseUrl}/api/assets`, {
      method: "POST",
      headers: requestHeaders({
        cookie: ownerA.cookie, tenantId: ownerA.tenant.id,
        csrfToken: ownerA.csrfToken, json: true, origin: true,
      }),
      body: JSON.stringify({
        inventoryNumber: `IT-BLOCK-${suffix}-${tag}`,
        title: "Should not be created",
      }),
    });
    const expiredTrial = await attemptOwnerAAsset("expired");
    assert.equal(expiredTrial.status, 403);
    assert.equal((await expiredTrial.json() as ErrorResponse).error?.code, "SUBSCRIPTION_EXPIRED");
    const expiredModelEdit = await fetch(`${baseUrl}/api/master-data/models/${model.data.id}`, {
      method: "PATCH", headers: requestHeaders({ cookie: ownerA.cookie, tenantId: ownerA.tenant.id,
        csrfToken: ownerA.csrfToken, json: true, origin: true }),
      body: JSON.stringify({ categoryId: category.data.id, name: "No write after trial",
        fields: [{ key: "ramGb", label: "RAM (GB)", type: "number", required: true }] }),
    });
    assert.equal(expiredModelEdit.status, 403);
    assert.equal((await expiredModelEdit.json() as ErrorResponse).error?.code, "SUBSCRIPTION_EXPIRED");
    const readableAfterExpiry = await fetch(`${baseUrl}/api/assets/${createdAsset.data.id}`, {
      headers: requestHeaders({ cookie: ownerA.cookie, tenantId: ownerA.tenant.id }),
    });
    assert.equal(readableAfterExpiry.status, 200);

    await prisma.tenantSubscription.update({
      where: { tenantId: ownerA.tenant.id },
      data: { status: "SUSPENDED" },
    });
    const suspended = await attemptOwnerAAsset("suspended");
    assert.equal(suspended.status, 403);
    assert.equal((await suspended.json() as ErrorResponse).error?.code, "SUBSCRIPTION_INACTIVE");
    assert.equal(await prisma.asset.count({ where: { tenantId: ownerA.tenant.id } }), 2);

    const auditActions = await prisma.platformAuditLog.findMany({
      where: { actorUserId: ownerA.userId, entityId: { in: [createdPlanId, assignedBody.data.planId] } },
      select: { action: true, reason: true },
    });
    assert.ok(auditActions.some((entry) => entry.action === "subscription_plan.created" && entry.reason.length >= 8));
    assert.ok(auditActions.some((entry) => entry.action === "subscription_plan.updated"));

    const subscriptionAudit = await prisma.platformAuditLog.findFirst({
      where: { actorUserId: ownerA.userId, action: "tenant.subscription_changed" },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(subscriptionAudit, "Subscription assignment must be audited.");
    assert.equal(subscriptionAudit.reason, "Integration test activates a second company");

    await prisma.user.update({ where: { id: ownerA.userId }, data: { isPlatformAdmin: false } });
    const revokedPlatform = await fetch(`${baseUrl}/api/platform/plans`, {
      headers: requestHeaders({ cookie: ownerA.cookie }),
    });
    assert.equal(revokedPlatform.status, 403, "Existing sessions must lose platform access immediately.");

    const passwordChange = await fetch(`${baseUrl}/api/auth/change-password`, {
      method: "POST",
      headers: requestHeaders({ cookie: ownerA.cookie, csrfToken: ownerA.csrfToken, json: true, origin: true }),
      body: JSON.stringify({ currentPassword: "incorrect-current-password", newPassword: "Replacement-Test-Password-2026!" }),
    });
    assert.equal(passwordChange.status, 403);
    assert.equal((await passwordChange.json() as ErrorResponse).error?.code, "CURRENT_PASSWORD_INVALID");

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
      if (createdPlanId) {
        await prisma.platformAuditLog.deleteMany({ where: { actorUserId: { in: await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } }).then((users) => users.map((user) => user.id)) } } });
        await prisma.subscriptionPlan.delete({ where: { id: createdPlanId } });
      }
      await prisma.user.deleteMany({ where: { email: { in: [...emails, managedEmail, anotherMemberEmail] } } });
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
