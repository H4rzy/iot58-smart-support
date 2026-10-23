# Kế hoạch tích hợp Camera (Vision) — cho Codex và sub-agents

Đọc hết file này trước, rồi chia task cho sub-agents. Mỗi task ghi rõ file được sở hữu, để các agent chạy song song không ghi đè nhau.

## 0. Mục tiêu và nguyên tắc

Thêm camera làm **cảm biến có mặt** vào hệ thống hiện có. Camera chỉ gửi **số người theo khu (A/B/C)** qua MQTT, **không gửi và không lưu ảnh**. Middleware kết hợp tín hiệu nút bấm với tín hiệu camera để:

1. Tự hủy ticket khi khách bỏ đi (khu trống quá ngưỡng).
2. Gắn cờ ticket nghi ngờ khi bấm nút mà camera không thấy ai.
3. Xác nhận nhân viên đã đến thật (camera thấy từ 2 người trở lên).
4. Cảnh báo chủ động khi có người đứng chờ lâu mà chưa có ticket.
5. Đếm lượt khách (footfall) thật theo khu, để dùng cho forecast.

Nguyên tắc bắt buộc:

- **Fail-open:** camera mất tín hiệu quá `VISION_STALE_SECONDS` thì mọi luật camera tắt, luồng nút bấm chạy như cũ. Giá trị `null` nghĩa là "không biết", không được coi là `false`.
- Không phá 49 test hiện có. `npm test` trong `node-red/` phải luôn PASS.
- Giữ phong cách code hiện tại: CommonJS, `"use strict"`, module thuần trong `node-red/lib/`, lỗi dùng `fail(status, message)` từ `utils.js`.
- Tài liệu phải trung thực: demo bằng webcam laptop thì ghi rõ là webcam laptop, không viết là đã chạy trên ESP32-S3 thật. Không gọi hệ thống là AI. Đây là đếm người bằng mô hình nhận diện có sẵn cộng với luật.
- Không commit secrets. Không thêm CDN vào Dashboard.

## 1. Trạng thái hiện tại (đã code trước khi lập kế hoạch)

Đã có, **chưa được test riêng**, chỉ biết 49 test cũ vẫn PASS:

| File | Đã làm |
|---|---|
| `node-red/lib/vision.js` (mới) | `validateVision`, `freshVision`, `isFresh`, `applyReading`, `presence`, `arrivalVerified`, `isAbandoned`, `needsProactiveAssist`, `view` |
| `node-red/lib/config.js` | `visionEnabled`, `visionStaleSeconds`, `visionProduction`, `visionDemo`, `visionThresholds()` |
| `node-red/lib/ticket-engine.js` | `state.vision`, `cancel(t, reason)`, `visionPresence(zone)`, `ingestVision(topic, payload)`, `applyVisionRules()` gọi trong `tick()`, field ticket `presence_verified`, `arrival_verified`, `cancel_reason`, giữ `vision` qua `reset()` |

Chưa có:

- Đường đưa dữ liệu camera vào hệ thống (flow, runtime, settings).
- Phần vision trong `snapshot()` và REST.
- Test cho vision.
- Dashboard.
- Publisher demo bằng webcam.
- Kịch bản kiểm thử MQTT.
- Tài liệu.

## 2. Contract MQTT mới

Topic uplink: `{BASE}/vision/{zone}` với zone là `A`, `B` hoặc `C`. Payload:

```json
{"schema":1,"camera_id":"CAM-A","zone":"A","persons":2,"confidence":0.87,"ts":"2026-10-24T10:00:00.000Z"}
```

Quy tắc kiểm tra (đã có trong `validateVision`): schema bằng 1; zone thuộc A/B/C; topic phải khớp zone; `camera_id` khớp `^[-\w]{1,64}$`; `persons` là số nguyên từ 0 đến 50; payload không quá `PAYLOAD_MAX_BYTES`. `confidence` và `ts` là tùy chọn, hiện chưa được kiểm tra, task T1 quyết định có kiểm tra không. Camera nên publish mỗi 1–2 giây kể cả khi số người không đổi (đóng vai heartbeat).

