# Hardware bonus +5 — tùy chọn

100 điểm cơ bản dựa trên simulation, bốn tầng, automation, application, demo và deliverables. Node thật chỉ phục vụ bonus, không thay simulation.

Triển khai một node A01 trước: ESP32-C3 Super Mini, một nút xuống GND với INPUT_PULLUP, một WS2812, nguồn USB và hộp nhỏ. Không thêm nút ACK/DONE.

ESP32-C3 có pin mapping khác DevKit. Không copy GPIO18/19/23 từ simulation. Chọn pin an toàn theo datasheet của board thực, tránh bootstrapping / USB pins dùng bởi board.

WS2812 cần chung GND, nguồn phù hợp, điện trở data và tụ nguồn. Nếu tín hiệu 3.3V tới LED cấp 5V không ổn định, thêm level shifter. Đặt nút và LED dễ nhìn; buzzer là optional; OLED chung có thể bỏ trên node thật.

Mỗi node chỉ đăng ký device_id / zone của mình, có client ID riêng và LWT `BASE/cp/A01/status`. B01/C01 dùng connection độc lập. Production dùng private broker, TLS và ACL.

Firmware hiện tại target simulation với ba logical instance. Muốn build C3 thật phải đổi target, pins, số instance, status topic và Wi-Fi credentials, sau đó compile/test lại. Đây là hướng dẫn bonus; chưa tuyên bố đã lắp node thật.

Evidence bonus cần ảnh wiring, short/long request, MQTT uplink/downlink, ACK LED blue và physical ARRIVED; ghi rõ board, power và pin mapping thực.

## Camera đếm người (tùy chọn, chưa lắp)

Trạng thái hiện tại: **chưa có** firmware camera và **chưa có** camera ESP32-S3 thật. Demo dùng webcam laptop qua `vision/publisher.py`, chỉ là phương án thay thế để chứng minh contract `BASE/vision/{zone}` và luật middleware. Không ghi là đã chạy trên ESP32-S3.

Phương án triển khai thật, cần chọn một:

- **ESP32-S3 + OV2640 (PSRAM)**, một camera cho mỗi khu A/B/C hoặc một camera cho cả cửa hàng. Cần kiểm tra bộ đếm người có chạy được trên thiết bị với PSRAM và tốc độ khung hình chấp nhận được. Nếu không, camera chỉ là cảm biến ảnh và phải có máy biên khác đếm người rồi publish.
- **ESP32-CAM AI-Thinker**: rẻ hơn, nhưng bộ nhớ và tốc độ suy luận rất chật để đếm người. Không khuyến nghị nếu không đo trước.
- **Máy biên có sẵn** (mini PC/laptop) đọc camera IP hoặc USB và chạy `publisher.py`. Đây là cách thực tế nhất nếu không muốn viết firmware, nhưng `publisher.py` hiện chỉ đọc camera cục bộ theo chỉ số (`--camera-index`), chưa đọc RTSP.

Yêu cầu khi lắp thật: camera hướng vào khu quầy, không ghi hình, không lưu clip, không gửi ảnh. Chỉ publish số nguyên `persons` theo contract. Có biển báo cho khách. Production cần ACL để camera khu A chỉ được publish `vision/A`.

Evidence cần có nếu làm bonus camera: ảnh lắp đặt, log MQTT `vision/{zone}` trong ít nhất một giờ, ảnh màn hình chứng minh `arrival_verified` và `ABANDONED_VISION` trên hệ thống thật.
