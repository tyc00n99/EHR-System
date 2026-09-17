import assert from "node:assert/strict";
import { test } from "node:test";
import { lockDurationMs } from "../../lib/lockout";

test("no lock before the fifth failure", () => {
  for (let n = 0; n < 5; n++) assert.equal(lockDurationMs(n), 0);
});

test("fifth failure locks for 15 minutes, then doubles, capped at a day", () => {
  assert.equal(lockDurationMs(5), 15 * 60_000);
  assert.equal(lockDurationMs(6), 30 * 60_000);
  assert.equal(lockDurationMs(7), 60 * 60_000);
  assert.equal(lockDurationMs(12), 24 * 60 * 60_000);
  assert.equal(lockDurationMs(40), 24 * 60 * 60_000);
});
