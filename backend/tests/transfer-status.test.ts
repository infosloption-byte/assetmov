import assert from "node:assert/strict";
import test from "node:test";
import {
  areAllTransferLinesResolved,
  summarizeTransferStatus,
  type TransferLineResolutionStatus,
} from "../src/modules/transfers/transfer-status.js";

test("undecided transfer lines keep a transfer in transit", () => {
  const statuses: TransferLineResolutionStatus[] = ["IN_TRANSIT", "IN_TRANSIT"];
  assert.equal(summarizeTransferStatus(statuses), "IN_TRANSIT");
  assert.equal(areAllTransferLinesResolved(statuses), false);
});

test("a mixture of resolved and unresolved lines is partially received", () => {
  assert.equal(summarizeTransferStatus(["RECEIVED", "IN_TRANSIT"]), "PARTIALLY_RECEIVED");
  assert.equal(areAllTransferLinesResolved(["RECEIVED", "IN_TRANSIT"]), false);
});

test("all accepted lines complete a transfer", () => {
  assert.equal(summarizeTransferStatus(["RECEIVED", "RECEIVED"]), "RECEIVED");
  assert.equal(areAllTransferLinesResolved(["RECEIVED", "RECEIVED"]), true);
});

test("all rejected lines mark a transfer rejected", () => {
  assert.equal(summarizeTransferStatus(["REJECTED", "REJECTED"]), "REJECTED");
  assert.equal(areAllTransferLinesResolved(["REJECTED", "REJECTED"]), true);
});

test("a completed mix of accepted and rejected lines stays marked as partially received", () => {
  assert.equal(summarizeTransferStatus(["RECEIVED", "REJECTED"]), "PARTIALLY_RECEIVED");
  assert.equal(areAllTransferLinesResolved(["RECEIVED", "REJECTED"]), true);
});

test("empty transfers are rejected by the status helper", () => {
  assert.throws(() => summarizeTransferStatus([]), /at least one asset line/);
  assert.equal(areAllTransferLinesResolved([]), false);
});
