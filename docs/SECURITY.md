# Security baseline

## Classroom demo

Demo mặc định dùng public broker anonymous, không có customer identity hoặc dữ liệu cá nhân. BASE chung giúp copy/run; trước live demo, đổi `MQTT_BASE_TOPIC` sang namespace riêng khó đoán ở cả firmware và Node-RED.

Namespace ngẫu nhiên không thay authentication. Traffic public broker có thể bị nghe hoặc chèn payload; chỉ gửi dữ liệu giả lập của đồ án.

## Các bảo vệ đã triển khai

- Validate JSON schema, known device/state, topic/device/zone match và giới hạn độ dài payload/body.
- Dedup TTL, spam lock, rate limit REST, invalid transition audit; DONE bắt buộc ARRIVED.
- Telegram chat allowlist và kiểm tra staff ownership.
- POST cùng origin; cấu hình `API_TOKEN` tùy chọn bảo vệ mutation bằng Bearer token.
- Dashboard render dữ liệu server bằng textContent, không chèn HTML từ payload.
- Secrets đọc từ environment / `.env`, không ghi vào audit hoặc source. `.gitignore` loại trừ `.env`, credentials, context và runtime logs. `.env.example` có token rỗng.

Khi API_TOKEN được bật, nhập token qua mục quyền điều khiển cuối Dashboard. Token chỉ giữ trong bộ nhớ trang và gửi ở Authorization cho POST; không ghi URL hoặc localStorage. Bản demo chưa có đăng nhập / RBAC đầy đủ.

## Production

Dùng private broker, MQTTS/TLS và xác thực certificate server. Mỗi node có username/password riêng; client certificate là lựa chọn bổ sung. ACL chỉ cho node publish event/status của chính nó và subscribe command của chính nó. Chỉ middleware có quyền publish queue/display/system/cmd.

Bổ sung firewall, VLAN IoT, HTTPS, Dashboard login/RBAC, Node-RED adminAuth, secrets manager hoặc environment, rotation credentials và rate limit theo identity. Giới hạn persistent storage, rotate audit và backup state cho vận hành dài hạn.

Không mở Node-RED editor ra Internet với cấu hình demo mặc định. API_TOKEN đơn lẻ không thay HTTPS, user authentication hoặc broker ACL.

## Camera (vision)

- Camera xử lý tại biên: chỉ đếm người theo khu A/B/C và gửi số nguyên `persons` qua `BASE/vision/{zone}`. Không gửi ảnh, không gửi video, không gửi thông tin nhận diện.
- Không ghi ảnh ra đĩa trong `vision/publisher.py`. Khung hình chỉ nằm trong bộ nhớ của một vòng lặp. Đây là điều kiện thiết kế; mới chỉ rà soát mã nguồn, chưa có kiểm thử tự động cho việc này (xem AC60 trong ACCEPTANCE_MATRIX).
- Không nhận diện khuôn mặt, không nhận diện danh tính, không gắn số người với khách cụ thể. `camera_id` chỉ là nhãn thiết bị.
- Server chỉ chấp nhận JSON theo schema: zone khớp topic, `persons` là số nguyên 0..50, `camera_id` đúng định dạng, payload không quá `PAYLOAD_MAX_BYTES`. `confidence` và `ts` chưa được server kiểm tra.
- Đặt camera hướng vào khu quầy, không hướng vào màn hình hay lối đi khác. Nếu dùng webcam laptop, không để laptop ghi hình hoặc lưu clip.
- Đề xuất biển thông báo tại khu vực: "Khu vực này có camera đếm người. Hệ thống không lưu hình ảnh và không nhận diện khuôn mặt." Đây là lưu ý cho triển khai thật, chưa được in hay đặt thực tế trong đồ án.

Rủi ro: topic `vision` nằm trên public broker không xác thực. Kẻ tấn công có thể giả mạo `persons=0` để làm ticket bị hủy (`ABANDONED_VISION`) hoặc giả mạo `persons>=2` để làm `arrival_verified=true`. Schema check không chống được giả mạo nguồn. Fail-open chỉ bảo vệ khi camera im, không bảo vệ khi camera giả. Khi tắt camera bằng `VISION_ENABLED=false`, mọi reading bị bỏ qua. Production cần ACL để chỉ node camera của khu đó được publish `vision/{zone}`, và nên có xác thực phía broker.

## Telegram

BotFather token chỉ đặt trong `node-red/.env`. Chat ID manager/group/staff phải allowlist; không tin username. Token rỗng làm Telegram DISABLED an toàn, Dashboard vẫn dùng được.

Staff chỉ DONE ticket được giao; manager override đi qua đường phân quyền rõ ràng. Không log URL chứa token từ Telegram HTTP API. Nếu token lộ, revoke ở BotFather rồi thay token và restart.

## Giới hạn

`events.jsonl` append-only ở tầng application, không phải tamper-proof log. msg_id chống trùng, không xác thực nguồn phát. Persistence file không phải database HA; production cần backup, monitor và kiểm thử restore.

Tham khảo: [Node-RED securing runtime](https://nodered.org/docs/user-guide/runtime/securing-node-red), [Telegram Bot API](https://core.telegram.org/bots/api).
