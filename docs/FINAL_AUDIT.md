# Audit tích hợp cuối — Agent 8

Audit đọc độc lập implementation sau khi các subsystem đã tích hợp. Role 8 được giao cho agent Application vì giới hạn thread của môi trường; các kiểm tra dưới đây tách với quá trình thiết kế giao diện.

## Phạm vi

Đọc firmware, diagram, libraries, MQTT contract; core engine, validation, priority, dispatch, runtime, Telegram; analytics, forecast; settings/flows/package; REST và Dashboard; Docker và gitignore. Không dùng trạng thái giả lập của Dashboard làm evidence Wokwi.

## Findings và xử lý

| Finding | Mức ảnh hưởng | Kết quả |
|---|---|---|
| Display MQTT gửi full ticket/audit có thể vượt firmware buffer 768 byte | Cao: OLED bỏ downlink | Lead và core đã sửa compact top/device summary; audit đo payload 236 byte; regression có audit lớn PASS |
| Dashboard lấy cuối mảng alerts newest-first, hiển thị cảnh báo cũ | Vừa: thông tin vận hành sai thứ tự | Sửa sort timestamp giảm dần rồi lấy 10 đầu; browser regression 12 alerts kiểm tra loại hai oldest PASS |
| Replay ARRIVED/CANCEL/CSAT mang ticket_id cũ có thể tác động ticket mới | Cao: sai lifecycle/KPI | Core đã thêm context guard; độc lập reproduce old ACK→reset→new ACK→old ARRIVED trả 409, ticket mới giữ ACKNOWLEDGED; unit regression PASS |
| CMD_APPLIED FIFO cần receipt nhưng không tạo command loop | Cao: kẹt FIFO hoặc vòng lặp | Cùng cmd_id, transient receipt, không reset flag; core test PASS, firmware ignore cmd_id đã áp dụng |
| Browser ACK state có thể cập nhật trước khi Node-RED MQTT flush | Race trong test | Script browser chờ command thật với timeout 3s; rerun controls PASS, không bỏ kiểm tra downlink |
| Telegram callback có thể đổi engine rồi flush MQTT trong cửa sổ throttle persistence 500ms | Cao: thiết bị thấy ACK chưa được lưu bền | Lead sửa Runtime.flush để persist dirty state trước drain/publish; thêm regression callback-style ACK durability, chờ batch test cuối xác nhận tổng số |

Fallback SLA của analytics khi gọi không config đã được Lead thống nhất 120s với runtime và tài liệu. Forecast VirtualClock helper và clock runtime là hai biểu diễn; audit sử dụng behavior runtime thật và test engine, không suy kết quả từ helper.

## Kiểm tra thực sự chạy

- `npm test` tại node-red: **47/47 PASS**, không skip/fail ở lần audit cuối ngày 2026-10-10. Bao gồm công thức, lifecycle, schema, duplicate, dispatch, timeout/escalation, CSAT/spam, forecast đổi theo dataset, persistence recovery, REST, Telegram mock permissions và reserved msg_id protection.
- `node tools/browser_smoke_test.js controls`: PASS real local MQTT + REST + browser UI. Queue PAYMENT trước CONSULTATION; staff AVAILABLE trigger dispatch; ACK downlink thật; DONE disabled trước ARRIVED và enabled sau MQTT arrival; DONE/CSAT; clock 60×/pause; mode toggle; confirmed reset READY; không JS fatal.
- `node tools/browser_smoke_test.js static`: PASS Node-RED state thật, desktop 1366×768 và mobile 390×844, 9 KPI/3 staff/3 devices/3 forecast, không page overflow, offline API khóa thao tác, XSS và latest-alert ordering.
- Pure engine reproduce stale ticket context: 409, state ACKNOWLEDGED giữ nguyên.
- Compact OLED payload đo độc lập: 236 byte < 768.

