"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { Runtime } = require("../lib/runtime");
const { loadConfig } = require("../lib/config");
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "iot58-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const c = loadConfig({ IOT58_DATA_DIR: dir });
  const r = new Runtime(c);
  return { dir, c, r };
}
const event = {
  schema: 1,
  msg_id: "A01-RECOVERY-1",
  boot_id: "RECOVERY",
  device_id: "A01",
  zone: "A",
  event: "REQUEST",
  intent: "CONSULTATION",
};
test("callback-style ACK is durable before its downlink flush", (t) => {
  const { dir, c, r } = fixture(t);
  r.ingest({ topic: `${c.baseTopic}/cp/A01/event`, payload: event });
  const ticket = r.engine.state.tickets[0];
  r.engine.ack(ticket.ticket_id, "NV01");
  const messages = r.flush();
  const saved = JSON.parse(fs.readFileSync(path.join(dir, "state.json"))).state;
  assert.equal(saved.tickets[0].state, "ACKNOWLEDGED");
  assert.ok(
    messages.some(
      (message) => JSON.parse(message.payload).state === "ACKNOWLEDGED",
    ),
  );
});
test("ingress persists ticket+dedup before its application receipt can be flushed", (t) => {
  const { dir, c, r } = fixture(t);
  assert.equal(
    r.ingest({ topic: `${c.baseTopic}/cp/A01/event`, payload: event }).ok,
    true,
  );
  const persisted = JSON.parse(
    fs.readFileSync(path.join(dir, "state.json")),
  ).state;
  assert.equal(persisted.tickets.length, 1);
  assert.ok(persisted.dedup[event.msg_id]);
  const recovered = new Runtime(c);
  assert.equal(
    recovered.ingest({ topic: `${c.baseTopic}/cp/A01/event`, payload: event })
      .duplicate,
    true,
  );
  assert.equal(recovered.engine.state.tickets.length, 1);
});
test("atomic persisted backup recovers when latest state file is corrupt", (t) => {
  const { dir, c, r } = fixture(t);
  r.ingest({ topic: `${c.baseTopic}/cp/A01/event`, payload: event });
  r.persist(true);
  fs.writeFileSync(path.join(dir, "state.json"), "{BROKEN");
  const recovered = new Runtime(c);
  assert.equal(recovered.engine.state.tickets.length, 1);
  assert.equal(
    recovered.engine.state.staff[0].current_ticket,
    recovered.engine.state.tickets[0].ticket_id,
  );
});
test("REST validation, status codes, authorization, rejected transition audit", async (t) => {
  const { dir, c, r } = fixture(t);
  const server = http.createServer((req, res) =>
    r.middleware(req, res, () => {
      res.statusCode = 404;
      res.end("{}");
    }),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/iot58`;
  const post = (url, body, headers = {}) =>
    fetch(base + url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  assert.equal((await fetch(base + "/health")).status, 200);
  assert.equal((await post("/demo/clock", "{bad")).status, 400);
  assert.equal(
    (await post("/staff/UNKNOWN/status", { status: "AVAILABLE" })).status,
    404,
  );
  assert.equal(
    (await post("/staff/NV01/status", { status: "INVALID" })).status,
    400,
  );
  r.ingest({ topic: `${c.baseTopic}/cp/A01/event`, payload: event });
  const id = r.engine.state.tickets[0].ticket_id;
  assert.equal((await post(`/tickets/${id}/done`, {})).status, 409);
  assert.equal(
    (await post(`/tickets/${id}/done`, { staff_id: 5 })).status,
    400,
  );
  assert.equal(
    (await post(`/tickets/${id}/done`, { staff_id: "" })).status,
    400,
  );
  assert.match(
    fs.readFileSync(path.join(dir, "events.jsonl"), "utf8"),
    /APPLICATION_COMMAND_REJECTED/,
  );
  assert.equal((await post(`/tickets/${id}/ack`, {})).status, 400);
  assert.equal(
    (await post(`/tickets/${id}/ack`, { staff_id: "NV01" })).status,
    200,
  );
  assert.equal(
    (await post("/demo/reset", {}, { Origin: "http://evil.example" })).status,
    403,
  );
  c.apiToken = "test-only";
  assert.equal((await post("/demo/reset", {})).status, 401);
  assert.equal(
    (await post("/demo/reset", {}, { Authorization: "Bearer test-only" }))
      .status,
    200,
  );
  assert.equal(r.engine.state.tickets.length, 0);
});
