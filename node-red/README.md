# Middleware Node-RED – Đề tài 58

Node-RED là source of truth cho global queue A01/B01/C01. Business logic nằm trong `lib/`, Function nodes dùng đúng module được unit test qua `functionGlobalContext.iot58`. Dashboard vanilla được serve từ `../application`, không cần cài dashboard plugin.

## Chạy từ PowerShell

Node.js 22.9+ hoặc Node 20.17 LTS; Python 3 để tạo history. Các lệnh từ repository root:

```powershell
python analytics/seed_history.py
Set-Location node-red
Copy-Item .env.example .env
npm install
npm test
npm start
```

Nếu `.env` đã có cấu hình riêng thì giữ file đó. Mặc định kết nối `broker.hivemq.com:1883` và BASE `huit/iot58/n20-smart-support/store/s1`. Đổi namespace đồng thời với firmware khi demo trên public broker.

- Dashboard: <http://localhost:1880/>
- Editor 12 tab: <http://localhost:1880/red/>
- Health: <http://localhost:1880/api/iot58/health>
- Kiểm tra flow load: <http://localhost:1880/api/iot58/flow-health>

Chạy ở chế độ local integration với broker đã khởi động:

```powershell
$env:MQTT_HOST = '127.0.0.1'
npm start
```

Wokwi cloud không kết nối trực tiếp localhost; demo live dùng broker public, local broker dành cho test. `UI_HOST` mặc định `127.0.0.1`; Docker dùng `0.0.0.0`. Firmware và Node-RED dùng cùng contract tại [IMPLEMENTATION_CONTRACT.md](../docs/IMPLEMENTATION_CONTRACT.md).

## Các tab flow

01 MQTT INGEST xác thực + dedup, 02 TICKET ENGINE state transitions, 03 PRIORITY QUEUE aging/rank/ETA, 04 STAFF DISPATCH chọn/reserve staff, 05 SLA/ESCALATION timer500ms, 06 DEVICE DOWNLINK MQTT QoS1, 07 APPLICATION COMMANDS REST outbox, 08 TELEGRAM HTTPS callbacks, 09 ANALYTICS, 10 FORECAST, 11 REST API, 12 AUDIT/LOGGING. Các tab nối nhau bằng link nodes. MQTT wildcard dùng full env `MQTT_EVENTS_TOPIC` được tính trong settings; không dùng partial substitution gây subscribe sai.

## REST

GET `health`, `state`, `queue`, `staff`, `metrics`, `forecast` dưới `/api/iot58/` trả JSON. `state` chứa tickets/queue/staff/metrics/forecast/devices/clock/config/alerts/mqtt/telegram.

POST:

| Endpoint | Body | Điều kiện |
|---|---|---|
| `/tickets/{ticketId}/ack` | `{ "staff_id": "NV02" }` | Pending/escalated; staff không xung đột |
| `/tickets/{ticketId}/done` | `{ "staff_id": "NV02" }` hoặc `{}` | Chỉ ARRIVED |
| `/staff/{staffId}/status` | `{ "status": "AVAILABLE" }` | AVAILABLE/BUSY/OFFLINE |
| `/demo/reset` | `{ "reset_metrics": true }` | Giữ history; phát READY mới |
| `/demo/clock` | `{ "action":"set", "datetime":"2026-10-09T17:45:00+07:00", "speed":60 }` | start/pause/reset/set;1/10/60x |
| `/demo/mode` | `{ "demo_mode": false }` | Chuyển production thresholds |

HTTP400 input sai,404 không tồn tại,409 transition sai. Invalid DONE được append audit. Body giới hạn4096 bytes, rate limit40 mutations/10s/IP, reject cross-origin mutation. Nếu `API_TOKEN` được cấu hình, POST cần `Authorization: Bearer ...`; Dashboard cấu hình cùng token. Editor production cần `adminAuth`, MQTT TLS/auth/ACL private broker. Demo không có dữ liệu cá nhân.

