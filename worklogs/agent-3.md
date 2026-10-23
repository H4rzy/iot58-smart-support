# Agent 3 – Middleware / REST / Telegram

- Inspected: shared implementation contract, original repository inventory, analytics.js/forecast.js interfaces, MQTT embedded receipt requirements.
- Changed: node-red/package.json + package-lock; settings.js; 12-tab flows.json; .env.example; lib/config/utils/priority/dispatch/validation/ticket-engine/runtime/telegram; data/staff.json; core, runtime and Telegram tests; README.
- Decisions: tested CommonJS modules exposed via functionGlobalContext; real MQTT nodes + full topic env substitution; actual HTTP in route registrations required for httpNodeMiddleware; deterministic staff reservation and no duplicate staffing; physical ARRIVED primary response; server-monotonic integer epoch timing; atomic snapshot backup before application receipt; transient receipts, retained snapshots; CMD_APPLIED same ID receipt avoids firmware FIFO stall; bounded input/rate and Telegram allowlist; offline queue remains embedded concern.
- Tests: npm install successful; Node-RED4.1.16 launched, no missing nodes,12 tabs; real public HiveMQ connected; health/state and flow-health HTTP200; local broker127.0.0.1 connection verified. Core33 tests initially passed; 47 tests passed after runtime tests added for durable recovery and REST security. Lead runs complete scenario tools.
- Fixes during integration: partial topic env substitution replaced with MQTT_EVENTS_TOPIC; fractional monotonic milliseconds floored to match canonical ISO arithmetic; genuine suspicious press counting; no spam deadline extension; HTTP rejected commands audit; reset speed1; UI_HOST for Docker; L1 exhaustion only when no pending assignment; reset_demo snapshot flag clears old embedded FIFO.
- Dependency audit: initial21 vulnerabilities in bundled npm10.9.9; compatible npm11.21.0 override reduces to5(2moderate/3high). No unsafe force upgrades.
- Known issues: real Telegram token not provided, live send/callback requires final manual verification. Wokwi browser handled embedded/Lead. Residual installer advisories documented, production package update required.

- QA followup: Telegram chat allowlist now checked independently of staff user identity; known staff in unknown chat rejected. Five enabled mock tests cover staff ACK/DONE, premature/wrong-staff DONE, group user mapping, unknown chat, manager override. No real token/network.47 tests pass; Lead reports all5 local MQTT scenarios PASS.

- Final OLED integration: display payload projected to compact top_ticket plus state-only device summaries; regression verifies below768 bytes despite large audit history. Public HiveMQ restarted with new Telegram/summary patches;47 tests pass.

- Final reliability followup: optional ticket_id is validated and contextual ARRIVED/CANCEL/CSAT rejects stale ticket bindings409. CMD_APPLIED now appended audit without generating a new command ID. Two regressions added;47 tests pass. Browser-live middleware restart deferred until embedded completes.

- Untrusted MQTT reserved msg_id keys __proto__/constructor/prototype now rejected400 before plain-object dedup indexing; regression confirms no ticket/cache mutation.47 tests pass. Core edits finalized for Lead formatting/review.

## Lead core fixes sau handoff

Runtime.flush lưu callback ACK trước downlink; DONE staff_id sai kiểu trả400; bỏ countdown-only values khỏi semantic command signature để tránh durable CMD_APPLIED flood trong Wokwi. Hai regressions bổ sung đưa tổng test cuối49/49 PASS. Năm MQTT scenarios và Chrome controls chạy lại PASS. Wokwi physical E2E và offline/reboot PASS, source hashes và KPI/FIFO được cross-check thật.
