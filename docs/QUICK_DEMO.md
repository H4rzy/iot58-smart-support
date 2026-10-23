# Quick demo — 3–4 phút

Chuẩn bị MQTT ONLINE, DEMO MODE, RESET DEMO với KPI sạch và cả ba staff BUSY.

1. A nhấn ngắn, B giữ ≥1.5s: hai ticket vào global queue. B PAYMENT rank 1, priority 50 cao hơn A CONSULTATION 20. Chỉ ra OLED và LED vàng.
2. Đặt NV02 AVAILABLE: engine tự dispatch B. ACK trên Dashboard → MQTT → LED B blue; chỉ rõ bằng chứng downlink.
3. Nhấn nút vật lý B → ARRIVED. DONE trên Dashboard → green, service/AHT update. B short → CSAT SATISFIED. Chỉ ra response time thực và P90.
4. C short, rồi C double trong 400ms → CANCELLED. A còn chờ tự L1/L2 sau 15/25s; chỉ ra alert và LED đỏ.
5. RESET giữ KPI, đặt NV03 OFFLINE. Set clock 09/10/2026 17:45 theo UTC+7, pause → forecast 18h: A cần 2, primary staff 1, recommendation thêm 1. Ghi rõ lịch sử giả lập.

Không hứa trình bày mọi abnormal case trong ba phút. Reassignment, spam và offline xem ở [full demo](FULL_DEMO.md) / test tools. Cần thử timing nút trước buổi trình bày. Clock ảo chỉ forecast; SLA dùng clock thực.
