import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appRoutePath, isProtectedRoute, platformPages, readAppRoute, workspacePages,
} from "./routes";

test("company pages have canonical, refresh-safe addresses", () => {
  const expected = {
    overview: "overview", assets: "assets", transfers: "transfers",
    employees: "employees", locations: "locations", requests: "requests", company: "users",
    profile: "profile", masterData: "master-data", billing: "billing",
  } as const;
  for (const page of workspacePages) {
    const route = { kind: "workspace" as const, tenantSlug: "hnb-bank", page };
    const path = appRoutePath(route);
    assert.equal(path, "/workspace/hnb-bank/" + expected[page]);
    assert.deepEqual(readAppRoute(path), route);
    assert.equal(isProtectedRoute(route), true);
  }
});

test("platform pages are deep-linkable without any tenant membership", () => {
  for (const page of platformPages) {
    const route = { kind: "platform" as const, page };
    assert.equal(appRoutePath(route), "/platform/" + page);
    assert.deepEqual(readAppRoute(appRoutePath(route)), route);
    assert.equal(isProtectedRoute(route), true);
  }
});

test("the public root remains a route and is not protected", () => {
  assert.deepEqual(readAppRoute("/"), { kind: "home" });
  assert.equal(appRoutePath({ kind: "home" }), "/");
  assert.equal(isProtectedRoute(readAppRoute("/")), false);
});

test("rejects missing or unknown pages and suspicious slugs", () => {
  for (const path of [
    "/workspace", "/workspace/hnb-bank", "/workspace/hnb-bank/unknown",
    "/workspace/../assets", "/workspace/%2F/assets", "/workspace/%ZZ/assets",
    "/platform", "/platform/assets", "/platform/settings/extras", "/unrecognized",
  ]) {
    assert.deepEqual(readAppRoute(path), { kind: "notFound" }, path);
  }
});

test("does not confuse company and platform billing URLs", () => {
  assert.deepEqual(readAppRoute("/platform/billing"), { kind: "platform", page: "billing" });
  assert.deepEqual(readAppRoute("/workspace/acme/billing"),
    { kind: "workspace", tenantSlug: "acme", page: "billing" });
  assert.deepEqual(readAppRoute("/workspace/acme/master-data"),
    { kind: "workspace", tenantSlug: "acme", page: "masterData" });
});
