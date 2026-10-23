# Báo cáo — Máy lấy số / gọi nhân viên hỗ trợ thông minh

HUIT, môn Internet of Things, Đề tài 58. Nhóm: Nguyễn Xuân Nhân (2001230602), Nguyễn Duy Phát (2001230644), Cao Quốc Phú (2001230674). Giảng viên: Võ Hoàng Hải. Đây là nội dung V2; bản gốc V1 giữ tại legacy.

## 1. Giới thiệu

Đề tài tạo hàng đợi yêu cầu hỗ trợ tại cửa hàng và đo thời gian phản hồi. Customer point chỉ cần một nút và LED RGB; phần thông minh nằm ở middleware. Hệ thống dùng context-aware adaptive decision logic, không có mô hình ML.

## 2. Problem statement

Khi nhiều khách gọi cùng lúc, nhân viên khó xác định thứ tự, ticket dễ bị bỏ quên và quản lý chưa có số liệu phản hồi. Mục tiêu là tiếp nhận đúng điểm gọi, ưu tiên minh bạch, phân công theo ngữ cảnh và ghi nhận lúc nhân viên thực sự đến nơi.

## 3. Business context

Cửa hàng điện thoại / điện máy khoảng 200 m², khu A — iPhone, B — Android, C — Phụ kiện, khoảng 3–4 nhân viên. Đây là bối cảnh giả định để thiết kế, không phải cửa hàng đã triển khai. Điện thoại staff và laptop/POS hiện có phục vụ Application/Middleware.

## 4. Requirement

Simulation hoạt động là điều kiện bắt buộc; hardware thật chỉ bonus. Hệ thống cần input, actuator, bốn tầng, uplink/downlink, queue, rules/timer/state/dispatch và Application remote ACK/DONE. Chi tiết tại [REQUIREMENTS](REQUIREMENTS.md) và [ACCEPTANCE_MATRIX](ACCEPTANCE_MATRIX.md).

## 5. Kiến trúc bốn tầng

Physical: ESP32/button/WS2812/OLED/buzzer. Network: Wi-Fi/MQTT. Middleware: Node-RED queue/state/dispatch/analytics/persistence. Application: Dashboard/REST/Telegram. Diagram và sequence tại [ARCHITECTURE](ARCHITECTURE.md).

## 6. Hardware và simulation

Trong simulation, một ESP32 được sử dụng để mô phỏng ba logical customer-point nhằm demo hàng đợi trên một project Wokwi. Khi triển khai thật, mỗi điểm gọi là một ESP32-C3 độc lập. Ba nút A01/B01/C01 đại diện ba điểm gọi. OLED chung phục vụ demo, không bắt buộc tại từng quầy.

Browser project cần sketch.ino, diagram.json, libraries.txt và partitions.csv để LittleFS có partition.

## 7. Firmware

Debounce 50ms; short <800ms gửi CONSULTATION; long ≥1500ms gửi PAYMENT; 800–1499ms là invalid; double ≤400ms hủy ticket waiting. Sau ACK, nút vật lý gửi STAFF_ARRIVED. Cửa sổ CSAT 15s: short hài lòng, long không hài lòng.

LED thể hiện pending/ACK/arrival/escalation/offline/spam. Xử lý input/output bằng millis(); network worker giữ giao diện hoạt động trong lúc reconnect. LittleFS FIFO có giới hạn, giữ event/msg_id và chờ receipt trước khi xóa.

## 8. MQTT

BASE configurable, public HiveMQ port 1883 cho classroom; có fallback broker. Uplink cp/id/event, downlink cp/id/cmd, queue/display/metrics/alert/status. Server validate schema/topic/device/zone, dedup TTL 1 giờ.

PubSubClient outbound QoS 0 được bổ sung receipt và replay; không tuyên bố exactly-once. CMD_APPLIED nhận transient receipt cùng cmd_id, không tạo vòng lặp. Simulation dùng một LWT; node thật dùng LWT riêng.

## 9. Middleware

Module CommonJS được Node-RED gọi qua functionGlobalContext; cùng implementation dùng trong unit test. Flow export có 12 khu ingest/engine/queue/dispatch/SLA/downlink/application/Telegram/analytics/forecast/REST/audit.

Context localfilesystem kết hợp atomic state JSON và backup; audit append-only events.jsonl. Server là source of truth. Payload OLED dùng summary nhỏ thay full ticket/audit, phù hợp buffer firmware. Event mang ticket_id cũ bị context guard reject.

## 10. State machine

PENDING → ACKNOWLEDGED → ARRIVED → RESOLVED. Waiting có thể ESCALATED_L1/L2 hoặc CANCELLED. Escalated vẫn ACK được. DONE chỉ sau ARRIVED; transition sai trả 409 và audit. Sau resolve, device CSAT_WAIT rồi READY.

Primary response = arrived_at − created_at; ACK latency = ack_at − created_at; service = resolved_at − arrived_at. Ticket RESOLVED còn trong lịch sử khi device đã READY.

## 11. Queue

Priority = trọng số 20/50 + 5 × waiting_minutes + 20 × escalation_level, tính lại định kỳ; tie theo ticket cũ. Consultation chờ 7 phút đạt 55, vượt PAYMENT mới 50. Mỗi device tối đa một active ticket, global queue có nhiều ticket.

## 12. Dispatch

StaffScore = 100 × available + 30 × zone_match − 10 × assigned_this_shift. Staff AVAILABLE và không active/reserved mới eligible. Tie theo active count, last assignment và ID.