Biến môi trường mới (đã có trong `config.js`, cần thêm vào `.env.example`):

```
VISION_ENABLED=true
VISION_STALE_SECONDS=10
VISION_ABANDON_SECONDS=60
VISION_DWELL_SECONDS=180
DEMO_VISION_ABANDON_SECONDS=10
DEMO_VISION_DWELL_SECONDS=20
```

Luật quyết định:

| Luật | Điều kiện | Hành động |
|---|---|---|
| Bỏ đi | Ticket đang chờ, camera tươi, khu trống liên tục từ lúc tạo ticket trở đi đủ `abandon` giây | `cancel(t, "ABANDONED_VISION")` và alert `TICKET_ABANDONED` |
| Nghi ngờ | Lúc `REQUEST`, camera tươi và thấy 0 người | `presence_verified=false` và alert `UNVERIFIED_REQUEST` |
| Đến thật | Lúc `STAFF_ARRIVED`, camera tươi và `persons>=2` | `arrival_verified=true`. Nếu tươi mà dưới 2 người thì `false` và alert `ARRIVAL_UNVERIFIED`. Không tươi thì `null`. **Không chặn** ARRIVED, chỉ gắn cờ |
| Chủ động | Khu có người liên tục từ `dwell` giây trở lên, thiết bị của khu đó không có ticket và không ở CSAT | alert `PROACTIVE_ASSIST` (có cooldown sẵn của `alert()`) |

## 3. Sơ đồ phụ thuộc

```
T0 review ──► T1 wiring ──► T2 snapshot/REST ──► T4 dashboard
          │            └──► T6 scenario MQTT
          ├──► T3 unit tests (độc lập với T1)
          └──► T5 publisher webcam (độc lập, chỉ cần contract mục 2)
T7 docs  (sau T1–T2; viết song song với T4–T6)
T8 verify cuối (sau tất cả)
```

Chạy song song được ngay: **T3, T5**. Sau khi T0 xong: **T1**. Sau T1: **T2, T6**. Sau T2: **T4**. T7 song song với T4–T6 sau T2.

## 4. Các task

### T0 — Rà soát phần đã code (không sửa nếu không có lỗi)

- Đọc `node-red/lib/vision.js`, các đoạn vision trong `ticket-engine.js` và `config.js`.
- Chạy `npm test` trong `node-red/`, phải 49/49 PASS.
- Kiểm tra cụ thể và sửa nếu sai:
  1. `applyReading`: `empty_since` và `occupied_since` có chuyển đúng khi số người đổi 0 thành khác 0 và ngược lại.
  2. `isAbandoned`: dùng `max(empty_since, created_at)` đúng ý nghĩa "trống kể từ khi có ticket".
  3. `cancel()` khi `release(t)` xong thì `recompute()` có được gọi sau trong `tick()` hay không (`tick()` gọi `recompute()` ở cuối nên đủ).
  4. Ticket hủy do camera thì `device.cancel_until` giúp thiết bị hiện trạng thái CANCELLED 1.5 giây, đúng hành vi cũ.
  5. `snapshot()` hiện chưa trả vision, và `state.json` cũ (không có `vision`) vẫn nạp được nhờ `||=` trong constructor.
- Báo lại danh sách lỗi tìm được. File sở hữu: `lib/vision.js`, `lib/ticket-engine.js`, `lib/config.js`.

### T1 — Nối camera vào runtime (Node-RED)

File sở hữu: `node-red/lib/runtime.js`, `node-red/settings.js`, `node-red/flows.json`, `node-red/.env.example`.

