"use strict";
const { fail } = require("./utils");
const DEVICES = { A01: "A", B01: "B", C01: "C" };
const EVENTS = new Set([
  "REQUEST",
  "CANCEL_REQUEST",
  "STAFF_ARRIVED",
  "CSAT",
  "INVALID_GESTURE",
  "SPAM_DETECTED",
  "CMD_APPLIED",
  "DEVICE_SYNC",
]);
function validateEvent(topic, input, config) {
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
  if (
    !event ||
    typeof event !== "object" ||
    Array.isArray(event) ||
    event.schema !== 1
  )
    fail(400, "Unsupported schema");
  if (!DEVICES[event.device_id] || event.zone !== DEVICES[event.device_id])
    fail(400, "Unknown device/zone");
  if (topic !== `${config.baseTopic}/cp/${event.device_id}/event`)
    fail(400, "Topic/device mismatch");
  if (typeof event.msg_id !== "string" || !/^[-\w]{1,128}$/.test(event.msg_id))
    fail(400, "Invalid msg_id");
  if (["__proto__", "constructor", "prototype"].includes(event.msg_id))
    fail(400, "Reserved msg_id");
  if (
    event.ticket_id !== undefined &&
    (typeof event.ticket_id !== "string" ||
      !/^[-\w]{1,128}$/.test(event.ticket_id))
  )
    fail(400, "Invalid ticket_id");
  if (
    event.cmd_id !== undefined &&
    (typeof event.cmd_id !== "string" || !/^[-\w]{1,128}$/.test(event.cmd_id))
  )
    fail(400, "Invalid cmd_id");
  if (!EVENTS.has(event.event)) fail(400, "Unknown event");
  if (
    event.event === "REQUEST" &&
    !["CONSULTATION", "PAYMENT"].includes(event.intent)
  )
    fail(400, "Invalid intent");
  if (
    event.event === "CSAT" &&
    !["SATISFIED", "UNSATISFIED"].includes(event.rating)
  )
    fail(400, "Invalid CSAT rating");
  return event;
}
module.exports = { DEVICES, EVENTS, validateEvent };
