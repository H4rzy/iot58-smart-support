# Kiến trúc bốn tầng

Thiết bị càng đơn giản càng tốt, phần thông minh nằm ở middleware. Trong simulation, một ESP32 được sử dụng để mô phỏng ba logical customer-point nhằm demo hàng đợi trên một project Wokwi. Khi triển khai thật, mỗi điểm gọi là một ESP32-C3 độc lập.

```mermaid
flowchart TD
 subgraph L1[1 Sensing / Physical]
  A[A01 Button + WS2812]
  B[B01 Button + WS2812]
  C[C01 Button + WS2812]
  E[ESP32 simulation + OLED + buzzer]
  A --> E
  B --> E
  C --> E
  K[Camera A/B/C optional: webcam demo, ESP32-S3 planned]
 end
 subgraph L2[2 Network / Connectivity]
  W[Wi-Fi]
  M[MQTT Broker]
  W <--> M
 end
 subgraph L3[3 Middleware]
  N[Node-RED ingest + validate + dedup]
  Q[Global Queue + State + Priority]
  D[Dispatch + SLA + Reassignment]
  S[EWMA + ETA + Overload + Forecast]
  V[Vision rules: fail-open, abandon, verify, assist]
  P[Persistent state + Audit JSONL]
  N --> Q
  Q <--> D
  Q --> S
  Q <--> V
  Q --> P
 end
 subgraph L4[4 Application]
  UI[Web Dashboard + REST]
  T[Telegram optional]
 end
 E <--> W
 K -->|BASE/vision/zone counts only| M
 M <--> N
 Q <--> UI
 D <--> T
 S --> UI
 UI -->|ACK / DONE| Q
 T -->|Allowlisted callback| Q
 Q -->|MQTT cmd / display| M
```

## REQUEST uplink

```mermaid
sequenceDiagram
 participant Customer
 participant ESP as ESP32 A01
 participant MQTT
 participant NR as Node-RED
 participant UI as Dashboard
 Customer->>ESP: Short press <800 ms
 ESP->>ESP: Debounce, persistent event msg_id
 ESP->>MQTT: cp/A01/event REQUEST
 MQTT->>NR: schema + topic/id validation
 NR->>NR: Dedup, create ticket, priority, dispatch
 NR->>MQTT: cp/A01/cmd PENDING + receipt
 MQTT->>ESP: Yellow LED, receipt removes FIFO head
 NR-->>UI: GET state polling, queue + ETA
```

## ACK downlink

```mermaid
sequenceDiagram
 participant Staff
 participant App as Dashboard / Telegram
 participant NR as Node-RED
 participant MQTT
 participant ESP
 Staff->>App: ACK selected ticket
 App->>NR: POST ack staff_id / allowlisted callback
 NR->>NR: Validate state + staff availability
 NR->>MQTT: cp/B01/cmd ACKNOWLEDGED
 MQTT->>ESP: BLUE + acknowledgement tone
 ESP->>MQTT: CMD_APPLIED cmd_id
 MQTT->>NR: Audit command applied
 NR->>MQTT: Transient receipt, same cmd_id
 MQTT->>ESP: Remove CMD_APPLIED from FIFO; no new command
```

## ARRIVED và DONE

```mermaid
sequenceDiagram
 participant Staff
 participant Customer
 participant ESP
 participant NR as Node-RED
 participant App
 Staff->>ESP: Physical press after ACK
 ESP->>NR: MQTT STAFF_ARRIVED
 NR->>NR: ACKNOWLEDGED → ARRIVED
 NR->>NR: response = arrived_at - created_at
 NR-->>ESP: cmd ARRIVED (cyan)
 Staff->>App: DONE
 App->>NR: POST done
 NR->>NR: ARRIVED → RESOLVED; service; EWMA
 NR-->>ESP: RESOLVED / CSAT window green
 Customer->>ESP: Short/long rating
 ESP->>NR: CSAT satisfied/unsatisfied
 NR-->>ESP: READY; or timeout 15s
```

## SLA escalation

```mermaid
sequenceDiagram
 participant Clock as Real clock scanner
 participant NR as Dispatch engine
 participant S1 as First staff
 participant S2 as Next staff
 participant Group
 participant Manager
 Clock->>NR: ACK timeout (demo 8s / normal 30s)
 NR->>S1: Release reservation; attempt recorded
 NR->>S2: Reassign eligible untried staff
 Clock->>NR: No ACK / exhausted attempts
 NR->>Group: ESCALATED_L1
 Clock->>NR: L2 waiting threshold
 NR->>Manager: ESCALATED_L2
 NR-->>NR: Priority +40; MQTT red fast blink
```

## Vision: khách bỏ đi

