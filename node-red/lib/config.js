"use strict";
const path = require("node:path");
function number(env, key, fallback, min = 0, max = Infinity) {
  const value =
    env[key] === undefined || env[key] === "" ? fallback : Number(env[key]);
  if (!Number.isFinite(value) || value < min || value > max)
    throw new Error(`Invalid configuration: ${key}`);
  return value;
}
function loadConfig(env = process.env) {
  const config = {
    baseTopic: env.MQTT_BASE_TOPIC || "huit/iot58/n20-smart-support/store/s1",
    mqttHost: env.MQTT_HOST || "broker.hivemq.com",
    mqttPort: number(env, "MQTT_PORT", 1883, 1, 65535),
    demo_mode: env.DEMO_MODE !== "false",
    production: {
      assign: number(env, "ASSIGN_ACK_TIMEOUT_SECONDS", 30),
      l1: number(env, "ESCALATION_L1_SECONDS", 60),
      l2: number(env, "ESCALATION_L2_SECONDS", 90),
    },
    demo: {
      assign: number(env, "DEMO_ASSIGN_TIMEOUT_SECONDS", 8),
      l1: number(env, "DEMO_ESCALATION_L1_SECONDS", 15),
      l2: number(env, "DEMO_ESCALATION_L2_SECONDS", 25),
    },
    csatWindowSeconds: number(env, "CSAT_WINDOW_SECONDS", 15),
    ahtAlpha: number(env, "AHT_ALPHA", 0.3, 0, 1),
    ahtDefaultSeconds: number(env, "AHT_DEFAULT_SECONDS", 120),
    overloadMultiplier: number(env, "OVERLOAD_MULTIPLIER", 2),
    targetUtilization: number(env, "TARGET_UTILIZATION", 0.8, 0.01, 1),
    dedupTtlSeconds: number(env, "DEDUP_TTL_SECONDS", 3600),
    spamThreshold: number(env, "SPAM_THRESHOLD", 5, 1),
    spamWindowSeconds: number(env, "SPAM_WINDOW_SECONDS", 10, 1),
    spamLockSeconds: number(env, "SPAM_LOCK_SECONDS", 30, 1),
    alertCooldownSeconds: number(env, "ALERT_COOLDOWN_SECONDS", 60),
    payloadMaxBytes: number(env, "PAYLOAD_MAX_BYTES", 4096, 256),
    paymentOverloadSlaFactor: number(
      env,
      "PAYMENT_OVERLOAD_SLA_FACTOR",
      0.8,
      0.1,
      1,
    ),
    responseSlaSeconds: number(env, "RESPONSE_SLA_SECONDS", 120),
    visionEnabled: env.VISION_ENABLED !== "false",
    visionStaleSeconds: number(env, "VISION_STALE_SECONDS", 10, 1),
    visionProduction: {
      abandon: number(env, "VISION_ABANDON_SECONDS", 60, 1),
      dwell: number(env, "VISION_DWELL_SECONDS", 180, 1),
    },
    visionDemo: {
      abandon: number(env, "DEMO_VISION_ABANDON_SECONDS", 10, 1),
      dwell: number(env, "DEMO_VISION_DWELL_SECONDS", 20, 1),
    },
    forecastHorizonMinutes: number(env, "FORECAST_HORIZON_MINUTES", 15),
    forecastTimezone: env.FORECAST_TIMEZONE || "Asia/Ho_Chi_Minh",
    dataDir: env.IOT58_DATA_DIR || path.join(__dirname, "../data"),
    apiToken: env.API_TOKEN || "",
    telegram: {
      token: env.TELEGRAM_BOT_TOKEN || "",
      manager: env.TELEGRAM_MANAGER_CHAT_ID || "",
      group: env.TELEGRAM_GROUP_CHAT_ID || "",
      staffChats: {
        NV01: env.TELEGRAM_NV01_CHAT_ID || "",
        NV02: env.TELEGRAM_NV02_CHAT_ID || "",
        NV03: env.TELEGRAM_NV03_CHAT_ID || "",
      },
    },
  };
  config.thresholds = () =>
    config.demo_mode ? config.demo : config.production;
  config.visionThresholds = () =>
    config.demo_mode ? config.visionDemo : config.visionProduction;
  return config;
}
module.exports = { loadConfig };
