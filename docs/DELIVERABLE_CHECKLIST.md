# Deliverable checklist

[x] nghĩa là artifact implementation có trong repository. [ ] nghĩa là evidence manual chưa ghi nhận. File tồn tại không đồng nghĩa runtime PASS; xem TEST_RESULTS.

- [x] ESP32 source — [sketch.ino](../wokwi-demo/sketch.ino).
- [x] Architecture diagram — [ARCHITECTURE](ARCHITECTURE.md).
- [x] Wiring — [diagram.json](../wokwi-demo/diagram.json), [pin map](../wokwi-demo/README.md).
- [x] Wokwi source, libraries và flash partition — [Wokwi](../wokwi-demo/README.md); upload đủ bốn file.
- [x] Wokwi browser E2E và offline/reboot thật — [E2E results](../evidence/wokwi-e2e-results.json), [Offline results](../evidence/wokwi-offline-results.json), [Ảnh/logs](../evidence/README.md).
- [x] MQTT topics/schema — [MQTT_TOPICS](MQTT_TOPICS.md), [Contract](IMPLEMENTATION_CONTRACT.md).
- [x] Node-RED flow export 12 sections — [flows.json](../node-red/flows.json), [settings.js](../node-red/settings.js).
- [x] Middleware logic — [Engine](../node-red/lib/ticket-engine.js), [Priority](../node-red/lib/priority.js), [Dispatch](../node-red/lib/dispatch.js).
- [x] Application/Dashboard — [index.html](../application/index.html), [app.js](../application/app.js), [styles.css](../application/styles.css).
- [x] Remote command/REST — [API](API.md), [Runtime](../node-red/lib/runtime.js).
- [x] Telegram implementation — [telegram.js](../node-red/lib/telegram.js), [Setup](../node-red/README.md).
- [ ] Telegram live với token nhóm — [Evidence E12](../evidence/README.md); chưa có token thật.
- [x] Uplink/downlink test tool — [MQTT scenario](../tools/mqtt_scenario_test.js), [Test results](TEST_RESULTS.md).
- [x] Alert scenario — [Demo](DEMO_SCRIPT_FINAL.md), [Scenario tool](../tools/mqtt_scenario_test.js).
- [x] Analytics, forecast và history generator — [Analytics](../node-red/lib/analytics.js), [Forecast](../node-red/lib/forecast.js), [Generator](../analytics/seed_history.py), [History](../node-red/data/history.json).
- [x] Test plan/report — [TEST_PLAN](TEST_PLAN.md), [TEST_RESULTS](TEST_RESULTS.md), [Acceptance](ACCEPTANCE_MATRIX.md).
- [x] Demo script — [Final demo](DEMO_SCRIPT_FINAL.md), [Quick demo](QUICK_DEMO.md), [Full demo](FULL_DEMO.md).
- [x] Video shot list — [Evidence checklist](../evidence/README.md).
- [ ] Video demo cuối của nhóm — quay E01–E15, không tạo evidence giả.
- [x] Report — [REPORT_FINAL](REPORT_FINAL.md).
- [x] Slide content/script — [Slides](SLIDES_FINAL_CONTENT.md), [Presentation script](PRESENTATION_SCRIPT_FINAL.md); binary gốc giữ ở legacy.
- [x] Viva — [VIVA_QA](VIVA_QA.md).
- [x] Course/rubric mapping — [Course](COURSE_OUTLINE_MAPPING.md), [Rubric](RUBRIC_TRACEABILITY.md).
- [x] Security/BOM — [SECURITY](SECURITY.md), [BOM](BOM.md).
- [x] Hardware bonus notes — [HARDWARE_BONUS](HARDWARE_BONUS.md).
- [x] Ten-week/person-hour proposal — [TEN_WEEK_PLAN](TEN_WEEK_PLAN.md); không giả định giờ thực đã làm.
- [x] V1 backup và original materials — [Legacy](../legacy/README.md).

Hướng dẫn chạy tại [root README](../README.md). Hoàn tất các mục manual trong test report trước nghiệm thu lớp và lưu project Wokwi vào tài khoản nhóm để có URL chia sẻ.
