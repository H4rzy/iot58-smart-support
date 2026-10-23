"use strict";
// Exercises real MQTT uplink + REST application + MQTT downlink. No fabricated device output.
const mqtt = require("mqtt");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const API =
  (process.env.API_URL || "http://127.0.0.1:1880").replace(/\/$/, "") +
  "/api/iot58";
const BASE =
  process.env.MQTT_BASE_TOPIC || "huit/iot58/n20-smart-support/store/s1";
const HOST = process.env.MQTT_HOST || "127.0.0.1";
const PORT = process.env.MQTT_PORT || 1883;
const bootId = "TEST" + crypto.randomBytes(3).toString("hex");
let sequence = 0;
const received = [];
let client;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function api(path, body, expected = 200) {
  const response = await fetch(API + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  const json = await response.json();
  assert.equal(response.status, expected, `${path}: ${JSON.stringify(json)}`);
  return json;
}
async function waitFor(condition, description, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const state = await api("/state");
    const value = condition(state);
    if (value) return value;
    await sleep(150);
  }
  throw new Error(`Timeout: ${description}`);
}
async function waitForMessage(condition, description, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const found = received.find(condition);
    if (found) return found;
    await sleep(100);
  }
  throw new Error(`Timeout MQTT: ${description}`);
}
function event(deviceId, type, extra = {}) {
  return {
    schema: 1,
    msg_id: `${deviceId}-${bootId}-${String(++sequence).padStart(6, "0")}`,
    boot_id: bootId,
    device_id: deviceId,
    zone: deviceId[0],
    event: type,
    device_uptime_ms: sequence * 100,
    ...extra,
  };
}
async function publish(
  payload,
  topic = `${BASE}/cp/${payload.device_id}/event`,
) {
  await new Promise((resolve, reject) =>
    client.publish(topic, JSON.stringify(payload), { qos: 1 }, (error) =>
      error ? reject(error) : resolve(),
    ),
  );
}
async function reset(statuses = {}) {
  await api("/demo/mode", { demo_mode: true });
  await api("/demo/reset", { reset_metrics: true });
  for (const id of ["NV01", "NV02", "NV03"])
    await api(`/staff/${id}/status`, { status: statuses[id] || "BUSY" });
  await sleep(300);
  received.length = 0;
}
async function priorityDemo() {
  await reset();
  const request = event("A01", "REQUEST", {
    gesture: "short",
    intent: "CONSULTATION",
  });
  await publish(request);
  await publish(
    event("B01", "REQUEST", { gesture: "long", intent: "PAYMENT" }),
  );
  await publish(
    event("C01", "REQUEST", { gesture: "short", intent: "CONSULTATION" }),
  );
  const queue = await waitFor(
    (s) => s.queue.length === 3 && s.queue,
    "three global waiting tickets",
  );
  assert.equal(queue[0].device_id, "B01");
  assert.equal(queue[1].device_id, "A01");
  await publish(request);
  await sleep(300);
  assert.equal(
    (await api("/state")).tickets.length,
    3,
    "duplicate msg_id must not create ticket",
  );
  await api("/staff/NV02/status", { status: "AVAILABLE" });
  const ticket = await waitFor(
    (s) =>
      s.tickets.find(
        (t) => t.device_id === "B01" && t.assigned_staff_id === "NV02",
      ),
    "B zone dispatch to Binh",
  );
  await api(`/tickets/${ticket.ticket_id}/done`, {}, 409);
  await api(`/tickets/${ticket.ticket_id}/ack`, { staff_id: "NV02" });
  await waitFor(
    (s) =>
      s.tickets.find(
        (t) => t.ticket_id === ticket.ticket_id && t.state === "ACKNOWLEDGED",
      ),
    "ACK",
  );
  await waitForMessage(
    (m) =>
      m.topic === `${BASE}/cp/B01/cmd` && m.payload.state === "ACKNOWLEDGED",
    "ACK downlink observed",
  );
  await api(`/tickets/${ticket.ticket_id}/done`, {}, 409);
  await publish(event("B01", "STAFF_ARRIVED"));
  const arrived = await waitFor(
    (s) =>
      s.tickets.find(
        (t) => t.ticket_id === ticket.ticket_id && t.state === "ARRIVED",
      ),
    "physical arrival MQTT",
  );
  assert.equal(
    arrived.response_time_ms,
    Date.parse(arrived.arrived_at) - Date.parse(arrived.created_at),
  );
  const ahtBefore = (await api("/metrics")).aht_by_zone.B;
  await sleep(350);
  await api(`/tickets/${ticket.ticket_id}/done`, { staff_id: "NV02" });
  const resolved = await waitFor(
    (s) =>
      s.tickets.find(
        (t) => t.ticket_id === ticket.ticket_id && t.state === "RESOLVED",
      ),
    "DONE after arrived",
  );
  const ahtAfter = (await api("/metrics")).aht_by_zone.B;
  assert(
    Math.abs(
      ahtAfter - ((0.3 * resolved.service_time_ms) / 1000 + 0.7 * ahtBefore),
    ) < 0.001,
    "live EWMA exact",
  );
  await publish(
    event("B01", "CSAT", { gesture: "short", rating: "SATISFIED" }),
  );
  await waitFor(
    (s) =>
      s.tickets.find(
        (t) => t.ticket_id === ticket.ticket_id && t.csat === "SATISFIED",
      ),
    "CSAT",
  );
  const cancelTicket = (await api("/state")).tickets.find(
    (t) => t.device_id === "C01",
  );
  await publish(event("C01", "CANCEL_REQUEST", { gesture: "double" }));
  await waitFor(
    (s) =>
      s.tickets.find(
        (t) =>
          t.ticket_id === cancelTicket.ticket_id && t.state === "CANCELLED",
      ),
    "double-press cancellation",
  );
  await api("/demo/clock", {
    action: "set",
    datetime: "2026-10-09T17:45:00+07:00",
    speed: 60,
  });
  await api("/demo/clock", { action: "pause" });
  const fc = await api("/forecast");
  assert(
    fc.zones.find((z) => z.zone === "A").lambda_per_minute > 0,
    "reads synthetic history",
  );
  assert(fc.recommendations.length > 0, "staffing recommendations exist");
  console.log(
    "PASS priority_demo: global queue, payment priority, dedup, dispatch, 409 guards, ACK downlink, ARRIVED, response, DONE, EWMA, CSAT, cancel, forecast.",
  );
}
async function duplicateDemo() {
  await reset();
  const payload = event("A01", "REQUEST", {
    intent: "CONSULTATION",
    gesture: "short",
  });
  for (let i = 0; i < 5; i++) await publish(payload);
  const ticket = await waitFor(
    (s) => s.tickets.find((t) => t.device_id === "A01"),
    "single ticket",
  );
  await sleep(350);
  assert.equal((await api("/state")).tickets.length, 1);
  await waitForMessage(
    (m) => m.payload.receipt_msg_id === payload.msg_id,
    "server receipt observed",
  );
  console.log(
    `PASS duplicate_demo: ${ticket.ticket_id}, five deliveries -> one ticket and receipt.`,
  );
}
async function escalationDemo() {
  await reset({ NV01: "AVAILABLE", NV02: "OFFLINE", NV03: "AVAILABLE" });
  await publish(
    event("A01", "REQUEST", { intent: "CONSULTATION", gesture: "short" }),
  );
  const first = await waitFor(
    (s) => s.tickets.find((t) => t.device_id === "A01" && t.assigned_staff_id),
    "first assignment",
  );
  assert.equal(first.assigned_staff_id, "NV01");
  await waitFor(
    (s) =>
      s.tickets.find(
        (t) => t.device_id === "A01" && t.assigned_staff_id === "NV03",
      ),
    "reassignment to next staff",
    13000,
  );
  await waitFor(
    (s) =>
      s.tickets.find(
        (t) => t.device_id === "A01" && t.state === "ESCALATED_L1",
      ),
    "L1 exhaustion",
    12000,
  );
  await waitFor(
    (s) =>
      s.tickets.find(
        (t) => t.device_id === "A01" && t.state === "ESCALATED_L2",
      ),
    "L2 manager escalation",
    14000,
  );
  await waitForMessage(
    (m) =>
      m.topic === `${BASE}/system/alert` && m.payload.type === "ESCALATED_L2",
    "L2 alert publish",
  );
  console.log(
    "PASS escalation_demo: NV01 -> NV03 timeout reassignment -> L1 -> L2 MQTT alert.",
  );
}
async function spamDemo() {
  await reset();
  await publish(
    event("A01", "REQUEST", { intent: "CONSULTATION", gesture: "short" }),
  );
  await waitFor((s) => s.tickets.length === 1, "initial ticket");
  for (let i = 0; i < 6; i++)
    await publish(
      event("A01", "REQUEST", { intent: "CONSULTATION", gesture: "short" }),
    );
  await sleep(500);
  assert.equal((await api("/state")).tickets.length, 1);
  await waitForMessage(
    (m) =>
      m.payload.type === "SPAM_DETECTED" || m.payload.state === "SPAM_LOCK",
    "spam lock/alert",
  );
  console.log(
    "PASS spam_demo: repeated new-ID suspicious requests -> alert/lock, no new tickets.",
  );
}
async function abnormalDemo() {
  await reset({ NV01: "OFFLINE", NV02: "OFFLINE", NV03: "OFFLINE" });
  await publish(
    event("A01", "REQUEST", { gesture: "short", intent: "CONSULTATION" }),
  );
  await waitFor((s) => s.metrics.overload, "overload when no staff on duty");
  await publish(
    event("B01", "REQUEST", { gesture: "short", intent: "CONSULTATION" }),
    `${BASE}/cp/A01/event`,
  );
  await publish(
    event("X01", "REQUEST", { gesture: "short", intent: "CONSULTATION" }),
  );
  await new Promise((resolve, reject) =>
    client.publish(`${BASE}/cp/B01/event`, "{bad json", { qos: 1 }, (error) =>
      error ? reject(error) : resolve(),
    ),
  );
  await sleep(500);
  const state = await api("/state");
  assert.equal(
    state.tickets.length,
    1,
    "malformed/unknown/topic mismatch rejected",
  );
  assert(Number.isFinite(state.queue[0].eta_seconds), "safe ETA without staff");
  await api("/staff/UNKNOWN/status", { status: "AVAILABLE" }, 404);
  await api("/staff/NV01/status", { status: "TYPO" }, 400);
  await api("/demo/clock", { action: "set", datetime: "invalid" }, 400);
  const health = await api("/health");
  assert.equal(
    health.telegram?.enabled ?? state.telegram?.enabled,
    false,
    "empty token gracefully disabled",
  );
  console.log(
    "PASS abnormal_demo: overload, safe ETA, schema/topic guards, HTTP400/404, Telegram disabled.",
  );
}
const CAMERA_HEARTBEAT_MS = 1000;
const DEMO_ABANDON_MS = 10000;
const DEMO_ESCALATION_L1_MS = 15000;
const cameras = new Map();
const cameraErrors = [];
const visionKey = ({ online, persons, camera_id, footfall }) => ({
  online,
  persons,
  camera_id,
  footfall,
});
function visionReading(zone, persons, overrides = {}) {
  return {
    schema: 1,
    camera_id: `CAM-${zone}`,
    zone,
    persons,
    confidence: 0.9,
    ts: new Date().toISOString(),
    ...overrides,
  };
}
function publishRaw(topic, text) {
  return new Promise((resolve, reject) =>
    client.publish(topic, text, { qos: 1 }, (error) =>
      error ? reject(error) : resolve(),
    ),
  );
}
async function setCameraPersons(zone, persons) {
  cameras.get(zone).persons = persons;
  await publish(visionReading(zone, persons), `${BASE}/vision/${zone}`);
}
async function startCamera(zone, persons) {
  stopCamera(zone);
  const camera = { persons, timer: null };
  camera.timer = setInterval(() => {
    publish(
      visionReading(zone, camera.persons),
      `${BASE}/vision/${zone}`,
    ).catch((error) => cameraErrors.push(error.message));
  }, CAMERA_HEARTBEAT_MS);
  cameras.set(zone, camera);
  await setCameraPersons(zone, persons);
}
function stopCamera(zone) {
  const camera = cameras.get(zone);
  if (!camera) return;
  clearInterval(camera.timer);
  cameras.delete(zone);
}
function stopAllCameras() {
  for (const zone of [...cameras.keys()]) stopCamera(zone);
}
async function requestFrom(deviceId) {
  const known = (await api("/state")).tickets.length;
  await publish(
    event(deviceId, "REQUEST", { gesture: "short", intent: "CONSULTATION" }),
  );
  return waitFor(
    (s) => (s.tickets.length > known ? s.tickets.at(-1) : null),
    `${deviceId} ticket created`,
  );
}
function waitForTicket(ticketId, predicate, description, timeout = 10000) {
  return waitFor(
    (s) => {
      const t = s.tickets.find((x) => x.ticket_id === ticketId);
      return t && predicate(t) ? t : null;
    },
    description,
    timeout,
  );
}
function waitForAlert(type, ticketId, description) {
  return waitForMessage(
    (m) =>
      m.topic === `${BASE}/system/alert` &&
      m.payload.type === type &&
      m.payload.ticket_id === ticketId,
    description,
  );
}
async function visionDemo() {
  await reset({ NV01: "AVAILABLE" });
  try {
    await startCamera("A", 1);
    await waitFor(
      (s) => s.vision.A.online && s.vision.A.persons === 1,
      "camera A online with one person",
    );
    // Verified request, then arrival verified with customer plus staff.
    const verified = await requestFrom("A01");
    assert.equal(verified.presence_verified, true, "A=1 must verify request");
    await waitForTicket(
      verified.ticket_id,
      (t) => t.assigned_staff_id === "NV01",
      "NV01 dispatched",
    );
    await api(`/tickets/${verified.ticket_id}/ack`, { staff_id: "NV01" });
    await setCameraPersons("A", 2);
    await waitFor((s) => s.vision.A.persons === 2, "camera A sees two people");
    await publish(event("A01", "STAFF_ARRIVED"));
    const arrived = await waitForTicket(
      verified.ticket_id,
      (t) => t.state === "ARRIVED",
      "ARRIVED with camera A=2",
    );
    assert.equal(arrived.arrival_verified, true, "A=2 must verify arrival");
    await api(`/tickets/${verified.ticket_id}/done`, { staff_id: "NV01" });
    await publish(
      event("A01", "CSAT", { gesture: "short", rating: "SATISFIED" }),
    );
    await waitForTicket(
      verified.ticket_id,
      (t) => t.csat === "SATISFIED",
      "CSAT closes A01 cycle",
    );

    // Abandoned: camera A keeps reporting an empty zone after the request.
    await setCameraPersons("A", 0);
    const abandoned = await requestFrom("A01");
    const cancelled = await waitForTicket(
      abandoned.ticket_id,
      (t) => t.state === "CANCELLED",
      "abandoned ticket auto-cancelled",
      15000,
    );
    assert.equal(cancelled.cancel_reason, "ABANDONED_VISION");
    const lifetimeMs =
      Date.parse(cancelled.cancelled_at) - Date.parse(cancelled.created_at);
    assert(
      lifetimeMs >= DEMO_ABANDON_MS && lifetimeMs < DEMO_ESCALATION_L1_MS,
      `cancelled after ${lifetimeMs} ms, expected 10000-15000`,
    );
    await waitForAlert(
      "TICKET_ABANDONED",
      abandoned.ticket_id,
      "TICKET_ABANDONED alert",
    );
    await waitFor(
      (s) => s.devices.A01.state === "READY",
      "A01 back to READY",
      5000,
    );
    stopCamera("A");

    // Unverified: camera B sees nobody when the customer presses.
    await startCamera("B", 0);
    await waitFor(
      (s) => s.vision.B.online && s.vision.B.persons === 0,
      "camera B online and empty",
    );
    const unverified = await requestFrom("B01");
    assert.equal(unverified.presence_verified, false, "B=0 must flag request");
    await waitForAlert(
      "UNVERIFIED_REQUEST",
      unverified.ticket_id,
      "UNVERIFIED_REQUEST alert",
    );
    await publish(event("B01", "CANCEL_REQUEST"));
    await waitForTicket(
      unverified.ticket_id,
      (t) => t.state === "CANCELLED" && t.cancel_reason === "CUSTOMER",
      "customer cancels unverified ticket",
    );

    // Arrival not verified: staff arrives but camera B only sees the customer.
    await setCameraPersons("B", 1);
    await waitFor((s) => s.vision.B.persons === 1, "camera B sees one person");
    const single = await requestFrom("B01");
    assert.equal(single.presence_verified, true, "B=1 must verify request");
    await waitForTicket(
      single.ticket_id,
      (t) => t.assigned_staff_id === "NV01",
      "NV01 dispatched for B01",
    );
    await api(`/tickets/${single.ticket_id}/ack`, { staff_id: "NV01" });
    await publish(event("B01", "STAFF_ARRIVED"));
    const lonely = await waitForTicket(
      single.ticket_id,
      (t) => t.state === "ARRIVED",
      "ARRIVED with camera B=1",
    );
    assert.equal(lonely.arrival_verified, false, "B=1 must not verify arrival");
    await waitForAlert(
      "ARRIVAL_UNVERIFIED",
      single.ticket_id,
      "ARRIVAL_UNVERIFIED alert",
    );
    await api(`/tickets/${single.ticket_id}/done`, { staff_id: "NV01" });
    await publish(
      event("B01", "CSAT", { gesture: "short", rating: "SATISFIED" }),
    );
    await waitForTicket(
      single.ticket_id,
      (t) => t.csat === "SATISFIED",
      "CSAT closes B01 cycle",
    );

    // Stale: heartbeats stop, camera goes offline, the waiting ticket survives.
    await startCamera("A", 1);
    await waitFor(
      (s) => s.vision.A.online && s.vision.A.persons === 1,
      "camera A back online",
    );
    const stale = await requestFrom("A01");
    assert.equal(stale.presence_verified, true, "A=1 must verify request");
    stopCamera("A");
    await waitFor(
      (s) => !s.vision.A.online,
      "camera A stale after heartbeats stop",
      15000,
    );
    const afterStale = await api("/state");
    assert.equal(afterStale.vision.A.persons, null, "stale count is unknown");
    const kept = afterStale.tickets.find(
      (t) => t.ticket_id === stale.ticket_id,
    );
    assert.notEqual(kept.state, "CANCELLED", "stale camera must not cancel");
    assert.equal(kept.cancel_reason, null);
    await publish(event("A01", "CANCEL_REQUEST"));
    await waitForTicket(
      stale.ticket_id,
      (t) => t.state === "CANCELLED",
      "customer cancels stale-camera ticket",
    );

    // Invalid payloads are rejected and leave camera B unchanged.
    const topic = `${BASE}/vision/B`;
    const beforeInvalid = visionKey((await api("/state")).vision.B);
    assert.equal(beforeInvalid.persons, 1, "camera B running at one person");
    const invalidPayloads = [
      visionReading("A", 3),
      visionReading("B", -1),
      visionReading("B", 1.5),
      visionReading("B", 51),
      visionReading("B", 2, { schema: 2 }),
      visionReading("B", 2, { camera_id: "bad id!" }),
      visionReading("X", 2),
    ];
    for (const payload of invalidPayloads)
      await publishRaw(topic, JSON.stringify(payload));
    await publishRaw(topic, "{bad json");
    await sleep(1000);
    const afterInvalid = visionKey((await api("/state")).vision.B);
    assert.deepEqual(
      afterInvalid,
      beforeInvalid,
      "rejected payloads must not change camera state",
    );
    assert.deepEqual(cameraErrors, [], "camera heartbeat publish failed");
  } finally {
    stopAllCameras();
    await api("/demo/reset", { reset_metrics: true });
  }
  console.log(
    "PASS vision: verified request, abandoned auto-cancel, unverified request, arrival true/false, stale camera, invalid payloads.",
  );
}
async function main() {
  const name = process.argv[2] || "priority_demo";
  const scenarios = {
    priority_demo: priorityDemo,
    duplicate_demo: duplicateDemo,
    escalation_demo: escalationDemo,
    spam_demo: spamDemo,
    abnormal_demo: abnormalDemo,
    vision: visionDemo,
  };
  if (name !== "all" && !scenarios[name])
    throw new Error(`Unknown scenario ${name}`);
  client = mqtt.connect(`mqtt://${HOST}:${PORT}`, {
    clientId: `scenario-${bootId}`,
    reconnectPeriod: 0,
    connectTimeout: 5000,
  });
  client.on("message", (topic, buffer) => {
    try {
      received.push({ topic, payload: JSON.parse(buffer.toString()) });
    } catch {
      /* negative JSON test */
    }
  });
  await new Promise((resolve, reject) => {
    client.once("connect", resolve);
    client.once("error", reject);
  });
  await new Promise((resolve, reject) =>
    client.subscribe(
      [
        `${BASE}/queue`,
        `${BASE}/cp/+/cmd`,
        `${BASE}/system/metrics`,
        `${BASE}/system/alert`,
      ],
      { qos: 1 },
      (error) => (error ? reject(error) : resolve()),
    ),
  );
  if (name === "all") {
    for (const scenario of Object.values(scenarios)) await scenario();
  } else await scenarios[name]();
  await api("/demo/reset", { reset_metrics: true });
  console.log("Demo reset -> READY; synthetic history preserved.");
}
main()
  .catch((error) => {
    console.error("FAIL:", error.message);
    process.exitCode = 1;
  })
  .finally(() => {
    if (client) client.end(true);
  });
