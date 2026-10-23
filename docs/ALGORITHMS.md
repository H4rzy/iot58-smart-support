# Thuật toán và dữ liệu thích nghi

## Priority và aging

`Priority = W_type + 5 × waiting_minutes + 20 × escalation_level`

CONSULTATION có trọng số 20; PAYMENT có trọng số 50. Server tính lại định kỳ từ created_at, dùng phút thực có phần thập phân. Queue sắp xếp priority giảm dần, sau đó created_at tăng dần và ticket_id theo lexical order.

Ví dụ: consultation chờ 7 phút có priority 20 + 5×7 = 55, vượt payment mới có priority 50. Aging giúp chống starvation khi hệ thống có khả năng xử lý; không giải quyết tình trạng thiếu năng lực vô hạn.

## Staff dispatch và reassignment

`StaffScore = 100 × [AVAILABLE] + 30 × [supports_zone] − 10 × tickets_assigned_this_shift`

Chỉ dispatch staff AVAILABLE, không có ticket active hoặc reservation và chưa nằm trong staff_attempts của ticket. Ví dụ NV02 hỗ trợ B, chưa nhận lượt nào: score 130 cho khu B; NV01 hỗ trợ A/C: score 100 cho khu B. BUSY/OFFLINE không được dispatch dù lịch sử ít việc.

Tie breaker: ít active ticket hơn → lâu chưa được assign hơn → staff_id lexical. Assignment giữ chỗ cho nhân viên, nên staff đã được notify không tiếp tục được tính là free.

Không ACK sau 30s (normal) hoặc 8s (demo): release reservation, ghi attempt và thử nhân viên tiếp theo. Nếu hết nhân viên phù hợp đã thử thì L1; timer L1 là 60s/15s, L2 là 90s/25s, tính từ created_at. L2 gửi manager alert. Ticket escalated vẫn có thể ACK.

ACK latency = ack_at − created_at. Response time thực = arrived_at − created_at. Timestamp canonical do server tạo; uptime của ESP32 chỉ phục vụ debug.

## Adaptive AHT và ETA

`AHT_new = 0.3 × latest_service_seconds + 0.7 × AHT_old`

AHT lưu riêng theo A/B/C, mặc định 120s. Service = resolved_at − arrived_at. Ví dụ AHT cũ 120s, service mới 60s thì AHT mới 102s. Không học từ CANCELLED hoặc ACK. Alpha 0.3 dành 30% trọng số cho quan sát mới; đây là cấu hình giải thích được, không phải tham số tối ưu từ dữ liệu thực.

`ETA = ceil(queue_rank / max(1, free_staff_count)) × zone_AHT`

Rank 3, free 2, AHT 120s → ETA 240s. Free 0 → ETA 360s; không chia cho 0. Free staff loại trừ người đang active hoặc reserved. ETA là ước lượng đơn giản, chưa mô hình hóa từng kỹ năng và lịch phục vụ; Dashboard vẫn hiển thị không có staff rảnh.

## P90, SLA và CSAT

P90 dùng nearest-rank: sắp xếp response tăng dần, index = `ceil(0.9 × N) − 1`. Với dãy 1..10, P90 = 9. N=0 trả null và Dashboard hiển thị N/A. Chỉ ticket có physical ARRIVED mới có response_time_ms; ACK không thay response.

Response SLA KPI mặc định `RESPONSE_SLA_SECONDS=120`, cấu hình riêng với timeout assignment/escalation. SLA violation % = số ticket không CANCELLED đã vi phạm response SLA / tổng ticket không CANCELLED. Ticket đã ARRIVED dùng response_time_ms; ticket còn active chưa ARRIVED dùng thời gian chờ hiện tại. CSAT % = SATISFIED / (SATISFIED + UNSATISFIED); bỏ qua người không đánh giá.

## Overload

`waiting_queue_length > on_duty_staff × 2`

On-duty gồm AVAILABLE và BUSY; OFFLINE không tính. Ví dụ 3 waiting / 0 on-duty → overload; 6 waiting / 3 on-duty → chưa overload. Alert theo chuyển trạng thái / cooldown để tránh lặp liên tục. PAYMENT có thể được giảm ngưỡng SLA bằng factor trong config.

Với ba điểm gọi và ba staff on-duty, queue tối đa 3 không vượt ngưỡng 6. Demo overload bằng cách đặt staff OFFLINE, thể hiện đúng thiếu năng lực phục vụ.

## Forecast và staffing recommendation

Dataset giả lập 4 tuần, seed 58, anchor 2026-10-09; timestamp có timezone, phân tích giờ cửa hàng UTC+7.

`lambda(zone, weekday, hour) = tickets_in_4_matching_prior_hours / 4 / 60`

Đơn vị λ là ticket/phút. Tuần có 0 ticket vẫn đóng góp 0, tránh bias do chỉ lấy tuần có dữ liệu. Forecast nhìn trước 15 phút theo clock ảo.

`N_required = ceil(lambda × (AHT_seconds / 60) / 0.8)`

