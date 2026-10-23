"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { TicketEngine } = require("../lib/ticket-engine");
const { loadConfig } = require("../lib/config");
const { WAITING } = require("../lib/utils");

// Fake clock `now`, `advance(ms)` as in ticket-engine.test.js. Camera readings
// are re-sent in run() so they never go stale (VISION_STALE_SECONDS default 10).
// Assertions on waiting tickets use WAITING because escalation timers
// (demo L1 15 s, L2 25 s) move PENDING to ESCALATED_* as time passes.
function fixture(env = {}, { production = false } = {}) {
  let now = Date.parse("2026-10-24T10:00:00Z");
  const logs = [];
  const config = loadConfig(env);
  if (production) config.demo_mode = false;
  const engine = new TicketEngine(config, {
    now: () => now,
    audit: (e) => logs.push(e),
  });
  let seq = 0;
  const event = (device, name = "REQUEST", extra = {}) =>
    engine.ingest(`${config.baseTopic}/cp/${device}/event`, {
      schema: 1,
      msg_id: `${device}-VISION-${++seq}`,
      boot_id: "TEST",
      device_id: device,
      zone: device[0],
      event: name,
      intent: "CONSULTATION",
      ...extra,
    });
  const camera = (zone, persons) =>
    engine.ingestVision(`${config.baseTopic}/vision/${zone}`, {
      schema: 1,
      camera_id: `CAM-${zone}`,
      zone,
      persons,
    });
  const advance = (ms) => {
    now += ms;
    engine.tick();
  };
  // Advances in 1 s steps, re-sending the given readings every step.
  const run = (seconds, readings = {}) => {
    for (let i = 0; i < seconds; i++) {
      for (const [zone, persons] of Object.entries(readings))
        camera(zone, persons);
      advance(1000);
    }
  };
  const alerts = (type) => engine.state.alerts.filter((a) => a.type === type);
  const staff = (id) => engine.state.staff.find((s) => s.staff_id === id);
  return {
    engine,
    config,
    logs,
    event,
    camera,
    advance,
    run,
    alerts,
    staff,
    ticket: () => engine.state.tickets.at(-1),
  };
}

test("T-E3 fail-open: no camera data never cancels and reports null presence", () => {
  const { engine, event, run, ticket, alerts } = fixture();
  event("A01");
  assert.equal(ticket().presence_verified, null);
  assert.equal(alerts("UNVERIFIED_REQUEST").length, 0);
  run(60);
  assert.ok(WAITING.has(ticket().state), `still waiting, got ${ticket().state}`);
  assert.equal(ticket().cancel_reason, null);
  assert.equal(engine.state.tickets.length, 1);
});

test("T-E3 fail-open: stale empty reading never cancels the ticket", () => {
  const { camera, event, advance, ticket, alerts } = fixture();
  camera("A", 0);
  event("A01");
  assert.equal(ticket().presence_verified, false, "fresh empty reading");
  // No further readings: the camera goes silent well past the abandon threshold.
  advance(30000);
  assert.ok(WAITING.has(ticket().state), `still waiting, got ${ticket().state}`);
  assert.equal(ticket().cancel_reason, null);
  assert.equal(alerts("TICKET_ABANDONED").length, 0);
});

test("T-E3 fail-open: an outage breaks the empty run, so time spent silent does not count", () => {
  const { camera, event, advance, run, ticket } = fixture();
  camera("A", 1);
  event("A01");
  camera("A", 0);
  advance(60000);
  camera("A", 0);
  advance(1000);
  assert.notEqual(ticket().state, "CANCELLED", "silent time is not empty time");
  run(8, { A: 0 });
  assert.notEqual(ticket().state, "CANCELLED", "9 s after reconnect is not enough");
  run(1, { A: 0 });
  assert.equal(ticket().cancel_reason, "ABANDONED_VISION");
});

test("T-E3 fail-open: an outage breaks the occupied run, so dwell restarts after reconnect", () => {
  const { camera, advance, run, alerts } = fixture();
  camera("A", 2);
  advance(60000);
  camera("A", 2);
  advance(1000);
  run(18, { A: 2 });
  assert.equal(alerts("PROACTIVE_ASSIST").length, 0, "19 s since reconnect");
  run(1, { A: 2 });
  assert.equal(alerts("PROACTIVE_ASSIST").length, 1);
});