NV01 An hỗ trợ A/C; NV02 Bình hỗ trợ B; NV03 Chi hỗ trợ A/B/C. No ACK timeout chuyển ứng viên tiếp theo; L1/L2 có alert và downlink đỏ. Dashboard thay staff status để chứng minh dispatch tự động.

## 13. Adaptive analytics

AHT theo zone dùng EWMA α=0.3, initial 120s, chỉ học service của RESOLVED. ETA = ceil(rank/max(1,free_staff)) × zone_AHT. P90 nearest-rank. Overload khi waiting > on-duty × 2.

Forecast cùng thứ/giờ của bốn tuần trước, λ theo ticket/phút, staffing = ceil(λ × AHT_minutes / 0.8). Clock ảo 60× chỉ dùng forecast; SLA và aging dùng thời gian thực. Response SLA KPI mặc định 120s, riêng với assignment/escalation thresholds.

**Dữ liệu này là dữ liệu giả lập để chứng minh thuật toán, không phải dữ liệu thực tế.** Generator seed 58 tạo 28 ngày có peak A 18–20h, B 17–19h, C thấp hơn và weekend khác weekday. Forecast đọc dataset; test thay data làm kết quả thay đổi. KPI live không lấy synthetic history làm response thật.

## 14. Dashboard

Vanilla web không CDN hoặc plugin bắt buộc, Node-RED phục vụ static. Có 9 KPI, global queue, staff controls, devices, alerts, AHT/P90/CSAT, nhu cầu theo khu/giờ và forecast. Poll mỗi giây.

ACK mở với waiting; DONE khóa trước ARRIVED. API mất kết nối báo rõ và khóa thao tác. Dữ liệu server render bằng textContent để tránh XSS. API token tùy chọn giữ trong RAM của phiên trang.

## 15. Telegram

HTTP Bot API trực tiếp, token environment. Token rỗng → DISABLED, Dashboard vẫn hoạt động. Notify assignment/L1/L2/overload/forecast, inline NHẬN/XONG, chat allowlist và ownership. Live cần token/chat ID của nhóm; mock tests chỉ chứng minh logic và quyền.

## 16. Security

Schema validation, bounded payload, dedup/rate/spam, state/context guards, API mutation token tùy chọn, Telegram allowlist, audit không secrets. Public broker demo chưa xác thực thiết bị. Production cần private broker TLS/auth/ACL, HTTPS/RBAC/adminAuth và backup. [SECURITY](SECURITY.md) nêu giới hạn.

## 17. Testing

node:test kiểm tra algorithms/state/recovery/HTTP/Telegram. Tools chạy MQTT thật với broker local và REST; Chrome kiểm tra UI/actions/XSS. Firmware compile PlatformIO, gesture harness và Wokwi lint; browser Wokwi có kết quả riêng.

[TEST_PLAN](TEST_PLAN.md) và [TEST_RESULTS](TEST_RESULTS.md) ghi số test, bằng chứng và hạn chế thực, không suy ra PASS từ code review.

## 18. Results

Kết quả kỹ thuật nằm trong TEST_RESULTS và acceptance matrix, cập nhật sau lần kiểm thử cuối. Không có kết quả kinh doanh thực: chưa triển khai tại cửa hàng, chưa thu CSAT thật. Thời gian demo là event kiểm thử. Mục chưa có token hoặc evidence cần giữ nhãn MANUAL.

Lần nghiệm thu cuối:49/49 unit/runtime/mock tests,5/5 MQTT scenarios, Chrome controls/responsive, firmware compile,14 gesture cases và Wokwi browser E2E đều PASS. Wokwi physical A/B chứng minh global queue/priority; ACK làm riêng B blue; physical ARRIVED đo response9705ms khác ACK549ms; DONE/EWMA/CSAT, C double cancel và A spam/L1/L2 được ghi nhận. Offline/reboot bảo toàn2 requests và replay đúngFIFO/msg_id. Đây là kết quả kỹ thuật của phiên QA, không phải KPI cửa hàng thực. Evidence ghi rõ một QA flag để gây mất mạng/reboot; source bàn giao defaultfalse. Telegram live chưa chạy vì chưa có token.

## 19. Cost

V2 giảm linh kiện mỗi điểm, chuyển ACK/DONE sang điện thoại. Dự toán và giả định giảm khoảng 50–60% tại [BOM](BOM.md); cần kiểm tra lại giá trước báo cáo chính thức. Không khẳng định giá thị trường đã xác minh.

## 20. Limitations

Public broker không bảo đảm riêng tư/availability. JSON persistence chưa phải HA database. FIFO và dedup TTL có giới hạn. ETA đơn giản; forecast chỉ bốn tuần synthetic và một primary zone/staff, chưa bảo đảm chính xác cho cửa hàng thật.

Telegram live cần secrets bên ngoài. ARRIVED dựa thao tác staff, chưa tự động xác minh vị trí. Docker và hardware chỉ được gọi kiểm chứng khi có evidence chạy thực.

## 21. Future development

ESP32-C3 thật, private MQTTS broker, account/RBAC, database/backup, lịch sử thật dài hơn và đánh giá forecast trước khi cân nhắc ML. Camera không cần cho cốt lõi; chỉ là hướng mở rộng riêng, không dependency của đồ án.

## 22. Kết luận

V2 chuyển prototype local thành hệ thống IoT bốn tầng có global queue và MQTT hai chiều, đo response theo ARRIVED, tự quyết định và thích nghi bằng rules/thống kê. Nghiệm thu dựa bằng chứng trong rubric/acceptance matrix; không cam kết điểm tuyệt đối hoặc thay simulation bằng hardware bonus.
