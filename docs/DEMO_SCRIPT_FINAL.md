# Kịch bản thuyết trình và demo — 5 phút tổng cộng

**Lời thoại và thao tác nằm trong cùng 5 phút, không cộng một lượt demo riêng.** Dùng đồng hồ bấm giờ, dừng ở 05:00. Node-RED có 45 giây trình bày riêng. [Thẻ thao tác](QUICK_DEMO.md) · [Tra cứu chi tiết](HUONG_DAN_DEMO.md).

## Chuẩn bị trước khi bấm giờ

- Mở sẵn Dashboard http://localhost:1880/, Node-RED http://localhost:1880/red/ và Wokwi đã compile, MQTT ONLINE. Không cài package hoặc chờ compile trong 5 phút.
- Wokwi dùng đủ sketch, diagram, libraries và partitions.csv; broker/BASE khớp middleware. CAM A/B/C=1 để không tự hủy do khu trống. Thanh trượt CAM giả lập số người, không phải camera thu hình.
- DEMO MODE, RESET KPI, cả 3 staff BUSY, thiết bị READY. Khi đến bước queue mới nhấn A/B. Không chạy auto runner cùng Wokwi.
- Thử quyền webcam trước, sau đó tắt; chuẩn bị vật mẫu/người đồng ý. Đóng Python vision publisher nếu nó chiếm camera. Ảnh chỉ lưu cục bộ, chưa chia sẻ cho máy nhân viên khác.
- Đặt clock forecast **09/10/2026 17:45**, Pause, để khớp history giả lập. Trong demo chỉ đọc kết quả, không nhập lại ngày.
- Nếu dùng launcher thay Wokwi: chạy tools/start_demo.ps1 từ root, A/B đã có sẵn. Phải nói rõ event thiết bị do MQTT publisher mô phỏng. Không gọi đó là nút Wokwi thật.

## 00:00–00:20 — Bài toán cửa hàng (20 giây)

**Màn hình:** Dashboard tổng quan.

**Nói:** “Nhóm em trình bày Máy lấy số / gọi nhân viên hỗ trợ thông minh. Khách ở các khu iPhone, Android và phụ kiện có thể gọi hỗ trợ cùng lúc. Hệ thống xếp hàng, phân công nhân viên và đo thời gian nhân viên thực sự đến nơi.”

**Tác dụng:** Giảm bỏ sót yêu cầu, có số liệu phản hồi thực.

## 00:20–01:05 — Node-RED là trung tâm xử lý (45 giây)

**Thao tác:** Chuyển tab /red/. Chỉ nhanh 4 khu flow, không mở code hoặc Deploy:

1. **01 MQTT INGEST:** nhận topic và kiểm tra dữ liệu.
2. **02 TICKET ENGINE / 03 PRIORITY QUEUE:** quản lý trạng thái và queue.
3. **04 STAFF DISPATCH / 05 SLA:** chọn nhân viên, timeout và cảnh báo.
4. **06 DEVICE DOWNLINK:** phát lệnh về thiết bị.

**Nói:** “Đây là Node-RED, tầng middleware và trung tâm xử lý. MQTT Ingest nhận yêu cầu từ ESP32, kiểm tra dữ liệu và chống trùng. Ticket Engine quản lý trạng thái, Queue xếp ưu tiên, Dispatch chọn nhân viên. Nhánh SLA theo dõi quá hạn. Khi bấm ACK trên Dashboard, Node-RED cập nhật ticket rồi phát MQTT xuống ESP32 đổi màu LED. Dashboard và REST cũng do Node-RED phục vụ. Như vậy có đủ bốn tầng: thiết bị, kết nối, middleware và ứng dụng.”

**Tác dụng:** Quyết định dùng chung ở server; thiết bị tại quầy chỉ cần nút và LED. MQTT đi cả hai chiều, không chỉ giám sát.

## 01:05–01:40 — Hai yêu cầu, một queue (35 giây)

**Thao tác:** Quay Dashboard/Wokwi. A nhấn ngắn; B giữ lâu rồi thả. Chỉ B đứng trước A, OLED top B và LED vàng. Nếu dùng launcher thì chỉ vào hai ticket đã tạo, không bấm thêm.

**Nói:** “A gọi tư vấn, B gọi thanh toán. Hai quầy vào cùng queue; B có trọng số 50, cao hơn A là 20 nên đứng trước. Mỗi phút chờ cộng thêm 5 điểm, giúp ticket tư vấn cũ không bị bỏ quên.”

**Tác dụng:** Ưu tiên theo nhu cầu và có aging chống chờ mãi. Không chờ 7 phút để minh họa aging.

## 01:40–02:20 — Tự phân công, ACK và downlink (40 giây)

**Thao tác:** NV02 Bình → AVAILABLE. Quan sát assignment B; chọn NV02 trên ticket nếu cần và **ACK ngay trong 8 giây** sau khi staff khả dụng, rồi mới giải thích. Cho thấy LED B blue. DONE còn khóa.

**Nói:** “Khi Bình rảnh, engine xét khu vực và khối lượng đã nhận để phân công. ACK nghĩa là nhận việc. Node-RED gửi MQTT downlink, LED B xanh dương báo đã có người tiếp nhận. DONE vẫn khóa vì nhận việc chưa có nghĩa là đã đến nơi.”

**Tác dụng:** Tự điều phối và phản hồi cho khách. Ticket đã L1/L2 trong lúc nói vẫn ACK được nếu chọn nhân viên khả dụng.

