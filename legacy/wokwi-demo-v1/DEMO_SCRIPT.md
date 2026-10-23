# Kịch bản demo nhanh (3–4 phút)

## Chuẩn bị trước khi trình bày

- Mở project Wokwi và bấm Play trước khoảng 30 giây.
- Đợi OLED hiện `READY`.
- Mở Serial Monitor để bên phải màn hình.
- Nếu vừa thử demo, bấm Stop rồi Play lại để Ticket quay về trạng thái ban đầu.

## 1. Giới thiệu — 20 giây

**Người nói:**

> Đây là prototype máy gọi nhân viên hỗ trợ thông minh tại Quầy A. Phần cứng được mô phỏng trên Wokwi gồm ESP32, nút yêu cầu, màn hình OLED, các LED trạng thái và buzzer. Hệ thống có xử lý event vật lý, business rule và actuator.

**Người thao tác:** Chỉ vào ESP32, nút REQUEST, OLED, LED và buzzer.

## 2. Tạo Ticket — 30 giây

**Người nói:**

> Khi khách hàng cần hỗ trợ, khách nhấn nút REQUEST. ESP32 xử lý debounce rồi tạo một Ticket mới tại đúng vị trí của thiết bị.

**Người thao tác:** Bấm nút đỏ `REQUEST` hoặc phím `R`.

**Kết quả cần chỉ ra:**

- OLED hiện Ticket `T001` và trạng thái `PENDING`.
- LED vàng sáng.
- Buzzer kêu xác nhận.
- Serial Monitor xuất sự kiện `TICKET_CREATED` cùng `device_id` và `location`.

## 3. Chứng minh business rule — 25 giây

**Người nói:**

> Nếu người dùng bấm thêm trong lúc Ticket cũ đang hoạt động, hệ thống không tạo Ticket trùng. Đây là rule chống spam yêu cầu, kết hợp debounce và cooldown.

**Người thao tác:** Bấm `REQUEST` thêm một lần.

**Kết quả:** OLED báo `TICKET ACTIVE`, buzzer phát âm báo lỗi và số Ticket vẫn là `T001`.

## 4. Nhân viên tiếp nhận — 30 giây

**Người nói:**

> Khi nhân viên nhận yêu cầu, Ticket chuyển từ PENDING sang ACKNOWLEDGED. Hệ thống ghi nhận thời điểm ACK để tính thời gian phản hồi.

**Người thao tác:** Bấm nút xanh dương `ACK` hoặc phím `A`.

**Kết quả:** LED xanh dương sáng, OLED hiện `ACKNOWLEDGED` và `Resp`.

## 5. Hoàn tất — 25 giây

**Người nói:**

> Sau khi hỗ trợ xong, nhân viên cập nhật hoàn tất. Ticket chỉ được RESOLVED nếu trước đó đã được ACK.

**Người thao tác:** Bấm nút xanh lá `DONE` hoặc phím `D`.

**Kết quả:** OLED hiện `RESOLVED`, LED xanh lá sáng và buzzer kêu hai tiếng.

## 6. Chứng minh SLA timeout — 45 giây

**Người nói:**

> Tiếp theo nhóm kiểm tra trường hợp Ticket không có nhân viên nhận. Trong demo, ngưỡng SLA được rút xuống còn 15 giây.

**Người thao tác:**

1. Nếu chưa đủ 10 giây từ Ticket trước, chờ một chút.
2. Bấm `REQUEST` để tạo Ticket tiếp theo.
3. Không bấm ACK và chờ 15 giây.

**Người nói khi hết 15 giây:**

> Ticket đã tự chuyển sang ESCALATED. LED đỏ nhấp nháy, buzzer cảnh báo và log xuất sự kiện SLA_ESCALATED. Điều này giúp yêu cầu không bị bỏ quên.

## 7. Kết luận — 20 giây

**Người nói:**

> Như vậy mô phỏng đã thể hiện đầy đủ event vật lý là nút nhấn, các business rule gồm chống Ticket trùng, State Machine và SLA timeout, cùng output actuator là OLED, LED và buzzer. Phiên bản tiếp theo có thể đưa ACK và DONE lên Dashboard thông qua MQTT.

## Phương án dự phòng

- Nếu Wokwi mất âm thanh: chỉ vào LED, OLED và Serial Monitor; buzzer không phải output duy nhất.
- Nếu nhấn nút không nhận: dùng phím `R`, `A`, `D`.
- Nếu đang ở trạng thái cũ: bấm Stop rồi Play để khởi động lại.
- Nếu không đủ thời gian chờ SLA: đổi `SLA_TIMEOUT_MS` từ `15000` thành `5000` rồi chạy lại.
