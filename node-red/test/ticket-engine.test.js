"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { TicketEngine } = require("../lib/ticket-engine");
const { loadConfig } = require("../lib/config");
function fixture() {
  let now = Date.parse("2026-10-09T10:00:00Z");
  const logs = [];
  const config = loadConfig({});
  const engine = new TicketEngine(config, {
    now: () => now,
    audit: (e) => logs.push(e),
  });
  let seq = 0;
  const event = (device, event = "REQUEST", extra = {}) =>
    engine.ingest(`${config.baseTopic}/cp/${device}/event`, {
      schema: 1,
      msg_id: `${device}-TEST-${++seq}`,
      boot_id: "TEST",
      device_id: device,
      zone: device[0],
      event,
      intent: "CONSULTATION",
      ...extra,
    });
  return {
    engine,
    event,
    config,
    logs,
    advance: (ms) => {
      now += ms;
      engine.tick();
    },
  };
}
test("T09 duplicate msg_id ignored and duplicate receipt confirms delivery", () => {
  const { engine, config } = fixture();
  const e = {
    schema: 1,
    msg_id: "A01-TEST-1",
    device_id: "A01",
    zone: "A",
    event: "REQUEST",
    intent: "CONSULTATION",
  };
  engine.ingest(`${config.baseTopic}/cp/A01/event`, e);
  assert.equal(
    engine.ingest(`${config.baseTopic}/cp/A01/event`, e).duplicate,
    true,
  );
  assert.equal(engine.state.tickets.length, 1);
  assert.equal(
    JSON.parse(engine.drain().at(-1).payload).receipt_msg_id,
    e.msg_id,
  );
});
test("T10 DONE rejected before ARRIVED, T11 ACK valid, T12 ARRIVED requires ACK", () => {
  const { engine, event } = fixture();
  event("A01");
  const t = engine.state.tickets[0];
  assert.equal(event("A01", "STAFF_ARRIVED").ok, false);
  assert.throws(() => engine.done(t.ticket_id), { status: 409 });
  engine.ack(t.ticket_id, "NV01");
  assert.equal(t.state, "ACKNOWLEDGED");
  assert.throws(() => engine.done(t.ticket_id), { status: 409 });
  assert.equal(event("A01", "STAFF_ARRIVED").ok, true);
  assert.equal(t.state, "ARRIVED");
  engine.done(t.ticket_id, "NV01");
  assert.equal(t.state, "RESOLVED");
});
test("T13 only resolved service EWMA updates AHT, physical response excludes ACK", () => {
  const { engine, event, advance } = fixture();
  event("A01");
  const t = engine.state.tickets[0];
  advance(1000);
  engine.ack(t.ticket_id, "NV01");
  advance(3000);
  event("A01", "STAFF_ARRIVED");
  advance(10000);
  engine.done(t.ticket_id);
  assert.equal(t.ack_latency_ms, 1000);
  assert.equal(t.response_time_ms, 4000);
  assert.equal(t.service_time_ms, 10000);
  assert.equal(engine.state.aht.A, 87);
  assert.equal(t.assigned_staff_id, "NV01");
  assert.equal(engine.state.staff[0].current_ticket, null);
  event("A01", "CSAT", { rating: "SATISFIED" });
  assert.equal(t.csat, "SATISFIED");
  assert.equal(engine.deviceSnapshot("A01").state, "READY");
});
test("T20 cancel only pending, releases reservation, no AHT update", () => {
  const { engine, event } = fixture();
  event("C01");
  const t = engine.state.tickets[0];
  assert.equal(event("C01", "CANCEL_REQUEST").ok, true);
  assert.equal(t.state, "CANCELLED");
  assert.equal(engine.state.aht.C, 120);
  assert.equal(
    engine.state.staff.some((s) => s.current_ticket === t.ticket_id),
    false,
  );
});
test("global priority queue B payment outranks A; dispatch matches B", () => {
  const { engine, event } = fixture();
  for (const s of engine.state.staff) s.status = "BUSY";
  event("A01");
  event("B01", "REQUEST", { intent: "PAYMENT" });
  assert.deepEqual(
    engine.queue.map((t) => t.device_id),
    ["B01", "A01"],
  );
  engine.staffStatus("NV02", "AVAILABLE");
  assert.equal(engine.queue[0].assigned_staff_id, "NV02");
});
test("no ACK reassigns once each, then escalates L1 and L2", () => {
  const { engine, event, advance } = fixture();
  engine.staffStatus("NV02", "OFFLINE");
  event("A01");
  const t = engine.state.tickets[0];
  assert.equal(t.assigned_staff_id, "NV01");
  advance(8000);
  assert.equal(t.assigned_staff_id, "NV03");
  advance(8000);
  assert.equal(t.state, "ESCALATED_L1");
  assert.equal(t.assigned_staff_id, null);
  advance(9000);
  assert.equal(t.state, "ESCALATED_L2");
  engine.ack(t.ticket_id, "NV01");
  assert.equal(t.state, "ACKNOWLEDGED");
});
test("spam locks after five suspicious requests, unlocks automatically; malformed topics rejected", () => {
  const { engine, event, advance, config } = fixture();
  for (let i = 0; i < 6; i++) event("A01");
  assert.equal(engine.deviceSnapshot("A01").state, "SPAM_LOCK");
  assert.equal(engine.state.tickets.length, 1);
  advance(30001);
  assert.notEqual(engine.deviceSnapshot("A01").state, "SPAM_LOCK");
  assert.throws(
    () =>
      engine.ingest(`${config.baseTopic}/cp/B01/event`, {
        schema: 1,
        msg_id: "a",
        device_id: "A01",
        zone: "A",
        event: "REQUEST",
        intent: "CONSULTATION",
      }),
    { status: 400 },
  );
  assert.throws(() => engine.ingest("bad", "{"), { status: 400 });
});
test("CSAT timeout releases device and reset clears ticket/locks with fresh READY command", () => {
  const { engine, event, advance } = fixture();
  event("B01");
  const t = engine.state.tickets[0];
  engine.ack(t.ticket_id, "NV02");
  event("B01", "STAFF_ARRIVED");
  engine.done(t.ticket_id);
  assert.equal(engine.deviceSnapshot("B01").state, "CSAT_WAIT");
  assert.equal(event("B01").ok, false);
  advance(15001);
  assert.equal(engine.deviceSnapshot("B01").state, "READY");
  const old = engine.state.devices.B01.last_cmd.cmd_id;
  engine.reset();
  assert.equal(engine.queue.length, 0);
  assert.equal(engine.state.tickets.length, 0);
  assert.notEqual(engine.state.devices.B01.last_cmd.cmd_id, old);
  assert.equal(engine.deviceSnapshot("B01").state, "READY");
});
test("CMD_APPLIED receipt uses current cmd_id, never loops", () => {
  const { engine, event } = fixture();
  event("A01", "DEVICE_SYNC");
  const cmd = engine.state.devices.A01.last_cmd.cmd_id;
  event("A01", "CMD_APPLIED", { cmd_id: cmd });
  const last = JSON.parse(engine.drain().at(-1).payload);
  assert.equal(last.cmd_id, cmd);
  assert.match(last.receipt_msg_id, /A01/);
});
test("persisted engine state retains dedup/tickets/staff assignments", () => {
  const { engine, event, config } = fixture();
  event("A01");
  const state = JSON.parse(JSON.stringify(engine.state));
  const recovered = new TicketEngine(config, { state });
  assert.equal(recovered.state.tickets.length, 1);
  assert.equal(
    recovered.state.staff[0].current_ticket,
    state.tickets[0].ticket_id,
  );
  assert.ok(Object.keys(recovered.state.dedup).length);
});
test("virtual60x clock does not accelerate real SLA timeout", () => {
  const { engine, event, advance } = fixture();
  event("A01");
  engine.clock({
    action: "set",
    datetime: "2026-10-09T17:45:00+07:00",
    speed: 60,
  });
  engine.clock({ action: "start" });
  advance(1000);
  assert.equal(engine.clockView().datetime, "2026-10-09T10:46:00.000Z");
  assert.equal(engine.state.tickets[0].state, "PENDING");
  assert.equal(engine.state.tickets[0].assigned_staff_id, "NV01");
});

