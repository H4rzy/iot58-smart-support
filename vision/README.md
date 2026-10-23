# Vision publisher (demo webcam)

Thành phần đếm người theo khu A/B/C và publish contract MQTT mục 2 của `docs/VISION_PLAN.md`:

```json
{"schema":1,"camera_id":"CAM-A","zone":"A","persons":2,"confidence":0.87,"ts":"2026-10-24T10:00:00.000Z"}
```

Topic: `{BASE}/vision/{A|B|C}`. Mặc định khớp `node-red/.env.example`: host `broker.hivemq.com`, port `1883`, base `huit/iot58/n20-smart-support/store/s1`.

- `publisher.py`: webcam laptop thật, OpenCV đọc khung hình, MediaPipe đếm người.
- `simulate.py`: không cần webcam, chỉ cần `paho-mqtt`. Dùng để demo và để T6 gọi.

**Đây là webcam laptop thay cho camera ESP32-S3.** Không được ghi là đã chạy trên ESP32-S3 thật.

## Quyền riêng tư

- Không ghi ảnh ra đĩa, không gửi ảnh qua mạng. Khung hình chỉ tồn tại trong bộ nhớ của một vòng lặp.
- Chỉ gửi số nguyên `persons` và `confidence` đã làm tròn 2 chữ số.
- `--show` chỉ mở cửa sổ xem trước trên máy, tắt mặc định.
- Khi camera không đọc được khung hình, script **không publish** số 0. Số 0 giả sẽ làm hệ thống tưởng khu trống.

## Cài đặt

Từ root repository (`.venv/` đã nằm trong `.gitignore`):

```powershell
python -m venv vision/.venv
vision/.venv/Scripts/python.exe -m pip install -r vision/requirements.txt
```

Chỉ chạy `simulate.py` thì chỉ cần `pip install paho-mqtt>=2,<3`.

Luôn chạy bằng `-I` và không chạy script từ thư mục không tin cậy:

```powershell
vision/.venv/Scripts/python.exe -I vision/publisher.py --help
```

Model: `vision/models/efficientdet_lite0.tflite` (khoảng 14 MB, không commit). Tải một lần:

```powershell
New-Item -ItemType Directory -Force vision/models | Out-Null
Invoke-WebRequest https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float32/latest/efficientdet_lite0.tflite -OutFile vision/models/efficientdet_lite0.tflite
```

Hoặc truyền `--model <đường dẫn>`.

## Chọn model: MediaPipe EfficientDet-Lite0 (không chọn YOLOv8n)

- MediaPipe Tasks chạy bằng TFLite trên CPU, không cần PyTorch. Cài nhẹ và chạy được trên laptop không có GPU.
- YOLOv8n qua `ultralytics` kéo theo PyTorch, phần phụ thuộc lớn hơn nhiều so với MediaPipe. Trọng số `.pt` nhỏ nhưng môi trường cài đặt thì không.
- `category_allowlist=["person"]` nên chỉ đếm người. `score_threshold` mặc định 0.5.
- Chưa benchmark tốc độ FPS trên máy cụ thể. Ghi FPS thực tế vào đây sau khi đo.

## Chạy

Chạy thử không broker (in payload, không publish):

```powershell
vision/.venv/Scripts/python.exe -I vision/publisher.py --dry-run --ticks 3
```

Publish thật lên broker local (chạy `node tools/local_broker.js` trước, rồi `--host 127.0.0.1`):

```powershell
vision/.venv/Scripts/python.exe -I vision/publisher.py --host 127.0.0.1 --port 1883
```

| Tham số | Mặc định | Ghi chú |
|---|---|---|
| `--host`, `--port` | `broker.hivemq.com`, `1883` | Mặc định là broker công khai như `.env.example`. Dùng `127.0.0.1` khi test để tránh gửi nhầm dữ liệu ra ngoài |
| `--base-topic` | `huit/iot58/n20-smart-support/store/s1` | Phải khớp `MQTT_BASE_TOPIC` của Node-RED |
| `--camera-index` | `0` | Số thứ tự webcam trong OpenCV |
| `--interval` | `1.0` | Giây giữa hai lần publish. Mỗi lần gửi cả 3 khu, kể cả khi số không đổi (heartbeat) |
| `--zones` | `equal` | `equal`, `draw`, hoặc `f1,f2` (xem dưới) |
| `--model` | `vision/models/efficientdet_lite0.tflite` | |
| `--score-threshold` | `0.5` | Điểm tối thiểu để tính một người |
| `--show` | tắt | Cửa sổ xem trước, `q` để thoát |
| `--dry-run` | tắt | In `topic payload`, không publish |
| `--ticks` | `0` (vô hạn) | Dừng sau N lần publish |

