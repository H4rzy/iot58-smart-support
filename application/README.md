# Dashboard vận hành cửa hàng

Application vanilla HTML/CSS/JS được Node-RED phục vụ tại `http://localhost:1880/`. Không dùng framework, CDN, font online hoặc dashboard plugin. Khởi chạy middleware theo [Node-RED README](../node-red/README.md); không mở `index.html` bằng `file://` vì REST API cần cùng origin.

Dashboard lấy dữ liệu thật từ `GET /api/iot58/state` mỗi 1 giây. Khi API mất kết nối, bản cập nhật gần nhất được đánh dấu và thao tác tạm khóa; không tạo dữ liệu thay thế. MQTT offline được hiển thị riêng với API offline. Telegram có thể DISABLED mà mọi điều khiển Dashboard vẫn hoạt động.

## Các thao tác

- Hàng đợi: chọn nhân viên và ACK ticket PENDING/ESCALATED. DONE chỉ mở khi ARRIVED. Nhân viên đến quầy và nhấn nút Wokwi để xác nhận ARRIVED; Dashboard không cung cấp thao tác giả lập arrival.
- Nhân sự: đổi AVAILABLE/BUSY/OFFLINE để trigger dispatch. Điểm xem trước theo A/B/C, lượt nhận trong ca và ticket hiện tại lấy từ server.
- Phân tích: phản hồi thực created→arrived, P90 nearest-rank, EWMA AHT, SLA, CSAT, nhu cầu theo khu/ý định và forecast staffing từ lịch sử giả lập. Dataset được gắn nhãn rõ.
- Clock: nhập mốc thời gian theo timezone máy đang mở trình duyệt; ứng dụng chuyển sang ISO UTC trước khi POST. Chọn 1×/10×/60×, đặt mốc rồi chạy hoặc tạm dừng. Forecast dùng clock ảo; SLA dùng thời gian thực.
- Chế độ: toggle DEMO/NORMAL thay ngưỡng tại middleware. Reset demo có xác nhận và tùy chọn reset KPI, giữ lịch sử synthetic.
- Nếu middleware có cấu hình `API_TOKEN`, mở mục quyền điều khiển cuối trang và nhập token được quản trị viên cung cấp. Token chỉ giữ trong bộ nhớ trang cho Authorization của POST; không có token hardcode, không ghi localStorage/URL/log. Reload cần nhập lại. Production phải dùng HTTPS.

API mutation: `POST /tickets/:id/ack`, `/tickets/:id/done`, `/staff/:id/status`, `/demo/clock`, `/demo/mode`, `/demo/reset` dưới prefix `/api/iot58`. Validation cuối cùng thuộc middleware; lỗi 400/404/409 hiển thị qua thông báo.

## Kiểm tra giao diện

Desktop mục tiêu 1366×768; responsive cho tablet/mobile. Điều hướng bàn phím, skip link, tên accessibility cho select/action, bảng cuộn ngang, reduced-motion. Nội dung server dùng `textContent`; không chèn `innerHTML` từ MQTT/audit/ticket.

## Camera (Vision)

- Thẻ "Camera" cho khu A/B/C đọc `state.vision`: số người, thời gian đứng, tổng lượt khách. Camera không có tín hiệu hiển thị "Không có tín hiệu", không bao giờ hiển thị 0 khi `persons` là `null`. Khi `config.vision_enabled` là `false`, thẻ chuyển sang trạng thái tắt và có ghi chú. Middleware cũ không có `vision` thì hiển thị "Chưa có dữ liệu".
- Huy hiệu trên ticket đọc `presence_verified`, `arrival_verified`, `cancel_reason`; giá trị `null` hoặc thiếu thì không hiển thị huy hiệu. Ticket tự hủy do camera được giữ trong hàng đợi 60 giây với trạng thái "Đã hủy", không có nút thao tác.
- Cảnh báo `TICKET_ABANDONED`, `UNVERIFIED_REQUEST`, `ARRIVAL_UNVERIFIED`, `PROACTIVE_ASSIST` có nhãn tiếng Việt; loại khác hiển thị đúng mã gốc.
- Camera chỉ gửi số người, không lưu hình. Dashboard không nhận hay hiển thị ảnh. Fetch có timeout 7 giây và không tạo request polling chồng nhau.

Kiểm tra manual: API online/offline, tạo A ngắn + B dài, thay nhân viên, ACK→LED blue, DONE disabled trước ARRIVED, ARRIVED tại nút vật lý, DONE/CSAT, forecast virtual clock, reset. Kết quả kiểm tra thực tế ghi trong [TEST_RESULTS](../docs/TEST_RESULTS.md).
