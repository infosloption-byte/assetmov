import assert from "node:assert/strict";
import test from "node:test";
import {
  canAssignAssetToEmployee,
  canReturnAssetToStock,
  type AssignableAssetState,
  type AssignableEmployeeState,
} from "../src/modules/assets/assignment-policy.js";

const availableAsset: AssignableAssetState = {
  status: "AVAILABLE",
  assignedEmployeeId: null,
  currentLocationId: "loc-1",
};
const employeeAtLocation: AssignableEmployeeState = {
  isActive: true,
  homeLocationId: "loc-1",
};

test("active employee at the asset's location can receive an available asset", () => {
  assert.equal(canAssignAssetToEmployee(availableAsset, employeeAtLocation), true);
});

test("assignment is blocked if the asset is already assigned or unavailable", () => {
  assert.equal(canAssignAssetToEmployee({ ...availableAsset, status: "ASSIGNED", assignedEmployeeId: "emp-1" }, employeeAtLocation), false);
  assert.equal(canAssignAssetToEmployee({ ...availableAsset, status: "IN_TRANSIT" }, employeeAtLocation), false);
  assert.equal(canAssignAssetToEmployee({ ...availableAsset, status: "IN_SERVICE" }, employeeAtLocation), false);
});

test("assignment is blocked for inactive employees or a mismatched location", () => {
  assert.equal(canAssignAssetToEmployee(availableAsset, { ...employeeAtLocation, isActive: false }), false);
  assert.equal(canAssignAssetToEmployee(availableAsset, { ...employeeAtLocation, homeLocationId: "loc-2" }), false);
});

test("assignment requires both an asset location and employee location match", () => {
  assert.equal(canAssignAssetToEmployee({ ...availableAsset, currentLocationId: null }, employeeAtLocation), false);
  assert.equal(canAssignAssetToEmployee(availableAsset, { ...employeeAtLocation, homeLocationId: null }), false);
});

test("only an assigned asset with a location can be returned to stock", () => {
  assert.equal(canReturnAssetToStock({ ...availableAsset, status: "ASSIGNED", assignedEmployeeId: "emp-1" }), true);
  assert.equal(canReturnAssetToStock(availableAsset), false);
  assert.equal(canReturnAssetToStock({ ...availableAsset, status: "ASSIGNED", assignedEmployeeId: "emp-1", currentLocationId: null }), false);
});
