"use strict";
function staffScore(staff, zone) {
  return (
    100 * Number(staff.status === "AVAILABLE") +
    30 * Number(staff.zones.includes(zone)) -
    10 * (staff.tickets_assigned_this_shift || 0)
  );
}
function candidates(staff, ticket) {
  return staff
    .filter(
      (s) =>
        s.status === "AVAILABLE" &&
        !s.current_ticket &&
        !(ticket.staff_attempts || []).includes(s.staff_id),
    )
    .sort(
      (a, b) =>
        staffScore(b, ticket.zone) - staffScore(a, ticket.zone) ||
        (a.active_tickets || 0) - (b.active_tickets || 0) ||
        (a.last_assigned_at ? Date.parse(a.last_assigned_at) : 0) -
          (b.last_assigned_at ? Date.parse(b.last_assigned_at) : 0) ||
        a.staff_id.localeCompare(b.staff_id),
    );
}
function chooseStaff(staff, ticket) {
  return candidates(staff, ticket)[0] || null;
}
module.exports = { staffScore, candidates, chooseStaff };
