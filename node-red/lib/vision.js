"use strict";
// Camera presence sensing. Cameras publish only person counts per zone, never
// images. Every rule fails open: a stale or missing camera disables vision
// decisions so the button workflow keeps working unchanged.
const { fail } = require("./utils");
const ZONES = ["A", "B", "C"];
const MAX_PERSONS = 50;

function validateVision(topic, input, config) {
  const raw =
    typeof input === "string"
      ? input
      : Buffer.isBuffer(input)
        ? input.toString()
        : JSON.stringify(input);
  if (Buffer.byteLength(raw) > config.payloadMaxBytes)
    fail(400, "Payload too large");
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    fail(400, "Malformed JSON");
  }
  if (!event || typeof event !== "object" || event.schema !== 1)
    fail(400, "Unsupported schema");
  if (!ZONES.includes(event.zone)) fail(400, "Unknown zone");
  if (topic !== `${config.baseTopic}/vision/${event.zone}`)
    fail(400, "Topic/zone mismatch");
  if (
    typeof event.camera_id !== "string" ||
    !/^[-\w]{1,64}$/.test(event.camera_id)
  )
    fail(400, "Invalid camera_id");
  if (
    !Number.isInteger(event.persons) ||
    event.persons < 0 ||
    event.persons > MAX_PERSONS
  )
    fail(400, "Invalid persons");
  return event;
}

function freshZone() {
  return {
    persons: 0,
    camera_id: null,
    updated_at: 0,
    empty_since: null,
    occupied_since: null,
    footfall: 0,
  };
}

function freshVision() {
  return Object.fromEntries(ZONES.map((z) => [z, freshZone()]));
}

function isFresh(zone, now, config) {
  return (
    zone.updated_at > 0 && now - zone.updated_at <= config.visionStaleSeconds * 1000
  );
}

// Applies one count reading; returns the number of newly entered persons.
function applyReading(zone, persons, cameraId, now) {
  const entered = Math.max(0, persons - zone.persons);
  zone.footfall += entered;
  if (persons === 0) {
    zone.empty_since ??= now;
    zone.occupied_since = null;
  } else {
    zone.occupied_since ??= now;
    zone.empty_since = null;
  }
  zone.persons = persons;
  zone.camera_id = cameraId;
  zone.updated_at = now;
  return entered;
}

// true = person seen, false = camera sees nobody, null = no usable camera.
function presence(zone, now, config) {
  if (!zone || !isFresh(zone, now, config)) return null;
  return zone.persons > 0;
}

// Customer plus staff means at least two people at the support point.
function arrivalVerified(zone, now, config) {
  if (!zone || !isFresh(zone, now, config)) return null;
  return zone.persons >= 2;
}

function isAbandoned(zone, createdAtMs, now, config) {
  if (!zone || !isFresh(zone, now, config) || zone.empty_since === null)
    return false;
  const emptyFrom = Math.max(zone.empty_since, createdAtMs);
  return now - emptyFrom >= config.visionThresholds().abandon * 1000;
}

function needsProactiveAssist(zone, now, config) {
  if (!zone || !isFresh(zone, now, config) || zone.occupied_since === null)
    return false;
  return now - zone.occupied_since >= config.visionThresholds().dwell * 1000;
}

function view(vision, now, config) {
  return Object.fromEntries(
    ZONES.map((z) => {
      const zone = vision[z];
      const online = isFresh(zone, now, config);
      return [
        z,
        {
          online,
          persons: online ? zone.persons : null,
          camera_id: zone.camera_id,
          footfall: zone.footfall,
          dwell_seconds:
            online && zone.occupied_since !== null
              ? Math.floor((now - zone.occupied_since) / 1000)
              : 0,
        },
      ];
    }),
  );
}

module.exports = {
  ZONES,
  validateVision,
  freshVision,
  isFresh,
  applyReading,
  presence,
  arrivalVerified,
  isAbandoned,
  needsProactiveAssist,
  view,
};
