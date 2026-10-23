# Demo cuối — 5–7 phút

Demo thresholds được rút ngắn để thuận tiện trình bày; production thresholds lớn hơn. Mặc định demo: ACK 8s, L1 15s, L2 25s; normal: 30/60/90s. Bật **DEMO MODE** trên Dashboard. Response SLA KPI mặc định 120s và được cấu hình riêng.

Ticket ID đầy đủ dạng TYYYYMMDD-sequence. T001/T002 chỉ là cách gọi nhanh thứ tự tạo; reset giữ sequence để ID không trùng.

## Chuẩn bị

1. Chạy Node-RED với public broker cho Wokwi; host và BASE phải khớp firmware. Mở Dashboard, Node-RED editor /red và Wokwi. Project Wokwi cần đủ `sketch.ino`, `diagram.json`, `libraries.txt` và `partitions.csv` để có LittleFS. Telegram token là optional.
2. Chờ MQTT ONLINE. Bấm RESET DEMO, chọn reset KPI để bắt đầu phiên sạch; không xóa synthetic history.
3. Đặt NV01/NV02/NV03 BUSY. Ba nút A/B/C đại diện ba customer-point, không phải nút ACK/DONE.
4. Mở trình duyệt khoảng 1366×768; cho phép âm thanh Wokwi nếu cần. Đảm bảo đã kiểm tra gesture timing trước buổi trình bày.

## Kịch bản chính

| Bước | Thao tác | Kết quả cần chỉ ra |
|---|---|---|
| 1 | A01 nhấn ngắn <800ms | CONSULTATION, PENDING, LED vàng, priority khoảng 20 |
| 2 | B01 giữ ≥1500ms rồi thả | PAYMENT, B đứng trước A, priority khoảng 50, OLED top B |
| 3 | Đặt NV02 Bình AVAILABLE | Engine tự assign ticket B; current ticket hiện trên staff panel; notify Telegram nếu configured |
| 4 | Không ACK; chờ timeout | Bình hết timeout, reservation được release; chỉ Bình AVAILABLE nên hết ứng viên → L1; đến ngưỡng L2 có manager alert và LED đỏ |
| 5 | Chọn Bình ở dropdown của ticket B, ACK trên Dashboard | ACKNOWLEDGED; MQTT downlink; LED B BLUE, chứng minh remote control |
| 6 | Nhấn nút vật lý B sau ACK | STAFF_ARRIVED → ARRIVED, LED cyan; response = created→arrived |
| 7 | DONE trên Dashboard | RESOLVED / CSAT_WAIT, LED green; service = arrived→resolved; AHT update |
| 8 | B nhấn ngắn trong cửa sổ CSAT 15s | SATISFIED → READY; CSAT update; chỉ ra Avg, P90, AHT và ACK latency riêng |
| 9 | C nhấn ngắn tạo ticket, rồi hai short cách ≤400ms | CANCELLED, purple tạm thời; AHT không học từ cancel |
| 10 | Bỏ chọn reset KPI, RESET; A tạo request, rồi ≥5 suspicious short trong 10s | SPAM_LOCK 30s, purple/red; không tạo thêm ticket. Cách các short khoảng 600ms để tránh bị đọc thành double |
| 11 | RESET giữ KPI; NV03 OFFLINE; set clock 09/10/2026 17:45, speed 60×, pause | Horizon 15 phút → 18h; A cần 2 staff, primary on-duty 1 → recommendation thêm 1; dataset ghi rõ giả lập |
| 12 | Mở analytics và forecast | Avg, P90, SLA, CSAT, AHT, nhu cầu theo khu/giờ và staffing recommendation |

Clock input dùng timezone của trình duyệt. Để mốc 17:45 đúng giờ cửa hàng, máy demo dùng UTC+7. Không nhấn thêm trong CSAT trừ thao tác rating.

DONE trước ARRIVED bị disable trên Dashboard; REST trả 409 nếu thử trực tiếp. Aging dùng thời gian thực; minh họa bằng công thức consultation chờ 7 phút có priority 55 vượt payment mới 50. Clock ảo không làm aging/SLA chạy nhanh.

## Reassignment riêng — khoảng 30 giây

Sau kịch bản chính hoặc trong full demo: RESET, đặt NV01 và NV03 AVAILABLE, NV02 OFFLINE; A tạo request. Không ACK. NV01 được chọn đầu tiên, sau 8s engine chuyển sang NV03; hết ứng viên tiếp tục L1/L2. Đây là scenario riêng vì reset sẽ xóa các ticket đang thao tác ở kịch bản chính.

Không reset trong khi automated scenario đang chạy.

## Lời giải thích ngắn

“Nút gửi MQTT uplink, server tạo global queue và tự chọn nhân viên. ACK từ Dashboard gửi MQTT downlink làm LED xanh dương. ACK là nhận việc; nhân viên đến nơi nhấn nút thì mới đo phản hồi thực. Service time cập nhật EWMA AHT; dữ liệu lịch sử bốn tuần giả lập chứng minh forecast staffing.”

## Khi broker hoặc kiểm chứng chưa sẵn sàng

Nếu public broker không ổn, đổi cả firmware và Node-RED sang fallback broker cùng BASE rồi restart. Broker local chỉ test middleware; Wokwi cloud không tới localhost.

Nếu chưa verify browser Wokwi, ghi manual pending; không trình bày local publisher như video Wokwi. Đối chiếu [TEST_RESULTS](TEST_RESULTS.md) và [evidence](../evidence/README.md).