Browser controls dùng MQTT publisher để mô phỏng STAFF_ARRIVED, không thay bằng chứng nhấn nút Wokwi. XSS / alert-order fixtures chỉ dùng kiểm thử bảo vệ, không tạo screenshot vận hành.

## Tính nhất quán

BASE firmware và Node-RED mặc định cùng `huit/iot58/n20-smart-support/store/s1`. A01/B01/C01 và zone A/B/C khớp registry và wiring. Sau kiểm thử browser, Lead chốt ba NeoPixel simulation nối chuỗi GPIO25 với index A/B/C=0/1/2 để tránh lỗi nhiều RMT controllers cùng màu; buttons18/19/23, OLED21/22, buzzer13 giữ nguyên. State/gesture names khớp; ARRIVED chỉ uplink physical/scenario publisher, ACK/DONE qua Application. Response created→arrived, EWMA từ resolved service, clock ảo tách SLA thực. Lịch sử được label giả lập và chỉ dùng forecast.

## Giới hạn bằng chứng

Kết quả Wokwi browser, local compile và gesture harness do embedded agent ghi riêng tại TEST_RESULTS/evidence. Agent 8 không gọi local MQTT test là bằng chứng LED Wokwi. Telegram không có token thật nên live delivery vẫn cần cấu hình và kiểm chứng. Hardware C3 thật optional; Docker chỉ được coi PASS nếu có daemon/evidence thực.

Quyết định nghiệm thu tổng thể theo [ACCEPTANCE_MATRIX](ACCEPTANCE_MATRIX.md) và [TEST_RESULTS](TEST_RESULTS.md) do Lead cập nhật sau các kiểm tra cuối. Audit này không bảo đảm điểm rubric hoặc xác nhận các môi trường chưa chạy.

## Lead verification sau audit

Lead chạy lại toàn bộ `npm test`: **49/49 PASS**, 0 fail / 0 skip; log thật tại [unit-tests.txt](../evidence/unit-tests.txt). Regression bổ sung xác minh callback ACK được lưu bền trước khi flush downlink; DONE staff_id sai kiểu trả 400. Pure metrics fallback đã thống nhất response SLA 120s.

Năm scenario MQTT đã chạy lại với runtime local cô lập port1881, broker Aedes port1883, state riêng; tất cả PASS và log tại [mqtt-scenarios.txt](../evidence/mqtt-scenarios.txt). Runtime public1880 không bị reset bởi batch này.

Static repository audit xác minh đủ deliverable, 12 flow tabs/không cạnh lỗi, MQTT namespace và button/pixel wiring, không delay blocking/ACK-DONE physical, không token trong deliverable và không broken local link: [repository-audit.json](../evidence/repository-audit.json).

Kiểm tra Wokwi tìm thêm command flood do countdown mỗi giây. Lead bỏ các giá trị countdown khỏi signature điều khiển; snapshot vẫn chứa thời gian còn lại khi state đổi hoặc forced sync. Regression xác minh không phát lại cmd_id, reconnect nhận timer mới và hết hạn trả READY. Tổng cuối49/49 PASS; 5 scenarios và Chrome controls chạy lại PASS sau sửa.

Embedded hoàn tất browser Wokwi thật: A CONSULTATION/B PAYMENT và B>A, NV02 dispatch, ACK độc lậpBLUE B, physical ARRIVED, guard409 trước arrival, DONE/EWMA/CSAT, C physical double cancel, A physical spam và L1/L2. Offline actual Wi-Fi/MQTT disconnect rồi physical A/B, LittleFS flush/reboot phục hồi5 events gồm control, server đúng2 tickets FIFO cùng msg_id. Lead đọc JSON/serial/state, xem ảnh thật và tự tính hashes: source test chỉ khác flag diagnostics false→true; firmware giao defaultfalse đã compile. Bằng chứng tại [evidence](../evidence/README.md). Runtime public đã reset sạch, giữ history. Không còn mục STATIC bắt buộc trong acceptance; Telegram live conditional vẫn MANUAL vì chưa có token.
