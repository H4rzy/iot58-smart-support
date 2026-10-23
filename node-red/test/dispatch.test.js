"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { staffScore, chooseStaff } = require("../lib/dispatch");
const staff = (id, status = "AVAILABLE", zones = ["A"], assigned = 0) => ({
  staff_id: id,
  status,
  zones,
  tickets_assigned_this_shift: assigned,
  current_ticket: null,
  active_tickets: 0,
  last_assigned_at: null,
});
test("T06 staff canonical score", () =>
  assert.equal(staffScore(staff("NV01", "AVAILABLE", ["A"], 2), "A"), 110));
test("T07 BUSY/OFFLINE and reserved staff never selected", () => {
  const reserved = { ...staff("R"), current_ticket: "T1" };
  assert.equal(
    chooseStaff(
      [
        staff("B", "BUSY"),
        staff("O", "OFFLINE"),
        reserved,
        staff("F", "AVAILABLE", ["C"]),
      ],
      { zone: "A", staff_attempts: [] },
    ).staff_id,
    "F",
  );
});
test("T08 zone bonus wins; attempted staff excluded", () => {
  const people = [
    staff("NV01", "AVAILABLE", ["C"]),
    staff("NV02", "AVAILABLE", ["B"]),
  ];
  assert.equal(
    chooseStaff(people, { zone: "B", staff_attempts: [] }).staff_id,
    "NV02",
  );
  assert.equal(
    chooseStaff(people, { zone: "B", staff_attempts: ["NV02"] }).staff_id,
    "NV01",
  );
});
test("ties prefer lower active count then older assignment then lexical", () => {
  const a = staff("A");
  const b = { ...staff("B"), last_assigned_at: "2026-10-09T01:00:00Z" };
  assert.equal(
    chooseStaff([b, a], { zone: "A", staff_attempts: [] }).staff_id,
    "A",
  );
});
