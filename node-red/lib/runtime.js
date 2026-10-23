"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { TicketEngine } = require("./ticket-engine");
const { Telegram } = require("./telegram");
const { fail } = require("./utils");
class Runtime {
  constructor(config) {
    this.config = config;
    fs.mkdirSync(config.dataDir, { recursive: true });
    this.statePath = path.join(config.dataDir, "state.json");
    let state = null;
    for (const file of [this.statePath, `${this.statePath}.bak`]) {
      try {
        const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
        if (parsed.version !== 2 || !Array.isArray(parsed.state?.tickets))
          throw new Error("Invalid persisted state");
        state = parsed.state;
        break;
      } catch {}
    }
    let history = [];
    try {
      history = JSON.parse(
        fs.readFileSync(path.join(config.dataDir, "history.json"), "utf8"),
      );
      if (!Array.isArray(history))
        history = history.records || history.history || [];
    } catch {}
    const realBase = Date.now();
    const monotonicBase = process.hrtime.bigint();
    const realNow = () =>
      Math.floor(
        realBase + Number(process.hrtime.bigint() - monotonicBase) / 1e6,
      );
    this.engine = new TicketEngine(config, {
      state,
      history,
      now: realNow,
      audit: (entry) =>
        fs.appendFileSync(
          path.join(config.dataDir, "events.jsonl"),
          JSON.stringify(entry) + "\n",
        ),
    });
    this.telegram = new Telegram(config, this.engine);
    this.mqtt = { connected: false };
    this.rateLimits = new Map();
    this.lastPersist = 0;
    this.engine.tick();
  }
  ingest(msg) {
    try {
      const result = this.engine.ingest(msg.topic, msg.payload);
      this.persist(true);
      return result;
    } catch (error) {
      this.engine.log("PAYLOAD_REJECTED", {
        topic: msg.topic,
        error: error.message,
      });
      return { ok: false, error: error.message, status: error.status || 400 };
    }
  }
  ingestVision(msg) {
    try {
      // Camera heartbeats arrive every 1-2s, so persist on the normal throttle only.
      const result = this.engine.ingestVision(msg.topic, msg.payload);
      this.persist();
      return result;
    } catch (error) {
      this.engine.log("VISION_REJECTED", {
        topic: msg.topic,
        error: error.message,
      });
      return { ok: false, error: error.message, status: error.status || 400 };
    }
  }
  setMqtt(connected) {
    this.mqtt.connected = connected;
  }
  status(msg) {
    try {
      const payload =
        typeof msg.payload === "string" ? JSON.parse(msg.payload) : msg.payload;
      const online =
        payload === true ||
        payload === "online" ||
        payload?.online === true ||
        payload?.status === "online";
      this.engine.deviceStatus(online);
    } catch {
      this.engine.log("STATUS_REJECTED", { topic: msg.topic });
    }
  }
  flush() {
    // Telegram callbacks and timeout transitions can enqueue output between ticks.
    // Save their state before a downlink exposes the transition to a device.
    if (this.engine.dirty && this.engine.outbox.length) this.persist(true);
    const messages = this.engine.drain();
    for (const msg of messages)
      if (msg.topic === `${this.config.baseTopic}/system/alert`) {
        try {
          void this.telegram.notify(JSON.parse(msg.payload));
        } catch {}
      }
    this.persist();
    return messages;
  }
  persist(force = false) {
    const now = Date.now();
    if (!force && (!this.engine.dirty || now - this.lastPersist < 500)) return;
    const temp = `${this.statePath}.tmp`;
    fs.writeFileSync(
      temp,
      JSON.stringify({ version: 2, state: this.engine.state }),
    );
    if (fs.existsSync(this.statePath))
      fs.copyFileSync(this.statePath, `${this.statePath}.bak`);
    fs.renameSync(temp, this.statePath);
    this.lastPersist = now;
    this.engine.dirty = false;
  }
  snapshot() {
    return {
      ...this.engine.snapshot(),
      mqtt: this.mqtt,
      telegram: {
        enabled: this.telegram.enabled,
        last_error: this.telegram.lastError,
      },
    };
  }
  health() {
    return {
      ok: true,
      project: "Máy lấy số / gọi nhân viên hỗ trợ thông minh",
      version: "2.0.0",
      mqtt: this.mqtt,
      telegram: { enabled: this.telegram.enabled },
      history_records: this.engine.history.length,
      uptime_seconds: Math.round(process.uptime()),
    };
  }
  middleware(req, res, next) {
    const pathname = req.url.split("?")[0];
    if (
      !pathname.startsWith("/api/iot58/") ||
      pathname === "/api/iot58/flow-health"
    )
      return next();
    const respond = (status, payload) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify(payload));
    };
    const run = (body) => {
      try {
        if (req.method !== "GET" && req.method !== "POST")
          fail(405, "Method not allowed");
        if (req.method === "POST") {
          if (
            this.config.apiToken &&
            req.headers.authorization !== `Bearer ${this.config.apiToken}`
          )
            fail(401, "Unauthorized");
          if (req.headers.origin) {
            try {
              const origin = new URL(req.headers.origin);
              if (origin.host !== req.headers.host)
                fail(403, "Cross-origin mutation rejected");
            } catch (error) {
              if (error.status) throw error;
              fail(403, "Invalid origin");
            }
          }
          const ip = req.socket.remoteAddress;
          const now = Date.now();
          const hits = (this.rateLimits.get(ip) || []).filter(
            (t) => now - t < 10000,
          );
          if (hits.length >= 40) fail(429, "Too many commands");
          hits.push(now);
          this.rateLimits.set(ip, hits);
          if (!body || typeof body !== "object" || Array.isArray(body))
            fail(400, "JSON object required");
        }
        let result;
        const endpoint = pathname.slice("/api/iot58/".length);
        if (req.method === "GET") {
          if (endpoint === "health") result = this.health();
          else if (endpoint === "state") result = this.snapshot();
          else if (endpoint === "queue") result = this.engine.queue;
          else if (endpoint === "staff") result = this.snapshot().staff;
          else if (endpoint === "metrics") result = this.engine.metrics;
          else if (endpoint === "forecast") result = this.engine.forecast;
          else if (endpoint === "vision") result = this.engine.visionView();
          else fail(404, "Endpoint not found");
        } else {
          let match;
          if ((match = /^tickets\/([\w-]+)\/(ack|done)$/.exec(endpoint))) {
            if (
              body.staff_id !== undefined &&
              (typeof body.staff_id !== "string" ||
                !body.staff_id.trim() ||
                body.staff_id.length > 64)
            )
              fail(400, "staff_id must be a nonempty string");
            if (match[2] === "ack" && typeof body.staff_id !== "string")
              fail(400, "staff_id required");
            result = {
              ok: true,
              ticket:
                match[2] === "ack"
                  ? this.engine.ack(match[1], body.staff_id)
                  : this.engine.done(match[1], body.staff_id),
            };
          } else if ((match = /^staff\/([\w-]+)\/status$/.exec(endpoint)))
            result = {
              ok: true,
              staff: this.engine.staffStatus(match[1], body.status),
            };
          else if (endpoint === "demo/reset") {
            if (
              body.reset_metrics !== undefined &&
              typeof body.reset_metrics !== "boolean"
            )
              fail(400, "reset_metrics must be boolean");
            result = this.engine.reset(body.reset_metrics !== false);
          } else if (endpoint === "demo/clock")
            result = { ok: true, clock: this.engine.clock(body) };
          else if (endpoint === "demo/mode") {
            if (typeof body.demo_mode !== "boolean")
              fail(400, "demo_mode must be boolean");
            this.config.demo_mode = body.demo_mode;
            this.engine.log("DEMO_MODE", { demo_mode: body.demo_mode });
            result = { ok: true, demo_mode: body.demo_mode };
          } else fail(404, "Endpoint not found");
          this.persist(true);
        }
        respond(200, result);
      } catch (error) {
        if (req.method === "POST")
          this.engine.log("APPLICATION_COMMAND_REJECTED", {
            path: pathname,
            status: error.status || 500,
            error: error.status ? error.message : "Internal server error",
          });
        respond(error.status || 500, {
          ok: false,
          error: error.status ? error.message : "Internal server error",
        });
      }
    };
    if (req.method === "GET") return run({});
    if (req.body !== undefined) return run(req.body);
    let raw = "";
    let overflow = false;
    req.on("data", (chunk) => {
      if (Buffer.byteLength(raw) + chunk.length > this.config.payloadMaxBytes) {
        overflow = true;
        return;
      }
      raw += chunk;
    });
    req.on("end", () => {
      if (overflow)
        return respond(400, { ok: false, error: "Payload too large" });
      try {
        run(raw ? JSON.parse(raw) : {});
      } catch {
        respond(400, { ok: false, error: "Malformed JSON" });
      }
    });
    req.on("error", () =>
      respond(400, { ok: false, error: "Request read error" }),
    );
  }
}
module.exports = { Runtime };
