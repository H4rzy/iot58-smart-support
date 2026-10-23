"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { priority, sortQueue } = require("../lib/priority");
const now = Date.parse("2026-10-09T10:00:00Z");
const ticket = (id, intent, age = 0, level = 0) => ({
  ticket_id: id,
  intent,
  created_at: new Date(now - age).toISOString(),
  escalation_level: level,
});
test("T01 consultation base20 / T02 payment base50", () => {
  assert.equal(priority(ticket("A", "CONSULTATION"), now), 20);
  assert.equal(priority(ticket("B", "PAYMENT"), now), 50);
});
test("T03 aging +5/min protects consultation from starvation", () => {
  assert.equal(priority(ticket("A", "CONSULTATION", 7 * 60000), now), 55);
  assert.equal(
    sortQueue(
      [ticket("A", "CONSULTATION", 7 * 60000), ticket("B", "PAYMENT")],
      now,
    )[0].ticket_id,
    "A",
  );
});
test("T04 escalation +20 per level", () =>
  assert.equal(priority(ticket("A", "CONSULTATION", 0, 2), now), 60));
test("T05 equal priority oldest then lexical deterministic", () => {
  const old = ticket("B", "CONSULTATION", 7 * 60000);
  const fresh = ticket("A", "PAYMENT", 60000);
  assert.deepEqual(
    sortQueue([fresh, old], now).map((t) => t.ticket_id),
    ["B", "A"],
  );
  assert.deepEqual(
    sortQueue([ticket("B", "PAYMENT"), ticket("A", "PAYMENT")], now).map(
      (t) => t.ticket_id,
    ),
    ["A", "B"],
  );
});