Ví dụ λ=1 ticket/phút, AHT=120s → ceil(2/0.8)=3 staff, hướng tới utilization ≤80%. Đây là forecast theo historic bin, không phải ML.

Dataset mặc định cho A lúc 18h khoảng 0.72 ticket/phút; AHT 120s cần 2 staff. Nếu NV03 OFFLINE, A có 1 staff theo primary zone thì recommendation cần thêm 1. Kết quả được tính từ dataset, không hardcode giờ 18h.

Một staff đa kỹ năng chỉ được tính vào một scheduled_zone, fallback zones[0], tránh nhân ba năng lực. Dashboard hiện chưa có control đổi primary zone; recommendation hỗ trợ quản lý bố trí nhân sự.

## Vision: đếm người và luật camera

Camera gửi `persons` mỗi 1–2 giây cho từng khu. Server giữ `persons`, `updated_at`, `empty_since`, `occupied_since` và `footfall` cho A/B/C.

Tươi: `now − updated_at ≤ VISION_STALE_SECONDS` (mặc định 10 giây). Chưa có reading thì không tươi.

`footfall += max(0, persons_mới − persons_cũ)`. Đây là số khách tăng ròng giữa hai reading liên tiếp, không phải số khách đi qua thật. Nếu một khách vào và một khách ra giữa hai reading, footfall không tăng. Dùng số này làm tín hiệu tham khảo, không dùng làm KPI tài chính.

Khu trống/có người: `empty_since` ghi lúc chuyển từ có người sang 0; `occupied_since` ghi lúc chuyển từ 0 sang có người. Khi camera im quá ngưỡng tươi, hai mốc này bị xóa, nên khoảng mất tín hiệu không được tính là liên tục.

| Luật | Công thức | Ngưỡng demo / production | Fail-open |
|---|---|---|---|
| Bỏ đi | `now − max(empty_since, created_at) ≥ abandon` | 10 s / 60 s | Không tươi → không hủy |
| Nghi ngờ | REQUEST: `persons > 0` | — | Không tươi → `null`, không gắn cờ |
| Đến thật | STAFF_ARRIVED: `persons ≥ 2` | — | Không tươi → `null`, ARRIVED vẫn chạy |
| Chủ động | `now − occupied_since ≥ dwell` và device không có ticket active, không CSAT | 20 s / 180 s | Không tươi → không alert |

Lý do ngưỡng: demo cần thấy hiệu ứng trong vài chục giây nên dùng 10 và 20 giây. Production dùng 60 và 180 giây để tránh hủy nhầm khi khách đứng xem hàng hoặc nhân viên đi ngang. Bỏ đi tính từ `created_at` nên khách rời đi trước khi bấm không làm ticket bị hủy ngay. Khách quay lại trước ngưỡng thì `empty_since` bị xóa khi `persons > 0`, nên không hủy.

Lý do fail-open: camera là cảm biến phụ, có thể mất Wi-Fi, lỗi driver hoặc đứng hình. Nếu coi "không có tín hiệu" là "khu trống", hệ thống sẽ hủy nhầm ticket của khách còn đứng đó. Vì vậy `null` nghĩa là không biết, luật không chạy, và nút bấm vẫn quyết định như trước.

Luật `PROACTIVE_ASSIST` có cooldown theo `ALERT_COOLDOWN_SECONDS` (mặc định 60 giây) và được khóa theo khu. Cancel bằng camera không đi vào AHT (EWMA chỉ học từ `service_seconds` của ticket RESOLVED), không đi vào response time và không đi vào SLA violation vì ticket CANCELLED bị loại khỏi các mẫu đó.

Độ chính xác đếm người chưa đo. Detector có ngưỡng điểm `--score-threshold` (mặc định 0.5), có thể sai khi người bị che, ngược sáng hoặc đứng sát khung. Trước khi tin cậy số liệu, cần đo trên webcam thật theo kịch bản có ground truth. Hiện chưa có số liệu đó.

## Clock ảo và reliability

Clock 60× nghĩa là 1 phút thực = 1 giờ ảo, hoặc 1 giây thực = 1 phút ảo. Start / pause / reset / set chỉ thay forecast. SLA, aging và ticket timestamps vẫn dùng clock thực; đổi 17:45→18:00 không làm ticket nhảy escalation.

msg_id = device − boot − counter, giữ nguyên khi replay. Dedup TTL 1 giờ. LittleFS FIFO nhận receipt sau ingest và persistence phía server rồi mới xóa head.

CMD_APPLIED cũng là outbound event và cần receipt để được xóa khỏi FIFO. Receipt này dùng lại cùng cmd_id, gửi transient; không tạo command mới. Firmware không gửi CMD_APPLIED lần nữa cho cùng cmd_id, nên không sinh vòng lặp.

FIFO có giới hạn, queue đầy phải báo rõ. Firmware và server cùng kiểm soát spam. Public MQTT không xác thực thiết bị; production cần TLS và ACL.