test("T-E4 abandon: empty zone past demo threshold cancels with ABANDONED_VISION", () => {
  const { engine, camera, event, run, advance, ticket, alerts, staff } =
    fixture();
  camera("A", 1);
  event("A01");
  const t = ticket();
  assert.equal(t.presence_verified, true);
  assert.equal(staff("NV01").current_ticket, t.ticket_id, "reserved by NV01");
  camera("A", 0);
  run(10, { A: 0 });
  assert.equal(t.state, "CANCELLED");
  assert.equal(t.cancel_reason, "ABANDONED_VISION");
  assert.ok(t.cancelled_at);
  const abandoned = alerts("TICKET_ABANDONED");
  assert.equal(abandoned.length, 1);
  assert.equal(abandoned[0].ticket_id, t.ticket_id);
  assert.equal(abandoned[0].device_id, "A01");
  assert.equal(staff("NV01").current_ticket, null, "staff released");
  assert.equal(t.assigned_staff_id, null);
  assert.equal(
    engine.queue.some((x) => x.ticket_id === t.ticket_id),
    false,
  );
  assert.equal(engine.deviceSnapshot("A01").state, "CANCELLED");
  advance(2000);
  assert.equal(engine.deviceSnapshot("A01").state, "READY");
  assert.equal(engine.state.devices.A01.ticket_id, null);
});

test("T-E4 abandon fires exactly at the 10 s demo threshold, not before", () => {
  const { engine, camera, event, run, ticket } = fixture();
  camera("A", 1);
  event("A01");
  camera("A", 0);
  run(9, { A: 0 });
  assert.notEqual(ticket().state, "CANCELLED", "9 s empty is not enough");
  run(1, { A: 0 });
  assert.equal(ticket().state, "CANCELLED", "10 s empty cancels");
  assert.equal(engine.state.tickets.length, 1);
});

test("T-E5 customer returning before the threshold keeps the ticket", () => {
  const { camera, event, run, ticket, alerts } = fixture();
  camera("A", 1);
  event("A01");
  camera("A", 0);
  run(6, { A: 0 });
  camera("A", 1);
  run(2, { A: 1 });
  camera("A", 0);
  run(6, { A: 0 });
  assert.notEqual(ticket().state, "CANCELLED", "empty clock restarted on return");
  assert.equal(alerts("TICKET_ABANDONED").length, 0);
  run(4, { A: 0 });
  assert.equal(ticket().state, "CANCELLED");
});

test("T-E6 REQUEST with empty zone: presence_verified false and UNVERIFIED_REQUEST alert", () => {
  const { camera, event, ticket, alerts } = fixture();
  camera("A", 0);
  assert.equal(event("A01").ok, true);
  assert.equal(ticket().presence_verified, false);
  const unverified = alerts("UNVERIFIED_REQUEST");
  assert.equal(unverified.length, 1);
  assert.equal(unverified[0].ticket_id, ticket().ticket_id);
  assert.equal(ticket().state, "PENDING", "unverified request is flagged, not blocked");
});

test("T-E6 REQUEST with a person present: presence_verified true, no alert", () => {
  const { camera, event, ticket, alerts } = fixture();
  camera("A", 1);
  event("A01");
  assert.equal(ticket().presence_verified, true);
  assert.equal(alerts("UNVERIFIED_REQUEST").length, 0);
});

test("T-E6 REQUEST with no camera: presence_verified null, no alert", () => {
  const { event, ticket, alerts } = fixture();
  event("B01");
  assert.equal(ticket().presence_verified, null);
  assert.equal(alerts("UNVERIFIED_REQUEST").length, 0);
});

test("T-E7 STAFF_ARRIVED with 2 people: arrival_verified true, ARRIVED succeeds", () => {
  const { engine, camera, event, ticket, alerts } = fixture();
  camera("A", 1);
  event("A01");
  engine.ack(ticket().ticket_id, "NV01");
  camera("A", 2);
  assert.equal(event("A01", "STAFF_ARRIVED").ok, true);
  assert.equal(ticket().state, "ARRIVED");
  assert.equal(ticket().arrival_verified, true);
  assert.equal(alerts("ARRIVAL_UNVERIFIED").length, 0);
});

