"use strict";
const { millis } = require("./utils");
function priority(ticket, now = Date.now()) {
  return (
    (ticket.intent === "PAYMENT" ? 50 : 20) +
    (5 * Math.max(0, now - millis(ticket.created_at))) / 60000 +
    20 * (ticket.escalation_level || 0)
  );
}
function sortQueue(tickets, now = Date.now()) {
  return tickets
    .map((t) => ({ ...t, priority: priority(t, now) }))
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        millis(a.created_at) - millis(b.created_at) ||
        a.ticket_id.localeCompare(b.ticket_id),
    );
}
module.exports = { priority, sortQueue };
