# Implementation contract V2

Tên: **Máy lấy số / gọi nhân viên hỗ trợ thông minh**. Mục tiêu: tạo hàng đợi yêu cầu hỗ trợ tại cửa hàng và đo thời gian phản hồi. Contract này là source of truth chung; agent báo Lead trước khi đổi.

## Thiết bị / MQTT

Simulation: ESP32 DevKit C V4 mô phỏng A01/A, B01/B, C01/C. Production mỗi điểm là ESP32-C3 độc lập. Button GPIO18/19/23; ba WS2812 nối chuỗi DATA GPIO25, pixel index0/1/2 tương ứng A/B/C; OLED SDA21/SCL22; buzzer13. Không có nút ACK/DONE vật lý.

BASE env MQTT_BASE_TOPIC, mặc định `huit/iot58/n20-smart-support/store/s1`. Public HiveMQ:1883 demo; có env host/port. Uplink `BASE/cp/{id}/event`, status `BASE/simulator/status`; downlink `BASE/cp/{id}/cmd`; summaries `BASE/queue`, `BASE/display`, `BASE/system/metrics`, `BASE/system/alert`.

Event JSON `{schema:1,msg_id,boot_id,device_id,zone,event,device_uptime_ms,...}`. Events REQUEST(intent CONSULTATION/PAYMENT, gesture short/long), CANCEL_REQUEST(double), STAFF_ARRIVED, CSAT(rating SATISFIED/UNSATISFIED), INVALID_GESTURE, SPAM_DETECTED, CMD_APPLIED(cmd_id), DEVICE_SYNC. `DEVICE_SYNC` xin lại state sau reconnect. Server xác thực topic/id/zone, giới hạn payload, dedup 1h. Event receipt downlink `{schema:1,device_id,receipt_msg_id,...state snapshot...}` hỗ trợ persistent replay tới khi server đã nhận, do PubSubClient publish QoS0 không bảo đảm delivery. Downlink retained snapshot `{schema:1,cmd_id,device_id,ticket_id,state,rank,eta_seconds,display,csat_remaining_seconds?,lock_remaining_seconds?}`. CMD_APPLIED không phát sinh cmd loop; receipts không được CMD_APPLIED nếu không đổi cmd_id. Firmware kiểm tra JSON/id/state.

## State / time

Ticket states PENDING, ACKNOWLEDGED, ARRIVED, RESOLVED, CANCELLED, ESCALATED_L1, ESCALATED_L2. Device states thêm READY/CSAT_WAIT/SPAM_LOCK; offline overlay. Server là source of truth, mỗi device tối đa một active ticket. Pending/escalated -> ACKNOWLEDGED qua Application; physical button -> STAFF_ARRIVED -> ARRIVED; DONE chỉ ARRIVED -> RESOLVED. Sau resolve CSAT 15s rồi READY. CSAT_wait chặn request mới. Cancel chỉ pending/escalated. Response = arrived-created; ACK latency riêng; service = resolved-arrived. Server timestamps ISO, runtime elapsed real clock; virtual forecast clock tách biệt.

`cmd_id` chỉ đổi khi nội dung điều khiển thay đổi hoặc server ép đồng bộ sau reconnect/reset. Các giá trị `csat_remaining_seconds` và `lock_remaining_seconds` được gửi cùng snapshot đó; giảm đếm mỗi giây không tạo lệnh mới. Dashboard vẫn đọc countdown hiện tại từ REST. Cách này tránh vòng phản hồi CMD_APPLIED làm chậm event khách trong FIFO.

Short <800ms; long >=1500ms; vùng giữa invalid; double 2 short <=400ms chỉ cancel waiting. Debounce50ms. Spam >=5 suspicious presses/10s -> lock30s. Offline FIFO persistent LittleFS bounded; msg_id giữ nguyên; backpressure rõ, không silent drop.

## Algorithms

Priority=typeWeight(20/50)+5*waiting_minutes+20*escalation_level; sort descending, oldest first, id lexical cuối. StaffScore=100*[AVAILABLE]+30*[supports zone]-10*assigned_this_shift. Chỉ staff AVAILABLE và không active/reserved được dispatch; tie active count, oldest last_assigned_at, lexical. Staff data NV01 An A/C; NV02 Bình B; NV03 Chi A/B/C. Pending assignment reserves staff. No ACK timeout -> release/reassign excluding attempts; exhaustion L1, L2 after threshold. ACK can accept escalated ticket; selecting unavailable/conflicting staff rejected409. CSAT/ARRIVED không qua ACK button.

