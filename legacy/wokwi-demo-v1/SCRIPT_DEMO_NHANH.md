# SCRIPT DEMO NHANH – MÁY GỌI NHÂN VIÊN HỖ TRỢ

**Thời lượng:** Khoảng 3 phút  
**Nền tảng:** Wokwi – ESP32

## Chuẩn bị trước khi demo

1. Mở project trên Wokwi.
2. Bấm **Play** và đợi `Build succeeded`.
3. Chờ OLED hiện `READY`.
4. Mở **Serial Monitor** để xem log sự kiện.
5. Có thể thao tác bằng phím tắt:
   - `R`: REQUEST
   - `A`: ACK
   - `D`: DONE

## BOM – Linh kiện sử dụng

| Linh kiện | Số lượng | Công dụng |
|---|---:|---|
| ESP32 DevKit V1 | 1 | Xử lý nút nhấn, business rule và điều khiển đầu ra |
| Nút nhấn | 3 | REQUEST, ACK và DONE |
| OLED SSD1306 128×64 | 1 | Hiển thị số Ticket, trạng thái và thời gian phản hồi |
| LED vàng, xanh dương, xanh lá, đỏ | 4 | Báo PENDING, ACKNOWLEDGED, RESOLVED và ESCALATED |
| Điện trở 220 Ω | 4 | Hạn dòng, bảo vệ các LED |
| Buzzer | 1 | Phát âm xác nhận và cảnh báo quá SLA |
| Dây nối/breadboard | Tùy chọn | Kết nối linh kiện khi triển khai phần cứng thật |

### Lời giới thiệu BOM

> Mô hình sử dụng một ESP32 làm bộ xử lý trung tâm, ba nút nhấn để mô phỏng thao tác REQUEST, ACK và DONE, OLED để hiển thị Ticket, bốn LED để báo trạng thái và buzzer để phát cảnh báo. Trong Wokwi, toàn bộ linh kiện và dây nối đều được mô phỏng; khi làm phần cứng thật, nhóm bổ sung breadboard và dây jumper.

## 1. Giới thiệu

### Lời nói

> Đây là mô hình máy gọi nhân viên hỗ trợ thông minh tại Quầy A. Hệ thống gồm ESP32, nút yêu cầu hỗ trợ, màn hình OLED, các LED trạng thái và buzzer. Mô hình thể hiện đầy đủ event vật lý, business rule và output actuator.

### Thao tác

Chỉ vào nút REQUEST, ESP32, OLED, các LED và buzzer trên Wokwi.

## 2. Khách tạo yêu cầu

### Lời nói

> Khi khách hàng cần hỗ trợ, khách nhấn nút REQUEST. ESP32 sẽ xử lý tín hiệu nút nhấn và tạo một Ticket mới.

### Thao tác

Bấm nút đỏ **REQUEST** hoặc phím `R`.

### Kết quả cần chỉ ra

- OLED hiện Ticket `T001`.
- Trạng thái chuyển thành `PENDING`.
- LED vàng sáng.
- Buzzer kêu xác nhận.
- Serial Monitor xuất sự kiện `TICKET_CREATED`.

### Lời nói tiếp

> Ticket đang ở trạng thái PENDING, nghĩa là đang chờ nhân viên tiếp nhận. Log cũng cho biết device ID và vị trí phát sinh yêu cầu là Quầy A.

## 3. Chứng minh chống Ticket trùng

### Lời nói

> Hệ thống có business rule chống tạo Ticket trùng khi khách nhấn nút nhiều lần.

### Thao tác

Bấm **REQUEST** hoặc phím `R` thêm một lần.

### Lời nói tiếp

> Yêu cầu mới đã bị từ chối vì thiết bị đang có một Ticket hoạt động. OLED báo TICKET ACTIVE và số Ticket vẫn giữ nguyên là T001.

## 4. Nhân viên tiếp nhận

### Lời nói

> Khi nhân viên nhận được thông báo, nhân viên bấm ACK. Trong phiên bản hoàn chỉnh, thao tác này sẽ được thực hiện trên Dashboard.

### Thao tác

Bấm nút **ACK** hoặc phím `A`.

### Kết quả cần chỉ ra

- Ticket chuyển sang `ACKNOWLEDGED`.
- LED xanh dương sáng.
- OLED hiển thị thời gian phản hồi tại dòng `Resp`.
- Serial Monitor xuất sự kiện `TICKET_ACKNOWLEDGED`.

### Lời nói tiếp

> Hệ thống tính thời gian phản hồi từ lúc khách tạo Ticket đến lúc nhân viên ACK.

## 5. Hoàn tất hỗ trợ

### Lời nói

> Sau khi hỗ trợ khách hàng xong, nhân viên cập nhật hoàn tất.

### Thao tác

Bấm nút **DONE** hoặc phím `D`.

### Kết quả cần chỉ ra

- Ticket chuyển sang `RESOLVED`.
- LED xanh lá sáng.
- Buzzer kêu hai tiếng.
- Serial Monitor xuất sự kiện `TICKET_RESOLVED`.

### Lời nói tiếp

> Ticket đã được xử lý thành công. Business rule của hệ thống yêu cầu Ticket phải được ACK trước khi có thể hoàn tất.

## 6. Demo SLA timeout

Chờ đủ thời gian cooldown kể từ lúc tạo Ticket trước rồi thực hiện phần này.

### Lời nói

> Tiếp theo, nhóm mô phỏng trường hợp không có nhân viên tiếp nhận yêu cầu. Để thuận tiện cho demo, SLA được đặt là 15 giây.

### Thao tác

1. Bấm **REQUEST** hoặc phím `R` để tạo Ticket mới.
2. Không bấm ACK.
3. Chờ 15 giây.

### Kết quả cần chỉ ra

- Ticket tự chuyển sang `ESCALATED`.
- LED đỏ nhấp nháy.
- Buzzer phát cảnh báo.
- OLED hiện `CANH BAO QUA SLA!`.
- Serial Monitor xuất sự kiện `SLA_ESCALATED`.

### Lời nói tiếp

> Do Ticket chờ quá SLA, hệ thống tự chuyển sang ESCALATED và kích hoạt cảnh báo. Cơ chế này giúp yêu cầu của khách hàng không bị bỏ quên.

Sau đó bấm `ACK`, rồi bấm `DONE` để đóng Ticket.

## 7. Kết luận

### Lời nói

> Qua demo, hệ thống đã mô phỏng được event vật lý là nút nhấn; business rule gồm debounce, chống Ticket trùng, State Machine và SLA timeout; output actuator gồm OLED, LED và buzzer. Phiên bản tiếp theo sẽ kết nối MQTT để nhân viên ACK và hoàn tất Ticket trực tiếp trên Dashboard.

## Chế độ demo nhanh hơn

Nếu muốn giảm thời gian chờ, sửa trong `sketch.ino`:

```cpp
const unsigned long REQUEST_COOLDOWN_MS = 3000;
const unsigned long SLA_TIMEOUT_MS = 8000;
```

Sau khi sửa, bấm **Stop**, rồi bấm **Play** để Wokwi compile lại.

## Phương án dự phòng

- Nếu buzzer không nghe được: tập trung trình bày OLED, LED và Serial Monitor.
- Nếu nhấn chuột không nhận: dùng các phím `R`, `A`, `D`.
- Nếu mô hình đang ở trạng thái cũ: bấm **Stop**, sau đó **Play** để reset.
- Nếu Wokwi build lỗi: mở Build Log và chụp hoặc sao chép toàn bộ phần lỗi.
