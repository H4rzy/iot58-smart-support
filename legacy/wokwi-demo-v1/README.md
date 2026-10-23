# Demo máy gọi nhân viên hỗ trợ trên Wokwi

## 1. Tạo project trên Wokwi

1. Truy cập https://wokwi.com/projects/new/esp32
2. Đăng nhập để có thể lưu và chia sẻ project.
3. Trong tab `sketch.ino`, xóa code mẫu rồi dán toàn bộ nội dung file `sketch.ino` trong thư mục này.
4. Mở tab `diagram.json`, xóa nội dung cũ rồi dán toàn bộ file `diagram.json`.
5. Tạo file `libraries.txt` và dán nội dung file tương ứng.
   - Nếu giao diện không có nút tạo file, mở Library Manager, tìm và thêm `Adafruit SSD1306`. Wokwi sẽ tự thêm các dependency cần thiết.
6. Bấm nút Play màu xanh để chạy.

## 2. Điều khiển

| Thao tác | Nút trên mạch | Phím tắt |
|---|---|---|
| Khách yêu cầu hỗ trợ | REQUEST đỏ | R |
| Nhân viên tiếp nhận | ACK xanh dương | A |
| Hoàn tất hỗ trợ | DONE xanh lá | D |

Mở Serial Monitor để xem log sự kiện dạng JSON.

## 3. Kịch bản demo

1. Chạy mô phỏng và chờ OLED hiện `READY`.
2. Bấm REQUEST: tạo Ticket T001, LED vàng sáng và OLED hiện `PENDING`.
3. Bấm REQUEST lại: hệ thống từ chối vì đang có Ticket hoạt động.
4. Bấm ACK: Ticket chuyển sang `ACKNOWLEDGED`, LED xanh dương sáng và OLED hiện response time.
5. Bấm DONE: Ticket chuyển sang `RESOLVED`, LED xanh lá sáng.
6. Đợi đủ 10 giây kể từ lần tạo trước rồi bấm REQUEST để tạo Ticket T002.
7. Không ACK trong 15 giây: Ticket chuyển sang `ESCALATED`, LED đỏ nhấp nháy và buzzer cảnh báo.
8. Bấm ACK để tiếp nhận Ticket đã escalated, sau đó bấm DONE để hoàn tất.

## 4. Các business rule đã có

- Debounce nút nhấn: 50 ms.
- Request cooldown: 10 giây.
- Chỉ có một Ticket hoạt động tại một thiết bị.
- Ticket phải ACK trước khi DONE.
- Ticket PENDING quá 15 giây tự chuyển ESCALATED.
- Thời gian phản hồi được tính từ lúc tạo Ticket đến lúc ACK.
- Serial Monitor ghi `device_id`, vị trí, Ticket, trạng thái và sự kiện.

## 5. Luồng trạng thái

```text
READY -> PENDING -> ACKNOWLEDGED -> RESOLVED
             |
             +---- quá 15 giây ----> ESCALATED
                                      |
                                      +---- ACK -> ACKNOWLEDGED
```
