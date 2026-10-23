"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { Telegram } = require("../lib/telegram");
const { TicketEngine } = require("../lib/ticket-engine");
const { loadConfig } = require("../lib/config");
test("Telegram disabled without token; no network call or crash", async () => {
  const c = loadConfig({});
  const e = new TicketEngine(c);
  const t = new Telegram(c, e, {
    fetchImpl: () => {
      throw Error("Network forbidden");
    },
  });
  assert.equal(t.enabled, false);
  await t.poll();
  await t.notify({ type: "OVERLOAD" });
  assert.equal(t.lastError, null);
});
test("callback rejects unauthorized chat and answers query", async () => {
  const c = loadConfig({
    TELEGRAM_BOT_TOKEN: "TEST",
    TELEGRAM_MANAGER_CHAT_ID: "100",
    TELEGRAM_NV01_CHAT_ID: "101",
  });
  const e = new TicketEngine(c);
  const calls = [];
  const t = new Telegram(c, e, {
    fetchImpl: async (url, opts) => {
      calls.push(JSON.parse(opts.body));
      return { ok: true, json: async () => ({ ok: true, result: [] }) };
    },
  });
  await t.callback({
    id: "q",
    from: { id: 999 },
    message: { chat: { id: 999 } },
    data: "ack:T1",
  });
  assert.equal(calls[0].show_alert, true);
  assert.match(calls[0].text, /không được phép/);
});

function enabledFixture() {
  const config = loadConfig({
    TELEGRAM_BOT_TOKEN: "TEST",
    TELEGRAM_MANAGER_CHAT_ID: "100",
    TELEGRAM_GROUP_CHAT_ID: "-200",
    TELEGRAM_NV01_CHAT_ID: "101",
    TELEGRAM_NV02_CHAT_ID: "102",
  });
  const engine = new TicketEngine(config);
  const calls = [];
  const telegram = new Telegram(config, engine, {
    fetchImpl: async (url, opts) => {
      calls.push({
        method: url.split("/").at(-1),
        payload: JSON.parse(opts.body),
      });
      return { ok: true, json: async () => ({ ok: true, result: [] }) };
    },
  });
  let sequence = 0;
  const event = (event) =>
    engine.ingest(`${config.baseTopic}/cp/A01/event`, {
      schema: 1,
      msg_id: `A01-TELEGRAM-${++sequence}`,
      device_id: "A01",
      zone: "A",
      event,
      intent: "CONSULTATION",
    });
  event("REQUEST");
  const ticket = engine.state.tickets[0];
  const callback = (chat, user, action) =>
    telegram.callback({
      id: `query-${calls.length}`,
      from: { id: user },
      message: { chat: { id: chat } },
      data: `${action}:${ticket.ticket_id}`,
    });
  return { engine, telegram, ticket, calls, event, callback };
}

test("enabled Telegram assigned staff ACK and DONE after physical ARRIVED", async () => {
  const { ticket, calls, event, callback } = enabledFixture();
  await callback(101, 101, "ack");
  assert.equal(ticket.state, "ACKNOWLEDGED");
  assert.equal(calls.at(-1).payload.show_alert, false);
  event("STAFF_ARRIVED");
  await callback(101, 101, "done");
  assert.equal(ticket.state, "RESOLVED");
  assert.equal(calls.at(-1).method, "answerCallbackQuery");
  assert.equal(calls.at(-1).payload.show_alert, false);
});

test("enabled Telegram DONE rejects wrong staff and premature transition", async () => {
  const { ticket, calls, event, callback } = enabledFixture();
  await callback(101, 101, "ack");
  await callback(101, 101, "done");
  assert.equal(ticket.state, "ACKNOWLEDGED");
  assert.match(calls.at(-1).payload.text, /ARRIVED/);
  event("STAFF_ARRIVED");
  await callback(102, 102, "done");
  assert.equal(ticket.state, "ARRIVED");
  assert.equal(calls.at(-1).payload.show_alert, true);
  assert.match(calls.at(-1).payload.text, /Không phải nhân viên/);
});

test("known staff identity from unknown chat still rejected independently", async () => {
  const { ticket, calls, callback } = enabledFixture();
  await callback(999, 101, "ack");
  assert.equal(ticket.state, "PENDING");
  assert.match(calls.at(-1).payload.text, /Chat không được phép/);
});

test("approved group resolves staff user identity, unknown group member rejected", async () => {
  const { ticket, calls, callback } = enabledFixture();
  await callback(-200, 999, "ack");
  assert.equal(ticket.state, "PENDING");
  assert.equal(calls.at(-1).payload.show_alert, true);
  await callback(-200, 101, "ack");
  assert.equal(ticket.state, "ACKNOWLEDGED");
  assert.equal(ticket.assigned_staff_id, "NV01");
});

test("manager allowlisted chat can override DONE after physical ARRIVED", async () => {
  const { ticket, calls, event, callback } = enabledFixture();
  await callback(101, 101, "ack");
  event("STAFF_ARRIVED");
  await callback(100, 100, "done");
  assert.equal(ticket.state, "RESOLVED");
  assert.equal(calls.at(-1).payload.show_alert, false);
});
