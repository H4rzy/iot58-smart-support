"use strict";

const ZONES = ["A", "B", "C"];
const DAY = 86400000;

// Store clock fixed at UTC+7; independent of the laptop/docker host timezone.
function storeParts(value, offsetMinutes = 420) {
  const date = new Date(new Date(value).getTime() + offsetMinutes * 60000);
  if (!Number.isFinite(date.getTime()))
    throw new RangeError("Invalid forecast date");
  return {
    day: date.getUTCDay(),
    hour: date.getUTCHours(),
    date: date.toISOString().slice(0, 10),
  };
}

function lambda(history, zone, target, offsetMinutes = 420) {
  const targetMs = new Date(target).getTime();
  const parts = storeParts(target, offsetMinutes);
  const localTarget = targetMs + offsetMinutes * 60000;
  const dayStart = Math.floor(localTarget / DAY) * DAY - offsetMinutes * 60000;
  // Four prior matching weekdays; empty weeks contribute zero, preventing selection bias.
  const matchingDates = new Set(
    [7, 14, 21, 28].map(
      (days) => storeParts(dayStart - days * DAY, offsetMinutes).date,
    ),
  );
  let count = 0;
  for (const row of history || []) {
    if (row.zone !== zone) continue;
    const time = Date.parse(row.timestamp);
    if (!Number.isFinite(time) || time >= targetMs) continue;
    const candidate = storeParts(time, offsetMinutes);
    if (matchingDates.has(candidate.date) && candidate.hour === parts.hour)
      count++;
  }
  return count / 4 / 60;
}

function requiredStaff(arrivalRatePerMinute, ahtSeconds, utilization = 0.8) {
  if (
    ![arrivalRatePerMinute, ahtSeconds, utilization].every(Number.isFinite) ||
    arrivalRatePerMinute < 0 ||
    ahtSeconds < 0 ||
    utilization <= 0 ||
    utilization > 1
  )
    throw new RangeError("Invalid staffing input");
  return Math.ceil((arrivalRatePerMinute * (ahtSeconds / 60)) / utilization);
}

function forecast(
  history,
  now = new Date(),
  aht = {},
  staff = [],
  config = {},
) {
  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(nowMs)) throw new RangeError("Invalid forecast clock");
  const horizonMinutes =
    config.forecast_horizon_minutes ?? config.forecastHorizonMinutes ?? 15;
  const offsetMinutes =
    config.store_timezone_offset_minutes ??
    config.storeTimezoneOffsetMinutes ??
    420;
  const at = new Date(nowMs + horizonMinutes * 60000);
  const targetParts = storeParts(at, offsetMinutes);
  const targetUtilization =
    config.target_utilization ?? config.targetUtilization ?? 0.8;
  staff = Array.isArray(staff) ? staff : Object.values(staff || {});
  // Each on-duty person is allocated to one primary scheduled zone, never counted in three zones.
  const onDutyByZone = Object.fromEntries(ZONES.map((zone) => [zone, 0]));
  for (const person of staff) {
    if (person.status === "OFFLINE") continue;
    const primary =
      person.scheduled_zone || person.current_zone || person.zones?.[0];
    if (ZONES.includes(primary)) onDutyByZone[primary]++;
  }
  const zones = ZONES.map((zone) => {
    const rate = lambda(history, zone, at, offsetMinutes);
    const ahtSeconds =
      aht[zone] ??
      config.aht_default_seconds ??
      config.ahtDefaultSeconds ??
      120;
    const required = requiredStaff(rate, ahtSeconds, targetUtilization);
    const additional = Math.max(0, required - onDutyByZone[zone]);
    return {
      zone,
      lambda_per_minute: rate,
      aht_seconds: ahtSeconds,
      required_staff: required,
      staff_on_duty: onDutyByZone[zone],
      additional_staff: additional,
      recommendation: additional
        ? `Khu ${zone} dự kiến cao điểm lúc ${String(targetParts.hour).padStart(2, "0")}:00, cần thêm ${additional} nhân viên.`
        : `Khu ${zone}: nhân sự hiện tại đáp ứng dự báo.`,
    };
  });
  return {
    at: at.toISOString(),
    now: new Date(nowMs).toISOString(),
    synthetic: true,
    horizon_minutes: horizonMinutes,
    target_utilization: targetUtilization,
    zones,
    recommendations: zones
      .filter((row) => row.additional_staff > 0)
      .map((row) => row.recommendation),
    history_rows: (history || []).length,
    note: "Dữ liệu giả lập để chứng minh thuật toán, không phải dữ liệu thực tế.",
  };
}

class VirtualClock {
  constructor(now = Date.now(), state) {
    this.baseReal = now;
    this.baseVirtual = state?.datetime ? Date.parse(state.datetime) : now;
    this.speed = state?.speed ?? 1;
    this.running = state?.running ?? true;
  }
  time(realNow = Date.now()) {
    return (
      this.baseVirtual +
      (this.running ? (realNow - this.baseReal) * this.speed : 0)
    );
  }
  update(command, realNow = Date.now()) {
    if (
      !command ||
      !["start", "pause", "reset", "set"].includes(command.action)
    )
      throw new RangeError("Invalid clock action");
    if (command.speed !== undefined && ![1, 10, 60].includes(command.speed))
      throw new RangeError("Clock speed must be 1,10,60");
    if (
      command.datetime !== undefined &&
      !Number.isFinite(Date.parse(command.datetime))
    )
      throw new RangeError("Invalid clock datetime");
    this.baseVirtual = this.time(realNow);
    this.baseReal = realNow;
    if (command.action === "reset") {
      this.baseVirtual = realNow;
      this.speed = 1;
      this.running = true;
    }
    if (command.action === "set") {
      if (!command.datetime)
        throw new RangeError("Set clock requires datetime");
      this.baseVirtual = Date.parse(command.datetime);
    }
    if (command.speed !== undefined) this.speed = command.speed;
    if (command.action === "start") this.running = true;
    if (command.action === "pause") this.running = false;
    return this.snapshot(realNow);
  }
  snapshot(realNow = Date.now()) {
    return {
      datetime: new Date(this.time(realNow)).toISOString(),
      speed: this.speed,
      running: this.running,
    };
  }
}

module.exports = { storeParts, lambda, requiredStaff, forecast, VirtualClock };