AHT zone EWMA alpha .3 initial120s, chỉ update resolved service. ETA=ceil(rank/max(1,free_staff))*zoneAHT. P90 nearest-rank. Overload waiting>on-duty*2, cooldown. Forecast 4-week matching weekday/hour average tickets/min, zero bins included. required=ceil(lambda*AHT_minutes/.8). Dataset synthetic seed58, rõ giả lập. Forecast horizon15min, virtual clock speed1/10/60.

## Module interfaces

Core agent owns node-red (except analytics.js/forecast.js and their tests), config/package/settings/flows/runtime/Telegram/REST. Analytics agent initially Lead owns analytics/, node-red/lib/analytics.js, forecast.js and tests. APIs pure modules CommonJS. analytics exports `ewma(old,latest,alpha=.3)`, `eta(rank,free,aht)`, `percentile(values,p=.9)`, `isOverloaded(waiting,onDuty,multiplier=2)`, `computeMetrics(tickets,staff,aht,now,config)`; output avg_response_seconds,p90_response_seconds,sla_violation_percent,csat_percent,waiting_tickets,active_tickets,escalated_tickets,available_staff,overload,aht_by_zone,response_by_zone,requests_by_intent,requests_by_zone. forecast exports `forecast(history,now,aht,staff,config)` returning `{at, synthetic:true,zones:[{zone,lambda_per_minute,aht_seconds,required_staff,staff_on_duty,additional_staff,recommendation}],recommendations:[]}`. Lead coordinates interface changes.

## REST / dashboard

GET /api/iot58/health,state,queue,staff,metrics,forecast. state returns `{tickets:[],queue:[],staff:[],metrics:{},forecast:{},devices:{A01:{state,...},...},clock:{datetime,speed,running},config:{demo_mode,...},alerts:[],mqtt:{connected},telegram:{enabled}}`. API timestamps ISO; ticket model follows user prompt. Mutation result `{ok:true,...}` error `{ok:false,error}`. ack POST body staff_id, done POST body optional staff_id; staff/:id/status POST status; demo/reset POST optional reset_metrics true; demo/clock POST `{action:'start'|'pause'|'reset'|'set',datetime?,speed?}`; demo/mode POST `{demo_mode:boolean}` optional. HTTP400 invalid,404 unknown,409 transition. Static app /, editor /red. Poll1s. ACK enabled waiting; DONE enabled ARRIVED. CSAT/ARRIVED physical only (scenario publisher for automated tests). Explicit DEMO MODE badge. No CDN.

## Config / delivery

.env keys from user prompt centralized. DEMO_MODE default true: ACK8s,L1=15s,L2=25s; production30/60/90. Response SLA KPI riêng `RESPONSE_SLA_SECONDS=120`. CSAT15s, dedup3600s, spam5 suspicious/10s/30s; cooldown configurable. Telegram disabled empty token; allowlist callback, assignment permissions; secrets never logged. Persist localfilesystem and atomic state JSON backup + append events.jsonl. Node-RED calls same tested modules via functionGlobalContext; flows contain12 explained sections (no missing plugin nodes). node:test tests and live local MQTT integration. Archive V1, preserve originals; docs truthful: browser Wokwi and Telegram token verification may remain manual.

## Vision (camera, R18)

Camera là cảm biến có mặt, không phải thiết bị khách và không có receipt/FIFO. Chỉ gửi số người theo khu; không gửi, không lưu ảnh; không nhận diện khuôn mặt hay danh tính.

Uplink `BASE/vision/{zone}` với zone `A|B|C` (topic phải khớp zone). Camera publish mỗi 1–2 giây kể cả khi số người không đổi (heartbeat). Payload:

```json
{"schema":1,"camera_id":"CAM-A","zone":"A","persons":2,"confidence":0.87,"ts":"2026-10-24T10:00:00.000Z"}
```

Server kiểm tra (`validateVision`): schema=1; zone thuộc A/B/C; topic khớp zone; `camera_id` khớp `^[-\w]{1,64}$`; `persons` nguyên 0..50; kích thước ≤ `PAYLOAD_MAX_BYTES`; JSON hợp lệ. `confidence` và `ts` là tùy chọn và hiện **không** được kiểm tra. Payload sai trả 400 và ghi audit `VISION_REJECTED`, không đổi state.

Biến môi trường (`.env.example`): `VISION_ENABLED=true`, `VISION_STALE_SECONDS=10`, `VISION_ABANDON_SECONDS=60`, `VISION_DWELL_SECONDS=180`, `DEMO_VISION_ABANDON_SECONDS=10`, `DEMO_VISION_DWELL_SECONDS=20`. Ngưỡng demo/production chọn theo `DEMO_MODE`. `VISION_ENABLED=false` thì mọi reading bị bỏ qua (`ignored:true`, không parse, không lưu) và mọi luật tắt.