test("T-E7 STAFF_ARRIVED with 1 person: arrival_verified false, ARRIVED still succeeds", () => {
  const { engine, camera, event, ticket, alerts } = fixture();
  camera("A", 1);
  event("A01");
  engine.ack(ticket().ticket_id, "NV01");
  camera("A", 1);
  assert.equal(event("A01", "STAFF_ARRIVED").ok, true);
  assert.equal(ticket().state, "ARRIVED");
  assert.equal(ticket().arrival_verified, false);
  const unverified = alerts("ARRIVAL_UNVERIFIED");
  assert.equal(unverified.length, 1);
  assert.equal(unverified[0].ticket_id, ticket().ticket_id);
});

test("T-E7 STAFF_ARRIVED with stale camera: arrival_verified null, ARRIVED still succeeds", () => {
  const { engine, camera, event, advance, ticket, alerts } = fixture();
  camera("A", 2);
  event("A01");
  engine.ack(ticket().ticket_id, "NV01");
  advance(11000);
  assert.equal(event("A01", "STAFF_ARRIVED").ok, true);
  assert.equal(ticket().state, "ARRIVED");
  assert.equal(ticket().arrival_verified, null);
  assert.equal(alerts("ARRIVAL_UNVERIFIED").length, 0);
});

test("T-E8 PROACTIVE_ASSIST fires when a zone is occupied past the dwell threshold without a ticket", () => {
  const { run, alerts } = fixture();
  run(19, { A: 2 });
  assert.equal(alerts("PROACTIVE_ASSIST").length, 0, "19 s is below 20 s dwell");
  run(2, { A: 2 });
  const assist = alerts("PROACTIVE_ASSIST");
  assert.equal(assist.length, 1);
  assert.equal(assist[0].device_id, "A01");
  assert.equal(assist[0].zone, "A");
});

test("T-E8 PROACTIVE_ASSIST does not fire while the device has an active ticket", () => {
  const { event, run, alerts } = fixture();
  run(1, { A: 2 });
  event("A01");
  run(25, { A: 2 });
  assert.equal(alerts("PROACTIVE_ASSIST").length, 0);
});

test("T-E8 PROACTIVE_ASSIST does not fire during the CSAT window", () => {
  const { engine, event, run, alerts, ticket } = fixture();
  run(8, { A: 2 });
  event("A01");
  const t = ticket();
  engine.ack(t.ticket_id, "NV01");
  run(1, { A: 2 });
  event("A01", "STAFF_ARRIVED");
  engine.done(t.ticket_id, "NV01");
  assert.equal(t.state, "RESOLVED");
  // Occupancy since t=0 already exceeds 20 s during the 15 s CSAT window.
  run(14, { A: 2 });
  assert.equal(engine.deviceSnapshot("A01").state, "CSAT_WAIT");
  assert.equal(alerts("PROACTIVE_ASSIST").length, 0);
  run(2, { A: 2 });
  assert.equal(alerts("PROACTIVE_ASSIST").length, 1, "fires once CSAT window ends");
});

test("T-E9 VISION_ENABLED=false: readings ignored and every vision rule is off", () => {
  const { engine, config, camera, event, run, ticket, alerts, logs } = fixture({
    VISION_ENABLED: "false",
  });
  assert.equal(config.visionEnabled, false);
  assert.deepEqual(camera("A", 0), { ok: true, ignored: true });
  assert.equal(engine.state.vision.A.updated_at, 0, "reading not stored");
  assert.equal(engine.visionPresence("A"), null);

  event("A01");
  assert.equal(ticket().presence_verified, null);
  assert.equal(alerts("UNVERIFIED_REQUEST").length, 0);
  engine.ack(ticket().ticket_id, "NV01");
  assert.equal(event("A01", "STAFF_ARRIVED").ok, true);
  assert.equal(ticket().arrival_verified, null);
  assert.equal(alerts("ARRIVAL_UNVERIFIED").length, 0);

  event("B01");
  camera("B", 0);
  run(40, { B: 0 });
  assert.ok(WAITING.has(engine.state.tickets.at(-1).state), "no abandon");
  assert.equal(alerts("TICKET_ABANDONED").length, 0);
  assert.equal(alerts("PROACTIVE_ASSIST").length, 0);
  assert.equal(logs.some((e) => e.type === "VISION_UPDATE"), false);
});

