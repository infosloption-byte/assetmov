import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAssetAssignable,
  assertAssetDisposable,
  assertAssetTransition,
  assertAssetTransferable,
  canTransitionAsset,
  InvalidAssetTransitionError,
} from "../src/modules/assets/asset-lifecycle.js";

test("available asset can be assigned and later returned", () => {
  assert.equal(canTransitionAsset("AVAILABLE", "ASSIGNED"), true);
  assert.equal(canTransitionAsset("ASSIGNED", "AVAILABLE"), true);
});

test("disposed and retired assets cannot leave terminal states", () => {
  assert.equal(canTransitionAsset("DISPOSED", "AVAILABLE"), false);
  assert.equal(canTransitionAsset("RETIRED", "AVAILABLE"), false);
  assert.throws(
    () => assertAssetTransition("DISPOSED", "AVAILABLE"),
    InvalidAssetTransitionError,
  );
});

test("an in-service asset cannot be assigned directly", () => {
  assert.throws(() => assertAssetAssignable("IN_SERVICE"), /Only AVAILABLE assets/);
});

test("only available or assigned assets can be transferred", () => {
  assert.doesNotThrow(() => assertAssetTransferable("AVAILABLE"));
  assert.doesNotThrow(() => assertAssetTransferable("ASSIGNED"));
  assert.throws(() => assertAssetTransferable("IN_TRANSIT"), /cannot be transferred/);
});

test("only available or damaged assets can be disposed", () => {
  assert.doesNotThrow(() => assertAssetDisposable("AVAILABLE"));
  assert.doesNotThrow(() => assertAssetDisposable("DAMAGED"));
  assert.throws(() => assertAssetDisposable("ASSIGNED"), /cannot be disposed/);
});
