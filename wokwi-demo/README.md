# Wokwi V2 — Máy lấy số / gọi nhân viên hỗ trợ thông minh

Trong simulation, một ESP32 được sử dụng để mô phỏng ba logical customer-point nhằm demo hàng đợi trên một project Wokwi. Khi triển khai thật, mỗi điểm gọi là một ESP32-C3 độc lập.

A01 = iPhone; B01 = Android; C01 = phụ kiện. Mỗi điểm có đúng **một nút và một NeoPixel**, không có nút ACK/DONE của khách. OLED và buzzer dùng chung để thuyết trình. Server Node-RED giữ global queue, state machine và tất cả business rules.

## Chạy trên browser Wokwi

1. Khởi động middleware theo [Node-RED README](../node-red/README.md), mở Dashboard `http://localhost:1880/`.
2. Tạo [project ESP32 Arduino mới](https://wokwi.com/projects/new/esp32). Dán đầy đủ **bốn file** `sketch.ino`, `diagram.json`, `libraries.txt`, **`partitions.csv`** vào project. Menu mũi tên cạnh tabs → New file để tạo hai file chưa có. `partitions.csv` bắt buộc vì template browser mặc định không có partition lưu LittleFS; nếu bỏ qua, OLED sẽ báo FLASH ERROR và chỉ buffer RAM. Library Manager cũng có thể thêm năm thư viện trong `libraries.txt`; WiFi/Wire/LittleFS/Preferences đi kèm ESP32 core.
3. Kiểm tra `Config::MQTT_HOST`, `MQTT_PORT`, `BASE_TOPIC` đầu sketch khớp `.env` middleware. Default `broker.hivemq.com:1883`; fallback `test.mosquitto.org` hoặc `broker.emqx.io`. Nên đổi namespace riêng cho nhóm để tránh collision public broker.
4. Bấm Play. Serial phải có `MQTT_ONLINE`, OLED luân phiên queue/top ticket/trạng thái ba điểm. Blank flash được khởi tạo LittleFS lần đầu; log mount lỗi ban đầu trước format có thể xuất hiện. Không tự format dữ liệu flash đã tồn tại nếu mount hỏng.
5. Focus vùng circuit, dùng phím **A / B / C** hoặc click giữ nút tương ứng. ACK/DONE thực hiện trên Dashboard hoặc Telegram.

Wokwi cloud cần public broker. MQTT broker localhost dành cho automated integration tests, không trực tiếp truy cập được từ browser Wokwi cloud. Wi-Fi mặc định `Wokwi-GUEST`, password rỗng, channel 6.

## Thao tác một nút

| Trạng thái | Gesture | Event |
|---|---|---|
| READY | Short <800ms | REQUEST / CONSULTATION |
| READY | Long ≥1500ms | REQUEST / PAYMENT |
| PENDING / ESCALATED | Hai short trong ≤400ms | CANCEL_REQUEST |
| ACKNOWLEDGED (LED blue) | Nhấn nút hợp lệ | STAFF_ARRIVED |
| CSAT_WAIT (LED green) | Short / long | SATISFIED / UNSATISFIED |
| Bất kỳ | Giữ 800–1499ms | INVALID_GESTURE, beep thấp |

Short REQUEST được chờ 400ms để phân biệt double. Debounce 50ms; tất cả gesture, buzzer sequence, LED blink và OLED rotation dùng `millis()`. Sau ARRIVED, DONE mới hợp lệ. Response time chính = server arrived_at − created_at, không phải ACK latency.

CSAT có tối đa 15s theo server snapshot; firmware cũng hết window cục bộ để thiết bị không bị giữ mãi. Request mới trong CSAT bị chặn. Spam detector theo cửa sổ 10s: 5 gesture không hợp lệ hoặc nhấn lặp khi đang chờ gây khóa 30s; REQUEST mới, CANCEL hợp lệ, ARRIVED và rating không được tính spam. Middleware xác thực lại và tự mở khóa. RESET DEMO từ Dashboard gửi READY mới để xóa lock/temporary state cả ba điểm.

Ngưỡng gesture dùng **millis của simulation**. Khi Wokwi chạy khoảng50% tốc độ, SHORT giữ khoảng0.6s ngoài đời, LONG khoảng4.5s đã kiểm thử; không thay ngưỡng800/1500ms trong source. Double-click cần hai SHORT, khoảng cách hai lần nhả≤400ms simulation, mỗi lần nhấn/nhả ổn định≥50ms để qua debounce. Đợi OLED/LED nhận trạng thái mới rồi thao tác ARRIVED, CSAT hoặc CANCEL.

## Wiring khớp sketch

| Thành phần | GPIO / kết nối |
|---|---|
| Button A/B/C | 18/19/23 → contact `1.l`; contact `2.l` → GND; INPUT_PULLUP |
| NeoPixel A/B/C | GPIO25 → A.DIN; A.DOUT → B.DIN; B.DOUT → C.DIN; VDD →5V; VSS→GND; pixel index0/1/2 |
| OLED `board-ssd1306` | SDA21, SCL22, VCC3V3, GND; địa chỉ 0x3c |
| Buzzer | 13 → pin1; pin2 → GND |

Đây là wiring mô phỏng: ba NeoPixel rời được daisy-chain trên cùng GPIO25, controller ba pixel nhưng mỗi LogicalKiosk giữ index riêng nên màu độc lập. Cách này tránh Wokwi RMT aliasing khi ba NeoPixel objects chuyển qua GPIO khác nhau (lỗi đã thấy qua chạy browser thật). Production mỗi C3 chỉ có một pixel riêng. Board thật dùng5V WS2812 nên có level shifter tín hiệu3.3V→5V, điện trở data330Ω và tụ nguồn phù hợp; xem [hardware bonus](../docs/HARDWARE_BONUS.md). NeoPixel đã tích hợp driver, không dùng điện trở hạn dòng LED như RGB rời.

| LED | Ý nghĩa |
|---|---|
| Dim green | READY |
| Yellow | PENDING / request đã buffer, đang chờ server |
| Blue | ACKNOWLEDGED — bằng chứng downlink |
| Cyan | ARRIVED |
| Green | RESOLVED / CSAT_WAIT |
| Red slow / fast | ESCALATED_L1 / ESCALATED_L2 |
| Purple tạm thời | CANCELLED |
| Orange blink | MQTT offline |
| Purple/red blink | SPAM_LOCK |

## MQTT và reliable outbox

One simulator = one unique MQTT connection, LWT ở `{BASE}/simulator/status` gồm A01/B01/C01. Production mỗi ESP32-C3 có LWT `{BASE}/cp/{id}/status`. Subscribe riêng ba `cp/{id}/cmd` và `display`; publish event JSON schema1 kèm boot_id, monotonic uptime, unique msg_id.

Worker FreeRTOS riêng sở hữu WiFiClient/PubSubClient và ghi flash. DNS/TCP connect hoặc LittleFS ghi chậm không chặn vòng đọc nút/LED/OLED; retry WiFi10s, MQTT5s, socket timeout2s. Enqueue RAM nhanh; worker commit snapshot trước publish, nên cần giữ nguồn trong khoảng ngắn từ nhấn nút đến flush flash (thường một worker tick cộng thời gian ghi). Không có `delay()` trong business logic. MQTT publish QoS0 của PubSubClient được bổ sung **application receipt**: chỉ xóa head FIFO sau downlink chứa `receipt_msg_id` đúng. Retry cùng msg_id mỗi2s; middleware dedup không tạo ticket mới. Schema-valid event dù transition bị reject cũng được receipt để tránh tắc FIFO.

Outbox LittleFS tối đa48 event, ghi snapshot `/outbox.json`, file tmp và backup để phục hồi restart; giữ nguyên thứ tự/topic/payload/msg_id. Có slot dự phòng cho control. Khi đầy: từ chối event mới rõ qua serial/OLED và beep, không silently drop event cũ. Flash mount/write hỏng: log PERSISTENCE_ERROR, bounded RAM fallback; mất điện trong fallback có thể mất event, cần sửa flash. Flash Wokwi không được giả định giữ giữa stop/restart browser; test reboot persistence cần cùng flash session hoặc node thật.

Downlink kiểm tra kích thước, JSON/schema, topic/device_id, state whitelist và cmd_id. CMD_APPLIED sinh một lần cho cmd_id mới; receipt dùng cùng cmd_id không sinh command loop. DEVICE_SYNC sau reconnect xin snapshot server. RESET DEMO gửi flag `reset_demo:true` để chủ động loại event cũ trước reset; ID reset đã áp dụng lưu NVS nên retained reset cũ không xóa request offline mới sau reboot. Public broker không có TLS/auth mặc định, chỉ dùng demo không PII; [security](../docs/SECURITY.md).

## Build local và VS Code

PlatformIO config có sẵn, pin library phiên bản tương thích. Nếu đã có PlatformIO:

```powershell
python -m platformio run --project-dir wokwi-demo
```

Nếu chưa có, cài vào venv riêng (chạy từ repository root):

```powershell
python -m venv wokwi-demo/.build-tools
wokwi-demo/.build-tools/Scripts/python.exe -m pip install platformio
wokwi-demo/.build-tools/Scripts/python.exe -m platformio run --project-dir wokwi-demo
```

Wokwi for VS Code: mở thư mục `wokwi-demo`, build rồi chạy `Wokwi: Start Simulator`; `wokwi.toml` trỏ `.pio/build/esp32dev/firmware.bin` và `.elf`. Browser Wokwi dùng bốn file source/config đã nêu, không cần `.pio` hoặc token CI. Wokwi CLI simulation yêu cầu token tài khoản; lint diagram có thể chạy độc lập bằng `wokwi-cli lint wokwi-demo`.

Test gestures trên host dùng chính functions trích từ sketch, không copy thuật toán: `python wokwi-demo/test_gestures.py` (g++ trên PATH). `browser-probe.cjs` là công cụ QA dùng Playwright optional ở `tools/node_modules/playwright`; không phải dependency chạy hệ thống.

### QA mất mạng và reboot

Wokwi browser miễn phí có biểu tượng Wi-Fi để tải PCAP; biểu tượng này không tắt mạng. Firmware giao cuối giữ `ENABLE_SERIAL_DIAGNOSTICS = false`. Công cụ QA `node wokwi-demo/browser-probe.cjs --offline` chỉ thay hằng này thành `true` trong source nạp vào browser, ghi rõ overlay trong JSON kết quả, giữ nguyên business logic. Gửi `O` qua Serial Monitor để worker thực sự đóng MQTT/TCP và đặt Wi-Fi OFF trong20s simulation; nhấn A/B lúc offline để buffer; gửi `R` để worker flush LittleFS rồi `ESP.restart()` trong cùng flash session. Sau reconnect kiểm tra ticket có đúng `origin_msg_id`, thứ tự FIFO và không duplicate. `R` không xóa flash hoặc giả lập state/ACK/DONE. Nếu không gửi `R`, Wi-Fi tự reconnect khi hết20s. Không bật diagnostics cho thiết bị production.

## Kiểm chứng

Build/lint kết quả thực tế được ghi tại [TEST_RESULTS](../docs/TEST_RESULTS.md) và [agent-2 log](../worklogs/agent-2.md). Browser Wokwi thực tế đã chạy E2E: physical A SHORT/B LONG, global queue B>A, NV02 dispatch, ACK→LED B blue độc lập, physical ARRIVED, DONE/EWMA/CSAT, double CANCEL và spam lock. [JSON E2E](../evidence/wokwi-e2e-results.json) giữ serial và state thật; [offline/reboot JSON](../evidence/wokwi-offline-results.json) chứng minh FIFO LittleFS phát lại hai msg_id nguyên vẹn sau mất mạng/reboot. Hai test dùng overlay diagnostics=true đã ghi rõ; binary/source giao giữfalse. Đây là kết quả tại thời điểm test, public broker vẫn có thể chậm/mất kết nối; demo cần kiểm tra mạng trước trình bày. [Demo cuối](../docs/DEMO_SCRIPT_FINAL.md) và [evidence checklist](../evidence/README.md) chỉ rõ bằng chứng cần quay thêm.

Part pin names kiểm tra theo tài liệu chính thức: [NeoPixel](https://docs.wokwi.com/parts/wokwi-neopixel), [SSD1306](https://docs.wokwi.com/parts/board-ssd1306), [pushbutton](https://docs.wokwi.com/parts/wokwi-pushbutton), [buzzer](https://docs.wokwi.com/parts/wokwi-buzzer), [diagram format](https://docs.wokwi.com/diagram-format), [PlatformIO integration](https://docs.wokwi.com/vscode/platformio).
