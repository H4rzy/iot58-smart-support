# Webcam Dashboard — 2026-10-31

- User chọn webcam laptop trên Dashboard, xem/chụp ảnh gắn ticket, camera tùy chọn.
- Inspected: frontend-design skill; index/app/styles; runtime API; existing vision modules/config/publisher README/security. Repository hiện có vision counting; giữ nguyên phần đó.
- Changed: application/index.html, camera.js, app.js state/offline events, styles.css; README/application/security/test/tools/evidence docs; webcam_smoke_test.js và actual browser results.
- Decision: browser-local JPEG IndexedDB theo ticket_id; không upload ảnh vào public broker/server, không ảnh hưởng state engine hoặc ARRIVED. Video only và user gesture opt-in, stop/pagehide release tracks, bounded20 ảnh, replace/evict/delete/clear, precise local-only labels.
- Verification:95 core tests PASS; syntax checks PASS; browser fake-device checks PASS. Chưa dùng webcam vật lý hoặc chạy lại Wokwi E2E trong lần này. Không thay evidence lịch sử bằng fixture/screenshot giả.
- Live Node-RED khởi động với cấu hình broker hiện có, flows load và MQTT connected. Chrome mở Dashboard localhost1880 thật, API connected, camera controls có mặt, camera.js HTTP200, không JS fatal; không xin quyền camera hoặc mutate server. Static repository audit10 checks PASS.
- Run: npm start tại node-red; mở localhost1880, tạo/chọn ticket, bật webcam/cho phép quyền/chụp. Nếu chạy vision Python đồng thời camera có thể đang bị chiếm; tắt publisher trước để demo webcam browser.
- Limitation: ảnh chỉ trên cùng browser origin, không chia sẻ cho staff khác; localhost/HTTPS required; reset không xóa ảnh cục bộ; user cần tự lưu hoặc xóa ảnh.
