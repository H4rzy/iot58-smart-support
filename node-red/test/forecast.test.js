"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  lambda,
  requiredStaff,
  forecast,
  VirtualClock,
  storeParts,
} = require("../lib/forecast");

const target = "2026-10-09T18:00:00+07:00";
const dates = ["2026-10-02", "2026-09-25", "2026-09-18", "2026-09-11"];
const history = dates.flatMap((day) =>
  Array.from({ length: 60 }, () => ({
    zone: "A",
    timestamp: `${day}T18:30:00+07:00`,
  })),
);
test("T18 lambda four matching weekday/hour windows; rate in tickets/minute", () => {
  assert.equal(lambda(history, "A", target), 1);
  assert.equal(lambda(history, "B", target), 0);
  assert.equal(
    lambda(
      [{ zone: "A", timestamp: "2026-10-02T18:10:00+07:00" }],
      "A",
      target,
    ),
    1 / 240,
  );
});
test("T19 staffing utilization and units exact", () => {
  assert.equal(requiredStaff(1, 120), 3);
  assert.equal(requiredStaff(0, 120), 0);
  assert.throws(() => requiredStaff(1, 120, 0), RangeError);
});
test("Data-driven forecast changes when history changes and excludes future/wrong hour", () => {
  const before = forecast(history, "2026-10-09T17:45:00+07:00", { A: 120 }, []);
  const after = forecast(
    [...history, ...history],
    "2026-10-09T17:45:00+07:00",
    { A: 120 },
    [],
  );
  assert.equal(before.zones[0].required_staff, 3);
  assert.equal(after.zones[0].required_staff, 5);
  assert.equal(
    lambda(
      [
        ...history,
        { zone: "A", timestamp: "2026-10-09T18:30:00+07:00" },
        { zone: "A", timestamp: "2026-10-02T19:00:00+07:00" },
      ],
      "A",
      target,
    ),
    1,
  );
});
test("Zone capacity does not count a multi-skill staff three times", () => {
  const result = forecast(history, "2026-10-09T17:45:00+07:00", {}, [
    { status: "AVAILABLE", zones: ["A", "B", "C"] },
  ]);
  assert.equal(
    result.zones.reduce((sum, z) => sum + z.staff_on_duty, 0),
    1,
  );
});
test("Virtual clock60x: 1 second real ->1 minute virtual; pause/reset deterministic", () => {
  const real = Date.parse("2026-10-09T10:45:00Z");
  const clock = new VirtualClock(real);
  clock.update({ action: "set", datetime: target, speed: 60 }, real);
  assert.equal(clock.time(real + 1000), Date.parse(target) + 60000);
  clock.update({ action: "pause" }, real + 1000);
  assert.equal(clock.time(real + 10000), Date.parse(target) + 60000);
  clock.update({ action: "reset" }, real + 10000);
  assert.equal(clock.time(real + 10000), real + 10000);
  assert.equal(clock.speed, 1);
  assert.throws(
    () => clock.update({ action: "set", datetime: "bad" }),
    RangeError,
  );
});
test("Store weekday/hour independent of host TZ", () => {
  assert.deepEqual(storeParts("2026-10-09T11:00:00Z"), {
    day: 5,
    hour: 18,
    date: "2026-10-09",
  });
});