test("T-E10 production thresholds: abandon at 60 s and dwell at 180 s", () => {
  const abandon = fixture({}, { production: true });
  assert.equal(abandon.config.demo_mode, false);
  abandon.camera("A", 1);
  abandon.event("A01");
  abandon.camera("A", 0);
  abandon.run(59, { A: 0 });
  assert.notEqual(abandon.ticket().state, "CANCELLED", "59 s is below 60 s");
  abandon.run(2, { A: 0 });
  assert.equal(abandon.ticket().state, "CANCELLED");
  assert.equal(abandon.ticket().cancel_reason, "ABANDONED_VISION");

  const dwell = fixture({}, { production: true });
  dwell.run(179, { B: 1 });
  assert.equal(dwell.alerts("PROACTIVE_ASSIST").length, 0, "179 s below 180 s");
  dwell.run(2, { B: 1 });
  assert.equal(dwell.alerts("PROACTIVE_ASSIST").length, 1);
  assert.equal(dwell.alerts("PROACTIVE_ASSIST")[0].device_id, "B01");
});

test("T-E10 demo mode is the default and uses 10 s / 20 s", () => {
  const { config } = fixture();
  assert.equal(config.demo_mode, true);
  assert.equal(config.visionThresholds().abandon, 10);
  assert.equal(config.visionThresholds().dwell, 20);
});

test("T-E11 reset keeps vision state and footfall", () => {
  const { engine, camera } = fixture();
  camera("A", 2);
  camera("A", 3);
  const before = engine.state.vision.A;
  assert.equal(before.footfall, 3);
  engine.reset(true);
  assert.equal(engine.state.vision.A, before, "same zone object survives reset");
  assert.equal(engine.state.vision.A.footfall, 3);
  assert.equal(engine.state.vision.A.persons, 3);
});

test("T-E11 state without a vision key loads with fresh vision zones", () => {
  const first = fixture();
  first.event("A01");
  const legacy = JSON.parse(JSON.stringify(first.engine.state));
  delete legacy.vision;
  const config = loadConfig({});
  let now = Date.parse("2026-10-24T10:00:00Z");
  const engine = new TicketEngine(config, { state: legacy, now: () => now });
  assert.deepEqual(Object.keys(engine.state.vision).sort(), ["A", "B", "C"]);
  assert.equal(engine.state.vision.A.updated_at, 0);
  assert.equal(engine.visionPresence("A"), null);
  now += 1000;
  engine.tick();
  assert.ok(WAITING.has(engine.state.tickets[0].state));
  assert.equal(
    engine.ingestVision(`${config.baseTopic}/vision/A`, {
      schema: 1,
      camera_id: "CAM-A",
      zone: "A",
      persons: 1,
    }).ok,
    true,
  );
  assert.equal(engine.state.vision.A.persons, 1);
});

test("T-E12 vision-cancelled tickets do not distort AHT, response or SLA metrics", () => {
  const { engine, config, camera, event, run, ticket, advance } = fixture();
  camera("A", 1);
  event("A01");
  camera("A", 0);
  run(10, { A: 0 });
  const abandoned = ticket();
  assert.equal(abandoned.state, "CANCELLED");
  assert.equal(abandoned.response_time_ms, null, "no physical response measured");
  assert.equal(engine.state.aht.A, config.ahtDefaultSeconds, "AHT untouched");
  assert.equal(engine.metrics.avg_response_seconds, null);
  assert.equal(engine.metrics.p90_response_seconds, null);
  assert.equal(
    engine.metrics.sla_violation_percent,
    null,
    "cancelled excluded from SLA denominator",
  );
  assert.equal(engine.metrics.active_tickets, 0);
  assert.equal(engine.metrics.waiting_tickets, 0);
  assert.equal(engine.metrics.response_by_zone.A.completed, 0);

  // A real served ticket afterwards is measured alone.
  camera("B", 1);
  event("B01");
  const served = engine.state.tickets.at(-1);
  advance(3000);
  engine.ack(served.ticket_id, "NV02");
  advance(2000);
  camera("B", 2);
  assert.equal(event("B01", "STAFF_ARRIVED").ok, true);
  assert.equal(served.response_time_ms, 5000);
  assert.equal(engine.metrics.avg_response_seconds, 5);
  assert.equal(engine.metrics.response_by_zone.A.avg_response_seconds, null);
  assert.equal(engine.state.aht.A, config.ahtDefaultSeconds);
  // Documented behaviour: request counters still include vision-cancelled tickets.
  assert.equal(engine.metrics.requests_by_zone.A, 1);
});

