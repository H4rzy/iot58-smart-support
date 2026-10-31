# Thẻ thao tác demo — 5 phút

Lời nói mẫu và tác dụng từng chức năng: [DEMO_SCRIPT_FINAL.md](DEMO_SCRIPT_FINAL.md). Đây là tổng thời gian thuyết trình + thao tác, không cộng một lượt demo khác.

| Mốc | Làm gì | Ý chính cần nói |
|---|---|---|
| 00:00–00:20 | Dashboard tổng quan | Gọi hỗ trợ A/B/C, giảm bỏ sót và đo lúc nhân viên tới. |
| 00:20–01:05 | /red/: Ingest → Engine/Queue → Dispatch/SLA → Downlink | Node-RED nhận/validate/dedup, xếp hàng, điều phối, cảnh báo, phát MQTT. |
| 01:05–01:40 | A short, B long; B trước A | Queue chung; PAYMENT50 > CONSULT20; aging +5/phút. |
| 01:40–02:20 | NV02 AVAILABLE → ACK B ngay → LED blue | Tự phân công, downlink; DONE khóa trước ARRIVED. |
| 02:20–03:00 | Nhấn B → ARRIVED; DONE; short B CSAT trong15s | Response thật, service cập nhật AHT/ETA, đánh giá. |
| 03:00–03:35 | Chọn ticket → Bật webcam → Chụp → Tắt | Webcam ngoài Wokwi, ảnh cục bộ; khác slider giả lập số người. |
| 03:35–04:00 | Chỉ A waiting, alert L1/L2 | Chống bỏ quên; thử người tiếp theo khi có ứng viên. |
| 04:00–04:45 | Response/P90, AHT/CSAT, forecast | Đo chất lượng, thích nghi, đề xuất người từ lịch sử giả lập. |
| 04:45–05:00 | Kết | Đủ 4 tầng, MQTT hai chiều; smart ở middleware. |

**Chuẩn bị ngoài giờ:** Wokwi compile xong, mở Dashboard/Node-RED, MQTT ONLINE; RESET KPI, staff BUSY, CAM A/B/C=1; thử webcam rồi tắt. Forecast đặt trước09/10/2026 17:45, Pause. Không để CAM=0 làm tự hủy queue.

**Mở bằng publisher thay Wokwi:** powershell -ExecutionPolicy Bypass -File tools/start_demo.ps1. A/B đã tạo sẵn, không tạo thêm; nói rõ event mô phỏng. Sau ACK dùng node tools/run_demo.js --arrived B01; sau DONE dùng node tools/run_demo.js --csat B01 trong15s. Chế độ -Auto để diễn tập, không thay lời thuyết trình5 phút hoặc bằng chứng nút Wokwi.

**Giữ thời gian:** ACK trong8s sau khi staff AVAILABLE; ARRIVED/DONE/CSAT liền nhau rồi mới giải thích. A tự lên L1/L2 trong lúc demo, không chờ lại25s. Cancel/spam/replay/Telegram và công thức để Q&A tại [hướng dẫn đầy đủ](HUONG_DAN_DEMO.md).
