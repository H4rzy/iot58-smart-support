# BOM và giả định chi phí

## Simulation BOM

| Linh kiện | Số lượng | Wiring |
|---|---:|---|
| ESP32 DevKit C V4 | 1 | Wi-Fi/MQTT; mô phỏng 3 logical point |
| Push button | 3 | GPIO18/19/23, INPUT_PULLUP, nút xuống GND |
| WS2812 NeoPixel | 3 | Chuỗi GPIO25→A.DIN; A.DOUT→B.DIN; B.DOUT→C.DIN; 5V, chung GND |
| SSD1306 128×64 | 1 | SDA21, SCL22, 3V3, GND |
| Buzzer | 1 | GPIO13, GND |

Mạch cụ thể tại [diagram.json](../wokwi-demo/diagram.json). Simulation không yêu cầu mua linh kiện. OLED chung phục vụ demo, không bắt buộc OLED ở từng quầy.

## Real per-customer-point BOM

| Linh kiện | Số lượng | Khoảng dự toán minh họa (VND) |
|---|---:|---:|
| ESP32-C3 Super Mini | 1 | 35.000–65.000 |
| Nút nhấn | 1 | 2.000–5.000 |
| WS2812/RGB + điện trở data | 1 | 3.000–10.000 |
| USB nguồn / cáp | 1 | 10.000–25.000 |
| Hộp nhỏ / dây / tụ | 1 bộ | 10.000–25.000 |
| Buzzer (optional) | 1 | 2.000–5.000 |

**Ước tính tham khảo, cần kiểm tra lại trước khi đưa vào báo cáo chính thức.** Đây là giả định ngân sách, không phải giá thị trường đã xác minh hoặc báo giá. Chưa bao gồm vận chuyển, công lắp và laptop.

Nhân viên dùng điện thoại có sẵn; middleware dùng laptop/POS có sẵn. Broker production là chi phí chung. OLED có thể chỉ là màn hình demo chung.

V1 có nhiều nút / LED / OLED từng quầy. V2 dùng một nút, một RGB và ACK/DONE trên điện thoại. Theo ví dụ dự toán cùng cách tính, V1=180.000 VND và V2=80.000–90.000 VND tiết kiệm khoảng 50–56%. Có thể mô tả giảm khoảng 50–60% theo estimate hiện tại; đây chưa phải kết quả đo chi phí thật. Cần thay bằng báo giá cùng ngày trước báo cáo chính thức.

## Camera đếm người (tùy chọn, ước tính)

Không nằm trong BOM cơ bản ở trên. Đây là giả định ngân sách để so sánh phương án, không phải giá đã kiểm tra.

| Phương án | Số lượng | Khoảng dự toán minh họa (VND) | Ghi chú |
|---|---:|---:|---|
| Webcam laptop (demo) | 1 | 0 | Đã có sẵn, chỉ để demo |
| ESP32-S3 + OV2640 có PSRAM | 1 mỗi khu (3) hoặc 1 cho cả cửa hàng | 250.000–400.000 mỗi module | Cần kiểm tra giá thật và khả năng đếm người trên thiết bị |
| ESP32-CAM AI-Thinker | 1 mỗi khu hoặc 1 cho cả cửa hàng | 150.000–250.000 mỗi module | Rẻ hơn nhưng đếm người rất chật, cần đo trước |
| Nguồn 5V, hộp, dây | 1 bộ mỗi camera | 20.000–40.000 | Lắp cố định, hướng vào khu quầy |

**Ước tính tham khảo, chưa kiểm tra giá thực tế.** Cần báo giá cùng ngày trước khi đưa vào báo cáo. Ví dụ, 3 camera ESP32-S3 cho ba khu tốn khoảng 750.000–1.200.000 VND cộng nguồn và hộp, tức là lớn hơn nhiều so với BOM nút bấm. Đây là lý do camera được để tùy chọn. Mỗi khu cần ít nhất một camera; một camera cho cả cửa hàng cần kiểm tra góc nhìn có đủ không.
