# Rubric traceability — baseline 100 điểm

Không bảo đảm điểm 100/100. Bảng chỉ nơi có implementation và bằng chứng để giảng viên kiểm tra. Trạng thái thực tại [TEST_RESULTS](TEST_RESULTS.md) và [AC01–40](ACCEPTANCE_MATRIX.md).

| Rubric | Max points | Implementation | Evidence | Demo step | File path |
|---|---:|---|---|---|---|
| Simulation & Embedded | 20 | ESP32, 3 customer-point buttons, 3 WS2812, OLED, buzzer, gesture và physical arrival | Local compile, gesture harness, Wokwi browser circuit; màu LED live xem acceptance | 1, 2, 6, 8, 9 | [Wokwi](../wokwi-demo/README.md) |
| Kiến trúc bốn tầng | 25 | Physical + Wi-Fi/MQTT + Node-RED + web/Telegram | Mermaid/sequence, flow export, MQTT uplink/downlink | 1–7 | [Architecture](ARCHITECTURE.md), [MQTT](MQTT_TOPICS.md), [flows](../node-red/flows.json) |
| Automation / Control | 20 | Global queue, priority/aging, dispatch, timer, L1/L2, spam, EWMA/ETA và forecast | Unit tests, 5 MQTT scenarios thật, KPI live | 2–4, 7, 10–12 | [Engine](../node-red/lib/ticket-engine.js), [Algorithms](ALGORITHMS.md) |
| Application / Integration | 15 | Dashboard/REST ACK/DONE/staff, MQTT remote command, Telegram optional | Chrome controls, HTTP 200/400/404/409, Telegram mock/disabled | 3, 5, 7, 11 | [Application](../application/README.md), [API](API.md), [Telegram](../node-red/lib/telegram.js) |
| Demo & Stability | 10 | Reset deterministic, demo thresholds, normal/abnormal, replay/dedup/recovery | Scenario all, worklogs, video shot list | RESET và các bước demo | [Demo](DEMO_SCRIPT_FINAL.md), [Tools](../tools/README.md), [Tests](TEST_RESULTS.md) |
| Report & Deliverables | 10 | Source, wiring, architecture, MQTT, flows, report/slides/Q&A/security/tests | File cụ thể trong checklist | Evidence / trình bày cuối | [Checklist](DELIVERABLE_CHECKLIST.md), [Report](REPORT_FINAL.md) |
| Hardware thật bonus | +5 | Guide một node C3 độc lập; không mandatory | Chưa claim đã lắp node thật | Optional | [Hardware bonus](HARDWARE_BONUS.md) |

Smart Level 1: ngữ cảnh intent/zone/staff/waiting. Level 2: tự dispatch/reassign/escalate/overload. Level 3: EWMA theo service, adaptive ETA và forecast/recommendation từ history. Camera chỉ future work, không đổi đề tài.

Simulation phải thực sự chạy; unit test không thay điều kiện này. Telegram live cần kiểm chứng khi token được cấu hình; token rỗng đã test DISABLED và Application vẫn đầy đủ.
