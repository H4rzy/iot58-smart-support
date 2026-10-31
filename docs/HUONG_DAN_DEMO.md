# Chạy demo, thao tác và lời thuyết trình

**Kịch bản đứng thuyết trình mới nhất chỉ 5 phút, đã có Node-RED:** [DEMO_SCRIPT_FINAL.md](DEMO_SCRIPT_FINAL.md). Dùng [QUICK_DEMO](QUICK_DEMO.md) làm thẻ nhắc. File này để chuẩn bị/tra cứu và Q&A, không đọc nối tiếp toàn bộ trong 5 phút.

Tên đề tài: **Máy lấy số / gọi nhân viên hỗ trợ thông minh**. Mục tiêu: tạo hàng đợi yêu cầu hỗ trợ trong cửa hàng và đo thời gian nhân viên thực sự đến phục vụ. A=iPhone, B=Android, C=Phụ kiện.

## 1. Mở demo ngay trên máy

Từ PowerShell tại thư mục repository:

```powershell
# Nếu chưa cài dependencies:
npm --prefix node-red ci
npm --prefix tools ci

# Mở Dashboard với hai yêu cầu mẫu A/B, tất cả staff BUSY:
powershell -ExecutionPolicy Bypass -File tools/start_demo.ps1

# Hoặc chạy diễn tập tự động bằng Chrome nhìn thấy được:
powershell -ExecutionPolicy Bypass -File tools/start_demo.ps1 -Auto
```

Chạy một trong hai lệnh demo, không chạy cả hai cùng lúc. Launcher dùng Node-RED đang có hoặc mở server nền, chờ MQTT kết nối rồi mở `http://localhost:1880/`. Đọc cấu hình broker/topic từ `node-red/.env`, không in token. Nếu chưa có `.env`, copy `node-red/.env.example` thành `.env` rồi chỉnh cấu hình phù hợp. Chạy Node.js22.9+ và Chrome; dependencies cần cài trước. Log khởi động server mới ở `demo-node-red.log` và `demo-node-red-error.log`.

Đã chạy thực ngày 31/10/2026: auto rehearsal PASS; launcher PowerShell exit0 và mở Dashboard; manual ARRIVED/CSAT helpers qua MQTT thật PASS. [Kết quả lượt tự động](../evidence/live-demo-results.json). Camera vật lý vẫn cần bạn cấp quyền, không được auto runner tự kiểm chứng.

**Hai chế độ này reset phiên demo để có trạng thái xác định và dùng MQTT publisher mô phỏng thao tác thiết bị.** REQUEST, ARRIVED, CSAT và số người của runner không phải thao tác vật lý/camera thật. Broker, API, dispatch và Dashboard là thật. Dừng Wokwi hoặc publisher vision khác trước khi chạy tự động để tránh hai nguồn cùng điều khiển một điểm.

Diễn tập tự động trình diễn queue → UI ACK → MQTT command → ARRIVED publisher → UI DONE → CSAT → cancel → L2 → forecast. Không tự bật webcam. Cuối lượt giữ KPI hoàn tất, tạo lại A/B đang chờ và mở Dashboard thường để bạn thao tác. JSON kết quả thật lưu `evidence/live-demo-results.json`. Camera count của runner chỉ gửi khi cần, sau10s không có heartbeat sẽ stale/fail-open. Không để lại publisher nền.

Nếu chỉ cần mở app mà không reset hoặc tạo event mẫu:

```powershell
Set-Location node-red
npm start
```

Mở Dashboard `http://localhost:1880/`, editor `http://localhost:1880/red/`. Có Node-RED đang chạy thì không mở thêm instance trên cùng port.

## 2. Chuẩn bị demo bằng nút Wokwi thật

### Thử tiếp ngay trên Dashboard khi chưa mở Wokwi

Launcher đã tạo A/B và đặt nhân viên BUSY. Mở Nhân sự, đổi NV02 Bình thành AVAILABLE, quay về ticket B, chọn NV02 và bấm ACK. Nếu B đã escalated trong lúc chờ, ACK vẫn hợp lệ. Chưa ARRIVED thì DONE vẫn khóa đúng thiết kế.

Từ terminal tại repository root, mô phỏng nút xác nhận đến nơi mà không reset phiên:

```powershell
node tools/run_demo.js --arrived B01
```

