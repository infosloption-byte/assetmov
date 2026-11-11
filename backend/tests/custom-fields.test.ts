import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJson, CustomFieldValidationError, validateCustomFieldValues } from "../src/modules/master-data/custom-fields.js";

const schema = { version: 1, fields: [
  { key: "memory", label: "Memory", type: "number", required: true },
  { key: "retired", label: "Retired", type: "boolean", required: false },
  { key: "joined", label: "Joined", type: "date", required: false },
  { key: "tier", label: "Tier", type: "singleSelect", required: true, options: ["standard", "premium"] },
  { key: "tags", label: "Tags", type: "multiSelect", required: false, options: ["a", "b"] },
] };
function invalid(values: unknown) {
  assert.throws(() => validateCustomFieldValues(schema, values), CustomFieldValidationError);
}
test("model-defined custom fields accept typed values and omit empty optional values", () => {
  assert.deepEqual(validateCustomFieldValues(schema, {
    memory: 16, retired: false, tier: "standard", joined: "2026-10-24", tags: ["a", "b"],
  }), { memory: 16, retired: false, tier: "standard", joined: "2026-10-24", tags: ["a", "b"] });
  assert.deepEqual(validateCustomFieldValues(null, {}), {});
});
test("custom fields reject unknown keys, wrong types and missing required values", () => {
  invalid({ memory: 16, tier: "standard", unknown: "injection" });
  invalid({ memory: "16", tier: "standard" });
  invalid({ memory: 16 });
  invalid({ memory: 16, tier: "vip" });
  invalid({ memory: 16, tier: "standard", tags: ["a", "a"] });
  invalid({ memory: 16, tier: "standard", joined: "2026-02-30" });
  invalid({ memory: Infinity, tier: "standard" });
  invalid(null);
  assert.throws(() => validateCustomFieldValues({ version: 2, fields: [] }, {}), CustomFieldValidationError);
});

test("used model definitions remain equivalent when MySQL reorders JSON object properties", () => {
  const created = { version: 1, fields: [
    { key: "ramGb", label: "RAM (GB)", type: "number", required: true },
    { key: "tier", label: "Tier", type: "singleSelect", required: true, options: ["a", "b"] },
  ] };
  const readFromMySql = { fields: [
    { required: true, type: "number", label: "RAM (GB)", key: "ramGb" },
    { options: ["a", "b"], type: "singleSelect", required: true, key: "tier", label: "Tier" },
  ], version: 1 };
  assert.equal(canonicalJson(created), canonicalJson(readFromMySql));
  assert.notEqual(canonicalJson(created), canonicalJson({ version: 1, fields: [
    { key: "ramGb", label: "RAM (GB)", type: "number", required: false },
    { key: "tier", label: "Tier", type: "singleSelect", required: true, options: ["a", "b"] },
  ] }));
  assert.notEqual(canonicalJson(created), canonicalJson({ version: 1, fields: [
    created.fields[1], created.fields[0],
  ] }));
});
