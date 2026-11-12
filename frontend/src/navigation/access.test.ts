import assert from "node:assert/strict";
import { test } from "node:test";
import { canOpenWorkspacePage } from "./access";

test("asset operator sees only overview, register and transfer menus",()=>{
  const permissions=["asset.read","asset.create","asset.update","asset.assign",
    "asset.transfer.read","asset.transfer.dispatch"];
  for(const page of ["overview","assets","transfers"] as const)
    assert.equal(canOpenWorkspacePage(page,permissions,"ASSET_MANAGER"),true,page);
  for(const page of ["employees","locations","company","profile","masterData","billing","requests"] as const)
    assert.equal(canOpenWorkspacePage(page,permissions,"ASSET_MANAGER"),false,page);
});

test("location/employee menus depend on their own read permissions",()=>{
  const permissions=["employee.read","location.read"];
  assert.equal(canOpenWorkspacePage("employees",permissions,"EMPLOYEE_VIEWER"),true);
  assert.equal(canOpenWorkspacePage("locations",permissions,"EMPLOYEE_VIEWER"),true);
  assert.equal(canOpenWorkspacePage("assets",permissions,"EMPLOYEE_VIEWER"),false);
  assert.equal(canOpenWorkspacePage("masterData",permissions,"EMPLOYEE_VIEWER"),false);
});

test("P1 request navigation requires submit or approval permissions",()=>{
  assert.equal(canOpenWorkspacePage("requests",["request.create"],"STAFF"),true);
  assert.equal(canOpenWorkspacePage("requests",["request.approve"],"MANAGER"),true);
  assert.equal(canOpenWorkspacePage("requests",["asset.read"],"ASSET_MANAGER"),false);
});

test("master-data administration and billing remain privileged",()=>{
  assert.equal(canOpenWorkspacePage("masterData",["asset.read"],"ASSET_MANAGER"),false);
  assert.equal(canOpenWorkspacePage("masterData",["tenant.settings.manage"],"TENANT_OWNER"),true);
  assert.equal(canOpenWorkspacePage("billing",[],"TENANT_OWNER"),true);
  assert.equal(canOpenWorkspacePage("billing",["tenant.settings.manage"],"MANAGER"),false);
});
