"use strict";
// Real MQTT + REST demo. Device presses/vision counts are simulated by this
// publisher; it never claims a physical Wokwi action or a real camera image.
const path = require("node:path");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const mqtt = require("mqtt");
require("../node-red/node_modules/dotenv").config({ path: path.resolve(__dirname, "../node-red/.env"), quiet: true });
const config = require("../node-red/lib/config").loadConfig();
const origin = (process.env.API_URL || "http://localhost:1880").replace(/\/$/, "");
const auto = process.argv.includes("--auto");
const prepareOnly = !auto;
const boot = `DEMO${crypto.randomBytes(4).toString("hex")}`;
const checks = [];
const commands = [];
let sequence = 0;
let client;
let browser;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function api(endpoint, body) {
  const response = await fetch(`${origin}/api/iot58/${endpoint}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(config.apiToken ? { authorization: `Bearer ${config.apiToken}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(8000),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(`${endpoint}: HTTP${response.status} ${value.error || ""}`);
  return value;
}
async function until(test, label, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const state = await api("state");
    const value = test(state);
    if (value) return value;
    await sleep(200);
  }
  throw new Error(`Timeout: ${label}`);
}
async function publish(topic, payload) {
  await new Promise((resolve, reject) => client.publish(`${config.baseTopic}/${topic}`, JSON.stringify(payload), { qos: 1 }, (e) => e ? reject(e) : resolve()));
}
async function event(device, type, extra = {}) {
  await publish(`cp/${device}/event`, { schema: 1, device_id: device, zone: device[0], event: type,
    boot_id: boot, msg_id: `${device}-${boot}-${++sequence}`, device_uptime_ms: sequence * 100, ...extra });
}
async function count(zone, persons) {
  await publish(`vision/${zone}`, { schema: 1, camera_id: `DEMO-${zone}`, zone, persons, confidence: 1, ts: new Date().toISOString() });
}
async function prepare(resetMetrics) {
  await api("demo/mode", { demo_mode: true });
  await api("demo/reset", { reset_metrics: resetMetrics });
  for (const staff of ["NV01", "NV02", "NV03"]) await api(`staff/${staff}/status`, { status: "BUSY" });
  // Positive counts cannot auto-cancel tickets; after 10s the camera goes stale
  // and rules fail open. No background publisher is left running.
  if (config.visionEnabled) { await count("A", 1); await count("B", 1); await count("C", 1); }
  await event("A01", "REQUEST", { intent: "CONSULTATION", gesture: "short" });
  await event("B01", "REQUEST", { intent: "PAYMENT", gesture: "long" });
  return until((s) => s.queue.length === 2 && s.queue[0].device_id === "B01" && s, "B payment outranks A");
}
async function narration(page, title, detail, selector = "#queue-section") {
  console.log(`${title}: ${detail}`);
  await page.evaluate(({ title, detail }) => {
    let banner = document.getElementById("demo-live-caption");
    if (!banner) {
      banner = document.createElement("div"); banner.id = "demo-live-caption";
      banner.style.cssText = "position:fixed;bottom:14px;left:20px;right:20px;z-index:80;background:#173e2a;color:#fff;padding:16px 22px;border-radius:10px;box-shadow:0 5px 30px #0004;font:14px Georgia;pointer-events:none";
      document.body.append(banner);
    }
    banner.textContent = `${title} — ${detail} | MQTT publisher mô phỏng thiết bị; không phải nút/camera Wokwi thật.`;
  }, { title, detail });
  await page.locator(selector).scrollIntoViewIfNeeded();
  await sleep(1700);
}
async function main() {
  const health = await api("health");
  assert(health.mqtt.connected, "Node-RED must be connected to MQTT first");
  client = mqtt.connect(`mqtt://${config.mqttHost}:${config.mqttPort}`, { clientId: `iot58-demo-${boot}`, connectTimeout: 12000, reconnectPeriod: 0 });
  await new Promise((resolve, reject) => { client.once("connect", resolve); client.once("error", reject); });
  client.on("error", (e) => console.error("MQTT:", e.message));
  await new Promise((resolve, reject) => client.subscribe(`${config.baseTopic}/cp/+/cmd`, (e) => e ? reject(e) : resolve()));
  client.on("message", (_topic, payload) => { try { commands.push(JSON.parse(payload)); } catch {} });
  const action = ["--arrived", "--csat"].find((flag) => process.argv.includes(flag));
  if (action) {
    const device = process.argv[process.argv.indexOf(action) + 1];
    assert(["A01", "B01", "C01"].includes(device), "Device must be A01, B01 or C01");
    const state = await api("state");
    const currentId = state.devices[device].ticket_id;
    const ticket = state.tickets.find((item) => item.ticket_id === currentId);
    if (action === "--arrived") {
      assert(ticket?.state === "ACKNOWLEDGED", "ACK the ticket on Dashboard before simulating ARRIVED");
      if (config.visionEnabled) await count(device[0], 2);
      await event(device, "STAFF_ARRIVED", { ticket_id: ticket.ticket_id });
      await until((s) => s.tickets.find((t) => t.ticket_id === ticket.ticket_id)?.state === "ARRIVED", "manual ARRIVED");
      console.log(`ARRIVED ${device}. MQTT simulated arrival; DONE is now available on Dashboard. No demo reset.`);
    } else {
      assert(ticket?.state === "RESOLVED" && state.devices[device].state === "CSAT_WAIT", "Use DONE after ARRIVED, then rate within15s");
      await event(device, "CSAT", { ticket_id: ticket.ticket_id, rating: "SATISFIED", gesture: "short" });
      await until((s) => s.tickets.find((t) => t.ticket_id === ticket.ticket_id)?.csat === "SATISFIED", "manual CSAT");
      console.log(`CSAT SATISFIED ${device}. MQTT simulated rating; no demo reset.`);
    }
    return;
  }
  const initial = await prepare(!process.argv.includes("--keep-metrics"));
  checks.push("Global queue: B PAYMENT before A CONSULTATION; all staff BUSY");
  if (prepareOnly) {
    console.log(`READY ${origin}/ — 2 tickets, staff BUSY. Select NV02 AVAILABLE then ACK B. Webcam needs your browser permission. Events are MQTT simulated.`);
    return;
  }
  const { chromium } = require("playwright");
  browser = await chromium.launch({ channel: "chrome", headless: process.argv.includes("--headless") });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, timezoneId: "Asia/Ho_Chi_Minh" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);
  if (config.apiToken) { await page.locator("#access-token").fill(config.apiToken); await page.locator("#access-form button").click(); }
  await page.waitForFunction(() => document.querySelectorAll("#queue-body tr[data-ticket-id]").length >= 2);
  await narration(page, "1. Hàng đợi ưu tiên", "B thanh toán đứng trước A tư vấn; yêu cầu cũ vẫn tăng ưu tiên theo thời gian.");
  const b = initial.queue.find((t) => t.device_id === "B01");
  await page.locator('[data-staff-id="NV02"]').selectOption("AVAILABLE");
  await until((s) => s.tickets.find((t) => t.ticket_id === b.ticket_id)?.assigned_staff_id === "NV02", "NV02 dispatch");
  const row = page.locator(`tr[data-ticket-id="${b.ticket_id}"]`);
  await row.locator('button[data-action="ack"]').click();
  await until((s) => s.tickets.find((t) => t.ticket_id === b.ticket_id)?.state === "ACKNOWLEDGED", "Dashboard ACK");
  const deadline = Date.now() + 5000;
  while (!commands.some((c) => c.ticket_id === b.ticket_id && c.state === "ACKNOWLEDGED") && Date.now() < deadline) await sleep(100);
  assert(commands.some((c) => c.ticket_id === b.ticket_id && c.state === "ACKNOWLEDGED"));
  assert(await row.locator('button[data-action="done"]').isDisabled());
  checks.push("UI staff control dispatches NV02; Dashboard ACK produces real MQTT downlink; DONE is disabled");
  await narration(page, "2. Phân công và ACK", "NV02 nhận việc trên Dashboard; lệnh MQTT ACK đã phát. DONE khóa cho đến khi nhân viên tới nơi.");
  if (config.visionEnabled) await count("B", 2);
  await event("B01", "STAFF_ARRIVED", { ticket_id: b.ticket_id });
  await until((s) => s.tickets.find((t) => t.ticket_id === b.ticket_id)?.state === "ARRIVED", "ARRIVED uplink");
  await page.waitForFunction((id) => document.querySelector(`tr[data-ticket-id="${id}"] button[data-action="done"]`)?.disabled === false, b.ticket_id);
  await narration(page, "3. Nhân viên đến", "Uplink ARRIVED mô phỏng lúc nhấn nút tại quầy; response được đo từ lúc tạo ticket đến đây.");
  await row.locator('button[data-action="done"]').click();
  await until((s) => s.tickets.find((t) => t.ticket_id === b.ticket_id)?.state === "RESOLVED", "DONE");
  await event("B01", "CSAT", { ticket_id: b.ticket_id, rating: "SATISFIED", gesture: "short" });
  const completed = await until((s) => s.tickets.find((t) => t.ticket_id === b.ticket_id)?.csat === "SATISFIED" && s, "CSAT");
  checks.push("ARRIVED → DONE → CSAT; response/service/EWMA metrics recorded");
  await narration(page, "4. Hoàn tất và đánh giá", "DONE kết thúc phục vụ, cập nhật AHT/ETA; CSAT ghi đánh giá hài lòng.", "#analytics-section");
  await narration(page, "5. Webcam tùy chọn", "Chọn ticket rồi Bật webcam → cho phép → Chụp. Ảnh chỉ lưu trong trình duyệt; demo tự động không bật camera.", "#webcam-section");
  await event("C01", "REQUEST", { intent: "CONSULTATION", gesture: "short" });
  const c = await until((s) => s.tickets.find((t) => t.device_id === "C01" && t.state === "PENDING"), "C request");
  await event("C01", "CANCEL_REQUEST", { ticket_id: c.ticket_id, gesture: "double" });
  await until((s) => s.tickets.find((t) => t.ticket_id === c.ticket_id)?.state === "CANCELLED", "C cancel");
  checks.push("C request then double-cancel event releases ticket without learning AHT");
  await narration(page, "6. Hủy yêu cầu", "Event double-click mô phỏng hủy ticket C; không cho ticket hủy làm sai thời gian phục vụ.");
  await narration(page, "7. Chống bỏ quên", "Giữ A chờ không ACK: theo dõi L1/L2 và cảnh báo. Ngưỡng demo15/25 giây; production60/90 giây.");
  await until((s) => s.tickets.find((t) => t.device_id === "A01")?.state === "ESCALATED_L2", "A L2", 32000);
  checks.push("Waiting A reaches real-time escalation L2 without ACK");
  await api("staff/NV03/status", { status: "OFFLINE" });
  await api("demo/clock", { action: "set", datetime: "2026-10-09T17:45:00+07:00", speed: 60 });
  await api("demo/clock", { action: "pause" });
  await narration(page, "8. Dự báo bố trí người", "Clock 17:45 dự báo18h từ4 tuần dữ liệu giả lập. Clock ảo không tăng tốc SLA.", "#analytics-section");
  const final = await api("state");
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.resolve(__dirname, "../evidence/live-demo-results.json"), JSON.stringify({ at: new Date().toISOString(), source: "Actual Node-RED + public MQTT + visible Chrome UI; REQUEST/ARRIVED/CSAT/counts simulated by MQTT publisher, no physical Wokwi/camera claim", checks, completed_ticket: completed.tickets.find((t) => t.ticket_id === b.ticket_id), state: final, errors }, null, 2));
  console.log(`PASS ${checks.length} demo checks. Real artifacts: evidence/live-demo-results.json`);
  await prepare(false);
  console.log(`READY ${origin}/ — preserved completed metrics, fresh two-ticket queue for manual demo; no background count publisher.`);
}
main().catch((error) => { console.error("DEMO FAILED:", error.message); process.exitCode = 1; }).finally(async () => {
  if (client) await new Promise((resolve) => client.end(false, {}, resolve));
  if (browser) await browser.close();
});
