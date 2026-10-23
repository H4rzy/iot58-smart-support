"use strict";
const { DEVICES, validateEvent } = require("./validation");
const { WAITING, ACTIVE, iso, millis, fail } = require("./utils");
const { sortQueue } = require("./priority");
const { chooseStaff, staffScore } = require("./dispatch");
const analytics = require("./analytics");
const forecasting = require("./forecast");
const vision = require("./vision");
const defaultStaff = require("../data/staff.json");

class TicketEngine {
  constructor(
    config,
    {
      now = () => Date.now(),
      state = null,
      history = [],
      audit = () => {},
    } = {},
  ) {
    this.config = config;
    this.now = now;
    this.history = history;
    this.auditSink = audit;
    this.outbox = [];
    this.dirty = false;
    this.state = state || this.freshState();
    this.state.cooldowns ||= {};
    this.state.dedup ||= {};
    this.state.alerts ||= [];
    this.state.vision ||= vision.freshVision();
    this.state.clock ||= {
      base: iso(this.now()),
      realBase: this.now(),
      speed: 1,
      running: true,
    };
    this.queue = [];
    this.metrics = {};
    this.forecast = {};
    this.lastSummary = 0;
    this.lastForecast = 0;
    this.recompute();
  }
  freshState() {
    return {
      sequence: 0,
      tickets: [],
      staff: defaultStaff.map((s) => ({
        ...s,
        zones: [...s.zones],
        tickets_assigned_this_shift: 0,
        current_ticket: null,
        last_assigned_at: null,
        active_tickets: 0,
      })),
      devices: Object.fromEntries(
        Object.keys(DEVICES).map((id) => [
          id,
          {
            state: "READY",
            ticket_id: null,
            online: false,
            lock_until: 0,
            csat_until: 0,
            presses: [],
            last_cmd: null,
          },
        ]),
      ),
      aht: {
        A: this.config.ahtDefaultSeconds,
        B: this.config.ahtDefaultSeconds,
        C: this.config.ahtDefaultSeconds,
      },
      dedup: {},
      vision: vision.freshVision(),
      alerts: [],
      cooldowns: {},
      clock: {
        base: iso(this.now()),
        realBase: this.now(),
        speed: 1,
        running: true,
      },
    };
  }
  log(type, details = {}, ticket = null) {
    const entry = { at: iso(this.now()), type, ...details };
    if (ticket) {
      entry.ticket_id = ticket.ticket_id;
      ticket.audit.push(entry);
    }
    this.auditSink(entry);
    this.dirty = true;
    return entry;
  }
  publish(suffix, payload, retain = false) {
    this.outbox.push({
      topic: `${this.config.baseTopic}/${suffix}`,
      payload: JSON.stringify(payload),
      retain,
      qos: 1,
    });
  }
  alert(type, message, details = {}, force = false) {
    const now = this.now();
    const key = `${type}:${details.device_id || details.zone || details.ticket_id || ""}`;
    if (
      !force &&
      now - (this.state.cooldowns[key] || 0) <
        this.config.alertCooldownSeconds * 1000
    )
      return;
    this.state.cooldowns[key] = now;
    const entry = this.log(type, { message, ...details });
    this.state.alerts.unshift(entry);
    this.state.alerts = this.state.alerts.slice(0, 100);
    this.publish("system/alert", entry);
  }
  active(id) {
    return this.state.tickets.find(
      (t) => t.device_id === id && ACTIVE.has(t.state),
    );
  }
  ticket(id) {
    const t = this.state.tickets.find((t) => t.ticket_id === id);
    if (!t) fail(404, "Ticket not found");
    return t;
  }
  freeStaff() {
    return this.state.staff.filter(
      (s) => s.status === "AVAILABLE" && !s.current_ticket,
    );
  }
  release(ticket, clear = true) {
    const s = this.state.staff.find(
      (s) => s.staff_id === ticket.assigned_staff_id,
    );
    if (s && s.current_ticket === ticket.ticket_id) {
      s.current_ticket = null;
      s.active_tickets = 0;
    }
    if (clear) {
      ticket.assigned_staff_id = null;
      ticket.assigned_at = null;
    }
  }
  dispatch() {
    for (const t of this.queue) {
      if (t.assigned_staff_id) continue;
      const s = chooseStaff(this.state.staff, t);
      if (!s) continue;
      t.assigned_staff_id = s.staff_id;
      t.assigned_at = iso(this.now());
      t.staff_attempts.push(s.staff_id);
      s.current_ticket = t.ticket_id;
      s.active_tickets = 1;
      s.tickets_assigned_this_shift++;
      s.last_assigned_at = t.assigned_at;
      this.log(
        t.staff_attempts.length > 1 ? "REASSIGNED" : "ASSIGNED",
        { staff_id: s.staff_id },
        t,
      );
      this.publish("system/alert", {
        type: "ASSIGNED",
        at: t.assigned_at,
        ticket_id: t.ticket_id,
        staff_id: s.staff_id,
        zone: t.zone,
        intent: t.intent,
      });
    }
  }
  recompute() {
    const now = this.now();
    const sorted = sortQueue(
      this.state.tickets.filter((t) => WAITING.has(t.state)),
      now,
    );
    for (let i = 0; i < sorted.length; i++) {
      const t = this.ticket(sorted[i].ticket_id);
      t.priority = sorted[i].priority;
      t.queue_rank = i + 1;
    }
    this.queue = sorted.map((t) => this.ticket(t.ticket_id));
    this.dispatch();
    const free = this.freeStaff().length;
    for (const t of this.queue)
      t.eta_seconds = analytics.eta(t.queue_rank, free, this.state.aht[t.zone]);
    this.metrics = analytics.computeMetrics(
      this.state.tickets,
      this.state.staff,
      this.state.aht,
      now,
      this.config,
    );
  }
  ingest(topic, payload) {
    const e = validateEvent(topic, payload, this.config);
    const now = this.now();
    const device = this.state.devices[e.device_id];
    device.online = true;
    if (this.state.dedup[e.msg_id] && this.state.dedup[e.msg_id] > now) {
      this.command(e.device_id, e.msg_id, false);
      return { ok: true, duplicate: true };
    }
    this.state.dedup[e.msg_id] = now + this.config.dedupTtlSeconds * 1000;
    this.dirty = true;
    try {
      this.handleEvent(e);
    } catch (error) {
      this.log("EVENT_REJECTED", {
        device_id: e.device_id,
        event: e.event,
        msg_id: e.msg_id,
        error: error.message,
      });
      this.recompute();
      this.command(e.device_id, e.msg_id, false, error.message);
      return { ok: false, error: error.message, status: error.status || 400 };
    }
    this.recompute();
    this.command(e.device_id, e.msg_id, e.event === "DEVICE_SYNC");
    return { ok: true };
  }
  handleEvent(e) {
    const now = this.now();
    const d = this.state.devices[e.device_id];
    const t = this.active(e.device_id);
    if (e.event === "CMD_APPLIED") {
      this.log("CMD_APPLIED", {
        device_id: e.device_id,
        msg_id: e.msg_id,
        cmd_id: e.cmd_id || null,
      });
      return;
    }
    if (e.event === "DEVICE_SYNC") return;
    if (
      ["STAFF_ARRIVED", "CANCEL_REQUEST"].includes(e.event) &&
      e.ticket_id !== undefined &&
      e.ticket_id !== t?.ticket_id
    )
      fail(409, "Ticket context no longer current");
    if (
      e.event === "CSAT" &&
      e.ticket_id !== undefined &&
      e.ticket_id !== d.ticket_id
    )
      fail(409, "Ticket context no longer current");
    if (
      [
        "REQUEST",
        "CANCEL_REQUEST",
        "INVALID_GESTURE",
        "SPAM_DETECTED",
      ].includes(e.event)
    ) {
      if (now < d.lock_until) fail(409, "Device temporarily locked");
      const suspicious =
        e.event === "INVALID_GESTURE" ||
        e.event === "SPAM_DETECTED" ||
        (e.event === "REQUEST" && (t || now < d.csat_until)) ||
        (e.event === "CANCEL_REQUEST" && (!t || !WAITING.has(t.state)));
      if (suspicious) {
        d.presses = d.presses.filter(
          (at) => now - at <= this.config.spamWindowSeconds * 1000,
        );
        d.presses.push(now);
        if (
          e.event === "SPAM_DETECTED" ||
          d.presses.length >= this.config.spamThreshold
        ) {
          d.lock_until = now + this.config.spamLockSeconds * 1000;
          this.alert(
            "SPAM_DETECTED",
            "Temporary device lock",
            { device_id: e.device_id },
            true,
          );
          return;
        }
      }
    }
    if (e.event === "REQUEST") {
      if (t) fail(409, "Device already has active ticket");
      if (now < d.csat_until) fail(409, "CSAT window active");
      const seq = ++this.state.sequence;
      const ticket = {
        ticket_id: `T${iso(now).slice(0, 10).replaceAll("-", "")}-${String(seq).padStart(4, "0")}`,
        device_id: e.device_id,
        zone: e.zone,
        intent: e.intent,
        source: "BUTTON",
        state: "PENDING",
        priority: 0,
        queue_rank: 0,
        created_at: iso(now),
        assigned_at: null,
        assigned_staff_id: null,
        staff_attempts: [],
        ack_at: null,
        arrived_at: null,
        resolved_at: null,
        cancelled_at: null,
        ack_latency_ms: null,
        response_time_ms: null,
        service_time_ms: null,
        escalation_level: 0,
        eta_seconds: null,
        csat: null,
        origin_msg_id: e.msg_id,
        presence_verified: this.visionPresence(e.zone),
        arrival_verified: null,
        cancel_reason: null,
        audit: [],
      };
      this.state.tickets.push(ticket);
      d.ticket_id = ticket.ticket_id;
      this.log(
        "TICKET_CREATED",
        {
          device_id: e.device_id,
          intent: e.intent,
          presence_verified: ticket.presence_verified,
        },
        ticket,
      );
      if (ticket.presence_verified === false)
        this.alert(
          "UNVERIFIED_REQUEST",
          "Camera sees nobody at the support point",
          { ticket_id: ticket.ticket_id, device_id: e.device_id },
          true,
        );
    } else if (e.event === "CANCEL_REQUEST") {
      if (!t || !WAITING.has(t.state))
        fail(409, "Only waiting tickets can cancel");
      t.state = "CANCELLED";
      this.cancel(t, "CUSTOMER");
    } else if (e.event === "STAFF_ARRIVED") {
      if (!t || t.state !== "ACKNOWLEDGED") fail(409, "ARRIVED requires ACK");
      t.state = "ARRIVED";
      t.arrived_at = iso(now);
      t.response_time_ms = now - millis(t.created_at);
      t.arrival_verified = this.config.visionEnabled
        ? vision.arrivalVerified(this.state.vision[t.zone], now, this.config)
        : null;
      this.log(
        "ARRIVED",
        {
          response_time_ms: t.response_time_ms,
          arrival_verified: t.arrival_verified,
        },
        t,
      );
      if (t.arrival_verified === false)
        this.alert(
          "ARRIVAL_UNVERIFIED",
          "Camera does not see staff beside the customer",
          { ticket_id: t.ticket_id, device_id: t.device_id },
          true,
        );
      this.publish("system/alert", {
        type: "ARRIVED",
        ticket_id: t.ticket_id,
        staff_id: t.assigned_staff_id,
      });
    } else if (e.event === "CSAT") {
      const resolved = this.state.tickets.find(
        (x) => x.ticket_id === d.ticket_id,
      );
      if (
        !resolved ||
        resolved.state !== "RESOLVED" ||
        now >= d.csat_until ||
        resolved.csat
      )
        fail(409, "CSAT window inactive");
      resolved.csat = e.rating;
      d.csat_until = 0;
      d.ticket_id = null;
      this.log("CSAT", { rating: e.rating }, resolved);
    } else if (e.event === "INVALID_GESTURE")
      this.log("INVALID_GESTURE", { device_id: e.device_id });
  }
  cancel(t, reason) {
    const now = this.now();
    const d = this.state.devices[t.device_id];
    t.state = "CANCELLED";
    t.cancelled_at = iso(now);
    t.cancel_reason = reason;
    this.release(t);
    d.ticket_id = null;
    d.cancel_until = now + 1500;
    this.log("CANCELLED", { reason }, t);
  }
  visionView() {
    return vision.view(this.state.vision, this.now(), this.config);
  }
  visionPresence(zone) {
    if (!this.config.visionEnabled) return null;
    return vision.presence(this.state.vision[zone], this.now(), this.config);
  }
  ingestVision(topic, payload) {
    // Checked before validation: with cameras disabled nothing is parsed or stored.
    if (!this.config.visionEnabled) return { ok: true, ignored: true };
    const e = vision.validateVision(topic, payload, this.config);
    const zone = this.state.vision[e.zone];
    const before = zone.persons;
    const now = this.now();
    // Readings missed while the camera was silent are unknown, so a run that
    // started before the gap must not be counted as continuous.
    if (!vision.isFresh(zone, now, this.config)) {
      zone.empty_since = null;
      zone.occupied_since = null;
    }
    vision.applyReading(zone, e.persons, e.camera_id, now);
    if (before !== e.persons)
      this.log("VISION_UPDATE", { zone: e.zone, persons: e.persons });
    return { ok: true };
  }
  applyVisionRules() {
    if (!this.config.visionEnabled) return;
    const now = this.now();
    for (const t of this.state.tickets.filter((t) => WAITING.has(t.state))) {
      const zone = this.state.vision[t.zone];
      if (!vision.isAbandoned(zone, millis(t.created_at), now, this.config))
        continue;
      this.cancel(t, "ABANDONED_VISION");
      this.alert(
        "TICKET_ABANDONED",
        "Customer left; ticket cancelled automatically",
        { ticket_id: t.ticket_id, device_id: t.device_id },
        true,
      );
    }
    for (const [id, z] of Object.entries(DEVICES)) {
      const d = this.state.devices[id];
      if (this.active(id) || now < d.csat_until) continue;
      if (vision.needsProactiveAssist(this.state.vision[z], now, this.config))
        this.alert("PROACTIVE_ASSIST", "Customer waiting without a ticket", {
          zone: z,
          device_id: id,
        });
    }
  }
  ack(id, staffId) {
    const t = this.ticket(id);
    if (!WAITING.has(t.state))
      fail(409, "ACK requires waiting/escalated state");
    const s = this.state.staff.find((x) => x.staff_id === staffId);
    if (!s) fail(400, "Unknown staff_id");
    if (
      s.status !== "AVAILABLE" ||
      (s.current_ticket && s.current_ticket !== id)
    )
      fail(409, "Staff unavailable or assigned elsewhere");
    if (t.assigned_staff_id !== staffId) {
      this.release(t);
      s.current_ticket = id;
      s.active_tickets = 1;
      s.tickets_assigned_this_shift++;
      s.last_assigned_at = iso(this.now());
      t.assigned_staff_id = staffId;
      t.assigned_at = iso(this.now());
      if (!t.staff_attempts.includes(staffId)) t.staff_attempts.push(staffId);
    }
    t.state = "ACKNOWLEDGED";
    t.ack_at = iso(this.now());
    t.ack_latency_ms = this.now() - millis(t.created_at);
    this.log("ACKNOWLEDGED", { staff_id: staffId }, t);
    this.recompute();
    this.command(t.device_id);
    return t;
  }
  done(id, staffId = null) {
    const t = this.ticket(id);
    if (t.state !== "ARRIVED") fail(409, "DONE requires ARRIVED");
    if (staffId && staffId !== t.assigned_staff_id)
      fail(409, "Staff not assigned");
    const now = this.now();
    t.state = "RESOLVED";
    t.resolved_at = iso(now);
    t.service_time_ms = now - millis(t.arrived_at);
    this.state.aht[t.zone] = analytics.ewma(
      this.state.aht[t.zone],
      t.service_time_ms / 1000,
      this.config.ahtAlpha,
    );
    this.log(
      "RESOLVED",
      {
        service_time_ms: t.service_time_ms,
        aht_seconds: this.state.aht[t.zone],
      },
      t,
    );
    this.release(t, false);
    const d = this.state.devices[t.device_id];
    d.csat_until = now + this.config.csatWindowSeconds * 1000;
    d.ticket_id = t.ticket_id;
    this.recompute();
    this.command(t.device_id);
    return t;
  }
  staffStatus(id, status) {
    if (!["AVAILABLE", "BUSY", "OFFLINE"].includes(status))
      fail(400, "Invalid staff status");
    const s = this.state.staff.find((x) => x.staff_id === id);
    if (!s) fail(404, "Staff not found");
    s.status = status;
    this.log("STAFF_STATUS", { staff_id: id, status });
    if (s.current_ticket) {
      const t = this.ticket(s.current_ticket);
      if (WAITING.has(t.state) && status !== "AVAILABLE") this.release(t);
    }
    this.recompute();
    return s;
  }
  tick() {
    const now = this.now();
    for (const [id, expires] of Object.entries(this.state.dedup))
      if (expires <= now) {
        delete this.state.dedup[id];
        this.dirty = true;
      }
    this.applyVisionRules();
    for (const t of this.state.tickets.filter((t) => WAITING.has(t.state))) {
      const thresholds = this.config.thresholds();
      const factor =
        this.metrics.overload && t.intent === "PAYMENT"
          ? this.config.paymentOverloadSlaFactor
          : 1;
      const elapsed = (now - millis(t.created_at)) / 1000;
      if (
        t.assigned_staff_id &&
        now - millis(t.assigned_at) >= thresholds.assign * 1000
      ) {
        this.log("ASSIGNMENT_TIMEOUT", { staff_id: t.assigned_staff_id }, t);
        this.release(t);
      }
      const eligible = this.state.staff.filter(
        (s) => s.status === "AVAILABLE" && !s.current_ticket,
      );
      const exhausted =
        !t.assigned_staff_id &&
        t.staff_attempts.length > 0 &&
        eligible.length > 0 &&
        eligible.every((s) => t.staff_attempts.includes(s.staff_id));
      if (
        t.escalation_level < 1 &&
        (elapsed >= thresholds.l1 * factor || exhausted)
      ) {
        t.state = "ESCALATED_L1";
        t.escalation_level = 1;
        this.alert(
          "ESCALATED_L1",
          "No timely staff acceptance",
          { ticket_id: t.ticket_id, device_id: t.device_id },
          true,
        );
        this.log("ESCALATED_L1", {}, t);
      }
      if (t.escalation_level < 2 && elapsed >= thresholds.l2 * factor) {
        t.state = "ESCALATED_L2";
        t.escalation_level = 2;
        this.alert(
          "ESCALATED_L2",
          "Manager intervention required",
          { ticket_id: t.ticket_id, device_id: t.device_id },
          true,
        );
        this.log("ESCALATED_L2", {}, t);
      }
    }
    for (const d of Object.values(this.state.devices)) {
      if (d.csat_until && now >= d.csat_until) {
        d.csat_until = 0;
        d.ticket_id = null;
        this.dirty = true;
      }
      if (d.lock_until && now >= d.lock_until) {
        d.lock_until = 0;
        d.presses = [];
        this.dirty = true;
      }
    }
    this.recompute();
    if (this.metrics.overload)
      this.alert("OVERLOAD", "Waiting queue exceeds staff capacity", {
        waiting: this.queue.length,
      });
    if (now - this.lastForecast >= 1000) {
      this.lastForecast = now;
      this.forecast = forecasting.forecast(
        this.history,
        this.virtualNow(),
        this.state.aht,
        this.state.staff,
        this.config,
      );
      for (const z of this.forecast.zones || [])
        if (z.additional_staff > 0)
          this.alert("FORECAST_ALERT", z.recommendation, {
            zone: z.zone,
            required_staff: z.required_staff,
            at_forecast: this.forecast.at,
          });
    }
    for (const id of Object.keys(DEVICES)) this.command(id);
    if (now - this.lastSummary >= 1000) {
      this.lastSummary = now;
      this.publish("queue", this.queue, true);
      this.publish("system/metrics", this.metrics, true);
      this.publish("system/vision", this.visionView(), true);
      const top = this.queue[0];
      const summary = top
        ? {
            ticket_id: top.ticket_id,
            device_id: top.device_id,
            intent: top.intent,
            eta_seconds: top.eta_seconds,
            state: top.state,
          }
        : null;
      const devices = Object.fromEntries(
        Object.keys(DEVICES).map((id) => [
          id,
          { state: this.deviceSnapshot(id).state },
        ]),
      );
      this.publish(
        "display",
        {
          schema: 1,
          queue_count: this.queue.length,
          top_ticket: summary,
          devices,
        },
        true,
      );
    }
  }
  deviceSnapshot(id) {
    const d = this.state.devices[id];
    const now = this.now();
    const t = this.active(id);
    const resolved = this.state.tickets.find(
      (x) => x.ticket_id === d.ticket_id,
    );
    const state =
      now < d.lock_until
        ? "SPAM_LOCK"
        : t
          ? t.state
          : now < d.csat_until
            ? "CSAT_WAIT"
            : now < (d.cancel_until || 0)
              ? "CANCELLED"
              : "READY";
    return {
      device_id: id,
      ticket_id:
        t?.ticket_id || (state === "CSAT_WAIT" ? resolved?.ticket_id : null),
      state,
      rank: t?.queue_rank || 0,
      eta_seconds: t?.eta_seconds || 0,
      display: state,
      csat_remaining_seconds: Math.max(
        0,
        Math.ceil((d.csat_until - now) / 1000),
      ),
      lock_remaining_seconds: Math.max(
        0,
        Math.ceil((d.lock_until - now) / 1000),
      ),
      online: d.online,
    };
  }
  deviceSnapshots() {
    return Object.fromEntries(
      Object.keys(DEVICES).map((id) => [id, this.deviceSnapshot(id)]),
    );
  }
  command(id, receipt = null, force = false, error = null, resetDemo = false) {
    const d = this.state.devices[id];
    const snapshot = this.deviceSnapshot(id);
    // Countdown display values change every tick. Issuing a new command for
    // them creates durable CMD_APPLIED traffic that can delay customer events.
    // Send timers on state changes or forced reconnect snapshots instead.
    const {
      csat_remaining_seconds,
      lock_remaining_seconds,
      ...semanticSnapshot
    } = snapshot;
    const signature = JSON.stringify(semanticSnapshot);
    if (!force && !receipt && d.last_signature === signature) return;
    const previous = d.last_cmd;
    const changed = force || d.last_signature !== signature || !previous;
    if (changed) {
      d.last_signature = signature;
      this.state.cmd_sequence = (this.state.cmd_sequence || 0) + 1;
      d.last_cmd = {
        schema: 1,
        cmd_id: `CMD-${this.now()}-${id}-${this.state.cmd_sequence}`,
        ...snapshot,
      };
      if (resetDemo) d.last_cmd.reset_demo = true;
      this.dirty = true;
    }
    const payload = { ...d.last_cmd };
    if (receipt) {
      delete payload.reset_demo;
      payload.receipt_msg_id = receipt;
      if (error) payload.error = error;
      if (changed) this.publish(`cp/${id}/cmd`, d.last_cmd, true);
      this.publish(`cp/${id}/cmd`, payload, false);
    } else this.publish(`cp/${id}/cmd`, payload, true);
  }
  virtualNow() {
    const c = this.state.clock;
    return (
      millis(c.base) + (c.running ? (this.now() - c.realBase) * c.speed : 0)
    );
  }
  clock(command) {
    if (!["start", "pause", "reset", "set"].includes(command.action))
      fail(400, "Invalid clock action");
    if (command.speed !== undefined && ![1, 10, 60].includes(command.speed))
      fail(400, "Invalid clock speed");
    let base = this.virtualNow();
    if (command.action === "reset") base = this.now();
    if (command.action === "set") {
      base = Date.parse(command.datetime);
      if (!Number.isFinite(base)) fail(400, "Invalid datetime");
    }
    this.state.clock = {
      base: iso(base),
      realBase: this.now(),
      speed:
        command.action === "reset"
          ? 1
          : command.speed || this.state.clock.speed,
      running:
        command.action === "start"
          ? true
          : command.action === "pause" || command.action === "reset"
            ? false
            : this.state.clock.running,
    };
    this.dirty = true;
    this.lastForecast = 0;
    this.tick();
    return this.clockView();
  }
  clockView() {
    return {
      datetime: iso(this.virtualNow()),
      speed: this.state.clock.speed,
      running: this.state.clock.running,
    };
  }
  reset(resetMetrics = true) {
    const old = this.state;
    const fresh = this.freshState();
    fresh.sequence = old.sequence;
    fresh.dedup = old.dedup;
    // Cameras observe the physical store; a demo reset must not forget them.
    fresh.vision = old.vision;
    fresh.clock = {
      base: iso(this.now()),
      realBase: this.now(),
      speed: 1,
      running: true,
    };
    if (!resetMetrics) {
      fresh.tickets = old.tickets.filter((t) => !ACTIVE.has(t.state));
      fresh.aht = old.aht;
    }
    this.state = fresh;
    this.log("DEMO_RESET", { reset_metrics: resetMetrics });
    this.recompute();
    for (const id of Object.keys(DEVICES))
      this.command(id, null, true, null, true);
    this.lastSummary = 0;
    this.tick();
    return { ok: true };
  }
  deviceStatus(online) {
    for (const [id, d] of Object.entries(this.state.devices)) {
      if (d.online && !online) this.log("DEVICE_OFFLINE", { device_id: id });
      d.online = online;
    }
    this.dirty = true;
  }
  snapshot() {
    return {
      tickets: this.state.tickets,
      queue: this.queue,
      staff: this.state.staff.map((s) => ({
        ...s,
        score_preview: Object.fromEntries(
          ["A", "B", "C"].map((zone) => [zone, staffScore(s, zone)]),
        ),
      })),
      metrics: this.metrics,
      forecast: this.forecast,
      devices: this.deviceSnapshots(),
      clock: this.clockView(),
      vision: this.visionView(),
      config: {
        demo_mode: this.config.demo_mode,
        thresholds: this.config.thresholds(),
        csat_window_seconds: this.config.csatWindowSeconds,
        aht_alpha: this.config.ahtAlpha,
        vision_enabled: this.config.visionEnabled,
        vision_thresholds: this.config.visionThresholds(),
      },
      alerts: this.state.alerts,
    };
  }
  drain() {
    return this.outbox.splice(0);
  }
}
module.exports = { TicketEngine };
