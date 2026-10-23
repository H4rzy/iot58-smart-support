# REST API

Base `/api/iot58`; request/response JSON. Dashboard polling GET state mỗi giây. Server tạo timestamp canonical; ACK latency khác response time thực.

Status: bad input 400, not found 404, invalid transition 409, bảo vệ API_TOKEN 401, rate limit 429. Mutation success `{ok:true,...}`; lỗi `{ok:false,error:"..."}`.

| Method | Path sau base | Request / result |
|---|---|---|
| GET | /health | ok, version, mqtt, telegram, history_records, uptime |
| GET | /state | tickets, queue, staff, metrics, forecast, devices, clock, vision, config (gồm vision_enabled, vision_thresholds), alerts, mqtt, telegram |
| GET | /queue | Mảng waiting ticket đã rank |
| GET | /staff | Staff array và score_preview theo A/B/C |
| GET | /metrics | KPI phiên, AHT theo zone, zone/hour stats |
| GET | /forecast | synthetic, zones, λ, required_staff và recommendations |
| GET | /vision | Camera view theo A/B/C: `online`, `persons` (null khi offline, không bao giờ là 0 giả), `camera_id`, `footfall`, `dwell_seconds` |
| GET | /flow-health | flows_loaded=true; endpoint được đăng ký bởi flow |
| POST | /tickets/:ticketId/ack | `{"staff_id":"NV02"}` |
| POST | /tickets/:ticketId/done | `{}` hoặc `{"staff_id":"NV02"}`; bắt buộc ARRIVED |
| POST | /staff/:staffId/status | `{"status":"AVAILABLE"}`, BUSY hoặc OFFLINE |
| POST | /demo/reset | `{"reset_metrics":true}`; giữ synthetic history |
| POST | /demo/clock | `{"action":"set","datetime":"2026-10-09T17:45:00+07:00","speed":60}` |
| POST | /demo/clock | Action start/pause/reset; speed 1/10/60 |
| POST | /demo/mode | `{"demo_mode":true}` |

ARRIVED và CSAT là MQTT event từ customer point, không có REST arrival action trên Dashboard. DONE từ PENDING hoặc ACKNOWLEDGED bị reject 409 và audit. ACK từ ESCALATED được phép khi staff AVAILABLE và không có conflicting reservation.

```powershell
Invoke-RestMethod http://localhost:1880/api/iot58/health
Invoke-RestMethod -Method Post -Uri http://localhost:1880/api/iot58/staff/NV02/status -ContentType 'application/json' -Body '{"status":"AVAILABLE"}'
```

Nếu .env cấu hình API_TOKEN, POST cần header `Authorization: Bearer <token>`. Dashboard có mục nhập token, giữ trong RAM của trang; không lưu trình duyệt. Mặc định demo chỉ phục vụ localhost và chưa bật auth. Không expose cấu hình demo ra Internet.

UI_HOST mặc định 127.0.0.1; Docker override 0.0.0.0 cần mạng tin cậy. Xem [SECURITY](SECURITY.md).