DONE mở trên Dashboard; bấm DONE rồi trong 15 giây chạy:

```powershell
node tools/run_demo.js --csat B01
```

Hai lệnh trên là event MQTT mô phỏng, không được trình bày là nút Wokwi thật. Để demo phần cứng simulation, làm các bước dưới và thay hai lệnh bằng nhấn nút B. Với webcam, có thể chọn ticket còn trong phiên bất kỳ lúc nào, Bật webcam → Cho phép → Chụp; không cần ARRIVED trước để chụp.

1. Mở [Wokwi ESP32](https://wokwi.com/projects/new/esp32), chép đủ `wokwi-demo/sketch.ino`, `diagram.json`, `libraries.txt`, `partitions.csv`. Xem [hướng dẫn Wokwi](../wokwi-demo/README.md).
2. MQTT host/port và BASE trong sketch phải trùng `.env` middleware. Cấu hình máy lúc viết hướng dẫn dùng `broker.emqx.io:1883`; kiểm tra cấu hình thực trước demo. Không dùng localhost broker cho Wokwi cloud.
3. Bấm Play, chờ Serial `MQTT_ONLINE`, OLED ONLINE, Dashboard API/MQTT ONLINE. Bấm RESET DEMO, xác nhận reset KPI, chờ LED/OLED cập nhật READY và buffer ổn định.
4. Trong mạch hiện tại có3 thanh trượt CAM A/B/C ởGPIO34/35/32. Đây là **số người giả lập0–4**, không phải camera thu hình. Đặt A=1, B=1, C=1 cho lượt demo chính. Nếu để0 và heartbeat vẫn chạy, middleware có thể tự hủy ticket sau ngưỡng abandon.
5. Đặt cả3 staff BUSY. Chuẩn bị hai cửa sổ Wokwi và Dashboard; không chạy auto runner đồng thời với nút Wokwi.
6. Thời gian gesture dùng millis simulation: short<800ms, long≥1500ms, double hai short trong≤400ms; vùng800–1499ms không hợp lệ. Nếu Wokwi chạy50% tốc độ, thử short khoảng0.6s và long khoảng4.5s ngoài đời; nhìn tốc độ simulation và luyện trước. Chờ LED nhận trạng thái mới trước khi ARRIVED/CSAT/cancel.

## 3. Tra cứu thao tác và lời giải thích chi tiết

Nội dung dưới đây để luyện tập hoặc trả lời Q&A. Lượt trình bày chính dùng lịch 300 giây tại [DEMO_SCRIPT_FINAL](DEMO_SCRIPT_FINAL.md), không chạy thêm một kịch bản 7–9 phút.

### Mở đầu — 30 giây

**Nói:** “Ở cửa hàng, nhiều khách cùng cần tư vấn nhưng không biết gọi ai, nhân viên có thể bỏ sót yêu cầu. Nhóm em dùng nút gọi đơn giản tại từng khu. Server quản lý chung, ưu tiên và tự điều phối nhân viên; đo phản hồi khi nhân viên thực sự tới nơi.”

Chỉ3 khu A/B/C, sơ đồ4 tầng: nút/LED → Wi-Fi/MQTT → Node-RED → Dashboard/Telegram. Một ESP32 mô phỏng3 điểm để tiện demo; ngoài thực tế mỗi điểm dùng một ESP32-C3 riêng.

### Bước1 — Tạo queue và so ưu tiên

**Thao tác:** Staff đều BUSY. Nhấn ngắnA, giữ lâuB rồi thả. Nếu dùng launcher prepare, hai ticket mẫu đã có nên không nhấn lại.

**Quan sát:** A CONSULTATION khoảng20 điểm, B PAYMENT khoảng50; B rank1, có ít nhất2 ticket trong global queue. LED vàng, OLED hiển thị queue/top/ETA.

**Nói:** “Hai quầy dùng chung một queue. Thanh toán được ưu tiên, nhưng consultation chờ lâu tăng5 điểm mỗi phút. Sau7 phút consultation đạt55, vượt payment mới50, nên yêu cầu thường không bị chờ mãi.”

**Tác dụng:** Tránh chọn theo cảm tính; xử lý nhu cầu gấp và chống starvation. Clock ảo không tua nhanh aging; trình bày ví dụ bằng số, không chờ7 phút.

### Bước2 — Tự phân công và ACK từ xa

**Thao tác:** Đổi NV02 Bình từ BUSY sang AVAILABLE, quan sát assignmentB. Chọn NV02 ở dropdown ticketB nếu cần, bấm ACK sớm trong8s. Nếu ticket đã escalated, vẫn chọn staff khả dụng và ACK được.

**Quan sát:** NV02 được giao khuB; ticket ACKNOWLEDGED; command MQTT xuống B, LEDB xanh dương. DONE còn khóa.

**Nói:** “Server chọn người theo độ sẵn sàng, khu vực và số lượt đã nhận. ACK là nhận việc, chưa phải đã đến. Đổi trạng thái trên ứng dụng đi xuống MQTT làm LED đổi màu, chứng minh downlink.”

**Tác dụng:** Giảm điều phối thủ công và phân bổ công việc; khách biết yêu cầu đã có người nhận. Không có ACK/DONE vật lý trên nút khách hàng.

### Bước3 — Xác nhận đến nơi, hoàn tất và đo thời gian

**Thao tác:** Đặt CAM B=2 nếu đang demo presence. Nhân viên đến quầy và nhấn nútB. Chờ ARRIVED/cyan. Bấm DONE trên Dashboard sau vài giây phục vụ. Trong15s CSAT, nhấn ngắnB để SATISFIED; giữ lâu để UNSATISFIED.

**Quan sát:** Response time=ARRIVED−created; ACK latency riêng. DONE chỉ mở sau ARRIVED. DONE→RESOLVED/green, AHT thay đổi; CSAT xong hoặc timeout thì READY.

**Nói:** “Khác với đo thời điểm nhận việc, nhóm đo lúc nhân viên thực sự đến. DONE sau ARRIVED giúp không khai hoàn tất khi chưa phục vụ. Service time cập nhật EWMA theo từng khu:0.3 lần mới+0.7 AHT cũ, giúp ETA thích nghi. CSAT bổ sung góc nhìn khách hàng.”

**Tác dụng:** KPI phản ánh đúng quy trình hơn; ETA có dữ liệu cập nhật; thiết bị tự rời cửa sổ đánh giá, không bị giữ mãi. Camera thấy2 người chỉ là tín hiệu bổ trợ, không chứng minh danh tính hay tự thay thao tác ARRIVED.

### Bước4 — Webcam laptop chụp ảnh kèm ticket

**Thao tác:** Kéo tới **Ảnh khu vực gắn với ticket**. Chọn ticketA hoặcB, bấm **Bật webcam**, chọn Allow/Cho phép. Hướng webcam vào vật mẫu hoặc người đồng ý; bấm **Chụp ảnh cho ticket**. Xem ảnh và nhãn ticket/thời gian, thử tải hoặc xóa. Bấm **Tắt** sau demo.

**Nói:** “Camera mở rộng giúp nhân viên xem ngữ cảnh của yêu cầu. Đây là webcam laptop bên ngoài Wokwi. Ảnh chỉ được lưu khi em bấm chụp, chỉ trên trình duyệt này; chưa gửi server hoặc chia sẻ cho nhân viên ở máy khác.”

**Tác dụng:** Chứng minh UI camera thực và gắn ảnh với ticket, minh họa hỗ trợ xác định khu vực. Camera này không tự đếm người, không gửi vision reading, không tự tạo ACK/ARRIVED.

**Lưu ý:** Webcam cầnlocalhost hoặcHTTPS. Nếu camera bị từ chối, cho phép lại tại biểu tượng quyền của trình duyệt. Nếu Python vision publisher đang chiếm camera, dừng publisher trước. Camera không có thì trình bày graceful failure, không gọi ảnh mẫu là camera thật. Kho ảnh tối đa20, mỗi ticket ảnh mới nhất; reset demo không xóa ảnh, dùng **Xóa toàn bộ ảnh đã lưu** sau buổi trình bày.

### Bước5 — Hủy và không bỏ quên khách

**Thao tác:** CAM C=1; Cshort tạo ticket rồi đợi LEDpending. Double-clickC để hủy. Giữ A đang chờ khôngACK để quan sát L1/L2. Nếu A đã escalated trong lúc thuyết trình, chỉ vào alert/state đang có.

**Quan sát:** CCANCELLED, purple tạm thời rồiREADY; không updateAHT từ cancel. Ared slow/fast theoL1/L2; Dashboard alert, Telegram nếu đã cấu hình.

**Nói:** “Khách đổi ý có thể hủy. Yêu cầu bị bỏ quên tự nâng cấp cảnh báo, không phụ thuộc quản lý ngồi nhìn Dashboard. Demo rút ngắn15/25s; production60/90s.”

### Bước6 — KPI, ETA và forecast

**Thao tác:** Mở Phân tích. Chỉ Avg response/P90/SLA/CSAT/AHT. ĐặtNV03 OFFLINE; set clock **09/10/2026 17:45**, speed60× rồi Pause. Đọc recommendation thực tế, không hứa số staff cố định nếu AHT phiên vừa thay đổi.

**Nói:** “P90 là ngưỡng mà90% response samples nằm dưới hoặc bằng theo nearest-rank. Forecast đếm ticket cùng thứ/giờ của4 tuần trước. Số người cần=ceil(lambda×AHT_minutes/0.8), mục tiêu sử dụng tối đa80%. Dữ liệu này giả lập có chủ đích, không phải dữ liệu cửa hàng thật.”

**Tác dụng:** Quản lý thấy chất lượng phục vụ và chủ động bổ sung người trước giờ cao điểm. Clock60× giúp demo forecast, không thay SLA real-time. Mốc09/10 khớp history được seed; ngày hệ thống31/10 không tự đảm bảo có4 tuần dữ liệu phù hợp. Không đồng nhất footfall camera với số ticket trong forecast hiện tại.

### Kết — 20 giây

**Nói:** “Thiết bị gọi đơn giản, phần thông minh nằm ở middleware: queue, ưu tiên, điều phối và thống kê thích nghi. Demo chứng minh đủ uplink, downlink và ứng dụng. Camera là mở rộng tùy chọn; tắt camera vẫn gọi hỗ trợ được.”

## 4. Demo mở rộng — chọn theo thời gian

| Chức năng | Thao tác | Kết quả và tác dụng |
|---|---|---|
| Reassignment | RESET; NV01/NV03 AVAILABLE, NV02 OFFLINE; CAM A=1, A short; không ACK | NV01→NV03 sau 8s demo; tránh để một người không phản hồi giữ yêu cầu mãi. L1/L2 nếu tiếp tục không nhận. |
| Overload | Có ticket waiting; đổi cả 3 staff OFFLINE | Waiting > on-duty × 2 gây cảnh báo; giúp quản lý biết cần thêm người. BUSY vẫn on-duty nên chỉ BUSY chưa chắc overload. |
| Spam lock | A có ticket; nhấn lặp không hợp lệ ≥5 lần trong 10s, tránh double cancel | Lock 30s và cảnh báo, không tạo thêm ticket. REQUEST/CANCEL/ARRIVED/CSAT hợp lệ không bị coi spam. Dùng RESET để lặp lại ngay. |
| Khách bỏ đi | CAM A=1, A short; sau đó kéo CAM A=0 và giữ heartbeat | Sau 10s demo khu trống, waiting ticket tự CANCELLED/ABANDONED_VISION, tránh queue ảo. Không áp dụng cho ARRIVED; production 60s. |
| REQUEST không thấy người | CAM B=0, B short | Flag chưa xác minh để nhân viên kiểm tra; không phải bằng chứng khách gian lận, vì reading có thể sai. |
| ARRIVED thiếu ngữ cảnh | ACK B; CAM B=1; nhấn B | ARRIVED được ghi, arrival_verified=false và cảnh báo; CAM B=2 hỗ trợ verified=true. Count không nhận diện ai là staff. |
| Chủ động hỗ trợ | CAM C≥1, không tạo ticket C, giữ 20s demo | PROACTIVE_ASSIST cảnh báo người đứng lâu chưa gọi. Tránh bỏ quên người chưa bấm nút; production 180s. |
| Vision mất tín hiệu | Dừng nguồn publisher vision/Wokwi, chờ >10s; tạo REQUEST bằng MQTT tool nếu cần | Camera offline, persons=null chứ không phải 0; fail-open giữ luồng nút, không tự hủy chỉ vì mất camera. Webcam Dashboard bật/tắt không tác động heartbeat vision. |
| Footfall | Kéo CAM 0→1→2→1→2 | Tổng lượt tăng khi count tăng; đây là ước lượng theo biến động số người, chưa unique visitor tracking. Không tuyên bố nhận diện khách quay lại. |
| Duplicate | Chạy duplicate_demo riêng như mục 5 | Cùng msg_id phát 5 lần chỉ 1 ticket; chống replay tạo queue trùng. Không chạy cùng Wokwi. |
| Offline/buffer | Bật riêng QA flag diagnostics, Serial O tắt mạng, nhấn A/B, Serial R flush/reboot | LittleFS giữ FIFO/msg_id và replay; không dùng Stop/Play để hứa giữ flash. Firmware giao mặc định diagnostics=false; xem Wokwi README. |
| Telegram | Thêm token/chat allowlist trong .env, restart, dùng inline NHẬN/XONG | Điều khiển từ điện thoại, L1 group/L2 manager; token rỗng DISABLED không ảnh hưởng Dashboard. Chỉ claim live nếu đã thử với token thật. |
| RESET | Dashboard Reset, chọn reset KPI hoặc giữ KPI | Dọn active queue/assignment/locks, phát READY, giữ synthetic history. Không xóa ảnh IndexedDB. |

## 5. Lệnh kiểm chứng độc lập

Các scenario reset phiên, không chạy cùng người đang demo. Ví dụ broker đúng cấu hình máy hiện tại:

```powershell
$env:MQTT_HOST = 'broker.emqx.io'
$env:MQTT_PORT = '1883'
$env:API_URL = 'http://localhost:1880'
node tools/mqtt_scenario_test.js priority_demo
node tools/mqtt_scenario_test.js escalation_demo
node tools/mqtt_scenario_test.js duplicate_demo
node tools/mqtt_scenario_test.js spam_demo
node tools/mqtt_scenario_test.js abnormal_demo
node tools/mqtt_scenario_test.js vision
```

Nếu namespace đổi, đặt MQTT_BASE_TOPIC cùng giá trị. Các tool test cũ không hỗ trợ API_TOKEN; dùng run_demo.js đọc .env hoặc test trên môi trường local được phép. Để kiểm thử webcam không cần camera thật: `node tools/webcam_smoke_test.js`; kết quả fake camera được ghi rõ.

## 6. Khi demo gặp lỗi

| Hiện tượng | Xử lý |
|---|---|
| Dashboard không lên | Chạy npm start trong node-red; kiểm tra health tại port 1880, không mở hai server cùng port. |
| MQTT offline | Chờ kết nối; kiểm tra Internet/host/port. Đổi broker ở cả .env và firmware, restart. |
| Ticket tự hủy | Kiểm tra thanh trượt CAM đang 0 và heartbeat; đặt khu đang có khách thành 1. |
| ACK bị 409 | Chọn staff AVAILABLE không bận/reserved; xác minh ticket còn waiting/escalated. |
| DONE không bấm được | ACK chưa đủ; phải nhấn nút quầy để ARRIVED trước. |
| Webcam không lên | Dùng localhost/HTTPS, Allow camera, đóng ứng dụng khác đang chiếm camera; queue vẫn chạy khi tắt. |
| Không thấy ảnh ở máy khác | Đúng giới hạn bản hiện tại: IndexedDB cục bộ, chưa upload server. |
| Forecast không có đỉnh | Đặt mốc 09/10/2026 17:45 để khớp history demo; xem AHT hiện tại, không hardcode số staff. |

## 7. Phân biệt bằng chứng khi báo cáo

- Auto runner: MQTT publisher mô phỏng thiết bị/counts; UI/API/broker/algorithms thật. Không claim nút/LED Wokwi thật từ runner.
- Wokwi: nút/LED/OLED thật trong simulator; thanh trượt CAM giả lập số người, không camera ảnh.
- Webcam Dashboard: ảnh trực tiếp từ webcam khi bạn cấp quyền; chỉ lưu cục bộ khi bấm chụp, không đếm người.
- Vision Python: webcam + detector model đếm person, chỉ publish counts; cần model/dependencies và test thật trước khi claim độ chính xác.
- Xem logs/ảnh đã kiểm chứng tại [evidence](../evidence/README.md); live Telegram/token và hardware node thật là điều kiện riêng.
