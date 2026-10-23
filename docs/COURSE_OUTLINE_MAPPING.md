# Ánh xạ đề cương môn học

| CLO / chương | Phần đồ án | Bằng chứng cụ thể |
|---|---|---|
| CLO1.1 — xác định device IoT | ESP32-C3 thực / DevKit simulation, button, WS2812 | [BOM](BOM.md), [diagram](../wokwi-demo/diagram.json) |
| CLO1.2 — thành phần hệ thống | Bốn tầng, broker, middleware, application | [ARCHITECTURE](ARCHITECTURE.md) |
| CLO1.3 — lựa chọn platform | Wokwi, ESP32, Node-RED, MQTT, vanilla web | [Root README](../README.md), `node-red/settings.js` |
| CLO1.4 — REST + MQTT integration | Event uplink, cmd downlink, REST ACK/DONE/staff | [MQTT_TOPICS](MQTT_TOPICS.md), [API](API.md), `tools/mqtt_scenario_test.js` |
| CLO1.5 — configuration + testing | .env, DEMO_MODE, node:test, MQTT scenarios | `node-red/.env.example`, [TEST_RESULTS](TEST_RESULTS.md) |
| CLO2 — mở rộng | Node C3 độc lập, private broker, RBAC, lịch sử dài hơn | [HARDWARE_BONUS](HARDWARE_BONUS.md), [REPORT_FINAL](REPORT_FINAL.md) |
| Chương 1 — IoT architecture | Physical / Network / Middleware / Application | [ARCHITECTURE](ARCHITECTURE.md) |
| Chương 2 — communication, protocol, cloud | Wi-Fi, MQTT broker, REST, Telegram HTTPS | [MQTT_TOPICS](MQTT_TOPICS.md), [API](API.md) |
| Chương 3 — ESP32 programming / server | millis() gestures, LittleFS, JS modules, Node-RED | `wokwi-demo/sketch.ino`, `node-red/lib/` |
| Chương 4 — IoT security | Schema, dedup, allowlist; TLS/ACL production | [SECURITY](SECURITY.md) |
| Chương 5 — building IoT application | Dashboard remote control, metrics, automation | `application/`, [DEMO_SCRIPT_FINAL](DEMO_SCRIPT_FINAL.md) |

Mapping dựa trên CLO do yêu cầu đồ án cung cấp; không cố gán CLO không liên quan. Mỗi thành viên phải hiểu cả bốn tầng và giải thích được qua demo uplink / downlink.
