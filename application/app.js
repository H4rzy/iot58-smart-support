'use strict';

(() => {
  const API = '/api/iot58';
  const POLL_MS = 1000;
  const REQUEST_TIMEOUT_MS = 7000;
  const WAITING = new Set(['PENDING', 'ESCALATED_L1', 'ESCALATED_L2']);
  const ACTIVE = new Set([...WAITING, 'ACKNOWLEDGED', 'ARRIVED']);
  const ZONES = { A: 'iPhone', B: 'Android', C: 'Phụ kiện' };
  const STATES = {
    READY: ['Sẵn sàng', 'green'], PENDING: ['Đang chờ', 'yellow'],
    ACKNOWLEDGED: ['Đã nhận', 'blue'], ARRIVED: ['Đã đến', 'cyan'],
    RESOLVED: ['Hoàn tất', 'green'], CSAT_WAIT: ['Chờ đánh giá', 'green'],
    CANCELLED: ['Đã hủy', 'purple'], ESCALATED_L1: ['Cảnh báo L1', 'red'],
    ESCALATED_L2: ['Cảnh báo L2', 'red'], SPAM_LOCK: ['Khóa spam', 'purple'],
    AVAILABLE: ['Sẵn sàng', 'green'], BUSY: ['Đang bận', 'yellow'], OFFLINE: ['Offline', 'neutral']
  };
  const LED_COLORS = { READY: '#86a281', PENDING: '#e7b535', ACKNOWLEDGED: '#378bcb', ARRIVED: '#34a6a0', RESOLVED: '#50a25b', CSAT_WAIT: '#50a25b', CANCELLED: '#9a71b2', ESCALATED_L1: '#d45c4c', ESCALATED_L2: '#d45c4c', SPAM_LOCK: '#9a71b2' };
  const RECENT_VISION_CANCEL_MS = 60000;
  const CAMERA_STATUS = {
    online: ['Có tín hiệu', 'green'], offline: ['Mất tín hiệu', 'yellow'],
    disabled: ['Đã tắt', 'neutral'], unknown: ['Chưa có dữ liệu', 'neutral']
  };
  const ALERT_LABELS = new Map([
    ['TICKET_ABANDONED', 'Khách bỏ đi · tự hủy'], ['UNVERIFIED_REQUEST', 'Yêu cầu chưa xác minh'],
    ['ARRIVAL_UNVERIFIED', 'Nhân viên chưa xác minh'], ['PROACTIVE_ASSIST', 'Khách chờ chưa có ticket']
  ]);
  const $ = (id) => document.getElementById(id);
  let state = null;
  let polling = false;
  let mutationPending = false;
  let reachable = false;
  let toastTimer;
  let clockInitialized = false;
  let accessToken = '';
  const staffSelections = new Map();

  // API values always enter the DOM as text, including audit and Telegram messages.
  function node(tag, className, content) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content !== undefined && content !== null) element.textContent = String(content);
    return element;
  }
  function badge(value) {
    const [label, color] = STATES[value] || [value || '—', 'neutral'];
    const element = node('span', `badge badge-${color}`, label);
    element.title = value || '';
    return element;
  }
  function numeric(value) { return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)); }
  function number(value, decimals = 0) { return numeric(value) ? Number(value).toLocaleString('vi-VN', { maximumFractionDigits: decimals, minimumFractionDigits: decimals }) : '—'; }
  function duration(seconds) {
    if (!numeric(seconds)) return 'N/A';
    const value = Math.max(0, Math.round(Number(seconds)));
    if (value < 60) return `${value}s`;
    if (value < 3600) return `${Math.floor(value / 60)}m ${value % 60}s`;
    return `${Math.floor(value / 3600)}h ${Math.floor((value % 3600) / 60)}m`;
  }
  function percent(value) { return numeric(value) ? `${number(value, 1)}%` : 'N/A'; }
  function time(value, full = false) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('vi-VN', { ...(full ? { day: '2-digit', month: '2-digit', year: 'numeric' } : {}), hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  function localDatetime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  function showToast(message, error = false) {
    clearTimeout(toastTimer);
    $('toast').textContent = message;
    $('toast').className = `toast${error ? ' error' : ''}`;
    $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 6500 : 3500);
  }
  async function request(path, body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${API}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store', signal: controller.signal
      });
      let result;
      try { result = await response.json(); } catch { throw new Error(`API trả về dữ liệu không hợp lệ (HTTP ${response.status}).`); }
      if (!response.ok || result.ok === false) throw new Error(`HTTP ${response.status}: ${result.error || result.message || 'Yêu cầu bị từ chối.'}`);
      return result;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('API không phản hồi trong 7 giây.');
      throw error;
    } finally { clearTimeout(timeout); }
  }
  function setReachable(online, message) {
    reachable = online;
    $('connection-dot').className = `status-dot ${online ? 'online' : 'offline'}`;
    $('connection-label').textContent = online ? 'API đã kết nối' : 'API mất kết nối';
    $('connection-warning').hidden = online;
    if (!online) $('connection-warning').textContent = `Không thể cập nhật: ${message || 'Kiểm tra Node-RED.'} ${state ? 'Đang hiển thị bản cập nhật gần nhất; thao tác tạm khóa.' : 'Chưa có dữ liệu vận hành.'}`;
    updateControls();
  }
  function updateControls() {
    const disabled = !reachable || mutationPending;
    document.querySelectorAll('button[data-action],button[data-clock],#reset-demo,#clock-form button,#demo-mode,.staff-status-control').forEach((control) => { control.disabled = disabled || control.dataset.forbidden === 'true'; });
  }
  async function mutate(path, body, message) {
    if (mutationPending || !reachable) return;
    mutationPending = true;
    updateControls();
    try {
      await request(path, body);
      showToast(message);
      await poll(true);
    } catch (error) {
      showToast(error.message, true);
    } finally {
      mutationPending = false;
      updateControls();
    }
  }

  function renderKpis(metrics = {}) {
    const items = [
      ['Đang chờ', number(metrics.waiting_tickets), 'Hàng đợi toàn cửa hàng', 'kpi-highlight'],
      ['Đang hoạt động', number(metrics.active_tickets), 'Chờ / đã nhận / đã đến'],
      ['Đã escalation', number(metrics.escalated_tickets), 'L1 + L2', metrics.escalated_tickets > 0 ? 'kpi-alert' : ''],
      ['Phản hồi trung bình', duration(metrics.avg_response_seconds), 'Tạo ticket → ARRIVED'],
      ['P90 phản hồi', duration(metrics.p90_response_seconds), 'Nearest-rank / 90%'],
      ['Vi phạm SLA', percent(metrics.sla_violation_percent), 'Dựa trên phản hồi thực'],
      ['CSAT hài lòng', percent(metrics.csat_percent), 'Chỉ đánh giá đã gửi'],
      ['Nhân viên rảnh', number(metrics.available_staff), 'Sẵn sàng nhận yêu cầu'],
      ['Tải hệ thống', metrics.overload ? 'Quá tải' : state ? 'Ổn định' : '—', 'Chờ > nhân sự × 2', metrics.overload ? 'kpi-alert' : '']
    ];
    $('kpi-grid').replaceChildren(...items.map(([label, value, note, modifier = '']) => {
      const card = node('article', `kpi ${modifier}`);
      card.append(node('span', 'kpi-label', label), node('strong', 'kpi-value', value), node('span', 'kpi-note', note));
      return card;
    }));
    $('overload-banner').hidden = !metrics.overload;
    $('overload-banner').textContent = `QUÁ TẢI · ${number(metrics.waiting_tickets)} yêu cầu chờ vượt năng lực nhân sự trên sàn. Cần bổ sung nhân viên hoặc xử lý ticket lâu nhất.`;
  }
  function renderDevices(devices = {}) {
    $('devices').replaceChildren(...Object.entries(ZONES).map(([zone, name]) => {
      const id = `${zone}01`;
      const device = devices[id] || {};
      const card = node('article', 'device-card');
      const top = node('div', 'device-top');
      const title = node('div', 'device-zone', id);
      title.append(node('span', 'device-name', `${name} / Khu ${zone}`));
      const light = node('span', 'device-light');
      light.style.backgroundColor = device.online === false ? '#dc8733' : LED_COLORS[device.state] || '#d7dfd2';
      light.setAttribute('aria-label', `LED ${device.online === false ? 'offline' : device.state || 'chưa có dữ liệu'}`);
      top.append(title, light);
      const meta = node('div', 'device-meta');
      meta.append(node('span', 'device-ticket', device.ticket_id || 'Chưa có ticket'), node('span', '', device.rank ? `#${device.rank} · ETA ${duration(device.eta_seconds)}` : ''));
      const status = node('div', 'device-state');
      status.append(badge(device.state), node('small', '', device.online === true ? 'Thiết bị online' : device.online === false ? 'Thiết bị offline' : 'Chưa có heartbeat'));
      card.append(top, meta, status);
      return card;
    }));
  }
  function renderCameras(vision, config = {}) {
    const disabled = config.vision_enabled === false;
    const available = !disabled && Boolean(vision) && typeof vision === 'object';
    $('vision-disabled').hidden = !disabled;
    $('camera-grid').replaceChildren(...Object.keys(ZONES).map((zone) => {
      const camera = available && vision[zone] && typeof vision[zone] === 'object' ? vision[zone] : {};
      const status = disabled ? 'disabled' : !available ? 'unknown' : camera.online === true ? 'online' : 'offline';
      return cameraCard(zone, camera, status);
    }));
  }
  function cameraCard(zone, camera, status) {
    // Offline or missing counts are shown as text, never as 0.
    const hasCount = status === 'online' && numeric(camera.persons);
    const personsText = hasCount ? number(camera.persons) : status === 'offline' ? 'Không có tín hiệu' : '—';
    const dwellText = hasCount && Number(camera.persons) > 0 && numeric(camera.dwell_seconds) ? duration(camera.dwell_seconds) : '—';
    const footfallText = numeric(camera.footfall) ? number(camera.footfall) : '—';
    const card = node('article', `camera-card${status === 'disabled' ? ' is-disabled' : ''}`);
    const head = node('div', 'camera-head');
    const [statusLabel, statusColor] = CAMERA_STATUS[status];
    head.append(node('span', 'camera-zone', `Khu ${zone} · ${ZONES[zone]}`), node('span', `badge badge-${statusColor}`, statusLabel));
    const stats = node('div', 'camera-stats');
    stats.append(
      cameraStat('Số người', personsText, hasCount ? '' : 'camera-offline'),
      cameraStat('Thời gian đứng', dwellText),
      cameraStat('Tổng lượt khách', footfallText)
    );
    card.append(head, stats, node('small', 'camera-id', camera.camera_id ? `Camera ${camera.camera_id}` : 'Chưa có camera'));
    return card;
  }
  function cameraStat(label, value, valueClass = '') {
    const box = node('div');
    box.append(node('span', '', label), node('strong', valueClass, value));
    return box;
  }
  function visionBadges(ticket) {
    const badges = [];
    if (ticket.presence_verified === true) badges.push(node('span', 'badge badge-green', 'Đã xác minh có khách'));
    else if (ticket.presence_verified === false) badges.push(node('span', 'badge badge-demo', 'Nghi ngờ: không thấy người'));
    if (ticket.arrival_verified === true) badges.push(node('span', 'badge badge-cyan', 'Đã xác minh nhân viên đến'));
    else if (ticket.arrival_verified === false) badges.push(node('span', 'badge badge-yellow', 'Chưa xác minh nhân viên'));
    if (ticket.cancel_reason === 'ABANDONED_VISION') badges.push(node('span', 'badge badge-purple', 'Tự hủy: khách bỏ đi'));
    return badges;
  }
  function isRecentVisionCancel(ticket) {
    return ticket.state === 'CANCELLED' && ticket.cancel_reason === 'ABANDONED_VISION' && Date.now() - Date.parse(ticket.cancelled_at) <= RECENT_VISION_CANCEL_MS;
  }
  function alertLabel(alert) {
    const type = alert.type || 'SYSTEM';
    const label = node('strong', '', ALERT_LABELS.get(type) || type);
    label.title = type;
    return label;
  }
  function activeTickets(snapshot) {
    const tickets = new Map();
    const visible = (ticket) => ACTIVE.has(ticket.state) || isRecentVisionCancel(ticket);
    (snapshot.tickets || []).filter(visible).forEach((ticket) => tickets.set(ticket.ticket_id, ticket));
    (snapshot.queue || []).filter(visible).forEach((ticket) => tickets.set(ticket.ticket_id, ticket));
    return [...tickets.values()].sort((a, b) => {
      const aWaiting = WAITING.has(a.state), bWaiting = WAITING.has(b.state);
      if (aWaiting !== bWaiting) return aWaiting ? -1 : 1;
      if (aWaiting) return (a.queue_rank || Number.MAX_SAFE_INTEGER) - (b.queue_rank || Number.MAX_SAFE_INTEGER) || Number(b.priority) - Number(a.priority) || Date.parse(a.created_at) - Date.parse(b.created_at);
      return Date.parse(a.created_at) - Date.parse(b.created_at);
    });
  }
  function renderQueue(snapshot) {
    // Do not replace a focused select while the user chooses an ACK identity.
    if ($('queue-body').contains(document.activeElement) && document.activeElement.tagName === 'SELECT') return;
    const tickets = activeTickets(snapshot);
    $('queue-count').textContent = tickets.filter((ticket) => ACTIVE.has(ticket.state)).length;
    if (!tickets.length) {
      const cell = node('td', 'empty-state', 'Sàn cửa hàng đã sẵn sàng. Nhấn nút A / B / C tại Wokwi để tạo yêu cầu.');
      cell.colSpan = 9;
      const row = node('tr'); row.append(cell); $('queue-body').replaceChildren(row); return;
    }
    $('queue-body').replaceChildren(...tickets.map((ticket) => {
      const row = node('tr');
      row.dataset.ticketId = ticket.ticket_id;
      row.append(node('td', 'rank-number', WAITING.has(ticket.state) ? `#${ticket.queue_rank || '—'}` : '—'));
      const identity = node('td', 'ticket-cell');
      identity.append(node('strong', '', ticket.ticket_id), node('small', '', `${ticket.device_id} · ${ZONES[ticket.zone] || ticket.zone}`));
      const badges = visionBadges(ticket);
      if (badges.length) { const badgeBox = node('div', 'ticket-badges'); badgeBox.append(...badges); identity.append(badgeBox); }
      row.append(identity);
      const intent = node('td');
      intent.append(node('span', `badge badge-${ticket.intent === 'PAYMENT' ? 'demo' : 'neutral'}`, ticket.intent === 'PAYMENT' ? 'PAYMENT' : 'CONSULTATION')); row.append(intent);
      row.append(node('td', 'priority-value', number(ticket.priority, 1)));
      const reference = WAITING.has(ticket.state) ? Date.now() : Date.parse(ticket.arrived_at || ticket.ack_at || ticket.cancelled_at);
      row.append(node('td', '', duration((reference - Date.parse(ticket.created_at)) / 1000)));
      row.append(node('td', '', WAITING.has(ticket.state) ? duration(ticket.eta_seconds) : '—'));
      const stateCell = node('td'); stateCell.append(badge(ticket.state)); row.append(stateCell);
      const staffCell = node('td');
      if (WAITING.has(ticket.state)) {
        const select = node('select', 'queue-staff-select');
        select.setAttribute('aria-label', `Nhân viên ACK ticket ${ticket.ticket_id}`);
        select.dataset.ticketId = ticket.ticket_id;
        // The assigned employee may be reserved; the server still validates conflicts.
        const eligible = (snapshot.staff || []).filter((staff) => (staff.status === 'AVAILABLE' && (!staff.current_ticket || staff.current_ticket === ticket.ticket_id)) || staff.staff_id === ticket.assigned_staff_id);
        select.append(node('option', '', 'Chọn nhân viên'));
        select.options[0].value = '';
        eligible.forEach((staff) => { const option = node('option', '', `${staff.name} (${staff.staff_id})`); option.value = staff.staff_id; select.append(option); });
        const preferred = staffSelections.get(ticket.ticket_id) || ticket.assigned_staff_id;
        if (eligible.some((staff) => staff.staff_id === preferred)) select.value = preferred;
        staffCell.append(select);
      } else {
        const employee = (snapshot.staff || []).find((staff) => staff.staff_id === ticket.assigned_staff_id);
        staffCell.append(node('span', '', employee ? employee.name : ticket.assigned_staff_id || '—'));
      }
      row.append(staffCell);
      const actions = node('td', 'queue-actions');
      if (ticket.state === 'CANCELLED') { actions.append(node('small', 'arrival-hint', 'Không cần thao tác')); row.append(actions); return row; }
      const button = node('button', 'button', WAITING.has(ticket.state) ? 'ACK · Nhận' : 'DONE · Xong');
      button.type = 'button'; button.dataset.ticketId = ticket.ticket_id;
      button.dataset.action = WAITING.has(ticket.state) ? 'ack' : 'done';
      button.dataset.forbidden = String(!WAITING.has(ticket.state) && ticket.state !== 'ARRIVED');
      button.setAttribute('aria-label', `${button.dataset.action.toUpperCase()} ticket ${ticket.ticket_id}`);
      if (ticket.state === 'ACKNOWLEDGED') { button.title = 'Nhấn nút vật lý tại quầy để xác nhận ARRIVED trước khi DONE.'; }
      actions.append(button);
      if (ticket.state === 'ACKNOWLEDGED') actions.append(node('small', 'arrival-hint', 'Chờ nhấn nút tại quầy'));
      row.append(actions);
      return row;
    }));
  }
  function renderStaff(staff = []) {
    if ($('staff-grid').contains(document.activeElement) && document.activeElement.tagName === 'SELECT') return;
    if (!staff.length) { $('staff-grid').replaceChildren(node('div', 'empty-state', 'Chưa có dữ liệu nhân viên.')); return; }
    $('staff-grid').replaceChildren(...staff.map((person) => {
      const card = node('article', 'staff-card');
      const top = node('div', 'staff-top');
      const identity = node('div');
      identity.append(node('div', 'staff-name', person.name), node('div', 'staff-id', person.staff_id));
      top.append(node('div', 'avatar', String(person.name || '?').slice(0, 1)), identity, badge(person.status));
      const zones = node('div', 'staff-zones', `Hỗ trợ khu ${(person.zones || []).join(' · ')}`);
      const facts = node('div', 'staff-facts');
      const assigned = node('div'); assigned.append(node('span', '', 'LƯỢT NHẬN / CA'), node('strong', '', number(person.tickets_assigned_this_shift)));
      const score = node('div');
      const scores = person.score_preview || {};
      const preview = Object.entries(ZONES).map(([zone]) => `${zone} ${numeric(scores[zone]) ? number(scores[zone]) : '—'}`).join(' / ');
      score.append(node('span', '', 'ĐIỂM KHU A / B / C'), node('strong', '', preview));
      score.lastElementChild.style.fontSize = '12px'; score.lastElementChild.style.marginTop = '7px';
      facts.append(assigned, score);
      const current = node('div', 'staff-ticket', person.current_ticket ? `Đang nhận: ${person.current_ticket}` : 'Chưa có ticket được giao');
      const status = node('select', 'staff-status-control'); status.dataset.staffId = person.staff_id; status.setAttribute('aria-label', `Trạng thái nhân viên ${person.name}`);
      ['AVAILABLE', 'BUSY', 'OFFLINE'].forEach((value) => { const option = node('option', '', `${value} · ${STATES[value][0]}`); option.value = value; status.append(option); });
      status.value = person.status;
      card.append(top, zones, facts, current, status);
      return card;
    }));
  }
  function renderAnalytics(metrics = {}) {
    const zoneResponses = metrics.response_by_zone || {};
    $('zone-stats').replaceChildren(...Object.entries(ZONES).map(([zone, label]) => {
      const row = node('tr');
      const response = zoneResponses[zone];
      const average = response && typeof response === 'object' ? response.avg_response_seconds ?? response.average_seconds : response;
      row.append(node('td', '', `${zone} · ${label}`), node('td', '', duration(average)), node('td', '', duration(response?.p90_response_seconds)), node('td', '', duration(response?.avg_service_seconds)), node('td', '', duration((metrics.aht_by_zone || {})[zone])), node('td', '', number((metrics.requests_by_zone || {})[zone] ?? 0)));
      return row;
    }));
    const requests = metrics.requests_by_intent || {};
    const total = Math.max(1, Number(requests.CONSULTATION || 0) + Number(requests.PAYMENT || 0));
    $('intent-chart').replaceChildren(...['CONSULTATION', 'PAYMENT'].map((intent) => {
      const value = Number(requests[intent] || 0);
      const bar = node('div');
      const heading = node('div', 'bar-heading'); heading.append(node('span', '', intent === 'CONSULTATION' ? 'Tư vấn' : 'Thanh toán / khẩn'), node('strong', '', `${number(value)} · ${number(value / total * 100)}%`));
      const track = node('div', 'bar-track'); const fill = node('div', `bar-fill${intent === 'PAYMENT' ? ' bar-payment' : ''}`);
      fill.style.width = `${Math.min(100, Math.max(0, value / total * 100))}%`; track.append(fill); bar.append(heading, track); return bar;
    }));
    const hours = metrics.requests_by_hour || {};
    const maximum = Math.max(1, ...Object.values(hours).map(Number).filter(Number.isFinite));
    $('hour-chart').replaceChildren(...Array.from({ length: 24 }, (_, hour) => {
      const value = Number(hours[hour] || 0);
      const column = node('div', 'hour-column');
      column.title = `${String(hour).padStart(2, '0')}:00 · ${number(value)} yêu cầu`;
      column.setAttribute('aria-label', column.title);
      const bar = node('div', 'hour-bar');
      bar.style.height = `${Math.max(2, value / maximum * 72)}px`;
      column.append(node('span', 'hour-count', value || ''), bar, node('span', 'hour-label', hour % 3 === 0 ? String(hour).padStart(2, '0') : ''));
      return column;
    }));
  }
  function renderForecast(forecast = {}) {
    $('forecast-at').textContent = forecast.at ? `Dự báo ${time(forecast.at, true)}` : 'Chưa có kết quả';
    const zones = Array.isArray(forecast.zones) ? forecast.zones : [];
    $('forecast-grid').replaceChildren(...zones.map((zone) => {
      const card = node('article', 'forecast-card');
      card.append(node('div', 'forecast-zone', `Khu ${zone.zone} · ${ZONES[zone.zone] || ''}`), node('div', 'forecast-demand', `λ ${number(zone.lambda_per_minute, 3)} ticket/phút · AHT ${duration(zone.aht_seconds)}`));
      const values = node('div', 'forecast-numbers');
      values.append(node('strong', zone.additional_staff > 0 ? 'shortage' : '', number(zone.required_staff)), node('span', '', `cần / ${number(zone.staff_on_duty)} trên sàn`));
      card.append(values, node('span', `badge badge-${zone.additional_staff > 0 ? 'demo' : 'green'}`, zone.additional_staff > 0 ? `Cần thêm ${number(zone.additional_staff)} nhân viên` : 'Đủ năng lực'));
      return card;
    }));
    const recommendations = Array.isArray(forecast.recommendations) ? forecast.recommendations : [];
    $('recommendations').replaceChildren(...(recommendations.length ? recommendations.map((recommendation) => node('p', '', typeof recommendation === 'string' ? recommendation : recommendation.message || recommendation.recommendation || '')) : [node('p', '', zones.length ? 'Nhân sự hiện tại đáp ứng dự báo cho các khu.' : 'Đang chờ dữ liệu lịch sử và forecast engine.')]));
  }
  function renderClock(clock = {}) {
    $('virtual-time').textContent = time(clock.datetime, true);
    $('clock-state').textContent = `${clock.running ? 'ĐANG CHẠY' : 'TẠM DỪNG'} · ${number(clock.speed || 1)}×`;
    if (!clockInitialized && clock.datetime) {
      $('clock-datetime').value = localDatetime(clock.datetime);
      $('clock-speed').value = String(clock.speed || 1);
      clockInitialized = true;
    }
  }
  function renderAlerts(alerts = []) {
    if (!Array.isArray(alerts) || !alerts.length) { $('alerts-list').replaceChildren(node('li', 'empty-state', 'Chưa có cảnh báo trong phiên hiện tại.')); return; }
    $('alerts-list').replaceChildren(...[...alerts].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 10).map((alert) => {
      const item = node('li', 'alert-item');
      item.append(node('time', '', time(alert.at)), alertLabel(alert), node('span', '', alert.message || alert.ticket_id || 'Sự kiện hệ thống'));
      return item;
    }));
  }
  function render(snapshot) {
    const config = snapshot.config || {};
    const demo = config.demo_mode === true;
    $('mode-badge').textContent = demo ? 'DEMO MODE' : 'NORMAL MODE';
    $('mode-badge').className = `badge badge-${demo ? 'demo' : 'green'}`;
    $('demo-mode').checked = demo;
    $('timeout-description').textContent = `${demo ? 'Demo' : 'Normal'}: ACK ${duration(config.thresholds?.assign)} · L1 ${duration(config.thresholds?.l1)} · L2 ${duration(config.thresholds?.l2)}. Ngưỡng được lấy trực tiếp từ middleware.`;
    $('operating-status').textContent = snapshot.metrics?.overload ? 'Cần bổ sung nhân sự' : 'Theo dõi vận hành trực tiếp';
    $('threshold-label').textContent = demo ? 'Demo thresholds được rút ngắn · SLA dùng clock thực' : 'Production thresholds · SLA dùng clock thực';
    $('alpha-value').textContent = number(config.aht_alpha ?? 0.3, 1);
    $('mqtt-status').textContent = snapshot.mqtt?.connected ? 'MQTT ONLINE' : 'MQTT OFFLINE';
    $('mqtt-status').className = `badge badge-${snapshot.mqtt?.connected ? 'green' : 'red'}`;
    $('telegram-status').textContent = snapshot.telegram?.enabled ? 'TELEGRAM ON' : 'TELEGRAM DISABLED';
    $('telegram-status').className = `badge badge-${snapshot.telegram?.enabled ? 'green' : 'neutral'}`;
    renderKpis(snapshot.metrics);
    renderDevices(snapshot.devices);
    renderCameras(snapshot.vision, snapshot.config);
    renderQueue(snapshot);
    renderStaff(snapshot.staff);
    renderAnalytics(snapshot.metrics);
    renderForecast(snapshot.forecast);
    renderClock(snapshot.clock);
    renderAlerts(snapshot.alerts);
    updateControls();
  }
  async function poll(force = false) {
    if (polling) return;
    if (document.hidden && !force) return;
    polling = true;
    try {
      const snapshot = await request('/state');
      if (!Array.isArray(snapshot.tickets) || !Array.isArray(snapshot.staff) || !snapshot.metrics) throw new Error('State API không đúng contract.');
      state = snapshot;
      setReachable(true);
      $('last-update').textContent = time(new Date().toISOString());
      render(snapshot);
    } catch (error) { setReachable(false, error.message); }
    finally { polling = false; }
  }

  $('queue-body').addEventListener('change', (event) => {
    if (event.target.matches('.queue-staff-select')) staffSelections.set(event.target.dataset.ticketId, event.target.value);
  });
  $('queue-body').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button || button.disabled || !state) return;
    const id = button.dataset.ticketId;
    const ticket = activeTickets(state).find((entry) => entry.ticket_id === id);
    if (!ticket) return;
    if (button.dataset.action === 'ack') {
      const staffId = button.closest('tr').querySelector('select').value;
      if (!staffId) { showToast('Chọn nhân viên để nhận ticket.', true); return; }
      mutate(`/tickets/${encodeURIComponent(id)}/ack`, { staff_id: staffId }, 'Đã ACK. Lệnh LED xanh dương được gửi qua MQTT.');
    } else if (ticket.state === 'ARRIVED') {
      mutate(`/tickets/${encodeURIComponent(id)}/done`, { staff_id: ticket.assigned_staff_id }, 'Đã hoàn tất. Khách có thể đánh giá tại nút quầy trong cửa sổ CSAT.');
    }
  });
  $('staff-grid').addEventListener('change', (event) => {
    const control = event.target.closest('.staff-status-control');
    if (control) mutate(`/staff/${encodeURIComponent(control.dataset.staffId)}/status`, { status: control.value }, 'Đã cập nhật trạng thái nhân viên; dispatch engine tính lại.');
  });
  $('clock-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const selected = new Date($('clock-datetime').value);
    if (Number.isNaN(selected.getTime())) { showToast('Mốc thời gian không hợp lệ.', true); return; }
    mutate('/demo/clock', { action: 'set', datetime: selected.toISOString(), speed: Number($('clock-speed').value) }, 'Đã đặt thời gian forecast; SLA vẫn dùng thời gian thực.');
  });
  document.querySelectorAll('[data-clock]').forEach((button) => button.addEventListener('click', () => {
    if (button.dataset.clock === 'reset') clockInitialized = false;
    mutate('/demo/clock', { action: button.dataset.clock, speed: Number($('clock-speed').value) }, 'Đã cập nhật đồng hồ ảo.');
  }));
  $('demo-mode').addEventListener('change', () => mutate('/demo/mode', { demo_mode: $('demo-mode').checked }, 'Đã cập nhật chế độ timeout.'));
  $('access-form').addEventListener('submit', (event) => {
    event.preventDefault();
    accessToken = $('access-token').value.trim();
    $('access-token').value = '';
    showToast(accessToken ? 'Đã áp dụng token cho thao tác trong phiên trang này.' : 'Đã xóa token của phiên trang này.');
  });
  $('reset-demo').addEventListener('click', () => $('reset-dialog').showModal());
  $('reset-dialog').addEventListener('close', () => {
    if ($('reset-dialog').returnValue !== 'confirm') return;
    clockInitialized = false;
    staffSelections.clear();
    mutate('/demo/reset', { reset_metrics: $('reset-metrics').checked }, 'Đã reset demo. READY được gửi tới A01, B01, C01.');
  });
  document.querySelectorAll('.nav-link').forEach((link) => link.addEventListener('click', () => {
    document.querySelectorAll('.nav-link').forEach((item) => item.classList.toggle('active', item === link));
  }));
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      document.querySelectorAll('.nav-link').forEach((link) => link.classList.toggle('active', link.getAttribute('href') === `#${visible.target.id}`));
    }, { rootMargin: '-10% 0px -55% 0px', threshold: [0, 0.2, 0.5] });
    document.querySelectorAll('.section-anchor').forEach((section) => observer.observe(section));
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(true); });
  renderKpis(); renderDevices(); renderCameras(); renderStaff(); renderAnalytics(); updateControls();
  poll();
  setInterval(poll, POLL_MS);
})();
