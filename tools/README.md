# Công cụ kiểm chứng

Từ repository root:

```powershell
Set-Location tools
npm ci
Set-Location ..
```

Dependencies chỉ phục vụ QA và broker local. Cần Node ≥22.9. Sau khi cài, chạy broker ở terminal thứ nhất:

```powershell
node tools/local_broker.js
```

Terminal thứ hai chạy Node-RED với `MQTT_HOST=127.0.0.1`. Terminal thứ ba chạy từng scenario:

```powershell
node tools/mqtt_scenario_test.js priority_demo
node tools/mqtt_scenario_test.js duplicate_demo
node tools/mqtt_scenario_test.js escalation_demo
node tools/mqtt_scenario_test.js spam_demo
node tools/mqtt_scenario_test.js abnormal_demo
node tools/mqtt_scenario_test.js vision
node tools/mqtt_scenario_test.js all
node tools/demo_reset.js
```

Tool publish schema 1 event qua MQTT thật, listen queue/cmd/metrics/alert và gọi REST ACK/DONE/staff của Application. Host mặc định của tool là localhost, khác với public broker của live Wokwi. Có thể cấu hình MQTT_HOST, MQTT_PORT, MQTT_BASE_TOPIC và API_URL.

`all` mất khoảng 55 giây (đo thật) vì cố ý chờ ngưỡng SLA 8/15/25s và ngưỡng camera. Tool reset trước mỗi scenario và khi kết thúc. Không chạy song song với demo browser trên cùng runtime vì dùng chung state.

| Scenario | Kiểm chứng |
|---|---|
| priority_demo | Ba request, B PAYMENT rank 1, dedup, NV02 dispatch, DONE sai trả 409, ACK MQTT downlink, ARRIVED/response, DONE, EWMA, CSAT, C cancel và forecast |
| duplicate_demo | Năm delivery cùng msg_id tạo một ticket |
| escalation_demo | NV01 → NV03 → L1 → L2 |
| spam_demo | Suspicious events tạo lock/alert, không thêm ticket |
| abnormal_demo | Staff OFFLINE → overload, ETA hữu hạn, reject malformed/unknown/topic mismatch, REST 400/404, Telegram disabled |
| vision | Camera A=1 → request có `presence_verified=true`; camera A=0 liên tục (heartbeat 1s) → ticket tự `CANCELLED` `ABANDONED_VISION` sau 10–15s, alert `TICKET_ABANDONED`, A01 về READY; request khi B=0 → `presence_verified=false` + `UNVERIFIED_REQUEST`; ACK rồi ARRIVED với A=2 → `arrival_verified=true`, với B=1 → `false` + `ARRIVAL_UNVERIFIED`; dừng heartbeat > `VISION_STALE_SECONDS` → `online=false`, `persons=null`, ticket không bị hủy; payload sai (zone lệch topic, persons -1/1.5/51, schema 2, camera_id sai, zone lạ, JSON hỏng) bị loại, state camera không đổi |

Scenario `vision` dùng cùng runtime demo (`DEMO_MODE`, ngưỡng demo abandon 10s, stale 10s). Lưu ý: `/demo/reset` **không** xóa state camera (đúng thiết kế: camera quan sát cửa hàng). Kịch bản dừng heartbeat khi kết thúc nên camera tự offline sau `VISION_STALE_SECONDS`. Chạy vision trên runtime đang có camera thật sẽ làm sai số đếm thật, nên chỉ chạy khi không có camera thật publish cùng `MQTT_BASE_TOPIC`. Thời gian vision đo thật khoảng 25–31 giây.

Aedes trong local_broker.js là fallback không cần Docker. Docker Mosquitto là tùy chọn tại root. Wokwi cloud không kết nối localhost trực tiếp. Publisher thay thiết bị để test middleware, không thay evidence nút vật lý Wokwi.

## Browser QA

```powershell
node tools/browser_smoke_test.js static
node tools/browser_smoke_test.js controls
node tools/browser_smoke_test.js all
```

Static chỉ đọc state, kiểm tra responsive/API offline/XSS/alert order; không reset runtime. Controls/all **reset phiên demo** và cần broker local đang chạy cùng Node-RED. Không chạy controls khi nhóm đang thao tác Wokwi.

Tool dùng Playwright và Chrome/Edge đã cài; nếu không có browser, cài Chromium bằng `npx playwright install chromium` tại tools. Cấu hình CHROME_EXECUTABLE nếu browser ở đường dẫn khác. API_URL chọn Node-RED origin; MQTT_HOST/PORT/BASE_TOPIC phải khớp runtime. API_TOKEN tùy chọn cho POST.

Screenshot trong evidence lấy từ browser thật với API thật. XSS / alert-order fixtures chỉ dùng security regression và không chụp làm evidence vận hành. Controls mô phỏng physical ARRIVED bằng MQTT publisher, không tự xác nhận gesture Wokwi.

## Repository audit

Chạy từ root: `python tools/repository_audit.py`. Kiểm tra file deliverable, flow graph, ba nút/ba NeoPixel, chuỗi GPIO25/index riêng, namespace, history bốn tuần, relative links và token pattern. Kết quả ghi `evidence/repository-audit.json`; chỉ là static audit, không thay Wokwi/Telegram runtime tests.

Sau khi QA hoàn tất và runtime đã RESET READY, chạy `python tools/final_acceptance_check.py`. Công cụ đối chiếu logs/evidence đã có, hashes source bàn giao/test overlay, response/service/EWMA, offlineFIFO và40 trạng thái nghiệm thu; kiểm tra7 live REST APIs, ghi `evidence/acceptance-summary.json`. Đây là đối chiếu bằng chứng của phiên QA hiện tại, không tự chạy lại Wokwi hoặc Telegram. API_URL tùy chọn chọn runtime origin.