## 02:20–03:00 — ARRIVED, DONE, CSAT (40 giây)

**Thao tác liên tiếp:** CAM B=2 nếu dùng presence; nhấn B → ARRIVED/cyan. DONE → green. Trong 15 giây, nhấn ngắn B → SATISFIED. Xong thao tác mới giải thích; không mở camera giữa cửa sổ CSAT.

**Nói:** “Nhân viên tới quầy và nhấn nút mới ghi ARRIVED. Response time tính từ lúc tạo yêu cầu đến lúc này, khác với ACK latency. Sau phục vụ, DONE kết thúc ticket và cập nhật thời gian phục vụ trung bình bằng EWMA. Khách đánh giá hài lòng bằng một lần nhấn.”

**Tác dụng:** Đo đúng mốc, ngăn DONE sớm, học AHT/ETA và ghi CSAT. Camera thấy 2 người chỉ hỗ trợ ngữ cảnh, không nhận diện ai là nhân viên.

## 03:00–03:35 — Camera mở rộng (35 giây)

**Thao tác:** Dashboard → Ảnh khu vực gắn với ticket. Chọn B hoặc A → Bật webcam → Chụp → chỉ nhãn ticket/ảnh → Tắt.

**Nói:** “Đây là webcam laptop ngoài Wokwi, giúp xem ngữ cảnh và chụp ảnh gắn ticket. Chỉ lưu ảnh khi bấm chụp, lưu trên trình duyệt này, chưa gửi qua Node-RED hay máy khác. Luồng đếm người là phần riêng; trong Wokwi dùng thanh trượt giả lập, có thể cảnh báo khách đứng lâu hoặc tự hủy khi khu trống. Tắt camera, nút gọi vẫn chạy.”

**Tác dụng:** Phân biệt ảnh ticket với presence; không nhầm slider là camera thật. Nếu camera chưa lên sau 5 giây, nói rõ thiếu quyền/thiết bị rồi chuyển bước; không sửa driver trong lượt demo.

## 03:35–04:00 — Cảnh báo không bỏ quên (25 giây)

**Thao tác:** Chỉ ticket A vẫn chờ, alert L1/L2 và LED đỏ nếu Wokwi đang chạy. Không reset hoặc chờ lại timeout.

**Nói:** “A chưa được nhận nên hệ thống tự nâng cấp cảnh báo L1/L2. Khi có nhiều nhân viên phù hợp, không ACK sẽ thử người tiếp theo. Demo rút ngắn ngưỡng để dễ quan sát; đây là cách tránh bỏ quên khách, không phụ thuộc quản lý luôn nhìn màn hình.”

**Tác dụng:** Xử lý bất thường tự động. Reassignment, spam, cancel và offline có kịch bản riêng cho Q&A, không chạy toàn bộ ở đây.

## 04:00–04:45 — KPI và forecast (45 giây)

**Thao tác:** Mở Phân tích, chỉ response/P90, AHT/ETA, CSAT vừa có dữ liệu. Đổi NV03 OFFLINE nếu cần minh họa thiếu người; đọc forecast tại mốc đã chuẩn bị, không cam kết số staff cố định.

**Nói:** “KPI cho biết tốc độ phản hồi và mức hài lòng. P90 giúp nhìn các lần chờ lâu thay vì chỉ xem trung bình. AHT theo từng khu cập nhật sau DONE để ETA thích nghi. Forecast lấy nhu cầu cùng thứ, cùng giờ trong bốn tuần trước và đề xuất nhân sự với mức sử dụng mục tiêu 80%. Lịch sử hiện là dữ liệu giả lập để chứng minh thuật toán. Đồng hồ ảo chỉ dùng dự báo, không tua nhanh SLA.”

**Tác dụng:** Đo chất lượng và bố trí người trước giờ cao điểm. Không đồng nhất footfall camera với số ticket lịch sử trong forecast hiện tại.

## 04:45–05:00 — Kết thúc (15 giây)

**Nói:** “Demo đã thể hiện thiết bị, MQTT hai chiều, Node-RED xử lý và Dashboard điều khiển. Phần thông minh là queue, điều phối, cảnh báo và thống kê thích nghi. Camera là mở rộng tùy chọn. Nhóm em kết thúc demo và sẵn sàng trả lời câu hỏi.”

**Dừng ở 05:00.** Không mở thêm Telegram, chạy test hoặc đọc 16 slide sau đoạn này trong cùng giới hạn 5 phút.

## Thẻ nhắc khi đứng demo

**20s bài toán → 45s Node-RED → 35s queue → 40s ACK → 40s ARRIVED/DONE/CSAT → 35s camera → 25s alert → 45s analytics → 15s kết = 300s.**

Nếu chậm: giữ Node-RED, ACK/downlink và ARRIVED; rút lời giải thích camera/forecast. Không hứa mọi chức năng đều được thao tác trong 5 phút; [hướng dẫn đầy đủ](HUONG_DAN_DEMO.md) dành cho chuẩn bị và Q&A.

Khi dùng MQTT thay nút Wokwi, chạy từ repository root:

~~~powershell
# Sau ACK B trên Dashboard:
node tools/run_demo.js --arrived B01
# Sau DONE, trong cửa sổ CSAT 15 giây:
node tools/run_demo.js --csat B01
~~~

Hai lệnh mô phỏng uplink, không reset phiên. Khi không có simulator nhận lệnh, chỉ chứng minh MQTT command/trạng thái Dashboard, không tuyên bố LED vật lý đổi màu.
