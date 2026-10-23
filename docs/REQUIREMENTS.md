# Yêu cầu V2 — Đề tài 58

**Máy lấy số / gọi nhân viên hỗ trợ thông minh**

Mục tiêu: tạo hàng đợi yêu cầu hỗ trợ tại cửa hàng và đo thời gian phản hồi. Bối cảnh là cửa hàng điện thoại / điện máy khoảng 200 m², gồm khu A — iPhone, B — Android, C — Phụ kiện và khoảng 3–4 nhân viên. Thiết bị càng đơn giản càng tốt; phần quyết định thông minh nằm ở middleware.

| ID | Yêu cầu nghiệm thu | Nơi triển khai |
|---|---|---|
| R01 | Wokwi có input thật A01/B01/C01, 3 WS2812, OLED chung và buzzer | `wokwi-demo/` |
| R02 | Short / long / double / invalid; debounce 50 ms; xử lý bằng millis() | `wokwi-demo/sketch.ino` |
| R03 | Wi-Fi / MQTT hai chiều, status, LWT, FIFO persistent và replay | `sketch.ino`, `node-red/flows.json` |
| R04 | Global queue, tối đa 1 active ticket / device, thời gian server | `node-red/lib/ticket-engine.js` |
| R05 | Priority 20/50, aging +5/phút, escalation +20/level, tie theo ticket cũ | `priority.js` |
| R06 | StaffScore theo availability, zone, lượt nhận; tie deterministic | `dispatch.js` |
| R07 | Timeout, reassignment, L1/L2, cấu hình demo / normal tập trung | `config.js`, `ticket-engine.js` |
| R08 | ACK qua Application; ARRIVED bằng nút vật lý; DONE chỉ sau ARRIVED | REST, Telegram, firmware |
| R09 | Response created→arrived; service arrived→resolved; CSAT 15 giây | Engine và analytics |
| R10 | EWMA α=0.3, ETA an toàn, P90 nearest-rank, overload có cooldown | `analytics.js` |
| R11 | Lịch sử giả lập 4 tuần, seed 58; forecast đọc dataset; utilization 0.8 | `analytics/seed_history.py`, `forecast.js` |
| R12 | Clock ảo 1×/10×/60× cho forecast; clock thực riêng cho SLA | `forecast.js`, runtime |
| R13 | Dedup 1 giờ; spam ≥5/10 giây, khóa 30 giây; reject payload sai | Validation và engine |
| R14 | Dashboard không CDN, staff controls, bảo vệ ACK/DONE theo state | `application/` |
| R15 | REST 400/404/409, Telegram disable an toàn và chat allowlist | `node-red/` |
| R16 | Persistent context + snapshot; audit append-only; không commit secrets | Settings, runtime, SECURITY |
| R17 | Test, reset deterministic, demo, rubric, evidence và báo cáo | `test/`, `tools/`, `docs/` |
| R18 | Vision (tùy chọn): camera chỉ gửi số người theo khu A/B/C qua MQTT, không gửi và không lưu ảnh; middleware dùng để tự hủy ticket khi khách bỏ đi, gắn cờ xác minh REQUEST và ARRIVED, cảnh báo khách chờ không có ticket; fail-open khi camera im | `node-red/lib/vision.js`, `ticket-engine.js`, `vision/` |

## Các điểm đã chốt từ V1 sang V2

- V1 có nút REQUEST/ACK/DONE. V2 có ba nút đại diện ba điểm gọi. ACK/DONE chuyển lên Application; nhấn nút sau ACK xác nhận ARRIVED.
- V1 đo phản hồi bằng ACK. V2 đo phản hồi thực bằng ARRIVED và giữ ACK latency riêng.
- Trong simulation, một ESP32 được sử dụng để mô phỏng ba logical customer-point nhằm demo hàng đợi trên một project Wokwi. Khi triển khai thật, mỗi điểm gọi là một ESP32-C3 độc lập.
- Firmware PubSubClient publish QoS 0. FIFO chỉ xóa event sau receipt từ server; replay giữ msg_id, server dedup. Không tuyên bố firmware publish QoS 1.
- KPI Dashboard lấy ticket live của phiên; không trộn lịch sử giả lập thành kết quả kinh doanh thực.
- Level 3 dựa trên EWMA và thống kê lịch sử. Không có ML model, không gọi hệ thống là AI.
- Simulation là điều kiện nghiệm thu cơ bản. Hardware thật chỉ bonus +5.
- Camera (R18) là cảm biến có mặt tùy chọn, đã tích hợp vào middleware và có unit test cho luật. Demo bằng webcam laptop chỉ là phương án thay thế cho camera ESP32-S3; chưa có camera ESP32-S3 thật và chưa chạy kịch bản vision trên Wokwi. Camera không thay nút bấm: tắt camera hoặc camera mất tín hiệu thì hệ thống chạy như trước.
- Telegram chưa có token thì DISABLED; Dashboard vẫn hoạt động đầy đủ.

Ngưỡng mặc định: normal ACK 30s / L1 60s / L2 90s; demo ACK 8s / L1 15s / L2 25s. Response SLA KPI mặc định 120s, cấu hình riêng, không đồng nhất với timeout ACK hoặc escalation.

Kiểm chứng AC01–AC61 tại [ACCEPTANCE_MATRIX](ACCEPTANCE_MATRIX.md). Những bước cần browser Wokwi / phần cứng thật phải ghi MANUAL nếu chưa kiểm thử, không suy ra PASS từ việc đọc source.
