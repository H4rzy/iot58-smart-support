# Kế hoạch kiểm thử

## Môi trường

Windows PowerShell, Node 24.13, npm và Python 3.11.9; phiên bản Node-RED theo package-lock. Local MQTT 127.0.0.1 dùng Aedes khi Docker không có daemon. Public HiveMQ dành cho Wokwi live. Không chạy browser mutation và MQTT scenario song song trên cùng session.

## Pure module tests

`npm test` tại node-red kiểm tra T01–T20: consultation/payment base priority, aging, escalation, tie oldest, staff score, unavailable filter, zone bonus, dedup, DONE guards, ACK, ARRIVED sau ACK, resolved AHT, EWMA, ETA không chia 0, P90, overload, lambda, staffing và cancel.

Bổ sung CSAT expiry, spam unlock, reassignment, virtual clock tách SLA, persistence/recovery, HTTP validation/auth, Telegram disable/permissions/mock callbacks, CMD_APPLIED receipt không loop, compact OLED payload và stale ticket context.

## Integration

`node tools/mqtt_scenario_test.js all` đi qua broker và flow thật, listen MQTT command. Kiểm tra priority/lifecycle, dedup, reassignment/L1/L2, spam, overload, malformed/topic mismatch, HTTP errors, forecast và reset.

Recovery: persist ticket/msg_id, restart runtime, replay cùng id không thêm ticket. Corrupt primary snapshot phải recover từ backup hợp lệ. Không coi unit fixture là kiểm chứng broker/public network.

## Dashboard

Chrome/Playwright tại 1366×768 và 390×844: không JS fatal, không page overflow; API load, 9 KPI/3 staff/3 devices/forecast, staff controls, ACK state và MQTT downlink. DONE disabled trước ARRIVED, enabled sau MQTT physical-event simulation; clock set/pause/reset, mode và session reset.

API offline báo rõ và khóa mutation. XSS negative input và latest-alert ordering dùng fixture được gắn nhãn security test, không dùng để chụp evidence vận hành. Commands tái chạy trong [tools README](../tools/README.md).

## Firmware / Wokwi

Compile PlatformIO ESP32 toolchain, static pin mapping và Wokwi diagram lint. Project browser cần sketch.ino, diagram.json, libraries.txt và partitions.csv để LittleFS có partition.

Browser Wokwi: A short, B long, C double; invalid 800–1499ms; ACK blue; physical ARRIVED cyan; DONE/CSAT green→READY; spam lock; offline orange/reconnect/FIFO. Ghi đúng compile/network failure. Local compile không thay browser runtime verification.

## Failure scenarios

| ID | Trigger | Expected |
|---|---|---|
| F01 | MQTT unavailable | Orange blink, persistent FIFO, không silent drop |
| F02 | Duplicate msg_id | Một ticket, trả receipt |
| F03 | Suspicious button spam | Khóa 30s, alert, không thêm ticket, auto-unlock |
| F04 | DONE từ PENDING/ACK | HTTP 409 và audit |
| F05 | Staff không ACK | Release/reassign, L1, L2 |
| F06 | Không free staff | Ticket còn queue, ETA hữu hạn; on-duty 0 gây overload |
| F07 | Malformed JSON | Reject/log, engine không crash |
| F08 | Unknown device / topic mismatch | Reject, không tạo ticket |
| F09 | Server restart | Recovery hợp lý, dedup persist |
| F10 | Offline event mang ticket_id cũ | Reject 409, không thay ticket mới |
| F11 | Audit ticket quá dài | Display summary vẫn <768 byte |
| F12 | CMD_APPLIED replay | Receipt cùng cmd_id, không vòng lặp |

Telegram: token rỗng phải disabled; mock callbacks kiểm tra permissions; token thật cần manual sendMessage/inline callback/allowlist/ownership. Không print token. Security review gồm secrets search, namespace, dependency audit và active-source review V1.

Exit criteria: AC matrix PASS hoặc MANUAL/PARTIAL với lý do trung thực; không gọi project complete khi required AC FAIL. Kết quả thực, screenshot và logs tại TEST_RESULTS/evidence.