test("reassigned staff ACK window stays PENDING before absolute L1 threshold", () => {
  const { engine, event, advance } = fixture();
  engine.staffStatus("NV02", "OFFLINE");
  event("A01");
  advance(8000);
  const t = engine.state.tickets[0];
  assert.equal(t.assigned_staff_id, "NV03");
  advance(500);
  assert.equal(t.state, "PENDING");
  assert.equal(t.assigned_staff_id, "NV03");
});

test("demo reset snapshots explicitly clear offline device FIFO; receipts never carry reset flag", () => {
  const { engine, event } = fixture();
  engine.reset();
  const snapshot = JSON.parse(
    engine.drain().find((m) => m.topic.endsWith("/cp/A01/cmd")).payload,
  );
  assert.equal(snapshot.reset_demo, true);
  event("A01", "CMD_APPLIED", { cmd_id: snapshot.cmd_id });
  const receipt = JSON.parse(engine.drain().at(-1).payload);
  assert.equal(receipt.reset_demo, undefined);
  assert.ok(receipt.receipt_msg_id);
});

test("OLED summary stays under768 bytes even with large ticket audit history", () => {
  const { engine, event } = fixture();
  for (const staff of engine.state.staff) staff.status = "BUSY";
  event("A01");
  event("B01", "REQUEST", { intent: "PAYMENT" });
  event("C01");
  for (const ticket of engine.state.tickets)
    ticket.audit.push(
      ...Array.from({ length: 100 }, () => ({
        type: "LOG",
        detail: "x".repeat(1024),
      })),
    );
  engine.drain();
  engine.tick();
  const display = engine.drain().find((m) => m.topic.endsWith("/display"));
  assert.ok(Buffer.byteLength(display.payload) < 768);
  const payload = JSON.parse(display.payload);
  assert.equal(payload.queue_count, 3);
  assert.equal(payload.top_ticket.device_id, "B01");
  assert.equal(payload.top_ticket.audit, undefined);
  assert.deepEqual(Object.keys(payload.devices.A01), ["state"]);
});

