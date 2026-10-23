# Agent 4 – Application

## Inspected

- `docs/IMPLEMENTATION_CONTRACT.md` và toàn bộ requirement của user liên quan Application/REST/analytics/demo.
- `C:/Users/PC/.agents/skills/frontend-design/SKILL.md`.
- Trao đổi core agent xác nhận state API, staff fields, devices object và alerts shape.

## Changed

- `application/index.html`, `application/styles.css`, `application/app.js`, `application/README.md`.
- Documentation polish được Lead giao thêm: `docs/REQUIREMENTS.md`, `ARCHITECTURE.md`, `ALGORITHMS.md`, `MQTT_TOPICS.md`, `SECURITY.md`, `BOM.md`, `COURSE_OUTLINE_MAPPING.md`, `DEMO_SCRIPT_FINAL.md`, `QUICK_DEMO.md`, `FULL_DEMO.md`, `HARDWARE_BONUS.md`, `TEN_WEEK_PLAN.md`, `evidence/README.md`.

## Decisions

- Giao diện cửa hàng olive/cream, typography offline, responsive và không CDN/plugin/framework.
- Poll state 1s, timeout7s, báo API offline và giữ bản cập nhật gần nhất; không fake data.
- Render mọi giá trị server bằng textContent để tránh XSS.
- ACK remote; DONE chỉ ARRIVED; physical ARRIVED chỉ Wokwi customer button.
- Queue gom waiting queue cùng active ACK/ARRIVED từ tickets.
- Staff score preview cả A/B/C; state server xác nhận eligibility/assignment.
- Clock nhập local browser timezone chuyển ISO, forecast synthetic được label rõ.
- Demo reset có confirmation, metric option; server reset/history source of truth.
- Documentation giữ tên thành viên từ bản gốc, tách response SLA 120s với ACK/L1/L2 và CMD_APPLIED receipt cùng cmd_id không vòng lặp.
- Demo reassignment tách scenario riêng, tránh reset xóa B trước bước ACK. Reset sau lifecycle giữ KPI để final analytics có số đo thực.
- Embedded agent xác nhận spam short cách ~600ms hoạt động; nhắc upload partitions.csv cùng ba file Wokwi để LittleFS có partition (default browser Wokwi không có).

## Tests

- `node --check application/app.js`: PASS.
- Chrome headless / Playwright với Node-RED thực tại `http://localhost:1880/`: PASS 9 KPI, 3 nhân viên, 3 thiết bị, 3 forecast zone; không có pageerror.
- Viewport 1366×768 và 390×844: PASS không có overflow ngang toàn trang. Bảng queue có scroll riêng.
- Abort GET state bằng Playwright route: PASS cảnh báo offline hiện, nút reset disabled.
- Screenshot thật: `evidence/dashboard-desktop.png`, `evidence/dashboard-mobile.png`; state Node-RED thực, thiết bị offline được label đúng. Đây là evidence UI, không phải evidence Wokwi LED hoạt động.
- Một lần chạy lại gặp `ERR_CONNECTION_REFUSED` trong lúc Lead chuyển broker/runtime; đã dừng process, không coi lần đó là PASS. Sau restart đã chạy lại toàn bộ static browser smoke với PASS, bao gồm các bảng/chart mới.
- Playwright XSS test có chủ đích route snapshot chứa `<img onerror>` tại staff name và `<svg onload>` tại alert: PASS text hiển thị literal, không có element img/svg được chèn, không có script thực thi. Đây là kiểm thử injection, không dùng payload mock để tạo screenshot/evidence vận hành.
- Reproducible browser test tại `tools/browser_smoke_test.js`: controls PASS với MQTT/REST thật; initial assertion race chờ MQTT flush được sửa bounded wait3s rồi rerun PASS. Real screenshots và JSON results trong evidence. Static PASS thêm latest10 alerts regression.
- Ngày 2026-10-10 hoàn tất readability polish root README, API/tools README, VIVA, report, slide/script, TEST_PLAN và bốn tài liệu nghiệm thu mới; giữ pending Wokwi statuses, không tạo thêm claim.
- Linkcheck 46 Markdown files / 141 relative links: 0 broken. Không có git repository; git status không áp dụng.

## Known issues

- Telegram thực tế cần user token/chat allowlist; Dashboard vẫn hoạt động khi disabled.
- Wokwi LED/physical arrival cần final browser verification, không coi ảnh/mock API là bằng chứng E2E.

## Lead final verification sau handoff

Wokwi browser E2E và offline/reboot đã hoàn tất PASS với ảnh/serial/state thật. Firmware defaultfalse compile,14 gesture cases và diagram lint PASS. Lead cross-check source hashes, response/service/EWMA, FIFO và7 live APIs khi runtime READY. Tổng middleware tests cuối49/49 và5 MQTT scenarios PASS. Telegram live conditional vẫn chưa có token; xem evidence/acceptance-summary.json và TEST_RESULTS. Những ghi chú pending phía trên là trạng thái tại thời điểm agent handoff, đã được giải quyết bằng lần QA cuối.
