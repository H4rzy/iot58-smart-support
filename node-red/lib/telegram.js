"use strict";
class Telegram {
  constructor(config, engine, { fetchImpl = global.fetch } = {}) {
    this.config = config.telegram;
    this.engine = engine;
    this.fetch = fetchImpl;
    this.enabled = Boolean(this.config.token);
    this.offset = engine.state.telegram_offset || 0;
    this.polling = false;
    this.lastError = null;
  }
  async api(method, payload) {
    if (!this.enabled) return null;
    const response = await this.fetch(
      `https://api.telegram.org/bot${this.config.token}/${method}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) throw new Error(`Telegram HTTP ${response.status}`);
    const result = await response.json();
    if (!result.ok) throw new Error("Telegram rejected request");
    return result.result;
  }
  manager(chat) {
    return (
      Boolean(this.config.manager) &&
      String(chat) === String(this.config.manager)
    );
  }
  staffFor(chat, user) {
    return (
      Object.entries(this.config.staffChats).find(
        ([, id]) => id && String(id) === String(chat),
      )?.[0] ||
      Object.entries(this.config.staffChats).find(
        ([, id]) => id && String(id) === String(user),
      )?.[0]
    );
  }
  allowed(chat) {
    // Chat allowlisting is independent of the user's staff identity. A known staff
    // member may act inside the approved group, but never inside an unknown chat.
    const allowlist = [
      this.config.manager,
      this.config.group,
      ...Object.values(this.config.staffChats),
    ]
      .filter(Boolean)
      .map(String);
    return chat !== undefined && allowlist.includes(String(chat));
  }
  async callback(query) {
    const chat = query.message?.chat?.id;
    const user = query.from?.id;
    let response = "Đã xử lý";
    try {
      if (!this.allowed(chat, user)) throw new Error("Chat không được phép");
      const match = /^(ack|done):([\w-]+)$/.exec(query.data || "");
      if (!match) throw new Error("Callback không hợp lệ");
      const ticket = this.engine.ticket(match[2]);
      let staff = this.staffFor(chat, user);
      if (!staff && this.manager(chat))
        staff =
          ticket.assigned_staff_id || this.engine.freeStaff()[0]?.staff_id;
      if (!staff)
        throw new Error("Cấu hình Telegram staff chat/user ID trước khi nhận");
      if (match[1] === "ack") this.engine.ack(ticket.ticket_id, staff);
      else {
        if (!this.manager(chat) && ticket.assigned_staff_id !== staff)
          throw new Error("Không phải nhân viên được phân công");
        this.engine.done(ticket.ticket_id, this.manager(chat) ? null : staff);
      }
    } catch (error) {
      response = error.message;
    }
    await this.api("answerCallbackQuery", {
      callback_query_id: query.id,
      text: response.slice(0, 180),
      show_alert: response !== "Đã xử lý",
    });
  }
  async poll() {
    if (!this.enabled || this.polling) return;
    this.polling = true;
    try {
      const updates = await this.api("getUpdates", {
        offset: this.offset,
        timeout: 0,
        allowed_updates: ["callback_query"],
      });
      for (const update of updates || []) {
        this.offset = update.update_id + 1;
        this.engine.state.telegram_offset = this.offset;
        this.engine.dirty = true;
        if (update.callback_query) await this.callback(update.callback_query);
      }
      this.lastError = null;
    } catch {
      this.lastError = "Telegram unavailable; will retry";
    } finally {
      this.polling = false;
    }
  }
  async notify(alert) {
    if (!this.enabled) return;
    try {
      const t = alert.ticket_id
        ? this.engine.state.tickets.find((t) => t.ticket_id === alert.ticket_id)
        : null;
      let chat;
      if (alert.type === "ASSIGNED" || alert.type === "ARRIVED")
        chat = this.config.staffChats[alert.staff_id] || this.config.group;
      else if (alert.type === "ESCALATED_L1") chat = this.config.group;
      else if (
        [
          "ESCALATED_L2",
          "OVERLOAD",
          "FORECAST_ALERT",
          "SPAM_DETECTED",
        ].includes(alert.type)
      )
        chat = this.config.manager;
      else return;
      if (!chat) return;
      const text = t
        ? `TICKET ${t.ticket_id}\nZone ${t.zone}\nType: ${t.intent}\nState: ${t.state}\nWaiting: ${Math.round((this.engine.now() - Date.parse(t.created_at)) / 1000)}s\nPriority: ${t.priority.toFixed(1)}\nETA: ${Math.ceil(t.eta_seconds || 0)}s`
        : `${alert.type}\n${alert.message || ""}`;
      const action =
        t?.state === "ARRIVED"
          ? "done"
          : t && ["PENDING", "ESCALATED_L1", "ESCALATED_L2"].includes(t.state)
            ? "ack"
            : null;
      const payload = { chat_id: chat, text };
      if (action)
        payload.reply_markup = {
          inline_keyboard: [
            [
              {
                text: action === "ack" ? "NHẬN" : "XONG",
                callback_data: `${action}:${t.ticket_id}`,
              },
            ],
          ],
        };
      await this.api("sendMessage", payload);
      this.lastError = null;
    } catch {
      this.lastError = "Telegram unavailable; will retry";
    }
  }
}
module.exports = { Telegram };
