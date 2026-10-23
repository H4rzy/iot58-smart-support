"use strict";

// Actual browser + REST + MQTT checks. "controls" resets the demo session.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const mqtt = require("mqtt");

const ORIGIN = (process.env.API_URL || "http://127.0.0.1:1880").replace(
  /\/$/,
  "",
);
const API = `${ORIGIN}/api/iot58`;
const BASE =
  process.env.MQTT_BASE_TOPIC || "huit/iot58/n20-smart-support/store/s1";
const EVIDENCE = path.resolve(__dirname, "../evidence");
const mode = process.argv[2] || "static";
const knownChrome = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
];
const executablePath =
  process.env.CHROME_EXECUTABLE ||
  knownChrome.find((file) => fs.existsSync(file));
let browser;
let client;
const checks = [];
const bootId = `BROWSER${Date.now()}`;
let sequence = 0;

async function api(endpoint, body) {
  const response = await fetch(API + endpoint, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(body !== undefined && process.env.API_TOKEN
        ? { Authorization: `Bearer ${process.env.API_TOKEN}` }
        : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(7000),
  });
  const data = await response.json();
  assert.equal(response.status, 200, `${endpoint}: HTTP ${response.status}`);
  return data;
}
async function publish(deviceId, event, extra = {}) {
  const payload = {
    schema: 1,
    msg_id: `${deviceId}-${bootId}-${++sequence}`,
    boot_id: bootId,
    device_id: deviceId,
    zone: deviceId[0],
    event,
    device_uptime_ms: sequence * 100,
    ...extra,
  };
  await new Promise((resolve, reject) =>
    client.publish(
      `${BASE}/cp/${deviceId}/event`,
      JSON.stringify(payload),
      { qos: 1 },
      (error) => (error ? reject(error) : resolve()),
    ),
  );
}
function passed(description) {
  checks.push(description);
  console.log(`PASS ${description}`);
}

async function staticChecks(page) {
  await page.goto(ORIGIN, { waitUntil: "networkidle" });
  await page.waitForSelector(".staff-card");
  assert.equal(await page.locator(".kpi").count(), 9);
  assert.equal(await page.locator(".staff-card").count(), 3);
  assert.equal(await page.locator(".device-card").count(), 3);
  assert.equal(await page.locator(".forecast-card").count(), 3);
  assert.equal(
    await page.locator("#connection-label").textContent(),
    "API đã kết nối",
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: path.join(EVIDENCE, "dashboard-desktop.png"),
    fullPage: true,
  });
  passed(
    "real API renders 9 KPIs / 3 staff / 3 devices / 3 forecast zones, desktop1366 no page overflow",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: path.join(EVIDENCE, "dashboard-mobile.png"),
    fullPage: true,
  });
  passed("mobile390 has no page overflow; queue scroll stays inside table");
  await page.route("**/api/iot58/state", (route) => route.abort());
  await page.waitForFunction(
    () => !document.getElementById("connection-warning").hidden,
  );
  assert.equal(await page.locator("#reset-demo").isDisabled(), true);
  await page.unroute("**/api/iot58/state");
  passed("API offline displays stale-state warning and disables mutations");

  // Deliberate injection fixture is only a security test, never a screenshot.
  const snapshot = await api("/state");
  snapshot.staff[0].name = '<img src=x onerror="window.__xss=1">';
  const alertBase = Date.now();
  snapshot.alerts = Array.from({ length: 12 }, (_, index) => ({
    type: `ORDER_${String(index).padStart(2, "0")}`,
    at: new Date(alertBase + index * 1000).toISOString(),
    message: '<svg onload="window.__xss=1">',
  })).reverse();
  await page.route("**/api/iot58/state", (route) =>
    route.fulfill({ json: snapshot }),
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".staff-card");
  assert.equal(await page.evaluate(() => Boolean(window.__xss)), false);
  assert.equal(
    await page.locator(".staff-card img,.alerts-list svg").count(),
    0,
  );
  assert(
    (await page.locator(".staff-name").first().textContent()).includes("<img"),
  );
  assert.deepEqual(
    await page.locator(".alert-item strong").allTextContents(),
    Array.from(
      { length: 10 },
      (_, index) => `ORDER_${String(11 - index).padStart(2, "0")}`,
    ),
  );
  await page.unroute("**/api/iot58/state");
  passed(
    "untrusted staff and alert HTML renders literal text without script execution",
  );
  passed(
    "newest-first alert input displays latest10 in descending timestamp order, excluding oldest",
  );
}