test("offline events carrying old ticket context cannot cancel/arrive/rate a newer ticket", () => {
  const { engine, event } = fixture();
  event("A01");
  const old = engine.state.tickets[0];
  event("A01", "CANCEL_REQUEST", { ticket_id: old.ticket_id });
  event("A01");
  const current = engine.state.tickets[1];
  assert.equal(
    event("A01", "CANCEL_REQUEST", { ticket_id: old.ticket_id }).status,
    409,
  );
  assert.equal(current.state, "PENDING");
  engine.ack(current.ticket_id, current.assigned_staff_id);
  assert.equal(
    event("A01", "STAFF_ARRIVED", { ticket_id: old.ticket_id }).status,
    409,
  );
  assert.equal(current.state, "ACKNOWLEDGED");
  assert.equal(
    event("A01", "STAFF_ARRIVED", { ticket_id: current.ticket_id }).ok,
    true,
  );
  engine.done(current.ticket_id);
  assert.equal(
    event("A01", "CSAT", { ticket_id: old.ticket_id, rating: "SATISFIED" })
      .status,
    409,
  );
  assert.equal(current.csat, null);
  assert.equal(
    event("A01", "CSAT", { ticket_id: current.ticket_id, rating: "SATISFIED" })
      .ok,
    true,
  );
  assert.equal(current.csat, "SATISFIED");
});

test("optional event context fields validate type/length; CMD_APPLIED is audited without new ID", () => {
  const { engine, event, config, logs } = fixture();
  event("A01", "DEVICE_SYNC");
  const cmd = engine.state.devices.A01.last_cmd.cmd_id;
  event("A01", "CMD_APPLIED", { cmd_id: cmd });
  assert.equal(engine.state.devices.A01.last_cmd.cmd_id, cmd);
  assert.ok(
    logs.some((log) => log.type === "CMD_APPLIED" && log.cmd_id === cmd),
  );
  for (const ticket_id of [null, {}, "x".repeat(129)])
    assert.throws(
      () =>
        engine.ingest(`${config.baseTopic}/cp/A01/event`, {
          schema: 1,
          msg_id: "A01-INVALID-1",
          device_id: "A01",
          zone: "A",
          event: "STAFF_ARRIVED",
          ticket_id,
        }),
      { status: 400 },
    );
});

test("untrusted reserved msg_id keys cannot bypass persisted dedup cache", () => {
  const { engine, config } = fixture();
  for (const msg_id of ["__proto__", "constructor", "prototype"])
    assert.throws(
      () =>
        engine.ingest(`${config.baseTopic}/cp/A01/event`, {
          schema: 1,
          msg_id,
          device_id: "A01",
          zone: "A",
          event: "REQUEST",
          intent: "CONSULTATION",
        }),
      { status: 400 },
    );
  assert.equal(engine.state.tickets.length, 0);
  assert.equal(Object.keys(engine.state.dedup).length, 0);
});

test("CSAT and spam countdown ticks do not flood durable command acknowledgments", () => {
  const { engine, event, advance } = fixture();
  event("A01");
  const ticket = engine.state.tickets[0];
  engine.ack(ticket.ticket_id, ticket.assigned_staff_id);
  event("A01", "STAFF_ARRIVED");
  engine.done(ticket.ticket_id);
  const csatCommand = engine.state.devices.A01.last_cmd;
  assert.equal(csatCommand.state, "CSAT_WAIT");
  assert.equal(csatCommand.csat_remaining_seconds, 15);
  engine.drain();
  for (let second = 0; second < 5; second++) advance(1000);
  assert.equal(engine.state.devices.A01.last_cmd.cmd_id, csatCommand.cmd_id);
  assert.equal(
    engine.drain().filter((m) => m.topic.endsWith("/cp/A01/cmd")).length,
    0,
  );
  engine.command("A01", null, true);
  const reconnectCommand = engine.state.devices.A01.last_cmd;
  assert.notEqual(reconnectCommand.cmd_id, csatCommand.cmd_id);
  assert.equal(reconnectCommand.csat_remaining_seconds, 10);
  advance(10000);
  assert.equal(engine.state.devices.A01.last_cmd.state, "READY");

  const device = engine.state.devices.C01;
  device.lock_until = engine.now() + 30000;
  engine.command("C01");
  const lockCommand = device.last_cmd;
  assert.equal(lockCommand.state, "SPAM_LOCK");
  engine.drain();
  advance(1000);
  assert.equal(device.last_cmd.cmd_id, lockCommand.cmd_id);
  assert.equal(
    engine.drain().filter((m) => m.topic.endsWith("/cp/C01/cmd")).length,
    0,
  );
  advance(29000);
  assert.equal(device.last_cmd.state, "READY");
});