Chỉ áp dụng khi `VISION_ENABLED=true` và camera đang tươi. Nếu camera im quá `VISION_STALE_SECONDS`, luật không chạy và ticket giữ nguyên.

```mermaid
sequenceDiagram
 participant Customer
 participant ESP as ESP32 A01
 participant Cam as Camera A
 participant NR as Node-RED
 participant MQTT
 participant UI as Dashboard
 Customer->>ESP: Short press
 ESP->>NR: REQUEST A01
 NR->>NR: presence_verified from last reading
 Cam->>MQTT: vision/A persons=1 each 1 s
 Customer->>Customer: Leaves the zone
 Cam->>MQTT: vision/A persons=0 heartbeat
 MQTT->>NR: validate, apply reading, empty_since set
 NR->>NR: Empty for abandon seconds since ticket created
 NR->>NR: cancel with ABANDONED_VISION, release staff
 NR->>MQTT: alert TICKET_ABANDONED
 NR-->>ESP: device CANCELLED 1.5 s then READY
 NR-->>UI: queue without the ticket
```

## Vision: xác minh nhân viên đến

Camera không chặn ARRIVED. Kết quả chỉ được gắn cờ trên ticket và alert.

```mermaid
sequenceDiagram
 participant Staff
 participant ESP as ESP32 B01
 participant Cam as Camera B
 participant NR as Node-RED
 participant MQTT
 Staff->>ESP: Physical press after ACK
 ESP->>NR: STAFF_ARRIVED
 NR->>NR: Read camera B state at arrival time
 alt camera stale
  NR->>NR: arrival_verified = null
 else two or more people
  NR->>NR: arrival_verified = true
 else fewer than two people
  NR->>NR: arrival_verified = false
  NR->>MQTT: alert ARRIVAL_UNVERIFIED
 end
 NR->>NR: ACKNOWLEDGED to ARRIVED, always succeeds
 NR-->>ESP: ARRIVED cyan
 Cam->>MQTT: vision/B persons heartbeat
```

Camera chỉ có số người, không có ảnh. Demo hiện tại dùng webcam laptop qua `vision/publisher.py`; hướng ESP32-S3 nằm trong [HARDWARE_BONUS](HARDWARE_BONUS.md).

## State machine

```mermaid
stateDiagram-v2
 [*] --> READY
 READY --> PENDING: REQUEST
 PENDING --> ESCALATED_L1: timeout / exhaustion
 ESCALATED_L1 --> ESCALATED_L2: threshold
 PENDING --> CANCELLED: double
 ESCALATED_L1 --> CANCELLED: double
 ESCALATED_L2 --> CANCELLED: double
 PENDING --> ACKNOWLEDGED: Application ACK
 ESCALATED_L1 --> ACKNOWLEDGED: Application ACK
 ESCALATED_L2 --> ACKNOWLEDGED: Application ACK
 ACKNOWLEDGED --> ARRIVED: physical STAFF_ARRIVED
 ARRIVED --> RESOLVED: Application DONE
 RESOLVED --> CSAT_WAIT
 CSAT_WAIT --> READY: rating / expiry
 CANCELLED --> READY: temporary feedback
```

READY và CSAT_WAIT là device state, còn PENDING→RESOLVED/CANCELLED là ticket state. State diagram kết hợp hai lớp để minh họa hành trình khách. Ticket RESOLVED được giữ làm lịch sử ngay cả khi device đã về READY.

Offline và spam lock là overlay của thiết bị, không tự hủy ticket trên server. Node-RED gọi cùng module CommonJS đã được unit test qua functionGlobalContext; static Dashboard tại `/`, editor tại `/red`.

Context localfilesystem là lớp persistence của Node-RED. Runtime còn ghi atomic snapshot để recovery không đợi context flush, và append audit tại `events.jsonl`. Synthetic history chỉ dùng forecast; KPI Dashboard dùng ticket thực của phiên.

Firmware giữ outgoing FIFO trong LittleFS. Browser Wokwi cần upload `partitions.csv` cùng sketch, diagram và libraries; default partition của Wokwi không đủ bảo đảm LittleFS hoạt động.

SLA/aging dùng clock thực của runtime; virtual clock 1×/10×/60× chỉ điều khiển forecast. Response SLA KPI mặc định 120s, cấu hình riêng với assignment ACK timeout và escalation thresholds.

Tham khảo triển khai: [Node-RED runtime configuration](https://nodered.org/docs/user-guide/runtime/configuration), [persistent context](https://nodered.org/docs/user-guide/context), [Wokwi NeoPixel pins](https://docs.wokwi.com/parts/wokwi-neopixel), [Telegram HTTP API](https://core.telegram.org/bots/api).
