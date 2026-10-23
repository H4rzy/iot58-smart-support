"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const vision = require("../lib/vision");
const { loadConfig } = require("../lib/config");

const config = loadConfig({});
const TOPIC = `${config.baseTopic}/vision/A`;
const event = (overrides = {}) => ({
  schema: 1,
  camera_id: "CAM-A",
  zone: "A",
  persons: 2,
  confidence: 0.87,
  ts: "2026-10-24T10:00:00.000Z",
  ...overrides,
});
const rejects = (fn, status, message) =>
  assert.throws(fn, (error) => {
    assert.equal(error.status, status);
    assert.equal(error.message, message);
    return true;
  });

test("T-V1 validateVision accepts a well-formed reading in all input forms", () => {
  const ok = event();
  assert.deepEqual(vision.validateVision(TOPIC, ok, config), ok);
  assert.deepEqual(
    vision.validateVision(TOPIC, JSON.stringify(ok), config),
    ok,
  );
  assert.deepEqual(
    vision.validateVision(TOPIC, Buffer.from(JSON.stringify(ok)), config),
    ok,
  );
  for (const persons of [0, 50])
    assert.equal(
      vision.validateVision(TOPIC, event({ persons }), config).persons,
      persons,
    );
});

test("T-V1 validateVision rejects wrong schema", () => {
  rejects(
    () => vision.validateVision(TOPIC, event({ schema: 2 }), config),
    400,
    "Unsupported schema",
  );
  rejects(
    () => vision.validateVision(TOPIC, event({ schema: "1" }), config),
    400,
    "Unsupported schema",
  );
  rejects(
    () => vision.validateVision(TOPIC, "null", config),
    400,
    "Unsupported schema",
  );
});

test("T-V1 validateVision rejects unknown zone", () => {
  rejects(
    () =>
      vision.validateVision(
        `${config.baseTopic}/vision/D`,
        event({ zone: "D" }),
        config,
      ),
    400,
    "Unknown zone",
  );
  rejects(
    () => vision.validateVision(TOPIC, event({ zone: undefined }), config),
    400,
    "Unknown zone",
  );
});

test("T-V1 validateVision rejects topic and zone mismatch", () => {
  rejects(
    () =>
      vision.validateVision(
        `${config.baseTopic}/vision/B`,
        event({ zone: "A" }),
        config,
      ),
    400,
    "Topic/zone mismatch",
  );
  rejects(
    () => vision.validateVision("other/topic/vision/A", event(), config),
    400,
    "Topic/zone mismatch",
  );
});

test("T-V1 validateVision rejects invalid camera_id", () => {
  for (const camera_id of ["", "CAM A", "CAM/A", "x".repeat(65), 7, null])
    rejects(
      () => vision.validateVision(TOPIC, event({ camera_id }), config),
      400,
      "Invalid camera_id",
    );
  assert.equal(
    vision.validateVision(TOPIC, event({ camera_id: "x".repeat(64) }), config)
      .camera_id.length,
    64,
  );
});

test("T-V1 validateVision rejects negative, non-integer and over-50 persons", () => {
  for (const persons of [-1, 1.5, 51, "2", null, Number.NaN])
    rejects(
      () => vision.validateVision(TOPIC, event({ persons }), config),
      400,
      "Invalid persons",
    );
});

test("T-V1 validateVision rejects oversized payload before parsing", () => {
  const small = loadConfig({ PAYLOAD_MAX_BYTES: "256" });
  const big = JSON.stringify(event({ pad: "x".repeat(400) }));
  rejects(
    () => vision.validateVision(TOPIC, big, small),
    400,
    "Payload too large",
  );
});

test("T-V1 validateVision rejects malformed JSON", () => {
  rejects(
    () => vision.validateVision(TOPIC, "{not json", config),
    400,
    "Malformed JSON",
  );
  rejects(
    () => vision.validateVision(TOPIC, "", config),
    400,
    "Malformed JSON",
  );
});

test("T-V2 applyReading footfall only grows when the count rises", () => {
  const zone = vision.freshVision().A;
  assert.equal(vision.applyReading(zone, 2, "CAM-A", 1000), 2);
  assert.equal(zone.footfall, 2);
  assert.equal(vision.applyReading(zone, 2, "CAM-A", 2000), 0);
  assert.equal(vision.applyReading(zone, 1, "CAM-A", 3000), 0);
  assert.equal(zone.footfall, 2);
  assert.equal(vision.applyReading(zone, 3, "CAM-A", 4000), 2);
  assert.equal(zone.footfall, 4);
  assert.equal(vision.applyReading(zone, 0, "CAM-A", 5000), 0);
  assert.equal(zone.footfall, 4);
  assert.equal(vision.applyReading(zone, 1, "CAM-A", 6000), 1);
  assert.equal(zone.footfall, 5);
});

test("T-V2 applyReading moves empty_since and occupied_since correctly", () => {
  const zone = vision.freshVision().A;
  vision.applyReading(zone, 0, "CAM-A", 1000);
  assert.equal(zone.empty_since, 1000);
  assert.equal(zone.occupied_since, null);

  vision.applyReading(zone, 1, "CAM-A", 2000);
  assert.equal(zone.occupied_since, 2000);
  assert.equal(zone.empty_since, null);

  vision.applyReading(zone, 2, "CAM-A", 3000);
  assert.equal(zone.occupied_since, 2000, "occupied start kept while occupied");

  vision.applyReading(zone, 0, "CAM-A", 4000);
  assert.equal(zone.empty_since, 4000);
  assert.equal(zone.occupied_since, null);

  vision.applyReading(zone, 0, "CAM-A", 5000);
  assert.equal(zone.empty_since, 4000, "empty start kept while empty");
  assert.equal(zone.persons, 0);
  assert.equal(zone.camera_id, "CAM-A");
  assert.equal(zone.updated_at, 5000);
});