1. `runtime.js`: thêm `ingestVision(msg)` bọc `engine.ingestVision(msg.topic, msg.payload)`, bắt lỗi giống `ingest()` (ghi audit `VISION_REJECTED`, trả `{ok:false,error,status}`), **không** `persist(true)` mỗi lần (camera gửi mỗi giây) mà dùng `persist()` thường.
2. `settings.js`: thêm `process.env.MQTT_VISION_TOPIC = config.baseTopic + "/vision/+"` (đúng kiểu `MQTT_EVENTS_TOPIC`, không dùng ghép env một phần trong flow).
3. `flows.json`, tab 01 MQTT INGEST: thêm node `mqtt in` (topic `${MQTT_VISION_TOPIC}`, qos 0, dùng broker `broker`, đặt tên "Camera presence") nối vào node function `global.get('iot58').ingestVision(msg); return null;`. Không dùng link tới pipeline của ticket (không cần receipt/downlink). Giữ nguyên số lượng tab là 12 và không thêm node ngoài thư viện có sẵn.
4. Quyết định có kiểm tra `confidence` (0 đến 1) và `ts` trong `validateVision` hay không. Nếu thêm thì cập nhật contract và test ở T3.
5. `.env.example`: thêm 6 biến ở mục 2.
6. Kiểm tra: khởi động Node-RED với `MQTT_HOST=127.0.0.1` cùng broker local (xem README gốc), publish thủ công một payload vision, `GET /api/iot58/state` phải phản ánh (sau khi T2 xong). Trước T2 chỉ cần không có lỗi trong log và `flow-health` trả 200.

### T2 — Snapshot và REST

File sở hữu: `node-red/lib/ticket-engine.js` (chỉ hàm `snapshot()`, `tick()` phần publish), `node-red/lib/runtime.js` (chỉ `health()` nếu cần).

1. `snapshot()` thêm `vision: vision.view(this.state.vision, this.now(), this.config)` và `config.vision_enabled`, `config.vision_thresholds`.
2. `tick()` publish summary mỗi giây: thêm `this.publish("system/vision", viewResult, true)` (retained) để các client khác đọc được. Giữ payload `display` dưới 768 byte, **không** nhét vision vào `display`.
3. `GET /api/iot58/vision` trả view riêng, thêm vào chuỗi `else if` trong `runtime.js`, `middleware()`.
4. Cập nhật `docs/API.md` và `docs/MQTT_TOPICS.md` (hoặc để T7 làm, nhưng phải liệt kê endpoint/topic cho T7).
5. Không đổi tên field hiện có. Dashboard cũ phải chạy không lỗi khi có thêm field.

### T3 — Unit test cho vision

File sở hữu: `node-red/test/vision.test.js` (mới), thêm case vào `node-red/test/ticket-engine.test.js` hoặc tạo `node-red/test/vision-engine.test.js` (ưu tiên file mới để tránh xung đột). Dùng `node:test`, fixture giống `ticket-engine.test.js` (đồng hồ giả `now`, `advance(ms)`).

Bắt buộc có:

1. `validateVision`: schema sai, zone lạ, topic và zone lệch, camera_id sai, persons âm, không nguyên, lớn hơn 50, payload quá lớn, JSON hỏng.
2. `applyReading`: footfall chỉ tăng khi số người tăng; `empty_since` và `occupied_since` chuyển đúng.
3. Fail-open: không có reading nào, hoặc reading cũ hơn `VISION_STALE_SECONDS`, thì `presence` và `arrivalVerified` trả `null`, `isAbandoned` trả `false`, và ticket không bị hủy.
4. Bỏ đi: tạo REQUEST khi khu A có người, rồi camera báo 0 người, `advance` quá ngưỡng demo 10 giây (nhớ gửi lại reading để không bị stale) thì ticket `CANCELLED`, `cancel_reason==="ABANDONED_VISION"`, alert `TICKET_ABANDONED`, device về `READY`, staff được release.
5. Khách quay lại trước ngưỡng thì không hủy.
6. REQUEST khi camera thấy 0 người thì `presence_verified===false` và có alert `UNVERIFIED_REQUEST`. Thấy ≥1 người thì `true`. Không có camera thì `null`.
7. STAFF_ARRIVED với 1 người, 2 người, và camera stale cho ba kết quả `false`, `true`, `null`; ARRIVED vẫn thành công cả ba trường hợp.
8. `PROACTIVE_ASSIST`: khu có người ≥ dwell, thiết bị không ticket thì có alert. Có ticket đang active hoặc đang CSAT thì không.
9. `VISION_ENABLED=false` thì mọi luật tắt và `ingestVision` trả `ignored:true`.
10. Chế độ production dùng ngưỡng 60 và 180 giây (đổi `config.demo_mode`).
11. `reset()` giữ `vision`. Nạp state cũ không có `vision` vẫn chạy.
12. Cancel bằng camera không làm sai AHT/EWMA và không tính vào response metrics (kiểm tra `computeMetrics` hiện tại xử lý ticket CANCELLED thế nào, ghi rõ kết quả).

