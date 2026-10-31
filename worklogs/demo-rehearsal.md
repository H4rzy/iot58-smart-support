# Demo rehearsal và hướng dẫn — 2026-10-31

- User yêu cầu chạy demo và viết script/hướng dẫn thao tác, giải thích tác dụng từng chức năng.
- Inspected: current .env chỉ đọc host/topic và token-present flag, health/state, firmware và Wokwi README hiện có CAM sliders, existing UI selectors, vision rules/contract, scenario scripts, webcam UI và guides.
- Changed: tools/run_demo.js, tools/start_demo.ps1; docs/HUONG_DAN_DEMO.md; links tại README, final/quick demo và tools README; actual live-demo-results.json.
- Decisions: diễn tập Chrome nhìn thấy được, real MQTT/REST/UI; REQUEST/ARRIVED/CSAT/counts là publisher simulation và caption nói rõ. Không tự bật webcam, không claim Wokwi physical test mới. Read .env giữ broker đang dùng, không in secrets. Server nền hidden, browser visible theo yêu cầu chạy demo.
- Actual run: global queue B>A; UI NV02 AVAILABLE tự dispatch; UI ACK/real MQTT command/DONE guard; publisher ARRIVED; UI DONE/CSAT; C cancel; A no-ACK L2; set forecast17:45. Runner PASS, không pageerror. Kết quả evidence/live-demo-results.json, giữ completed metrics và tạo lại A/B cho lượt thao tác tay.
- Launcher PowerShell chạy thực tế exit0, tạo queue2 và mở Dashboard trình duyệt. Bổ sung CLI --arrived/--csat cho lượt thao tác tay không reset; có guard ACK/CSAT state. Đường start server mới chưa cần dùng vì server1880 đang chạy.
- Manual helper verification thực: REST ACK B, --arrived B01 gửi real MQTT và chờ ARRIVED, REST DONE rồi --csat B01 → SATISFIED; cả hai process exit0, không reset. Chuẩn bị lại A/B giữ KPI sau khi kiểm tra.
- Limitations: phải tự cấp quyền webcam và chụp ảnh thật; camera counts của runner/slider không phải detector thật; không có Telegram token; public broker phụ thuộc Internet. Không chạy nhiều publisher cùng logical point.

## Kiểm tra trước push GitHub

- 95 middleware tests, 7 nhóm webcam browser checks và 10 repository checks PASS. Firmware hiện có CAM sliders compile PASS: RAM95056, flash873049 bytes.
- Host gesture harness ban đầu kéo nhầm hàm ADC mới vào đoạn trích, gây thiếu analogRead/cameraPersons. Tách phạm vi trích đúng gesture functions, không đổi business logic; chạy lại14 assertions PASS. Chưa chạy lại Wokwi browser cho bản slider trong lượt push này.
- Staged scan không có .env, private key hoặc token patterns; runtime/build/dependencies được ignore. Không sửa cấu hình secrets của máy.
