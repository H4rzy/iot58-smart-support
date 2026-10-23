# MQTT contract — schema 1

BASE lấy từ `MQTT_BASE_TOPIC`, mặc định `huit/iot58/n20-smart-support/store/s1`. Host mặc định `broker.hivemq.com:1883`, chỉ dùng classroom demo. Fallback: `test.mosquitto.org` hoặc `broker.emqx.io`; phải đổi host và BASE đồng bộ giữa firmware và Node-RED. Dùng namespace riêng ngẫu nhiên trước live demo.

| Topic sau BASE | Publisher | Subscriber | Retained? | Mục đích / payload |
|---|---|---|---|---|
| cp/A01/event, cp/B01/event, cp/C01/event | ESP32 | Node-RED | Không | schema, msg_id, boot_id, device_id, zone, event, uptime |
| cp/{id}/status | Node độc lập thật | Node-RED | Có | online/offline và boot_id; mỗi node có LWT |
| simulator/status | ESP32 simulation | Node-RED | Có | Một connection và một LWT cho ba logical point |
| cp/{id}/cmd | Node-RED | ESP32 đúng device_id | Snapshot có; receipt transient | State, cmd_id, ticket_id, rank, ETA, feedback |
| queue | Node-RED | Monitoring / tools | Có | Global queue đã sắp xếp, rank và ETA |
| display | Node-RED | OLED chung | Có | Queue count, top ticket, các điểm gọi |
| system/alert | Node-RED | Monitoring / tools | Không | Type, severity, message, server timestamp |
| system/metrics | Node-RED | Monitoring / tools | Có | KPI phiên, AHT, response, CSAT |
| system/vision | Node-RED | Dashboard / monitoring | Có | View camera theo A/B/C mỗi giây (online, persons null khi offline, footfall, dwell); không nằm trong `display` |

## Uplink

### Vision (camera đếm người, topic `vision/{zone}`)

Camera chỉ gửi số người theo khu, không gửi và không lưu ảnh. Topic `{BASE}/vision/{zone}` với zone A/B/C; payload:

```json
{"schema":1,"camera_id":"CAM-A","zone":"A","persons":2,"confidence":0.87,"ts":"2026-10-24T10:00:00.000Z"}
```

Server kiểm tra schema 1, zone thuộc A/B/C và khớp topic, camera_id `^[-\w]{1,64}$`, persons nguyên 0–50, kích thước payload. Khi `VISION_ENABLED=false` server trả `ignored` và không kiểm tra payload. Camera nên gửi mỗi 1–2 giây kể cả khi số người không đổi. Mất tín hiệu quá `VISION_STALE_SECONDS` thì khu được coi là offline và mọi luật camera tắt (fail-open).

Ví dụ request PAYMENT tại B01:

```json
{
  "schema": 1,
  "msg_id": "B01-B01F-000042",
  "boot_id": "B01F",
  "device_id": "B01",
  "zone": "B",
  "event": "REQUEST",
  "gesture": "long",
  "intent": "PAYMENT",
  "device_uptime_ms": 184302
}
```

Các event khác: CANCEL_REQUEST (gesture double), STAFF_ARRIVED, CSAT (rating SATISFIED/UNSATISFIED), INVALID_GESTURE, SPAM_DETECTED, CMD_APPLIED (cmd_id) và DEVICE_SYNC.

Topic device_id phải trùng payload; zone phải đúng registry. Server giới hạn payload, parse JSON và validate schema. Unknown device / intent / state / mismatched topic bị reject. Timestamp server là source of truth; uptime chỉ debug.

## Downlink

Ví dụ state sau ACK:

```json
{
  "schema": 1,
  "cmd_id": "CMD-example",
  "device_id": "B01",
  "ticket_id": "T20261009-0002",
  "state": "ACKNOWLEDGED",
  "rank": 0,
  "eta_seconds": 0,
  "display": "Staff accepted"
}
```

Firmware validate JSON, device_id và state; command hợp lệ mới điều khiển LED/OLED/buzzer.

Receipt có `receipt_msg_id`, xác nhận server đã xử lý event, hoàn toàn khác ACK của staff. Firmware chỉ xóa FIFO head khi receipt đúng msg_id. DEVICE_SYNC xin lại state sau reconnect.

CMD_APPLIED được audit và nhận transient receipt với **cùng cmd_id**. Server không cấp cmd_id mới chỉ để xác nhận event này; firmware không ACK lại cmd_id đã áp dụng, nên không có feedback loop. Snapshot có thể retained để reconnect nhận state mới nhất; receipt chỉ thuộc giao dịch event.

## Reliability và triển khai thật

Firmware lưu msg_id cùng event trong LittleFS, replay FIFO và server dedup 1 giờ. PubSubClient outbound QoS 0; Node-RED có thể publish QoS 1. Không tuyên bố exactly-once từ transport; application idempotency vẫn bắt buộc.

Simulation có một MQTT connection → một simulator LWT. Production mỗi ESP32-C3 có client ID riêng và LWT `BASE/cp/{id}/status`. LED orange offline là overlay, không xóa ticket server.

Kết quả test broker local không chứng minh public broker hoặc Wokwi đang online. Wokwi cloud không kết nối trực tiếp localhost. Không chứa secrets trong payload; production dùng broker private, MQTTS/TLS, auth và ACL theo [SECURITY](SECURITY.md).