Fail-open: reading cũ hơn `VISION_STALE_SECONDS` hoặc chưa có reading thì khu đó "offline". Offline không phải 0: `presence` và `arrival_verified` trả `null`, `isAbandoned` trả `false`, `view` trả `persons:null`. Khoảng im lặng làm đứt chuỗi trống/có người, nên thời gian camera mất tín hiệu không được tính là khu trống.

Luật:

| Luật | Điều kiện | Hành động |
|---|---|---|
| Bỏ đi | Ticket PENDING/ESCALATED, camera tươi, khu trống liên tục từ `max(empty_since, created_at)` đủ `abandon` giây | `cancel(t,"ABANDONED_VISION")`, alert `TICKET_ABANDONED` |
| Nghi ngờ | REQUEST, camera tươi, 0 người | `presence_verified=false`, alert `UNVERIFIED_REQUEST` (camera tươi ≥1 người: `true`; không camera: `null`) |
| Đến thật | STAFF_ARRIVED, camera tươi | `arrival_verified = persons>=2`; `false` kèm alert `ARRIVAL_UNVERIFIED`; camera không tươi: `null`. Không chặn ARRIVED |
| Chủ động | Khu có người liên tục từ `dwell` giây, thiết bị của khu không có ticket active và không ở CSAT_WAIT | alert `PROACTIVE_ASSIST` (cooldown theo `ALERT_COOLDOWN_SECONDS`) |

Field ticket mới: `presence_verified`, `arrival_verified`, `cancel_reason` (`CUSTOMER`, `ABANDONED_VISION`, hoặc null). Cancel bằng camera đi qua `cancel()` nên giải phóng staff, đặt `device.cancel_until` 1.5 giây như cũ, và không tính vào AHT/response/SLA (kiểm tra bằng unit test T-E12).

Đầu ra: `state.vision` (per zone: `persons`, `camera_id`, `footfall`, `empty_since`, `occupied_since`, `updated_at`); `snapshot()` có `vision`, `config.vision_enabled`, `config.vision_thresholds`; REST `GET /api/iot58/vision`; retained `BASE/system/vision` mỗi giây. Không nhét vision vào `display` (giữ dưới 768 byte). `reset()` giữ `vision`; state cũ không có `vision` vẫn nạp được.

Trạng thái: snapshot, retained topic và các luật có unit test. REST `/api/iot58/vision` đã nối nhưng chưa có test HTTP. Dashboard thẻ Camera và kịch bản MQTT `vision` chưa xong.

## Integration amendments được Lead chốt

- `CMD_APPLIED` cũng được FIFO lưu và chờ receipt. Server gửi receipt transient dùng **cùng cmd_id**; firmware không sinh CMD_APPLIED thêm nếu cmd_id đã áp dụng. Không bỏ receipt khiến head FIFO kẹt.
- Snapshot retained; receipt transient. State được atomic persist trước khi có thể gửi receipt để không ACK một event chưa lưu.
- MQTT in dùng full env `MQTT_EVENTS_TOPIC` / `MQTT_STATUS_TOPIC` do settings tạo; không dùng partial env substitution trong topic.
- Display là compact projection, không gồm ticket audit/timestamps đầy đủ: `{schema:1,queue_count,top_ticket:{ticket_id,device_id,intent,eta_seconds},devices:{A01:{state},B01:{state},C01:{state}}}`; serialized length <768 để phù hợp firmware.
- Browser Wokwi upload **4 file** gồm `partitions.csv` để LittleFS có partition; local build cũng dùng partition đó.
- Reset snapshot có `reset_demo:true`, firmware xóa pending FIFO/temporary state theo reset cmd_id; NVS giữ last reset đã áp dụng để retained reset cũ không xóa event offline mới sau reboot.
- Runtime monotonic elapsed được làm tròn về integer milliseconds, bảo đảm response_time_ms bằng phép trừ ISO timestamps. Clock ảo không đổi SLA real elapsed.
- Không L1 vì exhaustion trong lúc staff kế tiếp vẫn đang được assign chờ ACK; absolute L1 threshold vẫn áp dụng độc lập.
- Browser phát hiện ba Adafruit_NeoPixel instances trên ESP32/RMT làm cả ba indicator cùng màu. Simulation chuyển sang một controller ba pixel nối chuỗi GPIO25; từng logical kiosk giữ pixel index riêng. Vẫn có ba RGB indicators độc lập và một nút mỗi điểm; production mỗi C3 chỉ điều khiển một pixel.
- Ghi LittleFS chỉ ở network worker, snapshot copy trong mutex ngắn; loop input/output không chờ flash write. Event được persist trước publish và xóa khỏi FIFO sau receipt. ESP32 NetworkClient.setTimeout dùng seconds, cấu hình2s.
