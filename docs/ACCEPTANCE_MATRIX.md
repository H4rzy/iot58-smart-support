# Final acceptance matrix — AC01–AC61

PASS = đã chạy kiểm thử được nêu; STATIC = source/diagram đã kiểm tra nhưng chưa xác minh behavior live; MANUAL = cần token, tài khoản hoặc phần cứng ngoài môi trường. UNIT TEST = đã chạy `node --test` cho luật đó, chưa gồm MQTT live hay Dashboard. PENDING = chưa làm hoặc chưa chạy, không tính PASS. NOT RUN = chưa chạy trong đợt kiểm thử này. Không quy đổi thành điểm bảo đảm. Wokwi browser E2E và offline/reboot đã chạy PASS; xem [TEST_RESULTS](TEST_RESULTS.md) trước nghiệm thu.

| AC | Điều kiện | Trạng thái | Bằng chứng / test |
|---|---|---|---|
| AC01 | Wokwi có 3 customer-point inputs | PASS | Browser circuit render ba nút A/B/C; diagram lint |
| AC02 | Visible actuator | PASS | OLED browser hoạt động, ba NeoPixels render; màu live xem AC14 |
| AC03 | Short A tạo CONSULTATION | PASS | Physical A trong browser Wokwi → MQTT public → server CONSULTATION |
| AC04 | Long B tạo PAYMENT | PASS | Physical B long trong Wokwi → PAYMENT; harness threshold1500ms |
| AC05 | B outrank A | PASS | priority_demo và browser controls |
| AC06 | Global queue ≥2 ticket | PASS | Ba MQTT events → global queue ba ticket |
| AC07 | Duplicate ignored | PASS | duplicate_demo: năm delivery → một ticket; dedup/recovery unit tests |
| AC08 | Smart dispatch đúng staff | PASS | B→NV02; canonical score/tie tests |
| AC09 | No ACK reassignment | PASS | escalation_demo NV01→NV03 sau 8s |
| AC10 | Escalation L1 | PASS | Scenario và threshold/exhaustion regression |
| AC11 | Escalation L2 | PASS | Scenario state và MQTT alert thật |
| AC12 | Dashboard ACK | PASS | Chrome controls nhấn ACK thật |
| AC13 | ACK MQTT downlink | PASS | Browser/scenario quan sát cp/B01/cmd ACKNOWLEDGED |
| AC14 | LED BLUE | PASS | Ảnh browser thật: A vàng, B blue, C dim riêng; CMD_APPLIED ACK |
| AC15 | Physical press sau ACK → ARRIVED | PASS | Physical B → ARRIVED; response9705ms, ACK latency549ms trong phiên QA |
| AC16 | Response created→arrived | PASS | Runtime/integration kiểm tra exact ISO subtraction |
| AC17 | DONE chỉ ARRIVED | PASS | Browser disabled; REST 409 trước arrival |
| AC18 | AHT EWMA update | PASS | T13/T14 và numerical check của lifecycle MQTT thật |
| AC19 | ETA update | PASS | Rank/AHT/free staff và zero-denominator guard |
| AC20 | CSAT | PASS | Physical B short trong CSAT_WAIT → SATISFIED; timeout và short/long harness PASS |
| AC21 | Double cancel | PASS | Physical C double → CANCELLED trong browser Wokwi; exact gesture harness |
| AC22 | Spam lock | PASS | Physical A spam → SPAM_LOCK; server/firmware guard và auto-unlock tests |
| AC23 | Offline/reconnect | PASS | Browser QA O tắt Wi-Fi/MQTT thật, OLED OFFLINE và orange LEDs; firmware bàn giao tắt QA flag mặc định |
| AC24 | Buffer replay | PASS | Physical A/B offline → LittleFS → reboot R phục hồi5 events → đúng2 tickets FIFO, giữ nguyên msg_id |
| AC25 | Overload alert | PASS | Staff OFFLINE + một waiting → overload/MQTT alert |
| AC26 | Synthetic four-week history | PASS | Generator seed 58, 10.974 rows, có pattern chủ đích |
| AC27 | Forecast đọc dataset | PASS | Test thay data làm forecast đổi; REST đọc history thật |
| AC28 | Staffing recommendation | PASS | ceil(λ × AHT_minutes / 0.8), virtual 17:45 forecast |
| AC29 | Dashboard metrics | PASS | 9 KPI, zone P90/service/AHT, CSAT và forecast desktop/mobile |
| AC30 | Telegram graceful disable | PASS | Token rỗng → DISABLED, không HTTP hoặc crash |
| AC31 | Telegram configured live | MANUAL | Enabled HTTP mocks/allowlist/ownership PASS; chưa có token thật |
| AC32 | REST | PASS | Health/state/queue/staff/metrics/forecast; mutation 400/404/409 |
| AC33 | Bốn tầng documented | PASS | Mermaid Architecture và CLO mapping |
| AC34 | Uplink demo-able | PASS | Physical A/B → ESP32 → public MQTT → Node-RED queue; E2E JSON/serial |
| AC35 | Downlink demo-able | PASS | Application ACK → Node-RED → MQTT → independent BLUE B; real screenshot |
| AC36 | Security documented | PASS | SECURITY, TLS/ACL/auth production và allowlist/guards |
| AC37 | Không có committed secrets | PASS | Repo không có git; delivered source reviewed, env example token rỗng, secrets ignored |
| AC38 | Tests pass | PASS | 95/95 unit/runtime/mock tests (`npm test`, 2026-10-24); 6 MQTT scenarios (`mqtt_scenario_test.js all` 6/6); browser controls/static PASS |
| AC39 | Reset | PASS | Server READY, queue sạch, history giữ; reset_demo FIFO marker/NVS code |
| AC40 | Rubric traceability | PASS | Liên kết sáu rubric categories và hardware optional |
| AC41 | Vision: payload sai bị từ chối (schema, zone, topic lệch, camera_id, persons âm/không nguyên/>50, quá lớn, JSON hỏng) | PASS | `test/vision.test.js` T-V1 |
| AC42 | Vision fail-open: không reading hoặc reading cũ quá `VISION_STALE_SECONDS` thì presence/arrival `null`, abandon `false`, ticket không bị hủy | PASS | `vision.test.js` T-V3; `vision-engine.test.js` T-E3 |
| AC43 | Vision: camera im thì thời gian im lặng không tính là khu trống hoặc có người liên tục | PASS | `vision-engine.test.js` T-E3 (outage breaks run) |
| AC44 | Vision bỏ đi: khu trống quá ngưỡng demo 10 s thì ticket CANCELLED, `cancel_reason=ABANDONED_VISION`, alert `TICKET_ABANDONED`, device về READY, staff được release | PASS | `vision-engine.test.js` T-E4 |
| AC45 | Vision: khách quay lại trước ngưỡng thì ticket không bị hủy | PASS | `vision-engine.test.js` T-E5 |
| AC46 | Vision nghi ngờ: REQUEST khi khu trống thì `presence_verified=false` và alert `UNVERIFIED_REQUEST`; có người thì `true`; không camera thì `null` | PASS | `vision-engine.test.js` T-E6 |
| AC47 | Vision xác minh: STAFF_ARRIVED với 2 người thì `true`, 1 người thì `false` kèm `ARRIVAL_UNVERIFIED`, camera stale thì `null`; ARRIVED thành công cả ba | PASS | `vision-engine.test.js` T-E7 |
| AC48 | Vision chủ động: khu có người ≥ dwell, device không có ticket active và không ở CSAT thì alert `PROACTIVE_ASSIST` | PASS | `vision-engine.test.js` T-E8 |
| AC49 | `VISION_ENABLED=false`: reading bị bỏ qua (`ignored:true`), không parse hay lưu, mọi luật tắt | PASS | `vision-engine.test.js` T-E9, T2 |
| AC50 | Ngưỡng vision: production 60 s / 180 s, demo mặc định 10 s / 20 s theo `DEMO_MODE` | PASS | `vision-engine.test.js` T-E10 |
| AC51 | Footfall chỉ tăng khi số người tăng; `empty_since` và `occupied_since` chuyển đúng | PASS | `vision.test.js` T-V2 |
| AC52 | `reset()` giữ state vision; state cũ không có `vision` vẫn nạp được | PASS | `vision-engine.test.js` T-E11 |
| AC53 | Ticket hủy bằng camera không làm sai AHT, response time hay SLA | PASS | `vision-engine.test.js` T-E12 |
| AC54 | Snapshot và retained `system/vision`: khu online có `persons`, khu offline là `null` không bao giờ là 0; `display` dưới 768 byte và không có vision | PASS | `vision-engine.test.js` T2 (snapshot, system/vision, display); REST `GET /api/iot58/vision` kiểm tra live: khu offline trả `persons: null` |
| AC55 | Kịch bản MQTT `vision` 6 bước (ticket verified, bỏ đi qua MQTT, arrival, stale, payload sai) | PASS | `tools/mqtt_scenario_test.js` kịch bản `vision`; `all` 6/6 PASS trên Node-RED + broker local (2026-10-24) |
| AC56 | Dashboard: thẻ Camera A/B/C, badge xác minh trên hàng đợi, alert vision, ghi chú riêng tư | NOT RUN | Thẻ Camera A/B/C và ghi chú riêng tư render từ API thật, không lỗi JS, không tràn ngang 1366×768 và 390×844 (DOM check tạm). Chưa kiểm tra huy hiệu trên hàng đợi và alert vision |
| AC57 | `publisher.py --dry-run` và `simulate.py` chạy được và đúng contract mục 2 | NOT RUN | `simulate.py --dry-run A=2,B=0,C=1` PASS, đúng schema 1 cho 3 khu. `publisher.py --dry-run` không chạy được: thiếu model `efficientdet_lite0.tflite`; `publisher.py --help` PASS |
| AC58 | Webcam laptop thật đếm người đúng theo khu A/B/C | MANUAL | Cần webcam, model MediaPipe và đo ground truth; chưa đo độ chính xác |
| AC59 | Camera ESP32-S3 thật đưa số người vào hệ thống | MANUAL | Chưa có phần cứng và firmware camera; không được ghi là PASS |
| AC60 | Không có ảnh nào được ghi ra đĩa hoặc gửi đi ở bất kỳ phần nào | STATIC | Rà soát mã: validateVision chỉ chấp nhận các trường đã định nghĩa, `persons` là số nguyên; publisher không có lệnh ghi file hay gọi HTTP. Chưa có kiểm thử tự động |
| AC61 | Hồi quy: `VISION_ENABLED=false`, vòng đời ticket cũ (REQUEST, ACK, ARRIVED, DONE, CSAT) cho kết quả y như trước | PASS | Script hồi quy tạm (ngoài repo): REQUEST→ACK→ARRIVED→DONE→CSAT và 120 s im lặng với `VISION_ENABLED=false` và `true` (không camera) cho alert, trường ticket, device, staff, AHT giống hệt; reading camera khi tắt trả `ignored:true` |

Bằng chứng Wokwi thật gồm source hashes, serial và state trong evidence. Browser QA chỉ bật ENABLE_SERIAL_DIAGNOSTICS để gây mất mạng/reboot; firmware bàn giao tắt mặc định, giữ nguyên business logic. Telegram live chỉ cần khi configured; hardware thật optional, không thay simulation. Saved Wokwi project URL và video cuối cần tài khoản nhóm.

[Final cross-check đã chạy](../evidence/acceptance-summary.json): 61 dòng AC gồm 55 PASS, 3 MANUAL (AC31 Telegram live, AC58 webcam, AC59 ESP32-S3), 1 STATIC và 2 NOT RUN (AC56 huy hiệu/alert dashboard, AC57 publisher dry-run). Đối chiếu actual logs, source hashes, KPI arithmetic, offlineFIFO và 7 REST APIs trên runtime sạch đang READY.
