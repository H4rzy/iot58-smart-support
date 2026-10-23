# Role 5 — Analytics (Lead)

- Files inspected: canonical formulas của user, contract, staff/ticket models và engine configuration thực tế.
- Files changed: node-red/lib/analytics.js, forecast.js; analytics/seed_history.py và README; data/history.json; analytics.test.js và forecast.test.js.
- Decisions: EWMA alpha0.3, nearest-rank P90, N/A khi chưa có mẫu; response chỉ arrived-created; ETA denominator tối thiểu1; overload capacity tính cả staff BUSY đang on-duty.
- Forecast: bốn weekday/hour bins kể cả bin không có ticket, timezone UTC+7; một primary scheduled zone cho mỗi staff để không tính một người ba lần.
- History: seed58, 28 ngày trước2026-10-09, 10.974 synthetic tickets; pattern A18–20h, B17–19h và weekend có chủ đích. Label dữ liệu giả lập, không trộn vào KPI live.
- Tests run:12 analytics/forecast cases ban đầu PASS; nằm trong49 tests cuối. Regression thay dataset làm forecast đổi; REST/virtual-clock scenario đọc dữ liệu thật.
- Known limitations: chưa dùng ML, ETA đơn giản, forecast chỉ bốn tuần; mốc demo cần trùng khoảng dữ liệu hoặc regenerate history.
