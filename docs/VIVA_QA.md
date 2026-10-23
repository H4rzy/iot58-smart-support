# Viva / Q&A

1. **Smart ở đâu?** Middleware hiểu intent, zone, staff và waiting time; tự dispatch/reassign/escalate, đồng thời thích nghi AHT/ETA/forecast từ dữ liệu. Level 1–3 có rule và số liệu kiểm chứng.
2. **Tại sao không AI?** Dữ liệu ban đầu chưa đủ lớn để huấn luyện mô hình ML đáng tin cậy. Rule engine kết hợp thống kê thích nghi như EWMA phù hợp hơn vì nhẹ, giải thích được và dễ kiểm chứng. Khi có lịch sử dài hơn có thể nâng cấp forecasting bằng machine learning.
3. **Có queue thật không?** Có. Node-RED giữ một global queue cho A01/B01/C01. Thiết bị chỉ cache state và outgoing event, không tự giữ queue phục vụ riêng.
4. **Tại sao một ESP32 mô phỏng ba quầy?** Một project Wokwi giúp demo 2–3 request cùng lúc, giảm overhead simulation.
5. **Thực tế có phải ba ESP32 không?** Có. Mỗi điểm là một ESP32-C3 độc lập, có client ID, LWT và nút riêng.
6. **Tại sao bỏ OLED mỗi quầy?** RGB đủ feedback cơ bản, giảm BOM và nguồn. OLED chung chỉ phục vụ demo; staff xem Dashboard trên điện thoại.
7. **Tại sao ACK không đặt trên customer device?** Khách gửi request; staff nhận việc qua Application để có ownership và audit. Khách không tự xác nhận nhân viên đã nhận việc.
8. **Response time đo thế nào?** arrived_at − created_at, dùng server timestamp. Nhân viên đến vị trí khách và nhấn nút sau ACK.
9. **ACK time khác response time?** ACK là chấp nhận online, staff có thể chưa đến. ACK latency lưu riêng, không thay KPI response thực.
10. **Tại sao ARRIVED?** Tách nhận việc với hỗ trợ thực. DONE bắt buộc ARRIVED để không đóng ticket khi chưa tới.
11. **Priority có làm ticket thường starvation không?** Aging +5/phút; consultation chờ 7 phút đạt 55, vượt payment mới 50. Nếu thiếu capacity liên tục vẫn cần thêm staff.
12. **EWMA là gì?** Trung bình trọng số mũ. AHT mới = 0.3 × service mới + 0.7 × AHT cũ; nhẹ và thích nghi.
13. **Tại sao alpha 0.3?** Cấu hình demo cân bằng phản ứng với ổn định; chưa chứng minh tối ưu trên lịch sử thực.
14. **ETA tính ra sao?** ceil(rank/max(1,free_staff)) × zone_AHT. Free loại trừ staff active/reserved. Đây là ước lượng cập nhật theo dữ liệu.
15. **Không có staff rảnh thì sao?** Queue giữ ticket; timeout/escalation tiếp tục chạy. Mẫu số tối thiểu 1 tránh chia 0, Dashboard hiển thị free staff=0.
16. **Forecast dùng ML không?** Không. Tính λ theo cùng thứ/giờ trong bốn tuần trước, đơn vị ticket/phút; staff cần = ceil(λ × AHT_minutes / 0.8).
17. **Lịch sử ở đâu?** node-red/data/history.json, sinh bằng analytics/seed_history.py, seed 58, có pattern zone/giờ/weekend.
18. **Dữ liệu giả có gian lận không?** Không nếu ghi rõ synthetic, chỉ chứng minh thuật toán và không trộn vào KPI live hoặc gọi là kết quả kinh doanh thật.
19. **Tại sao dùng dữ liệu giả?** Chưa vận hành cửa hàng bốn tuần. Demo cần dataset deterministic có pattern để kiểm chứng forecast thay theo dữ liệu.
20. **MQTT QoS thế nào?** Firmware PubSubClient publish QoS 0; Node-RED dùng QoS 1. FIFO chờ server receipt và dedup msg_id; không tuyên bố exactly-once.
21. **msg_id dùng làm gì?** Định danh event ổn định qua replay; cache TTL 1 giờ ngăn duplicate ticket. msg_id không xác thực thiết bị.
22. **Public broker an toàn không?** Chỉ cho classroom, không PII. Anonymous không đủ bảo mật production; random namespace giảm nhiễu, không thay TLS/auth.
23. **Production bảo mật ra sao?** Private broker MQTTS, TLS verify, credentials riêng mỗi node, ACL, HTTPS/RBAC, secret rotation, firewall, audit và backup.
24. **Mất Wi-Fi request có mất không?** LittleFS FIFO có giới hạn, giữ msg_id, replay FIFO và chờ receipt. Nếu đầy hoặc flash lỗi, feedback/log báo rõ; không có dung lượng vô hạn.
25. **Node-RED chết thì sao?** State/context persist, atomic JSON và backup hỗ trợ recovery; device giữ event chưa receipt. Chưa phải HA cluster.
26. **Tại sao MQTT thay HTTP từ ESP?** Publish/subscribe nhẹ, downlink tự nhiên, LWT và tách device/server. REST phù hợp điều khiển từ Application.
27. **REST dùng ở đâu?** Dashboard GET state/metrics/forecast và POST ACK/DONE/staff/reset/clock, đáp ứng CLO integration.
28. **Bốn tầng ở đâu?** Physical button/LED/ESP32; Network Wi-Fi/MQTT; Middleware Node-RED; Application web/Telegram.
29. **Downlink ở đâu?** Dashboard ACK → Node-RED → BASE/cp/B01/cmd → ESP32 → LED B blue. CMD_APPLIED có audit/receipt cùng cmd_id.
30. **Application ở đâu?** Node-RED-hosted vanilla HTML/CSS/JS tại /, REST API và Telegram optional; không cần Dashboard plugin.
31. **Hardware thật bắt buộc không?** Không. Simulation bắt buộc cho baseline; C3 thật bonus +5.
32. **Camera đâu?** Lõi đề tài là queue và response-time, không cần camera. Camera là cảm biến có mặt tùy chọn (R18): chỉ gửi số người theo khu, middleware dùng để tự hủy ticket khi khách bỏ đi và gắn cờ xác minh. Demo hiện tại dùng webcam laptop; chưa có camera ESP32-S3 thật (xem câu 38–45).
33. **P90 là gì?** Nearest-rank percentile 90 của response created→arrived. Không mẫu thì N/A, không tạo giá trị 0 giả.
34. **Forecast clock có phá SLA không?** Không. SLA dùng real elapsed, virtual clock chỉ dùng forecast; unit/integration tests kiểm tra riêng.
35. **Nếu DONE sai thì sao?** Server reject 409 và audit; UI disable trước ARRIVED, nhưng server vẫn kiểm tra khi bỏ qua UI.
36. **Tại sao cần partitions.csv?** Wokwi browser mặc định có thể không có partition LittleFS. Upload file partition cùng source để FIFO persistent hoạt động.
37. **Offline event cũ có làm sai ticket mới không?** Event mang ticket_id cũ bị context guard reject; event replay giữ msg_id và dedup.
38. **Vì sao không dùng ảnh?** Ảnh chứa thông tin cá nhân không cần thiết. Hệ thống chỉ cần biết có bao nhiêu người ở khu nào. Payload chỉ có số nguyên, publisher không ghi và không gửi khung hình.
39. **Camera hỏng thì sao?** Sau `VISION_STALE_SECONDS` (10 giây) khu đó chuyển sang offline. API vision trả `persons: null`, không trả 0. Dashboard sẽ hiển thị "không có tín hiệu" khi thẻ Camera được hoàn thiện. Mọi luật camera dừng: không hủy ticket, `presence_verified` và `arrival_verified` thành `null`. Nút bấm chạy như trước.
40. **Độ chính xác đếm người bao nhiêu?** Chưa đo. Detector MediaPipe EfficientDet-Lite0 chạy CPU, có ngưỡng điểm 0.5, có thể sai khi người bị che hoặc ngược sáng. Nếu nhóm có thời gian, đo trên webcam với số người đã biết trước khi báo cáo con số.
41. **Khác gì AI?** Không gọi là AI. Hệ thống dùng một mô hình nhận diện người có sẵn để đếm số người trong khung, rồi áp dụng luật cố định (ngưỡng giây, số người ≥2). Không huấn luyện mô hình, không học từ dữ liệu của khách, không ra quyết định mờ.
42. **Riêng tư thế nào?** Camera chỉ gửi số người theo khu. Không nhận diện khuôn mặt, không lưu ảnh, không gắn số người với khách cụ thể. Triển khai thật cần biển báo cho khách. Chưa đặt biển trong đồ án.
43. **Vì sao webcam laptop mà không phải ESP32-S3?** Chưa có phần cứng và firmware camera trong phạm vi đồ án. Webcam laptop cùng contract MQTT để chứng minh middleware. Đây là phương án thay thế, không phải kết quả trên ESP32-S3.
44. **Chi phí camera?** Camera là tùy chọn, không nằm trong BOM cơ bản. Ước tính ESP32-S3 cho mỗi khu hoặc cho cả cửa hàng nằm trong [BOM](BOM.md), phải kiểm tra lại giá trước báo cáo.
45. **Kẻ xấu giả camera thì sao?** Topic vision trên public broker không có xác thực, nên có thể bị giả mạo. Đây là rủi ro đã ghi trong [SECURITY](SECURITY.md). Production cần ACL theo khu và broker có xác thực.
