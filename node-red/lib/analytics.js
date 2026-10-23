"use strict";

const WAITING = new Set(["PENDING", "ESCALATED_L1", "ESCALATED_L2"]);
const ACTIVE = new Set([...WAITING, "ACKNOWLEDGED", "ARRIVED"]);
const ZONES = ["A", "B", "C"];

function ewma(previous, latest, alpha = 0.3) {
  if (
    ![previous, latest, alpha].every(Number.isFinite) ||
    previous < 0 ||
    latest < 0 ||
    alpha < 0 ||
    alpha > 1
  ) {
    throw new RangeError("AHT values must be nonnegative and alpha in [0,1]");
  }
  return alpha * latest + (1 - alpha) * previous;
}

function eta(rank, freeStaff, ahtSeconds) {
  if (
    ![rank, freeStaff, ahtSeconds].every(Number.isFinite) ||
    rank < 0 ||
    ahtSeconds < 0
  )
    throw new RangeError("Invalid ETA input");
  return Math.ceil(rank / Math.max(1, freeStaff)) * ahtSeconds;
}

// Nearest-rank percentile; null is rendered N/A, never a fabricated zero.
function percentile(values, probability = 0.9) {
  if (probability <= 0 || probability > 1)
    throw new RangeError("Percentile in (0,1]");
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length
    ? sorted[Math.ceil(probability * sorted.length) - 1]
    : null;
}

function isOverloaded(waiting, onDuty, multiplier = 2) {
  return waiting > Math.max(0, onDuty) * multiplier;
}

function mean(values) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}
function freeStaff(staff) {
  return staff.filter(
    (person) =>
      person.status === "AVAILABLE" &&
      !person.current_ticket &&
      !person.current_ticket_id &&
      !(person.active_tickets > 0),
  );
}

function computeMetrics(tickets, staff, aht, now = Date.now(), config = {}) {
  tickets = Array.isArray(tickets) ? tickets : Object.values(tickets || {});
  staff = Array.isArray(staff) ? staff : Object.values(staff || {});
  // Only ARRIVED/RESOLVED have a physical response measurement. ACK never substitutes it.
  const measured = tickets.filter(
    (t) => Number.isFinite(t.response_time_ms) && t.response_time_ms >= 0,
  );
  const responses = measured.map((t) => t.response_time_ms / 1000);
  const slaSeconds =
    config.response_sla_seconds ??
    config.responseSlaSeconds ??
    config.slaSeconds ??
    120;
  const slaBreached = tickets.filter(
    (t) =>
      t.state !== "CANCELLED" &&
      (Number.isFinite(t.response_time_ms)
        ? t.response_time_ms > slaSeconds * 1000
        : ACTIVE.has(t.state) &&
          Math.max(0, Number(now) - Date.parse(t.created_at)) >
            slaSeconds * 1000),
  );
  const slaEligible = tickets.filter((t) => t.state !== "CANCELLED");
  const ratings = tickets.filter((t) =>
    ["SATISFIED", "UNSATISFIED"].includes(t.csat),
  );
  const waiting = tickets.filter((t) => WAITING.has(t.state)).length;
  const onDuty = staff.filter((s) => s.status !== "OFFLINE").length;
  const byZone = {};
  for (const zone of ZONES) {
    const zoneResponses = measured
      .filter((t) => t.zone === zone)
      .map((t) => t.response_time_ms / 1000);
    byZone[zone] = {
      avg_response_seconds: mean(zoneResponses),
      p90_response_seconds: percentile(zoneResponses),
      completed: tickets.filter(
        (t) => t.zone === zone && t.state === "RESOLVED",
      ).length,
      aht_seconds:
        aht?.[zone] ??
        config.aht_default_seconds ??
        config.ahtDefaultSeconds ??
        120,
      avg_service_seconds: mean(
        tickets
          .filter(
            (t) =>
              t.zone === zone &&
              t.state === "RESOLVED" &&
              Number.isFinite(t.service_time_ms),
          )
          .map((t) => t.service_time_ms / 1000),
      ),
    };
  }
  return {
    waiting_tickets: waiting,
    active_tickets: tickets.filter((t) => ACTIVE.has(t.state)).length,
    escalated_tickets: tickets.filter((t) => t.state.startsWith("ESCALATED"))
      .length,
    avg_response_seconds: mean(responses),
    p90_response_seconds: percentile(responses),
    sla_violation_percent: slaEligible.length
      ? (slaBreached.length / slaEligible.length) * 100
      : null,
    csat_percent: ratings.length
      ? (ratings.filter((t) => t.csat === "SATISFIED").length /
          ratings.length) *
        100
      : null,
    available_staff: freeStaff(staff).length,
    on_duty_staff: onDuty,
    overload: isOverloaded(
      waiting,
      onDuty,
      config.overload_multiplier ?? config.overloadMultiplier ?? 2,
    ),
    aht_by_zone: { ...aht },
    response_by_zone: byZone,
    requests_by_intent: Object.fromEntries(
      ["CONSULTATION", "PAYMENT"].map((intent) => [
        intent,
        tickets.filter((t) => t.intent === intent).length,
      ]),
    ),
    requests_by_zone: Object.fromEntries(
      ZONES.map((zone) => [
        zone,
        tickets.filter((t) => t.zone === zone).length,
      ]),
    ),
    requests_by_hour: Object.fromEntries(
      Array.from({ length: 24 }, (_, hour) => [
        hour,
        tickets.filter((t) => {
          const date = new Date(Date.parse(t.created_at) + 7 * 3600000);
          return date.getUTCHours() === hour;
        }).length,
      ]),
    ),
    sample_count: responses.length,
    resolved_count: tickets.filter((t) => t.state === "RESOLVED").length,
    as_of: new Date(now).toISOString(),
    response_sla_seconds: slaSeconds,
  };
}

module.exports = {
  ewma,
  eta,
  percentile,
  isOverloaded,
  computeMetrics,
  freeStaff,
  WAITING,
  ACTIVE,
};
