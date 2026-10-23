"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ewma,
  eta,
  percentile,
  isOverloaded,
  computeMetrics,
} = require("../lib/analytics");

test("T14 EWMA exact alpha .3, validates negative input", () => {
  assert.equal(ewma(120, 60), 102);
  assert.throws(() => ewma(120, -1), RangeError);
});
test("T15 ETA zero free staff is safe and rank formula exact", () => {
  assert.equal(eta(3, 0, 120), 360);
  assert.equal(eta(3, 2, 120), 240);
});
test("T16 P90 nearest-rank with empty and one sample", () => {
  assert.equal(percentile([]), null);
  assert.equal(percentile([42]), 42);
  assert.equal(percentile([10, 1, 8, 5, 6, 4, 2, 3, 9, 7]), 9);
});
test("T17 overload uses on-duty capacity strict greater-than", () => {
  assert.equal(isOverloaded(6, 3), false);
  assert.equal(isOverloaded(7, 3), true);
  assert.equal(isOverloaded(1, 0), true);
});
test("Metrics measure physical arrival, keep ACK latency separate and empty N/A", () => {
  const now = Date.parse("2026-10-09T10:00:10Z");
  const tickets = [
    {
      zone: "A",
      intent: "CONSULTATION",
      state: "ACKNOWLEDGED",
      ack_latency_ms: 10,
      response_time_ms: null,
      created_at: "2026-10-09T10:00:00Z",
    },
    {
      zone: "B",
      intent: "PAYMENT",
      state: "RESOLVED",
      response_time_ms: 2000,
      service_time_ms: 30000,
      csat: "SATISFIED",
      created_at: "2026-10-09T10:00:00Z",
    },
  ];
  const metrics = computeMetrics(
    tickets,
    [{ status: "AVAILABLE" }],
    { A: 120, B: 93, C: 120 },
    now,
  );
  assert.equal(metrics.avg_response_seconds, 2);
  assert.equal(metrics.sample_count, 1);
  assert.equal(metrics.csat_percent, 100);
  assert.equal(metrics.response_by_zone.A.avg_response_seconds, null);
  assert.equal(metrics.response_by_zone.B.avg_service_seconds, 30);
  assert.equal(computeMetrics([], [], {}, now).p90_response_seconds, null);
});
test("SLA denominator includes outstanding old requests, excludes cancellation", () => {
  const tickets = [
    {
      zone: "A",
      intent: "CONSULTATION",
      state: "PENDING",
      created_at: "2026-10-09T10:00:00Z",
    },
    {
      zone: "B",
      intent: "PAYMENT",
      state: "CANCELLED",
      created_at: "2026-10-09T10:00:00Z",
    },
  ];
  assert.equal(
    computeMetrics(tickets, [], {}, Date.parse("2026-10-09T10:01:01Z"), {
      responseSlaSeconds: 60,
    }).sla_violation_percent,
    100,
  );
  assert.equal(
    computeMetrics(tickets, [], {}, Date.parse("2026-10-09T10:01:01Z"))
      .sla_violation_percent,
    0,
  );
});