test("T2 snapshot: vision is online/persons, offline zones report null persons and never 0", () => {
  const { engine, config, camera, advance } = fixture();
  camera("A", 2);
  let snap = engine.snapshot();
  assert.equal(snap.vision.A.online, true);
  assert.equal(snap.vision.A.persons, 2);
  assert.equal(snap.vision.A.camera_id, "CAM-A");
  assert.equal(snap.vision.B.online, false, "never reported is offline");
  assert.equal(snap.vision.B.persons, null, "offline is null, not 0");
  assert.equal(snap.config.vision_enabled, true);
  assert.deepEqual(snap.config.vision_thresholds, {
    abandon: config.visionDemo.abandon,
    dwell: config.visionDemo.dwell,
  });

  advance(config.visionStaleSeconds * 1000 + 1000);
  snap = engine.snapshot();
  assert.equal(snap.vision.A.online, false);
  assert.equal(snap.vision.A.persons, null, "stale reading is null, not 0");
  assert.equal(snap.vision.A.footfall, 2, "footfall history survives staleness");
});

test("T2 snapshot: production mode exposes production vision thresholds", () => {
  const { engine, config } = fixture({}, { production: true });
  const snap = engine.snapshot();
  assert.deepEqual(snap.config.vision_thresholds, {
    abandon: 60,
    dwell: 180,
  });
  assert.equal(snap.config.vision_thresholds.abandon, config.visionProduction.abandon);
});

test("T2 system/vision: retained view is published by the once-per-second summary", () => {
  const { engine, camera, advance } = fixture();
  camera("A", 1);
  advance(1000);
  const msg = engine
    .drain()
    .find((m) => m.topic.endsWith("/system/vision"));
  assert.ok(msg, "system/vision published");
  assert.equal(msg.retain, true);
  const view = JSON.parse(msg.payload);
  assert.equal(view.A.online, true);
  assert.equal(view.A.persons, 1);
  assert.equal(view.B.online, false);
  assert.equal(view.B.persons, null);
});

test("T2 display payload stays under 768 bytes and carries no vision data", () => {
  const { engine, event, camera, advance } = fixture();
  event("A01");
  event("B01");
  event("C01");
  camera("A", 2);
  camera("B", 0);
  camera("C", 1);
  advance(1000);
  const display = engine
    .drain()
    .find((m) => m.topic.endsWith("/display"));
  assert.ok(display, "display published");
  assert.ok(Buffer.byteLength(display.payload) < 768);
  assert.equal("vision" in JSON.parse(display.payload), false);
});

test("T2 VISION_ENABLED=false: malformed payloads return ignored without throwing or storing", () => {
  const { engine, config } = fixture({ VISION_ENABLED: "false" });
  const topic = `${config.baseTopic}/vision/A`;
  const before = JSON.stringify(engine.state.vision);
  const malformed = [
    "{not json",
    { schema: 9, zone: "Z", persons: -1 },
    { schema: 1, zone: "B", camera_id: "x", persons: 1 },
    null,
  ];
  for (const payload of malformed)
    assert.deepEqual(engine.ingestVision(topic, payload), {
      ok: true,
      ignored: true,
    });
  assert.equal(JSON.stringify(engine.state.vision), before, "state untouched");
});

test("T2 VISION_ENABLED=true: malformed payloads are still rejected", () => {
  const { engine, config } = fixture();
  assert.throws(
    () => engine.ingestVision(`${config.baseTopic}/vision/A`, "{not json"),
    /Malformed JSON/,
  );
});
