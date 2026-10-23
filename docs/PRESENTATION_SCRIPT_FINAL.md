# Lời thuyết trình V2

Thời lượng nội dung khoảng 5–7 phút, chưa tính demo riêng nếu lớp yêu cầu. Người nói cần hiểu thao tác; phân công theo ba thành viên trong [TEN_WEEK_PLAN](TEN_WEEK_PLAN.md).

1. “Nhóm trình bày Máy lấy số / gọi nhân viên hỗ trợ thông minh. Mục tiêu là tạo hàng đợi hỗ trợ và đo thời gian nhân viên đến khách.”
2. “Tại cửa hàng điện thoại khoảng 200 m², khách ở A/B/C có thể gọi cùng lúc. Cần biết ai đang chờ, ai được ưu tiên và ticket nào bị bỏ quên.”
3. “V1 chứng minh nút và actuator nhưng còn local, dùng ACK/DONE vật lý và đo ACK thay arrival. V2 khắc phục bằng middleware server.”
4. “Mỗi điểm thực chỉ cần C3, một nút và RGB. Quyết định dùng chung ở Node-RED giúp dễ nhân rộng.”
5. “Bốn tầng là ESP32 và thiết bị vật lý, Wi-Fi/MQTT, Node-RED queue/state/analytics, rồi web/Telegram.”
6. “Một ESP32 simulation mô phỏng ba logical point; thực tế là ba node riêng. Short gọi tư vấn, long gọi thanh toán, double hủy ticket chờ. Sau ACK, staff nhấn nút tại điểm gọi để xác nhận đã đến.”
7. “Uplink từ nút qua MQTT lên queue. ACK trên Dashboard tạo downlink làm LED blue. Hệ thống có điều khiển hai chiều.”
8. “Payment 50 ưu tiên hơn consultation 20. Aging +5/phút giúp consultation chờ 7 phút đạt 55, vượt payment mới và giảm starvation.”
9. “Engine chọn staff AVAILABLE, xét zone và lượt đã nhận. Không ACK thì thử staff tiếp theo rồi L1/L2. Demo dùng 8/15/25s, normal dùng 30/60/90s.”
10. “ACK chưa phải đã đến. ARRIVED tạo response thực; DONE chỉ sau ARRIVED. Service time đo từ đến nơi tới giải quyết, sau đó lấy CSAT.”
11. “AHT cập nhật bằng EWMA alpha 0.3. ETA phụ thuộc rank, staff rảnh và AHT theo zone; P90 dùng response thực, không dùng ACK latency.”
12. “Forecast đọc bốn tuần dữ liệu giả lập được ghi rõ. Cùng thứ/giờ cho λ, staffing hướng tới utilization 80%. Clock ảo không thay SLA thực.”
13. “Dashboard có queue, staff, KPI, forecast và REST. Telegram optional, không token thì disabled. DONE sai bị server reject 409 ngay cả khi bỏ qua UI.”
14. Thực hiện [QUICK_DEMO](QUICK_DEMO.md). Dừng đúng frame ACK blue, physical ARRIVED và EWMA để người xem thấy bằng chứng.
15. “Kết quả đã chạy được ghi trong TEST_RESULTS; Wokwi và Telegram có trạng thái kiểm chứng riêng. Rubric mapping chỉ nơi có bằng chứng, không cam kết điểm tuyệt đối.”
16. “Smart đến từ ngữ cảnh, rules và thống kê thích nghi. Chưa đủ real data để ML đáng tin; hướng tiếp là C3 thật, TLS, RBAC và lịch sử thật. Nhóm sẵn sàng giải thích request→response.”

Q&A tại [VIVA_QA](VIVA_QA.md). Không đọc kết quả test chưa được chốt trong TEST_RESULTS.