## Hiệu chỉnh vùng A/B/C

Khung hình được chia thành 3 cột theo chiều ngang. Người được gán vào khu theo tâm hộp bao (bounding box) của họ.

1. Chạy `vision/.venv/Scripts/python.exe -I vision/publisher.py --zones draw`. Cửa sổ hiện một khung hình.
2. Click hai lần để đặt hai đường chia (từ trái sang phải). Nhấn ENTER để in ra, ví dụ `--zones 0.350,0.700`. ESC để hủy.
3. Chạy lại với giá trị đó: `--zones 0.350,0.700`.

## Ngưỡng tin cậy

- `confidence` là **trung bình điểm detector** của những người trong khu đó, làm tròn 2 chữ số. Khu không có người thì gửi `0.0`.
- Đây không phải xác suất đã hiệu chỉnh. Không dùng để so ngưỡng cứng trong middleware nếu chưa đo lại.
- Muốn bớt đếm nhầm: tăng `--score-threshold` (ví dụ 0.6).

## Simulator (không cần webcam)

```powershell
vision/.venv/Scripts/python.exe -I vision/simulate.py --dry-run A=2,B=0,C=1
vision/.venv/Scripts/python.exe -I vision/simulate.py --host 127.0.0.1 A=2,B=0,C=1
vision/.venv/Scripts/python.exe -I vision/simulate.py --host 127.0.0.1 --duration 60 timeline.json
```

- `A=2,B=0,C=1`: khu không ghi thì bằng 0. Chạy liên tục, heartbeat mỗi `--interval` giây (mặc định 1), đến khi Ctrl+C hoặc hết `--duration`.
- File JSON: danh sách bước `{"at": giây, "A": n, "B": n, "C": n}` (hoặc `{"steps": [...]}`). Khu không ghi thì giữ giá trị trước đó, ban đầu là 0. Bước cuối được giữ đến hết.

```json
{"steps": [{"at": 0, "A": 2, "B": 0, "C": 1}, {"at": 10, "A": 0}, {"at": 20, "C": 3}]}
```

`--dry-run` không cần broker và không cần ngủ giữa các tick. Mặc định in 3 tick. Có `--duration` thì in đủ số tick tương ứng.

## Mã lỗi và xử lý sự cố

| Thông báo | Nguyên nhân |
|---|---|
| `model not found` | Chưa tải model, hoặc sai `--model` |
| `cannot open camera index N` | Sai `--camera-index`, hoặc webcam đang bị app khác dùng |
| `camera stopped delivering frames` | 10 khung hình liên tiếp lỗi. Không publish gì trong thời gian đó |
| `cannot connect to MQTT broker` | Sai host/port, hoặc broker chưa chạy |
| thoát với mã `2` | Tham số không hợp lệ |

## Kiểm chứng đã làm

- `python -I vision/simulate.py --dry-run A=2,B=0,C=1`: in 3 tick, 3 zone mỗi tick, không cần broker.
- `python -I vision/publisher.py --help`: chạy được không cần OpenCV hoặc MediaPipe.
- `simulate.py` publish vào `tools/local_broker.js`. Một subscriber Node đã kiểm tra mọi payload: `schema=1`, `zone` khớp topic, `camera_id` khớp regex, `persons` là số nguyên 0-50, `ts` hợp lệ.
- `publisher.py` đã chạy với webcam giả (khung đen), publish 3 tick về broker local, đúng contract.

## Chưa kiểm chứng

- Chưa đo độ chính xác đếm người trên ảnh có người thật, và chưa chạy webcam thật. Phát hiện người được kiểm tra bằng khung đen (0 người), chưa có ảnh có người.
- Chưa đo FPS hay độ trễ trên máy cụ thể.
- Chưa chạy trên ESP32-S3.
- Chưa tích hợp với Node-RED (T1 làm).

## Hướng triển khai thật (T7)

Camera ESP32-S3 không chạy Python. Hướng cần làm ở T7: đẩy đếm người lên thiết bị, hoặc để một máy gateway chạy `publisher.py` và cảm biến khác gửi tín hiệu về. Contract mục 2 giữ nguyên trong mọi trường hợp.