Tiêu chí: tổng số test tăng, toàn bộ PASS, không sửa 49 test cũ.

### T4 — Dashboard

File sở hữu: `application/index.html`, `application/app.js`, `application/styles.css`, `application/README.md`. Chờ T2.

1. Thêm thẻ "Camera" cho từng khu A/B/C: số người hiện tại, trạng thái online/offline (stale), thời gian đứng, tổng lượt khách. Camera offline hiển thị "Không có tín hiệu", **không** hiển thị 0.
2. Trong hàng đợi, thêm huy hiệu cho ticket: "Đã xác minh có khách", "Nghi ngờ (không thấy người)", "Đã xác minh nhân viên đến", "Chưa xác minh nhân viên", "Tự hủy: khách bỏ đi".
3. Alert mới (`TICKET_ABANDONED`, `UNVERIFIED_REQUEST`, `ARRIVAL_UNVERIFIED`, `PROACTIVE_ASSIST`) hiển thị trong danh sách cảnh báo hiện có.
4. Ghi chú quyền riêng tư cố định trên giao diện: "Camera chỉ gửi số người, không lưu hình".
5. Ràng buộc đã có: dùng `textContent` (không `innerHTML` với dữ liệu từ server), không CDN, responsive 1366×768 và 390×844, fetch hiện tại giữ nguyên chu kỳ 1 giây.
6. Chạy `node tools/browser_smoke_test.js static` và `controls` (xem `tools/README.md`), cập nhật test này nếu đếm KPI/thẻ cố định bị lệch (hiện kiểm tra 9 KPI/3 staff/3 devices/3 forecast).

### T5 — Publisher demo bằng webcam (Python)

File sở hữu: thư mục mới `vision/` gồm `vision/publisher.py`, `vision/requirements.txt`, `vision/README.md`, `vision/simulate.py`.

1. `publisher.py`: đọc webcam bằng OpenCV, đếm người bằng một mô hình có sẵn chạy CPU (ưu tiên MediaPipe hoặc YOLOv8n qua `ultralytics`; chọn một, ghi lý do và dung lượng vào README). Chia khung hình thành 3 vùng A/B/C theo cột (cấu hình được, có chế độ vẽ vùng bằng tham số `--zones`), đếm người theo vùng, publish `{BASE}/vision/{zone}` mỗi `--interval` giây (mặc định 1) bằng `paho-mqtt`.
2. Tham số: `--host`, `--port`, `--base-topic` (mặc định khớp `.env.example`), `--camera-index`, `--interval`, `--show` (cửa sổ xem trước, tắt mặc định), `--dry-run` (in payload, không publish).
3. **Không ghi ảnh ra đĩa, không gửi ảnh qua mạng.** Chỉ số nguyên.
4. `simulate.py`: không cần webcam. Nhận kịch bản dòng lệnh như `A=2,B=0,C=1` hoặc file JSON theo thời gian, publish đúng contract. Dùng để demo và để T6 gọi. Thư viện chỉ gồm `paho-mqtt` để chạy nhẹ.
5. `README.md`: cài đặt, chạy, cách hiệu chỉnh vùng, ngưỡng tin cậy, ghi rõ đây là webcam laptop thay cho ESP32-S3 camera, nêu hướng triển khai thật ở mục T7.
6. Kiểm tra: `--dry-run` chạy được không cần broker; `simulate.py` publish được vào broker local (`tools/local_broker.js`) và `mqtt` subscriber xác nhận payload qua `validateVision`. Chạy Python với `-I`, đặt venv riêng ngoài thư mục `vision/` (ví dụ `vision/.venv` được gitignore).

