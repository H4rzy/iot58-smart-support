# Agent 2 — Embedded / Wokwi

## Files inspected

- `docs/IMPLEMENTATION_CONTRACT.md`, prototype `wokwi-demo/sketch.ino`, `diagram.json`, README và scripts demo V1 (đã backup `legacy/wokwi-demo-v1/`).
- `node-red/lib/ticket-engine.js` phần receipt/command; contract đã trao đổi trực tiếp với Agent3.
- Wokwi official docs: NeoPixel DIN/VDD/VSS, SSD1306 SDA/SCL, pushbutton contacts, buzzer và diagram format; CLI0.28.1.

## Files changed

- Thay `wokwi-demo/sketch.ino`, `diagram.json`, `libraries.txt`, README; thêm `platformio.ini`, `wokwi.toml`, `partitions.csv`, `test_gestures.py`, `browser-probe.cjs`.
- Loại hai scripts demo V1 khỏi thư mục active; bản gốc còn trong legacy.
- Toolchain Python venv task-local `.build-tools/` (ignored); firmware binary/ELF `.pio/` (ignored).

## Decisions

- Three logical kiosks, GPIO18/19/23 buttons, GPIO25 → NeoPixel A.DIN → B.DIN → C.DIN qua DOUT; một controller3 pixel với index0/1/2 riêng. OLED21/22, buzzer13.
- Đã thấy lỗi RMT aliasing thực tế trên Wokwi với ba controller GPIO25/26/27: ACK B làm cả ba LED blue. Lead chấp thuận đổi daisy-chain; ảnh chạy mới xác nhận A vàng/B xanh dương/C dim riêng. Production mỗi node có một pixel.
- FreeRTOS worker sở hữu PubSubClient và ghi LittleFS: TCP/DNS/flash wait không chặn logic gesture/LED/OLED. Loop dùng scheduler tick ngắn; business timing millis. Mutex chỉ copy snapshot; worker ghi flash rồi publish. Flash failure postpones publish để không giả định durability.
- ESP32 WiFiClient `setTimeout` dùng giây; đã sửa2000→2 (lỗi thật phát hiện live MQTT). Queue và receipts sau fix đã xuất hiện trên direct public MQTT monitor.
- LittleFS48 FIFO, snapshot/tmp/backup; unique boot+sequence msg_id, receipt sau server ingest mới xóa FIFO head. Schema-valid transition rejects cũng có receipt; CMD_APPLIED dùng lastCmdId tránh loop.
- LWT simulator chung, DEVICE_SYNC reconnect; production mỗi nodeLWT riêng được document.
- Downlink validate schema/topic/device/state/size; flash hỏng không tự format dữ liệu tồn tại, RAM fallback log rõ.
- Sourceoftruth server; ACK/DONE chỉ Application,physicalbutton STAFF_ARRIVED/CSAT.

## Tests run

- `.../python.exe -m platformio run --project-dir wokwi-demo`: PASS Espressif32 6.12.0, ArduinoESP32core2.0.17. Final RAM94872/32768029%; flash866933/131072066.1%. Fixed ino conversion filter and Note declaration preprocessor compile issue. Final compile log `evidence/firmware-compile.txt`, delivered diagnostics=false.
- `wokwi-cli.exe lint wokwi-demo`: PASS exit0,0errors/0warnings;1 info official DevKitC partundocumented inregistry.
- `python wokwi-demo/test_gestures.py`: PASS14 actualfirmwarefunctioncases: short,long boundaries,invaliddeadzone,bounce,doublecancel,arrival,CSAT,milliswrap,spamlock/window,legitimateactions exemptspam.
- Browser Playwright isolated Chrome anonymous new ESP32: source compiled, simulation started, three physical buttons/NeoPixels rendered, OLED powered, Wi-Fi/Public MQTT online.
- **Final real browser E2E PASS**: A physical short CONSULTATION, B physical long PAYMENT, global queue B>A, dispatch NV02, REST ACK downlink + independent BLUE B, invalid DONE409, physical B ARRIVED response9705ms vs ACK latency549ms, REST DONE + GREEN B, physical SATISFIED, C physical double CANCEL, A physical spam lock. Waiting A naturally escalated L1/L2. Final B AHT84.0387s=0.3×0.129+0.7×120. Serial/state saved `evidence/wokwi-e2e-results.json`; real images `wokwi-queue.png`, `wokwi-ack-blue.png`, `wokwi-resolved-csat.png`, `wokwi-final-spam.png`.
- **Final real offline/reboot PASS**: QA Serial O actually disconnects MQTT/TCP and Wi-Fi; physical A/B REQUEST stays local with zero server tickets. R flushes flash then ESP.restart in same Wokwi session. LittleFS restored5 events including outstanding control; replay created exactly2 tickets FIFO with original msg_ids `A01-0F8BC7CA-000016` / `B01-0F8BC7CA-000017`, no duplicates. `evidence/wokwi-offline-results.json` and two actual images retain provenance.
- Browser test source has only `ENABLE_SERIAL_DIAGNOSTICS=true` overlay to enable O/R; final source/binary defaultfalse. Delivery SHA256`00e7cc822fa6caffb025b8828c4cc160a74ac5b8abd090bfb05002afe3b27bea`; both delivery/tested hashes, thresholds and overlay recorded in JSON. Business logic unchanged. Browser simulation ~50–100% speed so wall gesture timing adjusted; contract uses simulation millis.
- Final14 host gesturecases and diagramlint PASS saved evidence/firmware-gestures.txt and wokwi-lint.txt. Browser QA script syntax check PASS.

## Resolved issues and actual limitations

- Browser template lacked spiffs partition; fixed with custom `partitions.csv` (bắt buộc file thứ4 khi upload browser), confirmed blankformat+saved3DEVICE_SYNC without persistence errors. Serialmonitor wires added.
- Middleware once sent a fresh cmd for each CSAT/lock countdown second, causing durable CMD_APPLIED outbox backlog and CSAT expiry. Lead/core excluded countdown-only changes from semantic command signature, retained forced sync/expiry commands; firmware drains bounded12 MQTT packets before another flash snapshot. Actual CSAT now passed, no command loop.
- Cancel QA originally read serverPENDING before firmware downlink and performed repeated locator round-trips within double timing. QA now waits deviceCMD_APPLIED PEND, resolves coordinates once,250mswall hold/100msgap/250mswall hold; actual C CANCEL passed without altering firmware800/1500/400ms thresholds.
- Public HiveMQ initial connect may time out/retry (observed state-4); successful tests used publicbroker and application receipts. Recheck Internet before demo. Anonymous browser project was not permanently saved to account; four source files are reproducible setup, not a claimed hosted permalink.
- Wokwi stop/new browser session is not guaranteed flash persistence; test used actual ESP.restart preserving sameflash. Wi-Fi icon offers PCAP rather than network toggle; optional default-disabled serial diagnostics documented for repeatable fault injection only.
- Hardware actualoptional/notconnected; no hardwareclaim.
