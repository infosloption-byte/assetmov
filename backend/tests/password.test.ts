import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "../src/modules/auth/password.js";

test("password hash does not contain the password and can be verified", async () => {
  const password = "Correct Horse Battery Staple! 2026";
  const hash = await hashPassword(password);

  assert.notEqual(hash, password);
  assert.match(hash, /^scrypt\$32768\$8\$1\$/);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword("different password", hash), false);
});

test("malformed or unsupported password hashes are rejected", async () => {
  assert.equal(await verifyPassword("password", "not-a-hash"), false);
  assert.equal(await verifyPassword("password", "scrypt$1$1$1$salt$key"), false);
});