### T6 — Kịch bản kiểm thử MQTT end-to-end

File sở hữu: `tools/mqtt_scenario_test.js` (thêm kịch bản), `tools/README.md`. Chờ T1 và T2.

Thêm kịch bản `vision` vào lệnh `all` (hiện 5, thành 6), chạy với broker local và Node-RED local như README gốc:

1. Publish vision A=1 rồi REQUEST A01 thì ticket `presence_verified===true`.
2. A=0 liên tục quá ngưỡng demo (ghi nhớ gửi heartbeat mỗi giây) thì ticket tự `CANCELLED` với `ABANDONED_VISION`, device A01 về READY, có alert trên `system/alert`.
3. REQUEST khi A=0 thì `presence_verified===false`.
4. ACK rồi STAFF_ARRIVED lúc A=2 thì `arrival_verified===true`, lúc A=1 thì `false`.
5. Dừng heartbeat quá `VISION_STALE_SECONDS` thì vision hiển thị offline và ticket không bị hủy.
6. Payload sai (zone lệch topic, persons=-1) bị loại, không đổi state.

Kết thúc kịch bản phải reset sạch như các kịch bản hiện tại. Không chạy song song với Wokwi demo.

### T7 — Tài liệu

File sở hữu: `docs/IMPLEMENTATION_CONTRACT.md`, `docs/REQUIREMENTS.md`, `docs/ARCHITECTURE.md`, `docs/MQTT_TOPICS.md`, `docs/API.md`, `docs/SECURITY.md`, `docs/ALGORITHMS.md`, `docs/VIVA_QA.md`, `docs/HARDWARE_BONUS.md`, `docs/BOM.md`, `docs/ACCEPTANCE_MATRIX.md`, `README.md` gốc. Không đụng `docs/TEST_RESULTS.md` (T8 viết).

1. `REQUIREMENTS.md`: thêm R18 Vision (và dòng "camera chỉ là hướng phát triển" phải sửa lại cho khớp). `IMPLEMENTATION_CONTRACT.md`: thêm mục Vision (topic, payload, luật, fail-open, field ticket mới).
2. `ARCHITECTURE.md`: cập nhật sơ đồ tầng Physical thêm camera, thêm sequence "khách bỏ đi" và "xác minh nhân viên đến" dạng mermaid.
3. `SECURITY.md`: chỉ truyền số đếm, không lưu ảnh, không nhận diện khuôn mặt hay danh tính, camera xử lý tại biên, đề xuất biển báo thông báo cho khách, và rủi ro (giả mạo topic vision, vì public broker không có auth).
4. `ALGORITHMS.md`: thêm các luật ở mục 2 với ngưỡng và lý do fail-open.
5. `VIVA_QA.md`: thêm câu hỏi dự kiến (vì sao không dùng ảnh, camera hỏng thì sao, độ chính xác đếm người, khác gì AI, riêng tư, chi phí).
6. `HARDWARE_BONUS.md` và `BOM.md`: phương án triển khai thật. Một camera ESP32-S3 (OV2640, PSRAM) cho mỗi khu hoặc cho cả cửa hàng, ước tính chi phí ghi là ước tính và phải kiểm tra lại giá thực tế. ESP32-CAM AI-Thinker rẻ hơn nhưng nhận diện người rất chật.
7. `ACCEPTANCE_MATRIX.md`: thêm AC41 trở đi cho các luật vision, trạng thái phải khớp thực tế (PASS chỉ khi T3/T6 thật sự chạy; webcam thật là MANUAL nếu chưa chạy).
8. `README.md` gốc: thêm một đoạn ngắn và đường dẫn tới `vision/README.md`, cập nhật dòng "Đã kiểm thử" ở T8 sau khi có số liệu.

