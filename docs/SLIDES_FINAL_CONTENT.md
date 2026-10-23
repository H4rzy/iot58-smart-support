# Nội dung 16 slide V2

PPTX gốc được giữ trong legacy/original-materials. Dùng nội dung này cập nhật slide bằng công cụ trình chiếu của nhóm; không giả định đã tạo binary PPTX mới.

| Slide | Nội dung đưa lên slide | Visual / evidence |
|---:|---|---|
| 1 | Máy lấy số / gọi nhân viên hỗ trợ thông minh; HUIT / IoT 58; nhóm và giảng viên | Tên nhóm từ TEN_WEEK_PLAN |
| 2 | Nhiều khách gọi cùng lúc, ticket bị bỏ quên, chưa đo phản hồi | Use case A/B/C, 200 m² |
| 3 | V1: local, chưa MQTT/global queue, ACK/DONE vật lý, response theo ACK | V1 vs V2; không tạo teacher quote |
| 4 | V2: mỗi điểm một C3 + nút + RGB, smart ở middleware | BOM đơn giản |
| 5 | Physical → Network → Middleware → Application | Diagram bốn tầng |
| 6 | Short consult, long payment, double cancel; physical arrival sau ACK | Ba logical point Wokwi và gesture timeline |
| 7 | MQTT uplink REQUEST; downlink ACK blue | Topic map và sequence |
| 8 | Priority 20/50 +5/phút +20/level; consult 7 phút đạt 55 | Queue B trước A |
| 9 | StaffScore, zone, availability, workload; timeout/reassignment | Panel NV01/NV02/NV03 |
| 10 | PENDING → ACKNOWLEDGED → ARRIVED → RESOLVED; L1/L2; CSAT | State diagram |
| 11 | Response created→arrived; EWMA AHT; ETA an toàn; P90 | AHT trước/sau DONE |
| 12 | Bốn tuần synthetic, λ theo thứ/giờ, staffing utilization 80%, clock ảo | Label synthetic và recommendation |
| 13 | Web/REST ACK/DONE/staff, Telegram optional, security guards | Screenshot Dashboard thật |
| 14 | Normal/abnormal demo, reset trước mỗi lượt | Quick demo |
| 15 | Test và rubric mapping, manual verification minh bạch | TEST_RESULTS / RUBRIC_TRACEABILITY |
| 16 | Smart ở đâu? Tại sao không AI? Bốn tầng/downlink/arrival | Q&A; C3, TLS và real history là future |

Slide ít chữ, formula phải có đơn vị. Không dùng camera/people counting làm câu chuyện chính. Đặt “Dữ liệu giả lập” ngay cạnh forecast. Không ghi 100/100 guaranteed hoặc kết quả kinh doanh chưa đo.