test("T-V3 no reading means presence and arrival are null and abandon is false", () => {
  const zone = vision.freshVision().A;
  const now = 1_000_000;
  assert.equal(vision.isFresh(zone, now, config), false);
  assert.equal(vision.presence(zone, now, config), null);
  assert.equal(vision.arrivalVerified(zone, now, config), null);
  assert.equal(vision.isAbandoned(zone, 0, now, config), false);
  assert.equal(vision.needsProactiveAssist(zone, now, config), false);
  assert.equal(vision.presence(undefined, now, config), null);
});

test("T-V3 stale reading (older than VISION_STALE_SECONDS) is fail-open", () => {
  const zone = vision.freshVision().A;
  vision.applyReading(zone, 0, "CAM-A", 1000);
  const staleAt = 1000 + config.visionStaleSeconds * 1000 + 1;
  assert.equal(vision.isFresh(zone, staleAt, config), false);
  assert.equal(vision.presence(zone, staleAt, config), null);
  assert.equal(vision.arrivalVerified(zone, staleAt, config), null);
  assert.equal(
    vision.isAbandoned(zone, 0, staleAt, config),
    false,
    "stale camera must never cancel",
  );
  assert.equal(vision.needsProactiveAssist(zone, staleAt, config), false);
});

test("T-V3 freshness boundary is inclusive at exactly VISION_STALE_SECONDS", () => {
  const zone = vision.freshVision().A;
  vision.applyReading(zone, 1, "CAM-A", 1000);
  const edge = 1000 + config.visionStaleSeconds * 1000;
  assert.equal(vision.isFresh(zone, edge, config), true);
  assert.equal(vision.isFresh(zone, edge + 1, config), false);
});

test("T-V3 presence is true with a person, false when empty, arrival needs two", () => {
  const zone = vision.freshVision().A;
  vision.applyReading(zone, 0, "CAM-A", 1000);
  assert.equal(vision.presence(zone, 1000, config), false);
  vision.applyReading(zone, 1, "CAM-A", 2000);
  assert.equal(vision.presence(zone, 2000, config), true);
  assert.equal(vision.arrivalVerified(zone, 2000, config), false);
  vision.applyReading(zone, 2, "CAM-A", 3000);
  assert.equal(vision.arrivalVerified(zone, 3000, config), true);
});

// Re-sends the reading at `at` so the camera stays fresh while time moves on.
function sendAt(zone, persons, at) {
  vision.applyReading(zone, persons, "CAM-A", at);
  return at;
}

test("isAbandoned counts only from max(empty_since, created_at) and needs the full threshold", () => {
  const zone = vision.freshVision().A;
  const abandon = config.visionThresholds().abandon * 1000;
  sendAt(zone, 0, 1000);
  const edge = 1000 + abandon;
  sendAt(zone, 0, edge - 1);
  assert.equal(
    vision.isAbandoned(zone, 500, edge - 1, config),
    false,
    "created before empty, one ms short",
  );
  sendAt(zone, 0, edge);
  assert.equal(
    vision.isAbandoned(zone, 500, edge, config),
    true,
    "created before empty: empty since 1000",
  );
  assert.equal(
    vision.isAbandoned(zone, 1001, edge, config),
    false,
    "ticket created after emptiness started: clock starts at creation",
  );
  sendAt(zone, 0, edge + 1);
  assert.equal(vision.isAbandoned(zone, 1001, edge + 1, config), true);
});

test("needsProactiveAssist requires continuous occupancy for the dwell threshold", () => {
  const zone = vision.freshVision().A;
  const dwell = config.visionThresholds().dwell * 1000;
  sendAt(zone, 1, 1000);
  sendAt(zone, 1, 1000 + dwell - 1);
  assert.equal(
    vision.needsProactiveAssist(zone, 1000 + dwell - 1, config),
    false,
  );
  sendAt(zone, 1, 1000 + dwell);
  assert.equal(vision.needsProactiveAssist(zone, 1000 + dwell, config), true);
  sendAt(zone, 0, 1000 + dwell);
  assert.equal(
    vision.needsProactiveAssist(zone, 1000 + dwell, config),
    false,
    "emptied zone is not dwelling",
  );
});

test("view reports offline zones as null persons, never 0", () => {
  const vis = vision.freshVision();
  vision.applyReading(vis.A, 2, "CAM-A", 1000);
  vision.applyReading(vis.B, 0, "CAM-B", 1000);
  const online = vision.view(vis, 2000, config);
  assert.equal(online.A.online, true);
  assert.equal(online.A.persons, 2);
  assert.equal(online.A.dwell_seconds, 1);
  assert.equal(online.B.persons, 0);
  assert.equal(online.C.online, false);
  assert.equal(online.C.persons, null);
  assert.equal(online.C.dwell_seconds, 0);
  const offline = vision.view(vis, 1000 + config.visionStaleSeconds * 1000 + 1, config);
  assert.equal(offline.A.online, false);
  assert.equal(offline.A.persons, null);
  assert.equal(offline.A.footfall, 2, "footfall survives offline");
});

test("freshVision creates exactly zones A, B and C", () => {
  assert.deepEqual(Object.keys(vision.freshVision()).sort(), ["A", "B", "C"]);
  assert.deepEqual(vision.ZONES, ["A", "B", "C"]);
});