### T8 — Nghiệm thu cuối (chạy sau khi T1–T7 xong)

Một agent độc lập, không phải agent đã code, thực hiện:

1. `npm ci && npm test` trong `node-red/`: tất cả PASS, ghi số test thực tế.
2. Khởi động broker local, Node-RED local, chạy `node tools/mqtt_scenario_test.js all` (phải 6/6), `node tools/browser_smoke_test.js static` và `controls`.
3. Chạy `python tools/repository_audit.py` và `python tools/final_acceptance_check.py`, sửa danh sách deliverable kiểm tra nếu chúng đếm cứng số file hay số test (ví dụ 49 hay 5 kịch bản).
4. Kiểm tra link tương đối trong docs không bị gãy, không có token hay secret trong repo.
5. Kiểm tra hồi quy: vòng đời ticket cũ (REQUEST, ACK, ARRIVED, DONE, CSAT) với `VISION_ENABLED=false` cho kết quả y hệt trước đây.
6. Cập nhật `docs/TEST_RESULTS.md` bằng số liệu **thật** vừa chạy. Mục không chạy được (webcam thật, ESP32-S3 thật, Wokwi) ghi MANUAL hoặc NOT RUN, không suy ra PASS.
7. Báo cáo cuối: danh sách file đổi, kết quả từng lệnh, các mục còn lại.

## 5. Phân công sub-agent đề xuất

| Đợt | Chạy song song | Agent | File sở hữu |
|---|---|---|---|
| 1 | T0 | Agent A (core) | `lib/vision.js`, `lib/ticket-engine.js`, `lib/config.js` |
| 1 | T3 | Agent B (test) | `test/vision*.test.js` |
| 1 | T5 | Agent C (python) | `vision/` |
| 2 | T1 | Agent A | `runtime.js`, `settings.js`, `flows.json`, `.env.example` |
| 3 | T2 | Agent A | `snapshot()`, REST |
| 3 | T6 | Agent D (integration) | `tools/` |
| 3 | T7 | Agent E (docs) | `docs/`, `README.md` |
| 4 | T4 | Agent F (frontend) | `application/` |
| 5 | T8 | Agent G (verify, độc lập) | chỉ `docs/TEST_RESULTS.md` |

Quy tắc phối hợp:

- Mỗi agent chỉ sửa file thuộc quyền sở hữu. Cần đổi file của agent khác thì báo lại người điều phối.
- Hai chỗ dễ đụng nhau là `ticket-engine.js` (T0, T2 cùng một agent để tránh xung đột) và `flows.json` (chỉ T1 được sửa). Sửa `flows.json` bằng script hay chỉnh tay đều phải giữ JSON hợp lệ, vì `repository_audit.py` kiểm tra 12 tab và không có cạnh lỗi.
- Đổi contract (mục 2) phải thông báo cho cả T3, T5, T6, T7.
- Mỗi agent tự chạy test của phần mình trước khi báo xong và báo lại **kết quả lệnh thật**, không báo "chắc là chạy".
- Dự án không phải git repo, nên trước khi bắt đầu hãy sao lưu thư mục (hoặc `git init` và commit baseline) để quay lại nếu một agent làm hỏng.

## 5b. Điều phối: Sonnet 5.5 làm controller, Codex làm sub-agent

**Sonnet 5.5 (controller)** không tự code. Nó đọc file này, giao việc, kiểm tra và quyết định bước tiếp theo. **Các sub-agent Codex** mới là bên sửa file và chạy test.

### Vai trò của controller

