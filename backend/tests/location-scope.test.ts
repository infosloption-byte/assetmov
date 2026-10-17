import assert from "node:assert/strict";
import test from "node:test";
import { expandLocationScope, type LocationNode } from "../src/modules/tenancy/location-scope.js";

const locations: LocationNode[] = [
  { id: "hq", parentId: null },
  { id: "finance", parentId: "hq" },
  { id: "finance-vault", parentId: "finance" },
  { id: "operations", parentId: "hq" },
  { id: "branch-a", parentId: null },
  { id: "branch-a-floor-1", parentId: "branch-a" },
];

test("location grant expands to descendants but not unrelated branches", () => {
  assert.deepEqual(
    new Set(expandLocationScope(locations, ["finance"])),
    new Set(["finance", "finance-vault"]),
  );
});

test("multiple grants merge and de-duplicate shared descendants", () => {
  assert.deepEqual(
    new Set(expandLocationScope(locations, ["hq", "finance"])),
    new Set(["hq", "finance", "finance-vault", "operations"]),
  );
});

test("unknown and inactive-filtered root ids are ignored", () => {
  assert.deepEqual(expandLocationScope(locations, ["missing", "deleted-location"]), []);
});

test("malformed cycles do not cause an infinite traversal", () => {
  const cyclic: LocationNode[] = [
    { id: "a", parentId: "b" },
    { id: "b", parentId: "a" },
  ];
  assert.deepEqual(new Set(expandLocationScope(cyclic, ["a"])), new Set(["a", "b"]));
});
