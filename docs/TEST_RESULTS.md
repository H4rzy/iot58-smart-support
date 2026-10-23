# Kết quả kiểm thử thực tế

Ngày kiểm thử: 2026-10-09/10 (Asia/Saigon). Windows PowerShell, Node 24.13.0, npm 11.4.2, Python 3.11.9, Chrome và Node-RED 4.1.16. Không tạo screenshot, test hoặc kết quả kinh doanh giả. Đối chiếu [ACCEPTANCE_MATRIX](ACCEPTANCE_MATRIX.md) trước nghiệm thu.

| Check | Kết quả đã chạy | Phạm vi thực tế |
|---|---|---|
| npm ci/install Node-RED/tools | PASS | Dependencies cài thành công, lockfiles có thật |
| npm test | **95/95 PASS**, 0 skip / 0 fail (2026-10-24) | 46 test vision mới (`vision.test.js` 18, `vision-engine.test.js` 28) cộng 49 test cũ. Algorithms, state, dispatch, forecast/data change, persistence, HTTP và Telegram mock; durable callback ACK trước downlink, chống command flood khi countdown giảm |
| Node-RED startup | PASS | 12 tabs, không missing node; health/state/flow-health HTTP 200 |
| HiveMQ connection | PASS | Node-RED kết nối public MQTT thật; không suy Wokwi uplink từ check này |
| mqtt_scenario_test.js all | **6/6 scenarios PASS** (2026-10-24) | Aedes local 127.0.0.1:1883 + bản sao sạch của Node-RED (IOT58_DATA_DIR tạm, MQTT_HOST=127.0.0.1) + REST + MQTT downlinks thật; gồm kịch bản `vision` |
| Vision unit tests | PASS | 46 test nằm trong 95/95 của `npm test` |
| Vision MQTT scenario `vision` | PASS | Qua MQTT thật: request verified, khách bỏ đi tự hủy (`ABANDONED_VISION`, `TICKET_ABANDONED`), request khi trống (`UNVERIFIED_REQUEST`), ARRIVED với 2 người và 1 người, camera stale không hủy ticket, payload sai bị loại |
| Vision hồi quy `VISION_ENABLED=false` | PASS | Script tạm ngoài repo: REQUEST→ACK→ARRIVED→DONE→CSAT và 120 s im lặng cho alert, ticket, device, staff và AHT giống hệt giữa tắt và bật nhưng không có camera; reading khi tắt trả `ignored:true` |
| Vision Dashboard (DOM tạm) | PARTIAL | Thẻ Camera A/B/C render từ API thật; camera offline hiển thị "Không có tín hiệu"; 0 lỗi JS; không tràn ngang 1366×768 và 390×844. Huy hiệu hàng đợi và alert vision chưa kiểm tra |
| `simulate.py --dry-run A=2,B=0,C=1` | PASS | In payload schema 1 cho khu A/B/C, exit 0, không cần broker |
| `publisher.py --help` | PASS | exit 0 |
| `publisher.py --dry-run` (webcam) | NOT RUN | Thiếu model `efficientdet_lite0.tflite`; chưa đếm người thật |
| Webcam laptop đếm người A/B/C | MANUAL | Chưa đo độ chính xác với ground truth |
| Camera ESP32-S3 thật | NOT RUN | Không có phần cứng và firmware camera |
| Wokwi có camera | NOT RUN | Chưa chạy Wokwi với camera |
| Repository audit | PASS | `python -I tools/repository_audit.py`: 10/10 check, exit 0 |
| Final acceptance check | PASS | `python -I tools/final_acceptance_check.py` exit 0; 61 dòng AC; đối chiếu 7 REST APIs trên runtime sạch |
| Link nội bộ docs/*.md và README | PASS | 144 link, 0 link gãy |
| Quét secret | PASS | Không có token Telegram, AKIA, ghp_, private key hay password literal; chỉ khớp chuỗi kiểm tra trong `repository_audit.py`. `vision/.venv` là thư viện bên thứ ba, không quét |
| Browser Dashboard controls | PASS | UI staff status→dispatch, ACK→MQTT, DONE guard, ARRIVED qua publisher, CSAT, clock/reset |
| Browser Dashboard static | PASS | 1366×768 và 390×844, không page overflow/JS fatal, 9 KPI/3 staff/3 devices/forecast |
| API offline / XSS / alert order | PASS | Negative fixtures có chủ đích; không dùng làm screenshot vận hành |
| Synthetic generator | PASS | Seed 58, 10.974 rows, 4 tuần trước 2026-10-09; forecast đọc dataset |
| Firmware PlatformIO compile | PASS | Espressif32 6.12 / Arduino ESP32 2.0.17, binary compile local |
| Wokwi diagram lint | PASS | 0 errors / 0 warnings; 1 info về DevKit part chưa có trong registry document |
| Firmware gesture harness | **14 cases PASS** | Extract hàm C++ thật: boundary, debounce, cancel, arrival, CSAT, millis wrap và spam |
| Wokwi browser compile/run | PASS | Project ESP32 browser anonymous, 3 nút/NeoPixels, OLED hoạt động |
| Browser LittleFS | PASS | Phát hiện default partition thiếu; custom partitions.csv, blank format và save 3 sync được xác minh |
| Wokwi offline / reboot FIFO | **PASS actual browser** | QA flag bật riêng để O tắt Wi-Fi/MQTT thật; physical A/B lưu flash, R reboot phục hồi5 events, đúng2 tickets FIFO cùng msg_id; firmware bàn giao default false |
| Wokwi MQTT full E2E | **PASS actual browser** | Physical A/B → queue B>A; NV02 dispatch; ACK independentBLUE B; DONE premature409; physical ARRIVED, DONE/EWMA, CSAT SATISFIED, C double cancel, A spam; L1/L2 xuất hiện thật |
| Telegram real API | MANUAL | Token rỗng disabled PASS; enabled callbacks qua HTTP fetch mock PASS, chưa có token thật |
| Docker Compose | NOT RUN | Có Docker executable, daemon chưa chạy; dùng Aedes local |
| Physical ESP32-C3 | OPTIONAL / NOT RUN | Chỉ có guide, chưa claim node thật |
| npm audit Node-RED | 5 advisories | npm 11.21 installer bundle: 2 moderate / 3 high; runtime feature tests vẫn PASS |

## Integration đã xác minh

- Priority: ba events vào global queue, B PAYMENT rank 1, dedup, NV02 dispatch, DONE sai trả 409, ACK MQTT downlink, ARRIVED, response theo ISO subtraction, DONE/service/EWMA, CSAT, C cancel và forecast.
- Duplicate: năm delivery cùng msg_id tạo một ticket và receipt.
- Escalation: NV01→NV03→L1→L2 và MQTT manager alert.
- Spam: suspicious request có msg_id mới tạo lock, không thêm ticket.
- Abnormal: staff OFFLINE gây overload, ETA hữu hạn; reject malformed/topic mismatch/unknown device; REST 400/404; Telegram disabled.
- Cuối batch reset READY và giữ history.

## Bugs đã tìm và sửa

- Topic dùng environment ghép một phần không expand: chuyển thành MQTT_EVENTS_TOPIC đầy đủ.
- Monotonic milliseconds có phần thập phân khác ISO: floor thành canonical integer milliseconds.
- L1 quá sớm khi NV03 còn chờ ACK: exhaustion chỉ khi không có current assignment.
- Receipt trước durable state: atomic persist trước emit; snapshot retained, receipt transient.
- CMD_APPLIED cần FIFO receipt: dùng cùng cmd_id để tránh vòng lặp.
- Full ticket/audit vượt 768 byte: compact OLED display và regression.
- Replay stale ticket context: 409 guard cho ARRIVED/CANCEL/CSAT cũ.
- Known staff từ unknown Telegram chat: kiểm tra chat allowlist riêng; bảo vệ reserved msg_id.
- Dashboard lấy tail alerts cũ: hiển thị latest 10 theo timestamp.
- Wokwi thiếu LittleFS partition: cần upload partitions.csv.
- ESP32 NetworkClient timeout dùng giây: sửa 2000 thành 2; ghi LittleFS chuyển sang worker để không làm mất short press khi flash chậm.
- Ba NeoPixel controllers dùng RMT trong simulation có màu bị alias: chuyển thành một chuỗi ba pixel GPIO25, index A/B/C riêng.
- Callback ACK có thể flush trước persistence throttle: lưu state trước khi phát downlink; regression thứ48 PASS.

## Evidence và giới hạn

Ảnh Dashboard desktop/mobile/priority và JSON browser results tại [evidence](../evidence/README.md) là dữ liệu từ browser thật. Chúng chứng minh UI, không chứng minh physical Wokwi LED. Telegram token/chat ID chưa được cung cấp, live commands cần final manual verification.

Local firmware compile không thay browser verification. History là dữ liệu giả lập, chưa có business outcome thực.

Snapshot log trước đợt vision: [unit-tests.txt](../evidence/unit-tests.txt) (49 tests), [mqtt-scenarios.txt](../evidence/mqtt-scenarios.txt) (5 scenarios). Chưa ghi đè hai file này; kết quả đợt 2026-10-24 (95 tests, 6 scenarios) nằm ở bảng trên. [Static repository audit](../evidence/repository-audit.json). Tất cả JSON/source/config hợp lệ, 12 flow tabs không cạnh lỗi, relative links kiểm tra không bị thiếu file.

Dependency audit còn brace-expansion, http-cache-semantics, ip-address, postcss-selector-parser và undici trong npm installer transitive bundle. Override npm 11.21 tương thích giảm từ 21 xuống 5 advisories; không force major upgrade unsupported của Node-RED/Node. Cần review updates trước production. Demo bind localhost, không expose editor Internet.

- CSAT countdown từng giây từng tạo cmd_id mới và CMD_APPLIED làm chậm event đánh giá trong FIFO: chỉ phát command khi nội dung điều khiển thay đổi hoặc forced reconnect/reset. Regression thứ49, 5 MQTT scenarios và Chrome controls chạy lại PASS.

## Vision (camera đếm người) — đợt 2026-10-24

- Đã chạy thật: unit test vision, MQTT scenario `vision` 6/6 trong `all`, hồi quy `VISION_ENABLED=false`, `simulate.py --dry-run`, `publisher.py --help`, DOM Dashboard camera, REST `GET /api/iot58/vision`.
- Chưa chạy: webcam laptop thật (MANUAL), ESP32-S3 camera (NOT RUN), Wokwi có camera (NOT RUN), Telegram live (MANUAL). `publisher.py --dry-run` NOT RUN vì thiếu model MediaPipe.
- Môi trường: bản sao sạch trong thư mục tạm, không chạy trên thư mục dự án; `IOT58_DATA_DIR` tạm có `history.json` và `staff.json` copy từ dự án, không có state cũ. Broker local Aedes 127.0.0.1:1883.
- Scenario `vision` và `/demo/reset` không xóa state camera (thiết kế). Camera được coi là offline sau `VISION_STALE_SECONDS`, nên `persons` là `null`, không phải 0.
- Không ảnh nào được lưu hay gửi; Dashboard chỉ nhận số người theo khu.

## Wokwi nghiệm thu cuối

Browser thực dùng HiveMQ public và source bàn giao với duy nhất QA diagnostics false→true để đóng mạng/reboot. SHA256 nguồn bàn giao: `00e7cc822fa6caffb025b8828c4cc160a74ac5b8abd090bfb05002afe3b27bea`; nguồn test overlay: `9a5e9ea9f08e2f86940a4fd86bc5301f5ac5854fd2784dfa8492381bc0fa128a`. Lead tự tính lại hashes và xác minh đúng một thay đổi này. Firmware defaultfalse đã compile và gesture harness14 cases PASS.

- ACK screenshot thật xác nhận A vàng/B blue/C dim độc lập. Physical ARRIVED đo9705ms từ created, ACK latency549ms riêng trong phiên QA; đây là số đo test, không phải hiệu quả kinh doanh.
- Final state: A ESCALATED_L2 với device SPAM_LOCK; B RESOLVED/SATISFIED; C CANCELLED. Có cả alertsL1/L2.
- Offline: O tắt Wi-Fi/MQTT thật, physical A/B chưa tạo server ticket; R flush/reboot, LittleFS restored5 events gồm control, replay tạo đúng2 tickets theoFIFO và giữ msg_id.
- Source/state/serial và ảnh thật trong evidence; lưu project Wokwi và quay video thuyết trình bằng tài khoản nhóm. Telegram live vẫn chưa chạy vì chưa có token.

Final cross-check chạy lại 2026-10-24 qua `python -I tools/final_acceptance_check.py`: 61 dòng AC gồm 55 PASS, 3 MANUAL, 1 STATIC, 2 NOT RUN; hashes/KPI/FIFO khớp evidence, 7 REST APIs HTTP 200 trên runtime sạch (READY, queue rỗng). [Acceptance summary](../evidence/acceptance-summary.json).