1. Đọc toàn bộ file này và `docs/IMPLEMENTATION_CONTRACT.md` trước khi giao việc đầu tiên.
2. Chạy `npm test` trong `node-red/` để lấy baseline trước khi giao việc (phải 49/49 PASS), rồi sao lưu thư mục hoặc `git init` và commit baseline.
3. Giao việc theo từng đợt ở mục 5. Chỉ mở đợt sau khi đợt trước qua cổng kiểm tra bên dưới.
4. Không cho hai agent cùng sở hữu một file. Khi có xung đột, controller là người quyết định.
5. Là nơi duy nhất được đổi contract ở mục 2. Mỗi lần đổi, controller thông báo lại cho T3, T5, T6, T7 bằng một tin nhắn ngắn nêu rõ chỗ đổi.
6. Tự chạy lại lệnh kiểm thử sau mỗi đợt. Không tin lời báo "xong" của sub-agent nếu chưa có output lệnh thật.

### Mẫu prompt giao việc cho mỗi sub-agent Codex

```
Task: <T-số và tên>
Đọc trước: docs/VISION_PLAN.md (mục 0, 2 và task của bạn), docs/IMPLEMENTATION_CONTRACT.md.
File bạn được sửa: <danh sách>. Không sửa file khác; nếu cần, dừng và báo lại.
Làm: <các bước của task>.
Bắt buộc: giữ phong cách code hiện tại, không phá test cũ, fail-open, không lưu hay gửi ảnh.
Kiểm tra: chạy <lệnh>, dán output thật vào báo cáo.
Báo cáo gồm: file đã đổi, lệnh đã chạy kèm kết quả, điểm chưa chắc, việc còn lại.
```

### Cổng kiểm tra giữa các đợt

| Sau đợt | Controller phải xác nhận |
|---|---|
| 1 | `npm test` PASS gồm test vision mới; `python vision/simulate.py --dry-run` chạy được; lỗi T0 (nếu có) đã sửa |
| 2 | Node-RED khởi động không lỗi, `flow-health` 200, vẫn đúng 12 tab, `flows.json` hợp lệ |
| 3 | `GET /api/iot58/state` có `vision`; kịch bản `vision` PASS; kịch bản cũ vẫn PASS |
| 4 | `browser_smoke_test.js static` và `controls` PASS, không lỗi JS |
| 5 | Agent nghiệm thu độc lập báo cáo; controller đối chiếu số liệu với `TEST_RESULTS.md` |

### Xử lý khi sub-agent thất bại

- Test đỏ: controller yêu cầu cùng agent sửa, tối đa 2 vòng. Sau đó controller tự đọc lỗi, xác định nguyên nhân gốc rồi giao lại với chỉ dẫn cụ thể.
- Agent sửa file ngoài quyền sở hữu: hoàn tác phần đó, giao lại với nhắc nhở phạm vi.
- Hai agent mâu thuẫn contract: dừng cả hai, controller chốt một phương án rồi thông báo.
- Không bao giờ ghi PASS trong tài liệu khi chưa có lệnh chạy thật.

### Báo cáo của controller cho người dùng

Sau mỗi đợt: một bảng ngắn gồm task, trạng thái, lệnh đã chạy, kết quả thật. Cuối cùng: danh sách file đổi, số test, các mục MANUAL hoặc NOT RUN, và những quyết định controller đã tự chọn.

## 6. Tiêu chí hoàn thành

- `npm test`: toàn bộ PASS (49 cũ cộng test mới, không bị skip).
- 6/6 kịch bản MQTT PASS, Dashboard static và controls PASS.
- Camera tắt hay mất tín hiệu thì hệ thống chạy y hệt phiên bản trước.
- Không có ảnh nào được ghi hay gửi đi ở bất kỳ phần nào.
- Tài liệu và `TEST_RESULTS.md` khớp số liệu thực, mục chưa chạy ghi đúng MANUAL hoặc NOT RUN.
