"use strict";
const WAITING = new Set(["PENDING", "ESCALATED_L1", "ESCALATED_L2"]);
const ACTIVE = new Set([...WAITING, "ACKNOWLEDGED", "ARRIVED"]);
function iso(now) {
  return new Date(now).toISOString();
}
function millis(value) {
  return value ? new Date(value).getTime() : 0;
}
function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}
module.exports = { WAITING, ACTIVE, iso, millis, fail };
