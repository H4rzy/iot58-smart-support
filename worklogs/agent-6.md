# Role6 — QA (Lead + application/embedded workers)

- Inspected: sharedcontract,firmwarepin/payloadbound,coreingest/dedup/persist/dispatch,time,Telegramallowlist,API,responseinvariants.
- Changed: tools/package.json,local_broker.js,mqtt_scenario_test.js,demo_reset.js,README.md,mosquitto.conf,docker-compose.local.yml,TEST_PLAN/TEST_RESULTS/ACCEPTANCE_MATRIX.
- Actualtests: npmtest;5MQTTintegration scenarios viarealAedes+Node-RED+REST;Chromebrowserstatic/controlsbyapplicationworker;PlatformIOcompile/Wokwiruntimebyembeddedworker.
- Bugsreported/fixed: partialenvtopicnotexpanded;fractionalmonotonicmsvsISO;prematureL1whilenextstaffreserved;receiptbeforepersist;retainedreceiptvs snapshot;unknownTelegramchatwithknownuser;largeOLEDdisplaypayload;stale ticketcontext;UIoldestalerts. ScenarioassertracefixedwithboundedMQTTwait.
- NoMQTTmockforintegration. Telegramfetchmockslabeled,pendingliveaccountcheck. Wokwibrowserresults recordedbyembedded,notinferredfromJSmodule tests.
- Knownissues: actualfinalverificationanddependencyadvisories listedTEST_RESULTS;externaltoken/productionauth/hardwarebonus outsidelocalautomation.

## Kiểm tra tích hợp cuối ngày 2026-10-10

- Lead sửa Runtime.flush để lưu ACK từ Telegram callback trước downlink; kiểm tra DONE staff_id sai kiểu trả 400.
- Embedded browser phát hiện CSAT command flood: countdown tạo lệnh và durable CMD_APPLIED mỗi giây. Signature chỉ giữ nội dung điều khiển; forced reconnect vẫn gửi timer hiện tại. Thêm regression thực cho CSAT, spam và expiry.
- Chạy lại 49 unit/runtime/mock tests: PASS, 0 fail, 0 skip. Chạy 5 MQTT scenarios trên runtime cô lập port1881/local Aedes1883: PASS. Chrome controls sau sửa: PASS, không JS fatal.
- Runtime public1880 khởi động với patch và kết nối HiveMQ; dành riêng cho physical Wokwi QA, không bị reset bởi local batch.

## Nghiệm thu cuối

- Đọc JSON/serial Wokwi và xem ảnh thật; A/B priority, BLUE riêng B, physical ARRIVED/CSAT, C cancel, A spam/L1/L2 PASS. Offline Wi-Fi/MQTT disconnect, physical A/B rồi LittleFS flush/reboot tạo đúng2 tickets FIFO cùng msg_id.
- Tính lại delivery/test overlay hashes, xác minh chỉ bật diagnostics để gây lỗi; firmware bàn giao defaultfalse.
- Công cụ final_acceptance_check đối chiếu actual artifacts, canonical response/service/EWMA và7 live APIs:39 PASS +1 MANUAL conditional Telegram live; runtime public MQTT connected, ba device READY, queue sạch.
- Static repository audit cuối10 checks PASS; links không bị thiếu, không có token trong deliverable. Đọc lại toàn bộ worklogs và cập nhật report/rubric/checklist/evidence với kết quả thực.
