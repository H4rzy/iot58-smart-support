"use strict";
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, ".env"), quiet: true });
const { loadConfig } = require("./lib/config");
const { Runtime } = require("./lib/runtime");
const config = loadConfig();
const runtime = new Runtime(config);
process.env.MQTT_HOST = config.mqttHost;
process.env.MQTT_PORT = String(config.mqttPort);
process.env.MQTT_BASE_TOPIC = config.baseTopic;
process.env.MQTT_EVENTS_TOPIC = config.baseTopic + "/cp/+/event";
process.env.MQTT_STATUS_TOPIC = config.baseTopic + "/simulator/status";
process.env.MQTT_VISION_TOPIC = config.baseTopic + "/vision/+";
process.on("exit", () => runtime.persist(true));
module.exports = {
  flowFile: "flows.json",
  uiHost: process.env.UI_HOST || "127.0.0.1",
  uiPort: Number(process.env.PORT || 1880),
  httpAdminRoot: "/red",
  httpNodeRoot: "/",
  httpStatic: path.join(__dirname, "../application"),
  httpNodeMiddleware: (req, res, next) => runtime.middleware(req, res, next),
  contextStorage: {
    default: { module: "localfilesystem", config: { flushInterval: 5 } },
  },
  functionGlobalContext: {
    iot58: runtime,
    config,
    priority: require("./lib/priority"),
    dispatch: require("./lib/dispatch"),
    analytics: require("./lib/analytics"),
    forecast: require("./lib/forecast"),
  },
  logging: { console: { level: "info", metrics: false, audit: false } },
  editorTheme: { projects: { enabled: false } },
  // Configure adminAuth before exposing the editor outside a trusted classroom/local network.
};