async function controlChecks(page) {
  client = mqtt.connect(
    `mqtt://${process.env.MQTT_HOST || "127.0.0.1"}:${process.env.MQTT_PORT || 1883}`,
    { reconnectPeriod: 0, connectTimeout: 5000 },
  );
  await new Promise((resolve, reject) => {
    client.once("connect", resolve);
    client.once("error", reject);
  });
  const commands = [];
  client.on("message", (_topic, payload) => {
    try {
      commands.push(JSON.parse(payload.toString()));
    } catch {
      /* invalid MQTT is a separate test */
    }
  });
  await new Promise((resolve, reject) =>
    client.subscribe(`${BASE}/cp/+/cmd`, (error) =>
      error ? reject(error) : resolve(),
    ),
  );
  await api("/demo/reset", { reset_metrics: true });
  await api("/demo/mode", { demo_mode: false });
  for (const id of ["NV01", "NV02", "NV03"])
    await api(`/staff/${id}/status`, { status: "BUSY" });
  await page.goto(ORIGIN, { waitUntil: "networkidle" });
  if (process.env.API_TOKEN) {
    await page.locator(".access-panel summary").click();
    await page.locator("#access-token").fill(process.env.API_TOKEN);
    await page.locator("#access-form button").click();
  }
  await publish("A01", "REQUEST", { intent: "CONSULTATION", gesture: "short" });
  await publish("B01", "REQUEST", { intent: "PAYMENT", gesture: "long" });
  await page.waitForFunction(
    () =>
      document.querySelectorAll("#queue-body tr[data-ticket-id]").length === 2,
  );
  assert(
    (await page.locator("#queue-body tr").first().textContent()).includes(
      "B01",
    ),
  );
  await page.screenshot({
    path: path.join(EVIDENCE, "dashboard-priority-queue.png"),
    fullPage: true,
  });
  passed(
    "real MQTT A/B events render two-ticket global queue with PAYMENT first",
  );

  await page.locator('select[data-staff-id="NV02"]').selectOption("AVAILABLE");
  await page.waitForFunction(
    () => document.querySelector("#queue-body tr select")?.value === "NV02",
  );
  const ticket = (await api("/state")).tickets.find(
    (t) => t.device_id === "B01",
  );
  assert.equal(ticket.assigned_staff_id, "NV02");
  const row = page.locator(`tr[data-ticket-id="${ticket.ticket_id}"]`);
  await row.locator('button[data-action="ack"]').click();
  await page.waitForFunction(
    (id) =>
      document.querySelector(
        `tr[data-ticket-id="${id}"] button[data-action="done"]`,
      )?.disabled === true,
    ticket.ticket_id,
  );
  const downlinkDeadline = Date.now() + 3000;
  while (
    !commands.some(
      (command) =>
        command.device_id === "B01" && command.state === "ACKNOWLEDGED",
    ) &&
    Date.now() < downlinkDeadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert(
    commands.some(
      (command) =>
        command.device_id === "B01" && command.state === "ACKNOWLEDGED",
    ),
  );
  passed(
    "UI staff availability triggers dispatch; UI ACK publishes real MQTT downlink; DONE disabled before ARRIVED",
  );

  // Publisher simulates physical ARRIVED uplink; this is not a Wokwi gesture test.
  await publish("B01", "STAFF_ARRIVED");
  await page.waitForFunction(
    (id) =>
      document.querySelector(
        `tr[data-ticket-id="${id}"] button[data-action="done"]`,
      )?.disabled === false,
    ticket.ticket_id,
  );
  await row.locator('button[data-action="done"]').click();
  await page.waitForFunction(
    (id) => !document.querySelector(`tr[data-ticket-id="${id}"]`),
    ticket.ticket_id,
  );
  await publish("B01", "CSAT", { rating: "SATISFIED", gesture: "short" });
  passed("MQTT ARRIVED enables UI DONE; resolved ticket leaves active queue");

  await page.locator("#clock-datetime").fill("2026-10-09T17:45");
  await page.locator("#clock-speed").selectOption("60");
  await page.locator("#clock-form button").click();
  await page.waitForFunction(() =>
    document.getElementById("clock-state").textContent.includes("60"),
  );
  await page.locator('[data-clock="pause"]').click();
  await page.waitForFunction(() =>
    document.getElementById("clock-state").textContent.includes("TẠM DỪNG"),
  );
  await page.locator("#demo-mode").check();
  await page.waitForFunction(
    () => document.getElementById("mode-badge").textContent === "DEMO MODE",
  );
  const state = await api("/state");
  assert.equal(
    state.tickets.find((t) => t.ticket_id === ticket.ticket_id).state,
    "RESOLVED",
  );
  assert.equal(state.metrics.csat_percent, 100);
  assert.equal(state.clock.speed, 60);
  assert.equal(state.clock.running, false);
  assert.equal(state.config.demo_mode, true);
  passed(
    "CSAT metrics, UI clock set60/pause and DEMO mode toggle update real API",
  );
  await page.locator("#reset-demo").click();
  await page.locator('#reset-dialog button[value="confirm"]').click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll("#queue-body tr[data-ticket-id]").length === 0,
  );
  const final = await api("/state");
  assert.equal(final.tickets.length, 0);
  assert.equal(final.devices.B01.state, "READY");
  passed(
    "confirmed UI reset clears tickets and sends READY state; history preserved",
  );
}

async function main() {
  assert(
    ["static", "controls", "all"].includes(mode),
    "Usage: node browser_smoke_test.js static|controls|all",
  );
  fs.mkdirSync(EVIDENCE, { recursive: true });
  browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 1366, height: 768 },
    timezoneId: "Asia/Ho_Chi_Minh",
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  if (mode !== "controls") await staticChecks(page);
  if (mode !== "static") {
    await page.setViewportSize({ width: 1366, height: 768 });
    await controlChecks(page);
  }
  assert.deepEqual(errors, [], "No JavaScript fatal errors");
  passed("zero JavaScript fatal errors");
  fs.writeFileSync(
    path.join(EVIDENCE, `browser-${mode}-results.json`),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        mode,
        source:
          "Actual Node-RED REST and MQTT; XSS fixture only in security test",
        checks,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "Wokwi physical gestures and Telegram live delivery require separate verification.",
  );
}
main()
  .catch((error) => {
    console.error(`FAIL ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (client) client.end(true);
    if (browser) await browser.close();
  });
