# Full demo — khoảng 7 phút

Kịch bản chính tại [DEMO_SCRIPT_FINAL](DEMO_SCRIPT_FINAL.md).

Checklist thao tác: RESET → staff BUSY → A short → B long → NV02 AVAILABLE → timeout → ACK → physical ARRIVED → DONE → CSAT → C cancel → spam → virtual forecast → analytics.

Bổ sung reassignment: RESET giữ KPI, NV01/NV03 AVAILABLE và NV02 OFFLINE; A short, không ACK. Sau khoảng 8s, NV01→NV03; hết lượt tiếp tục L1/L2.

Có thể dành phần cuối cho mất MQTT / reconnect: ngắt broker hoặc kết nối Wi-Fi, quan sát orange offline và buffer; khôi phục kết nối, xác nhận replay giữ msg_id và không tạo duplicate. Chỉ dùng khi đã kiểm chứng trước buổi demo; không làm broker public ngắt giữa lượt của nhóm khác.

Không reset khi automated scenario đang chạy. SLA dùng thời gian thực; clock ảo chỉ forecast. Giữ KPI ở các reset sau lifecycle để cuối demo còn dữ liệu response / CSAT / AHT.
