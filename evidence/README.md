# Evidence cần ghi nhận

Không dùng screenshot giả. Ảnh browser thật chỉ chứng minh những phần đã chạy; không thay bằng chứng Wokwi LED hoặc Telegram live. Không để token, password hoặc private chat information trong ảnh.

## Ảnh UI đã chụp khi kiểm thử

- [Dashboard desktop](dashboard-desktop.png): Chrome thật, viewport 1366×768, state từ Node-RED chạy tại localhost.
- [Dashboard mobile](dashboard-mobile.png): Chrome thật, viewport 390×844, responsive layout.
- `dashboard-priority-queue.png` được bổ sung nếu browser control test đã chạy. Kiểm tra file tồn tại trước khi đưa vào báo cáo.

Ảnh Dashboard có thể dùng events từ MQTT integration publisher; không gọi đó là evidence physical Wokwi. Kết quả thực tế đối chiếu [TEST_RESULTS](../docs/TEST_RESULTS.md) và worklog kiểm thử.

## Wokwi browser đã chạy thật

- [Global queue A/B](wokwi-queue.png), [ACK B blue độc lập](wokwi-ack-blue.png), [DONE / CSAT green](wokwi-resolved-csat.png), [Final spam / escalation](wokwi-final-spam.png).
- [E2E results](wokwi-e2e-results.json): physical gestures, MQTT public, timestamps, serial và server state; B RESOLVED/SATISFIED, C CANCELLED, A ESCALATED_L2/SPAM_LOCK.
- [Offline buffer](wokwi-offline-buffer.png), [Reboot replay](wokwi-offline-reboot-replay.png), [Offline results](wokwi-offline-results.json): Wi-Fi/MQTT tắt thật; physical A/B được lưu LittleFS và replay đúng2 tickets theoFIFO, giữ nguyên msg_id.
- [Firmware compile](firmware-compile.txt), [14 gesture tests](firmware-gestures.txt), [Diagram lint](wokwi-lint.txt).

Browser QA bật riêng ENABLE_SERIAL_DIAGNOSTICS để gây mất mạng/reboot bằng Serial O/R, không thay business logic. JSON ghi hashes nguồn bàn giao và nguồn test; firmware bàn giao giữ flag false. Lead đã tính lại và xác minh đúng một thay đổi flag. Project anonymous chưa có permalink lưu tài khoản; bốn file source/config đủ để nhóm tạo và lưu project.

## Logs middleware / Application

[49 unit/runtime/mock tests](unit-tests.txt), [5 MQTT scenarios](mqtt-scenarios.txt), [Browser controls](browser-controls-results.json), [Browser static](browser-static-results.json), [Repository audit](repository-audit.json). Telegram enabled tests dùng HTTP mock; chưa có token để chụp Telegram live.

[Final acceptance cross-check](acceptance-summary.json) đối chiếu nguồn/ảnh/logs, tính lại response/service/EWMA, xác minh offlineFIFO và7 live APIs HTTP200 khi server READY. Có39 PASS và1 MANUAL conditional Telegram live; không quy đổi thành điểm bảo đảm.

## Video shot list

| Shot | Nội dung | Điều kiện chụp |
|---|---|---|
| E01 | Toàn mạch Wokwi | ESP32, 3 nút A/B/C, 3 LED, OLED, buzzer và wiring; project có partitions.csv |
| E02 | REQUEST A | Short press, Serial event, PENDING và LED vàng |
| E03 | REQUEST B | Long press → PAYMENT |
| E04 | Priority queue | B trước A, ít nhất hai ticket |
| E05 | Node-RED flow | Ingest, engine, queue, dispatch, SLA và downlink |
| E06 | MQTT debug | Topic, msg_id và command; không chứa secrets |
| E07 | Dashboard | 9 KPI, staff và queue |
| E08 | ACK Application | Nhân viên NV02 nhận ticket |
| E09 | BLUE downlink | ACKNOWLEDGED command và LED blue trong cùng frame |
| E10 | ARRIVED | Physical B press; response created→arrived |
| E11 | Escalation | L1/L2, LED đỏ, manager alert nếu configured |
| E12 | Telegram | Inline NHẬN/XONG, allowlist; cần token thật |
| E13 | Analytics | Response / P90 / CSAT / AHT trước và sau DONE |
| E14 | Forecast | Label synthetic, clock 17:45, required staff |
| E15 | Video E2E cuối | Request → ACK blue → physical ARRIVED → DONE → CSAT |

Video 5–7 phút theo [demo script](../docs/DEMO_SCRIPT_FINAL.md). Ghi ngày, broker, namespace và DEMO_MODE; có thể che namespace trước khi public video. Nếu có retry hoặc gap, ghi nguyên nhân, không ghép clip thành kết quả PASS giả.
