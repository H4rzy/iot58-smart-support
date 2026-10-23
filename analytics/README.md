# Lịch sử giả lập và dự báo

**Dữ liệu này là dữ liệu giả lập để chứng minh thuật toán, không phải dữ liệu thực tế.** Không dùng các KPI của seed để tuyên bố kết quả triển khai thật.

Chạy từ root: `python analytics/seed_history.py`. Seed58, 28 ngày trước 2026-10-09, múi giờ UTC+7. Có chủ đích: A cao điểm18–20h; B17–19h; C baseline thấp; cuối tuần tăng cầu. Poisson demand theo zone/hour, response/service có noise bounded. Cùng seed/anchor cho output giống hệt.

Demo clock set `2026-10-09T17:45:00+07:00`, pause để trình bày; forecast horizon15 phút ->18h. Sau ngày này hơn4 tuần, dataset có thể không còn phủ cửa sổ; dùng `--anchor YYYY-MM-DD` để tái tạo hoặc set virtual date về anchor. Dữ liệu không tự đổi theo ngày chạy nhằm giữ demo deterministic.

Thuật toán đọc `node-red/data/history.json`; mỗi matching weekday/hour đếm ticket của4 tuần trước, chia4 rồi chia60 để ra ticket/phút. Tuần không có ticket vẫn tính0. `ceil(lambda * AHT_seconds/60 / .8)` ra staffing requirement. Nhân sự đa kỹ năng chỉ tính một primary scheduled zone để không nhân ba capacity. Lịch sử giả không trộn vào KPI session; AHT live chỉ cập nhật khi DONE sau ARRIVED.

Ví dụ đổi dataset: tăng ticket A giờ18 ở4 tuần trước -> lambda và requirement tăng; unit test xác minh. Xem [ALGORITHMS](../docs/ALGORITHMS.md).
