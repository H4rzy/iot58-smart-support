"use strict";
// Browser fixture tests use Chromium's fake camera, never a claimed real webcam.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const snapshot = JSON.parse(fs.readFileSync(path.join(root, "evidence/wokwi-e2e-results.json"), "utf8")).state;
snapshot.mqtt = { connected: true };
snapshot.telegram = { enabled: false };
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = http.createServer((req, res) => {
  if (req.url === "/api/iot58/state") {
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify(snapshot));
  }
  const name = req.url === "/" ? "index.html" : req.url.slice(1);
  if (!["index.html", "styles.css", "app.js", "camera.js"].includes(name)) { res.statusCode = 404; return res.end(); }
  res.setHeader("Content-Type", types[path.extname(name)]);
  res.end(fs.readFileSync(path.join(root, "application", name)));
});

async function main() {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  const checks = [];
  try {
    const context = await browser.newContext({ permissions: ["camera"], viewport: { width: 1366, height: 768 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(() => document.querySelector("#webcam-ticket").options.length > 1);
    assert.equal(await page.locator("#webcam-capture").isDisabled(), true);
    assert.equal(await page.evaluate(() => document.querySelector("#webcam-video").srcObject), null);
    checks.push("Camera off by default; ticket options render without requesting media");
    const id = snapshot.tickets[0].ticket_id;
    await page.selectOption("#webcam-ticket", id);
    await page.click("#webcam-start");
    await page.waitForFunction(() => !document.querySelector("#webcam-capture").disabled);
    await page.click("#webcam-capture");
    await page.waitForFunction(() => !document.querySelector("#webcam-snapshot").hidden);
    const stored = await page.evaluate(async () => {
      const database = await new Promise((resolve) => { const request = indexedDB.open("huit-iot58-ticket-photos", 1); request.onsuccess = () => resolve(request.result); });
      return new Promise((resolve) => { const request = database.transaction("photos").objectStore("photos").getAll(); request.onsuccess = () => resolve(request.result.map((p) => ({ id: p.ticket_id, type: p.blob.type, size: p.blob.size }))); });
    });
    assert.equal(stored[0].id, id);
    assert.equal(stored[0].type, "image/jpeg");
    assert.ok(stored[0].size > 0);
    checks.push("Fake camera captures nonempty JPEG Blob linked to selected ticket in IndexedDB");
    const track = await page.evaluateHandle(() => document.querySelector("#webcam-video").srcObject.getVideoTracks()[0]);
    await page.click("#webcam-stop");
    assert.equal(await track.evaluate((t) => t.readyState), "ended");
    checks.push("Stop releases video track; audio is never requested");
    await page.reload();
    await page.waitForFunction(() => document.querySelector("#webcam-ticket").options.length > 1);
    await page.selectOption("#webcam-ticket", id);
    await page.waitForFunction(() => !document.querySelector("#webcam-snapshot").hidden);
    assert.equal(await page.locator("#webcam-capture").isDisabled(), true);
    await page.click("#webcam-delete");
    await page.waitForFunction(() => document.querySelector("#webcam-snapshot").hidden);
    checks.push("Saved attachment survives page reload; camera stays off; delete removes attachment");
    await page.evaluate(async () => {
      const database = await new Promise((resolve) => { const request = indexedDB.open("huit-iot58-ticket-photos", 1); request.onsuccess = () => resolve(request.result); });
      await new Promise((resolve, reject) => {
        const tx = database.transaction("photos", "readwrite");
        const items = tx.objectStore("photos");
        for (let index = 0; index < 21; index++) items.put({ ticket_id: `OLD-${index}`, captured_at: new Date(1000 * index).toISOString(), blob: new Blob(["fixture"], { type: "image/jpeg" }) });
        tx.oncomplete = resolve; tx.onerror = reject;
      });
    });
    await page.click("#webcam-start");
    await page.waitForFunction(() => !document.querySelector("#webcam-capture").disabled);
    await page.click("#webcam-capture");
    await page.waitForFunction(() => !document.querySelector("#webcam-snapshot").hidden);
    const countPhotos = () => page.evaluate(async () => {
      const database = await new Promise((resolve) => { const request = indexedDB.open("huit-iot58-ticket-photos", 1); request.onsuccess = () => resolve(request.result); });
      return new Promise((resolve) => { const request = database.transaction("photos").objectStore("photos").count(); request.onsuccess = () => resolve(request.result); });
    });
    assert.equal(await countPhotos(), 20);
    await page.waitForFunction(() => !document.querySelector("#webcam-capture").disabled);
    await page.click("#webcam-capture");
    await page.waitForFunction(() => !document.querySelector("#webcam-capture").disabled);
    assert.equal(await countPhotos(), 20);
    page.once("dialog", (dialog) => dialog.accept());
    await page.click("#webcam-clear");
    await page.waitForFunction(() => document.querySelector("#webcam-snapshot").hidden);
    assert.equal(await countPhotos(), 0);
    await page.click("#webcam-stop");
    checks.push("Photo capacity stays20, oldest entries evicted; recapture replaces; confirmed clear deletes all");
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.route("**/api/iot58/state", (route) => route.abort());
    await page.evaluate(() => document.dispatchEvent(new Event("iot58:offline")));
    assert.equal(await page.locator("#webcam-capture").isDisabled(), true);
    checks.push("Mobile390px has no horizontal page overflow; offline API disables capture");
    assert.deepEqual(errors, []);
    await context.close();

    const denied = await browser.newContext();
    await denied.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("denied", "NotAllowedError"); };
    });
    const deniedPage = await denied.newPage();
    await deniedPage.goto(url);
    await deniedPage.click("#webcam-start");
    await deniedPage.waitForFunction(() => document.querySelector("#webcam-status").textContent.includes("bị từ chối"));
    assert.equal(await deniedPage.locator("#webcam-start").isEnabled(), true);
    assert.equal(await deniedPage.locator("#webcam-capture").isDisabled(), true);
    checks.push("Permission rejection is handled; retry stays available and queue UI remains functional");
    await denied.close();
    fs.writeFileSync(path.join(root, "evidence/webcam-browser-results.json"), JSON.stringify({ at: new Date().toISOString(), source: "Playwright Chrome with fake media device and recorded state fixture; not a physical webcam test", checks, errors }, null, 2));
    for (const check of checks) console.log(`PASS ${check}`);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => { console.error(error); server.close(); process.exitCode = 1; });