## Persistence / reliability

`settings.js` bật Node-RED localfilesystem context; tab12 mirror runtime state. Runtime chủ động ghi atomic `data/state.json` cùng `.bak`, audit append-only `data/events.jsonl`. Persist ngay sau mỗi schema-valid uplink trước khi flush receipt để crash/replay không tạo ticket thứ hai. Dedup TTL1h được giữ qua restart. Khi state mới hỏng, thử backup; nếu cả hai hỏng, runtime khởi tạo rỗng và cần xem audit.

MQTT snapshots retained; receipt_msg_id transient. Firmware FIFO chờ receipt. Reset snapshots có `reset_demo:true` để thiết bị bỏ event cũ đã buffer trước reset; receipt không mang flag này. Mọi event hợp lệ về schema nhận receipt, kể cả business transition bị reject. CMD_APPLIED được receipt bằng chính cmd_id đã có; firmware không tạo CMD_APPLIED thứ hai cho cùng cmd_id, tránh command loop. DEVICE_SYNC sau reconnect lấy snapshot mới. ARRIVED/CANCEL/CSAT có `ticket_id` được ràng buộc với ticket hiện tại; event cũ đã buffer không tác động nhầm ticket mới. Snapshot/summary QoS1; firmware publish QoS0 được bảo vệ bằng application acknowledgement/replay.

SLA dùng monotonic real time được neo vào epoch integer milliseconds; forecast dùng virtual clock riêng. AHT cập nhật khi DONE từ ARRIVED, không từ CANCEL. Physical ARRIVED mới đo response. Thời gian mất server vẫn thể hiện trong recovery; restart có thể gây timeout/escalation ngay khi server lên lại.

Lệnh điều khiển không được phát lại với cmd_id mới chỉ vì countdown CSAT/spam giảm một giây. Timer gửi khi đổi trạng thái hoặc forced DEVICE_SYNC; Dashboard lấy countdown hiện tại qua REST. Regression xác minh CSAT không bị trễ bởi hàng đợi CMD_APPLIED.

## Telegram (optional)

1. Dùng BotFather tạo bot và lấy token.
2. Nhắn bot `/start`; truy cập Telegram `getUpdates` trên máy của bạn để lấy chat ID. Không chia sẻ URL có token.
3. Thêm `.env`: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_MANAGER_CHAT_ID`, `TELEGRAM_GROUP_CHAT_ID`; staff private chat/user IDs `TELEGRAM_NV01_CHAT_ID`, `TELEGRAM_NV02_CHAT_ID`, `TELEGRAM_NV03_CHAT_ID`.
4. Restart `npm start`; health hiển thị `telegram.enabled:true`.

Token rỗng: subsystem disabled, không request network/không crash. Chat allowlist được kiểm tra độc lập trước staff identity: nhân viên đã biết vẫn bị reject nếu thao tác từ chat chưa allowlist. Group được allowlist nhận alert nhưng người callback cần mapping staff ID (hoặc manager override), không cho thành viên không xác định nhận ticket. Inline NHẬN gọi ACK, XONG chỉ hợp lệ sau physical ARRIVED; mọi callback trả answerCallbackQuery. L1 gửi group; L2/overload/forecast/spam gửi manager; cooldown60s configurable. Telegram live cần final manual verification khi có token.

## Dependency audit

Node-RED4.1.16 được chạy và verify flows/API. Override package installer npm11.21.0 giảm audit từ21 còn5 advisory (2 moderate,3 high), đều trong bundled npm installer. `npm audit fix` không tự thay bundled dependencies. Không force-upgrade framework hoặc dùng npm12 đòi runtime mới hơn workspace. Những advisory còn lại là limitation production cần xử lý bằng cập nhật Node/npm/Node-RED tương thích; baseline lớp học dùng local editor, không cài package không tin cậy.
