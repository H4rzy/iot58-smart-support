// HUIT IoT 58: one simulator, three logical customer points. Server owns tickets.
#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_NeoPixel.h>
#include <LittleFS.h>
#include <Preferences.h>
#include <esp_system.h>
#include <esp_partition.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <freertos/semphr.h>

namespace Config {
const char *WIFI_SSID = "Wokwi-GUEST", *WIFI_PASSWORD = "";
const char *MQTT_HOST = "broker.hivemq.com";
const uint16_t MQTT_PORT = 1883;
// Must match MQTT_BASE_TOPIC in node-red/.env. Change to a unique class namespace.
const char *BASE_TOPIC = "huit/iot58/n20-smart-support/store/s1";
const char *MQTT_USER = "", *MQTT_PASSWORD = "";
const uint8_t BUTTON_PINS[] = {18, 19, 23}, LED_DATA_PIN = 25;
const uint8_t BUZZER_PIN = 13, SDA_PIN = 21, SCL_PIN = 22;
const uint32_t DEBOUNCE_MS = 50, SHORT_MS = 800, LONG_MS = 1500, DOUBLE_MS = 400;
const uint32_t SPAM_WINDOW_MS = 10000, SPAM_LOCK_MS = 30000;
const uint8_t SPAM_LIMIT = 5;
const uint32_t CSAT_MS = 15000, CANCEL_FEEDBACK_MS = 1200;
const uint32_t WIFI_RETRY_MS = 10000, MQTT_RETRY_MS = 5000, RECEIPT_RETRY_MS = 2000, STATUS_MS = 15000;
const uint8_t OUTBOX_CAPACITY = 48;
const size_t PAYLOAD_BYTES = 768, TOPIC_BYTES = 160, ID_BYTES = 80;
const uint32_t UI_UPDATE_MS = 80, DISPLAY_UPDATE_MS = 350, DISPLAY_ROTATE_MS = 3000;
// Optional QA fault injection via Serial O/R. Disabled in the delivered firmware.
const bool ENABLE_SERIAL_DIAGNOSTICS = false;
const uint32_t DIAGNOSTIC_OFFLINE_MS = 20000;
}

enum class LocalState : uint8_t {
  READY, PENDING, ACKNOWLEDGED, ARRIVED, RESOLVED, CANCELLED,
  ESCALATED_L1, ESCALATED_L2, CSAT_WAIT, SPAM_LOCK
};
struct Note { uint16_t frequency, duration; };
struct GestureDetector {
  bool raw = HIGH, stable = HIGH, waitingShort = false;
  uint32_t rawChangedAt = 0, pressedAt = 0, firstReleasedAt = 0;
};
// One daisy-chain avoids simulator RMT GPIO routing aliasing across three objects.
// Real independent customer nodes each use one pixel; only this simulator shares a bus.
Adafruit_NeoPixel pixelBus(3, Config::LED_DATA_PIN, NEO_GRB + NEO_KHZ800);
class LogicalPixel {
  uint8_t index;
public:
  explicit LogicalPixel(uint8_t pixelIndex) : index(pixelIndex) {}
  uint32_t Color(uint8_t red, uint8_t green, uint8_t blue) { return pixelBus.Color(red, green, blue); }
  void setPixelColor(uint8_t, uint32_t color) { pixelBus.setPixelColor(index, color); }
  void show() { pixelBus.show(); }
};
struct LogicalKiosk {
  const char *deviceId, *zone;
  uint8_t buttonPin;
  LogicalPixel led;
  LocalState localState = LocalState::READY;
  char activeTicketId[40] = "", lastCmdId[Config::ID_BYTES] = "";
  GestureDetector gestureDetector;
  uint32_t suspiciousPresses[Config::SPAM_LIMIT] = {};
  uint8_t suspiciousCount = 0;
  uint32_t lockStartedAt = 0, lockDuration = 0, csatStartedAt = 0, csatDuration = 0, stateChangedAt = 0;
  bool requestOutstanding = false;
  uint32_t lastColor = 0xffffffff;
  LogicalKiosk(const char *id, const char *area, uint8_t button, uint8_t pixelIndex)
      : deviceId(id), zone(area), buttonPin(button), led(pixelIndex) {}
};
LogicalKiosk kiosks[] = {
  LogicalKiosk("A01", "A", Config::BUTTON_PINS[0], 0),
  LogicalKiosk("B01", "B", Config::BUTTON_PINS[1], 1),
  LogicalKiosk("C01", "C", Config::BUTTON_PINS[2], 2)
};
struct OutgoingEvent {
  char topic[Config::TOPIC_BYTES], payload[Config::PAYLOAD_BYTES], msgId[Config::ID_BYTES];
};
struct IncomingMessage { char topic[Config::TOPIC_BYTES], payload[Config::PAYLOAD_BYTES]; };
OutgoingEvent outbox[Config::OUTBOX_CAPACITY];
uint8_t outboxCount = 0;
SemaphoreHandle_t outboxMutex;
QueueHandle_t incomingQueue;
bool filesystemReady = false, displayReady = false;
bool outboxDirty = false;
volatile bool mqttOnline = false, reconnectNeedsSync = false, outboxOverflow = false;
volatile bool requestedOffline = false, requestedReboot = false;
char bootId[16], mqttClientId[64];
uint32_t sequenceNumber = 0;
WiFiClient transport;
PubSubClient mqtt(transport);
Preferences resetPreferences;
Adafruit_SSD1306 display(128, 64, &Wire, -1);
int serverQueueCount = 0, serverTopEta = 0;
char serverTopTicket[40] = "--", serverTopDevice[8] = "--", serverTopIntent[24] = "";
uint32_t lastLedAt = 0, lastDisplayAt = 0;

// Unsigned subtraction remains valid when millis wraps after 49 days.
bool elapsed(uint32_t now, uint32_t start, uint32_t duration) { return now - start >= duration; }
bool stateFromText(const char *text, LocalState &state) {
  static const char *names[] = {"READY", "PENDING", "ACKNOWLEDGED", "ARRIVED", "RESOLVED",
      "CANCELLED", "ESCALATED_L1", "ESCALATED_L2", "CSAT_WAIT", "SPAM_LOCK"};
  for (uint8_t i = 0; i < sizeof(names) / sizeof(names[0]); ++i) {
    if (!strcmp(text, names[i])) { state = static_cast<LocalState>(i); return true; }
  }
  return false;
}
const char *stateLabel(LocalState state) {
  switch (state) {
    case LocalState::READY: return "READY";
    case LocalState::PENDING: return "PEND";
    case LocalState::ACKNOWLEDGED: return "ACK";
    case LocalState::ARRIVED: return "ARRIVED";
    case LocalState::RESOLVED: case LocalState::CSAT_WAIT: return "RATE";
    case LocalState::CANCELLED: return "CANCEL";
    case LocalState::ESCALATED_L1: return "L1";
    case LocalState::ESCALATED_L2: return "L2";
    case LocalState::SPAM_LOCK: return "LOCK";
  }
  return "?";
}
bool isWaiting(const LogicalKiosk &kiosk) {
  return kiosk.localState == LocalState::PENDING || kiosk.localState == LocalState::ESCALATED_L1 ||
      kiosk.localState == LocalState::ESCALATED_L2;
}

// Worker-only flash writing; copy a stable snapshot briefly under mutex.
// Slow simulated flash must never make a physical 150ms button press disappear.
bool persistOutbox() {
  if (!filesystemReady) return false;
  JsonDocument document;
  JsonArray events = document["events"].to<JsonArray>();
  xSemaphoreTake(outboxMutex, portMAX_DELAY);
  if (!outboxDirty) { xSemaphoreGive(outboxMutex); return true; }
  for (uint8_t i = 0; i < outboxCount; ++i) {
    JsonObject item = events.add<JsonObject>();
    item["topic"] = outbox[i].topic; item["payload"] = outbox[i].payload; item["msg_id"] = outbox[i].msgId;
  }
  outboxDirty = false;
  xSemaphoreGive(outboxMutex);
  File next = LittleFS.open("/outbox.tmp", FILE_WRITE);
  if (!next) return false;
  size_t written = serializeJson(document, next);
  next.flush(); next.close();
  if (written != measureJson(document)) { LittleFS.remove("/outbox.tmp"); return false; }
  LittleFS.remove("/outbox.bak");
  if (LittleFS.exists("/outbox.json") && !LittleFS.rename("/outbox.json", "/outbox.bak")) return false;
  return LittleFS.rename("/outbox.tmp", "/outbox.json");
}
bool loadOutboxFile(const char *path) {
  File file = LittleFS.open(path, FILE_READ);
  if (!file) return false;
  JsonDocument document;
  DeserializationError error = deserializeJson(document, file); file.close();
  if (error || !document["events"].is<JsonArray>()) return false;
  outboxCount = 0;
  for (JsonObject item : document["events"].as<JsonArray>()) {
    const char *topic = item["topic"] | "", *payload = item["payload"] | "", *id = item["msg_id"] | "";
    if (outboxCount >= Config::OUTBOX_CAPACITY || strlen(topic) >= Config::TOPIC_BYTES ||
        strlen(payload) >= Config::PAYLOAD_BYTES || strlen(id) >= Config::ID_BYTES || !*id) return false;
    strlcpy(outbox[outboxCount].topic, topic, Config::TOPIC_BYTES);
    strlcpy(outbox[outboxCount].payload, payload, Config::PAYLOAD_BYTES);
    strlcpy(outbox[outboxCount].msgId, id, Config::ID_BYTES); ++outboxCount;
  }
  return true;
}
bool mountOutboxFilesystem() {
  if (LittleFS.begin(false)) return true;
  // Do not erase a damaged production flash just because mount failed.
  // A fresh Wokwi/ESP32 partition is erased (all 0xff), and may be initialized.
  const esp_partition_t *partition = esp_partition_find_first(
      ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_DATA_SPIFFS, "spiffs");
  if (!partition) return false;
  uint8_t sample[256];
  for (size_t offset = 0; offset < 4096; offset += sizeof(sample)) {
    if (esp_partition_read(partition, offset, sample, sizeof(sample)) != ESP_OK) return false;
    for (uint8_t byte : sample) if (byte != 0xff) {
      Serial.println("FLASH_RECOVERY_REQUIRED: unmountable data preserved, not formatted"); return false;
    }
  }
  Serial.println("LITTLEFS: initializing blank partition");
  return LittleFS.begin(true);
}
bool enqueueEvent(LogicalKiosk &kiosk, const char *event, const char *gesture = nullptr,
    const char *intent = nullptr, const char *rating = nullptr, const char *cmdId = nullptr) {
  OutgoingEvent entry{};
  snprintf(entry.topic, sizeof(entry.topic), "%s/cp/%s/event", Config::BASE_TOPIC, kiosk.deviceId);
  snprintf(entry.msgId, sizeof(entry.msgId), "%s-%s-%06lu", kiosk.deviceId, bootId, (unsigned long)++sequenceNumber);
  JsonDocument document;
  document["schema"] = 1; document["msg_id"] = entry.msgId; document["boot_id"] = bootId;
  document["device_id"] = kiosk.deviceId; document["zone"] = kiosk.zone;
  document["event"] = event; document["device_uptime_ms"] = millis();
  if (gesture) document["gesture"] = gesture;
  if (intent) document["intent"] = intent;
  if (rating) document["rating"] = rating;
  if (cmdId) document["cmd_id"] = cmdId;
  if (*kiosk.activeTicketId) document["ticket_id"] = kiosk.activeTicketId;
  if (measureJson(document) >= sizeof(entry.payload)) return false;
  serializeJson(document, entry.payload, sizeof(entry.payload));
  xSemaphoreTake(outboxMutex, portMAX_DELAY);
  // Reserve slots for sync/control events even when customers fill the outbox.
  uint8_t limit = !strcmp(event, "REQUEST") ? Config::OUTBOX_CAPACITY - 6 : Config::OUTBOX_CAPACITY;
  if (outboxCount >= limit) {
    outboxOverflow = true; xSemaphoreGive(outboxMutex);
    Serial.printf("OUTBOX_FULL: %s %s rejected; retry after reconnect\n", kiosk.deviceId, event); return false;
  }
  outbox[outboxCount++] = entry; outboxDirty = true; xSemaphoreGive(outboxMutex);
  Serial.printf("QUEUED %s %s (%s)\n", kiosk.deviceId, event, entry.msgId); return true;
}
void acknowledgeReceipt(const char *msgId) {
  if (!*msgId) return;
  xSemaphoreTake(outboxMutex, portMAX_DELAY);
  // A stale retained receipt must never remove a different event.
  if (outboxCount && !strcmp(outbox[0].msgId, msgId)) {
    for (uint8_t i = 1; i < outboxCount; ++i) outbox[i - 1] = outbox[i];
    --outboxCount;
    outboxDirty = true;
    if (outboxCount < Config::OUTBOX_CAPACITY - 6) outboxOverflow = false;
  }
  xSemaphoreGive(outboxMutex);
}
void clearDeviceOutbox(const char *deviceId, const char *cmdId) {
  // Retained reset must be idempotent even after reboot: never erase newer offline events.
  if (resetPreferences.getString(deviceId, "") == cmdId) return;
  char topic[Config::TOPIC_BYTES];
  snprintf(topic, sizeof(topic), "%s/cp/%s/event", Config::BASE_TOPIC, deviceId);
  xSemaphoreTake(outboxMutex, portMAX_DELAY);
  uint8_t keep = 0, previous = outboxCount;
  for (uint8_t i = 0; i < outboxCount; ++i)
    if (strcmp(outbox[i].topic, topic)) outbox[keep++] = outbox[i];
  outboxCount = keep;
  outboxDirty = true;
  outboxOverflow = false; xSemaphoreGive(outboxMutex);
  resetPreferences.putString(deviceId, cmdId);
  Serial.printf("DEMO_RESET %s: explicitly discarded %u pre-reset events\n", deviceId, previous - keep);
}
void mqttCallback(char *topic, uint8_t *payload, unsigned int length) {
  if (length >= Config::PAYLOAD_BYTES || strlen(topic) >= Config::TOPIC_BYTES) {
    Serial.println("DOWNLINK_REJECTED: payload/topic too large"); return;
  }
  IncomingMessage message{};
  strlcpy(message.topic, topic, sizeof(message.topic));
  memcpy(message.payload, payload, length); message.payload[length] = '\0';
  JsonDocument document;
  if (deserializeJson(document, message.payload) || (document["schema"] | 0) != 1) return;
  char expected[Config::TOPIC_BYTES];
  bool validTopic = false;
  for (LogicalKiosk &kiosk : kiosks) {
    snprintf(expected, sizeof(expected), "%s/cp/%s/cmd", Config::BASE_TOPIC, kiosk.deviceId);
    if (!strcmp(topic, expected) && !strcmp(document["device_id"] | "", kiosk.deviceId)) {
      LocalState parsed;
      if (!stateFromText(document["state"] | "", parsed)) return;
      if (parsed == LocalState::READY && (document["reset_demo"] | false)) {
        const char *cmdId = document["cmd_id"] | "";
        if (*cmdId && strlen(cmdId) < Config::ID_BYTES) clearDeviceOutbox(kiosk.deviceId, cmdId);
      }
      acknowledgeReceipt(document["receipt_msg_id"] | ""); validTopic = true; break;
    }
  }
  snprintf(expected, sizeof(expected), "%s/display", Config::BASE_TOPIC);
  if (!strcmp(topic, expected)) validTopic = true;
  if (!validTopic) return;
  if (xQueueSend(incomingQueue, &message, 0) != pdTRUE) {
    Serial.println("DOWNLINK_BACKPRESSURE: DEVICE_SYNC will refresh state"); reconnectNeedsSync = true;
  }
}
void publishStatus(bool online) {
  char topic[Config::TOPIC_BYTES], payload[192];
  snprintf(topic, sizeof(topic), "%s/simulator/status", Config::BASE_TOPIC);
  snprintf(payload, sizeof(payload), "{\"schema\":1,\"online\":%s,\"boot_id\":\"%s\",\"device_ids\":[\"A01\",\"B01\",\"C01\"]}", online ? "true" : "false", bootId);
  mqtt.publish(topic, payload, true);
}
void networkTask(void *) {
  mqtt.setServer(Config::MQTT_HOST, Config::MQTT_PORT); mqtt.setCallback(mqttCallback);
  mqtt.setBufferSize(2048); mqtt.setSocketTimeout(2); mqtt.setKeepAlive(20);
  // ESP32 NetworkClient::setTimeout is seconds, unlike generic Stream milliseconds.
  transport.setTimeout(2);
  WiFi.mode(WIFI_STA); WiFi.begin(Config::WIFI_SSID, Config::WIFI_PASSWORD, 6);
  uint32_t lastWifiAt = millis(), lastMqttAt = millis() - Config::MQTT_RETRY_MS;
  uint32_t lastSendAt = 0, lastStatusAt = 0;
  uint32_t forcedOfflineAt = 0;
  bool forcedOffline = false;
  char sentId[Config::ID_BYTES] = "";
  for (;;) {
    uint32_t now = millis();
    if (!persistOutbox() && filesystemReady) {
      xSemaphoreTake(outboxMutex, portMAX_DELAY); outboxDirty = true; xSemaphoreGive(outboxMutex);
      Serial.println("PERSISTENCE_ERROR: RAM retained; worker will retry flash");
    }
    if (Config::ENABLE_SERIAL_DIAGNOSTICS && requestedReboot) {
      requestedReboot = false;
      if (filesystemReady && persistOutbox()) {
        Serial.println("DIAG_REBOOT: persisted outbox, restarting without flash erase");
        Serial.flush(); ESP.restart();
      } else Serial.println("DIAG_REBOOT_REJECTED: flash persistence unavailable");
    }
    if (Config::ENABLE_SERIAL_DIAGNOSTICS && requestedOffline) {
      requestedOffline = false; forcedOffline = true; forcedOfflineAt = now;
      if (mqtt.connected()) { publishStatus(false); mqtt.disconnect(); }
      mqttOnline = false; transport.stop(); WiFi.mode(WIFI_OFF);
      Serial.println("DIAG_OFFLINE: actual WiFi/MQTT disabled for 20s; flash worker remains active");
    }
    if (forcedOffline) {
      if (!elapsed(now, forcedOfflineAt, Config::DIAGNOSTIC_OFFLINE_MS)) {
        vTaskDelay(pdMS_TO_TICKS(5)); continue;
      }
      forcedOffline = false; WiFi.mode(WIFI_STA);
      WiFi.begin(Config::WIFI_SSID, Config::WIFI_PASSWORD, 6); lastWifiAt = now;
      Serial.println("DIAG_RECONNECT: network restored");
    }
    if (WiFi.status() != WL_CONNECTED) {
      mqttOnline = false; if (mqtt.connected()) mqtt.disconnect();
      if (elapsed(now, lastWifiAt, Config::WIFI_RETRY_MS)) {
        lastWifiAt = now; WiFi.disconnect(); WiFi.begin(Config::WIFI_SSID, Config::WIFI_PASSWORD, 6);
      }
    } else if (!mqtt.connected()) {
      mqttOnline = false;
      if (elapsed(now, lastMqttAt, Config::MQTT_RETRY_MS)) {
        lastMqttAt = now;
        char willTopic[Config::TOPIC_BYTES];
        snprintf(willTopic, sizeof(willTopic), "%s/simulator/status", Config::BASE_TOPIC);
        const char *will = "{\"schema\":1,\"online\":false,\"device_ids\":[\"A01\",\"B01\",\"C01\"]}";
        // TCP/DNS waits are confined to this worker; UI never calls connect().
        if (mqtt.connect(mqttClientId, Config::MQTT_USER, Config::MQTT_PASSWORD, willTopic, 1, true, will)) {
          for (LogicalKiosk &kiosk : kiosks) {
            char topic[Config::TOPIC_BYTES];
            snprintf(topic, sizeof(topic), "%s/cp/%s/cmd", Config::BASE_TOPIC, kiosk.deviceId); mqtt.subscribe(topic, 1);
          }
          char topic[Config::TOPIC_BYTES]; snprintf(topic, sizeof(topic), "%s/display", Config::BASE_TOPIC); mqtt.subscribe(topic, 1);
          mqttOnline = true; reconnectNeedsSync = true; sentId[0] = '\0'; publishStatus(true); lastStatusAt = now;
          Serial.println("MQTT_ONLINE: FIFO replay awaits server receipts");
        } else Serial.printf("MQTT_RETRY: state=%d\n", mqtt.state());
      }
    } else {
      mqtt.loop();
      // Drain a bounded burst before the next flash snapshot. Broker summaries
      // must not queue in front of application receipts while flash writes are slow.
      for (uint8_t packet = 0; packet < 12 && mqtt.connected() && transport.available(); ++packet) mqtt.loop();
      mqttOnline = mqtt.connected();
      if (elapsed(now, lastStatusAt, Config::STATUS_MS)) { publishStatus(true); lastStatusAt = now; }
      OutgoingEvent head{}; bool hasHead = false;
      xSemaphoreTake(outboxMutex, portMAX_DELAY);
      if (outboxCount) { head = outbox[0]; hasHead = true; } xSemaphoreGive(outboxMutex);
      if (hasHead && (strcmp(sentId, head.msgId) || elapsed(now, lastSendAt, Config::RECEIPT_RETRY_MS))) {
        // Commit new head before publish; a flash failure must never pretend durability.
        bool persisted = persistOutbox();
        if (filesystemReady && !persisted) {
          xSemaphoreTake(outboxMutex, portMAX_DELAY); outboxDirty = true; xSemaphoreGive(outboxMutex);
          Serial.println("PERSISTENCE_RETRY: network publish postponed until flash commit");
          vTaskDelay(pdMS_TO_TICKS(5)); continue;
        }
        bool sent = mqtt.publish(head.topic, head.payload, false);
        Serial.printf("OUTBOX_SEND %s mqtt=%d\n", head.msgId, sent);
        if (sent) { strlcpy(sentId, head.msgId, sizeof(sentId)); lastSendAt = now; }
      }
    }
    vTaskDelay(pdMS_TO_TICKS(5)); // Worker scheduling only, never business timing.
  }
}

const Note REQUEST_SOUND[] = {{1400, 90}}, ACK_SOUND[] = {{2200, 100}}, INVALID_SOUND[] = {{300, 100}};
const Note ARRIVED_SOUND[] = {{1800, 80}, {0, 40}, {2400, 80}};
const Note RESOLVED_SOUND[] = {{1800, 70}, {0, 90}, {1800, 70}};
const Note ALARM_SOUND[] = {{2600, 150}, {0, 80}, {1800, 150}, {0, 80}, {2600, 150}};
const Note *activeSound = nullptr;
uint8_t soundLength = 0, soundIndex = 0;
uint32_t soundStartedAt = 0;
void playSound(const Note *notes, uint8_t length) {
  activeSound = notes; soundLength = length; soundIndex = 0; soundStartedAt = millis();
  if (notes[0].frequency) tone(Config::BUZZER_PIN, notes[0].frequency); else noTone(Config::BUZZER_PIN);
}
void updateSound(uint32_t now) {
  if (!activeSound || !elapsed(now, soundStartedAt, activeSound[soundIndex].duration)) return;
  if (++soundIndex >= soundLength) { noTone(Config::BUZZER_PIN); activeSound = nullptr; return; }
  soundStartedAt = now;
  if (activeSound[soundIndex].frequency) tone(Config::BUZZER_PIN, activeSound[soundIndex].frequency); else noTone(Config::BUZZER_PIN);
}
bool suspiciousPress(LogicalKiosk &kiosk, uint32_t now) {
  uint8_t keep = 0;
  for (uint8_t i = 0; i < kiosk.suspiciousCount; ++i)
    if (!elapsed(now, kiosk.suspiciousPresses[i], Config::SPAM_WINDOW_MS)) kiosk.suspiciousPresses[keep++] = kiosk.suspiciousPresses[i];
  kiosk.suspiciousCount = keep;
  if (keep < Config::SPAM_LIMIT) kiosk.suspiciousPresses[kiosk.suspiciousCount++] = now;
  if (kiosk.suspiciousCount < Config::SPAM_LIMIT) return false;
  kiosk.lockStartedAt = now; kiosk.lockDuration = Config::SPAM_LOCK_MS; kiosk.gestureDetector.waitingShort = false;
  enqueueEvent(kiosk, "SPAM_DETECTED"); playSound(INVALID_SOUND, 1); return true;
}
void handleGesture(LogicalKiosk &kiosk, const char *gesture, uint32_t now) {
  if (kiosk.lockDuration && !elapsed(now, kiosk.lockStartedAt, kiosk.lockDuration)) return;
  if (!strcmp(gesture, "invalid")) {
    if (suspiciousPress(kiosk, now)) return;
    enqueueEvent(kiosk, "INVALID_GESTURE", gesture); playSound(INVALID_SOUND, 1); return;
  }
  if (kiosk.localState == LocalState::ACKNOWLEDGED) { enqueueEvent(kiosk, "STAFF_ARRIVED", gesture); return; }
  if (kiosk.localState == LocalState::CSAT_WAIT || kiosk.localState == LocalState::RESOLVED) {
    if (strcmp(gesture, "double") && enqueueEvent(kiosk, "CSAT", gesture, nullptr,
        !strcmp(gesture, "short") ? "SATISFIED" : "UNSATISFIED")) playSound(REQUEST_SOUND, 1);
    return;
  }
  if (!strcmp(gesture, "double")) {
    if (isWaiting(kiosk) || kiosk.requestOutstanding) enqueueEvent(kiosk, "CANCEL_REQUEST", gesture);
    else {
      if (suspiciousPress(kiosk, now)) return;
      enqueueEvent(kiosk, "INVALID_GESTURE", gesture); playSound(INVALID_SOUND, 1);
    }
    return;
  }
  if (kiosk.localState == LocalState::READY && !kiosk.requestOutstanding) {
    if (enqueueEvent(kiosk, "REQUEST", gesture, !strcmp(gesture, "long") ? "PAYMENT" : "CONSULTATION")) {
      kiosk.requestOutstanding = true; playSound(REQUEST_SOUND, 1);
    } else playSound(INVALID_SOUND, 1);
  } else {
    // Valid new requests, cancel, arrival and rating never count as abuse.
    if (suspiciousPress(kiosk, now)) return;
    enqueueEvent(kiosk, "INVALID_GESTURE", gesture); playSound(INVALID_SOUND, 1);
  }
}
void updateButton(LogicalKiosk &kiosk, uint32_t now) {
  GestureDetector &detector = kiosk.gestureDetector;
  bool raw = digitalRead(kiosk.buttonPin);
  if (raw != detector.raw) { detector.raw = raw; detector.rawChangedAt = now; }
  if (raw != detector.stable && elapsed(now, detector.rawChangedAt, Config::DEBOUNCE_MS)) {
    detector.stable = raw;
    if (raw == LOW) {
      detector.pressedAt = now;
    } else {
      uint32_t duration = now - detector.pressedAt;
      if (duration >= Config::LONG_MS) { detector.waitingShort = false; handleGesture(kiosk, "long", now); }
      else if (duration >= Config::SHORT_MS) { detector.waitingShort = false; handleGesture(kiosk, "invalid", now); }
      else if (kiosk.localState == LocalState::ACKNOWLEDGED || kiosk.localState == LocalState::CSAT_WAIT || kiosk.localState == LocalState::RESOLVED) {
        detector.waitingShort = false; handleGesture(kiosk, "short", now);
      } else if (detector.waitingShort && !elapsed(now, detector.firstReleasedAt, Config::DOUBLE_MS + 1)) {
        detector.waitingShort = false; handleGesture(kiosk, "double", now);
      } else { detector.waitingShort = true; detector.firstReleasedAt = now; }
    }
  }
  // A held second press must not cause a premature short event.
  if (detector.waitingShort && detector.raw == HIGH && detector.stable == HIGH && elapsed(now, detector.firstReleasedAt, Config::DOUBLE_MS + 1)) {
    detector.waitingShort = false; handleGesture(kiosk, "short", now);
  }
}
void applyCommand(const IncomingMessage &message, uint32_t now) {
  JsonDocument document;
  if (deserializeJson(document, message.payload)) return;
  char expected[Config::TOPIC_BYTES]; snprintf(expected, sizeof(expected), "%s/display", Config::BASE_TOPIC);
  if (!strcmp(message.topic, expected)) {
    serverQueueCount = document["queue_count"] | 0;
    JsonObject top = document["top_ticket"].as<JsonObject>();
    strlcpy(serverTopTicket, top["ticket_id"] | "--", sizeof(serverTopTicket));
    strlcpy(serverTopDevice, top["device_id"] | "--", sizeof(serverTopDevice));
    strlcpy(serverTopIntent, top["intent"] | "", sizeof(serverTopIntent)); serverTopEta = top["eta_seconds"] | 0; return;
  }
  for (LogicalKiosk &kiosk : kiosks) {
    snprintf(expected, sizeof(expected), "%s/cp/%s/cmd", Config::BASE_TOPIC, kiosk.deviceId);
    if (strcmp(message.topic, expected) || strcmp(document["device_id"] | "", kiosk.deviceId)) continue;
    LocalState state;
    if ((document["schema"] | 0) != 1 || !stateFromText(document["state"] | "", state)) return;
    const char *cmdId = document["cmd_id"] | "";
    if (!*cmdId || strlen(cmdId) >= sizeof(kiosk.lastCmdId) || !strcmp(cmdId, kiosk.lastCmdId)) return;
    LocalState old = kiosk.localState;
    strlcpy(kiosk.lastCmdId, cmdId, sizeof(kiosk.lastCmdId));
    strlcpy(kiosk.activeTicketId, document["ticket_id"] | "", sizeof(kiosk.activeTicketId));
    kiosk.localState = state; kiosk.stateChangedAt = now; kiosk.requestOutstanding = false;
    if (state == LocalState::READY) {
      kiosk.gestureDetector.waitingShort = false; kiosk.suspiciousCount = 0; kiosk.lockDuration = 0; kiosk.csatDuration = 0;
    }
    if (state == LocalState::CSAT_WAIT || state == LocalState::RESOLVED) {
      kiosk.csatStartedAt = now;
      uint32_t csatMs = (document["csat_remaining_seconds"] | 15U) * 1000U;
      kiosk.csatDuration = csatMs < Config::CSAT_MS ? csatMs : Config::CSAT_MS;
    }
    uint32_t lockSeconds = document["lock_remaining_seconds"] | 0U;
    if (lockSeconds) { kiosk.lockStartedAt = now; kiosk.lockDuration = lockSeconds * 1000U < Config::SPAM_LOCK_MS ? lockSeconds * 1000U : Config::SPAM_LOCK_MS; }
    if (old != state) {
      if (state == LocalState::PENDING) playSound(REQUEST_SOUND, 1);
      if (state == LocalState::ACKNOWLEDGED) playSound(ACK_SOUND, 1);
      if (state == LocalState::ARRIVED) playSound(ARRIVED_SOUND, 3);
      if (state == LocalState::CSAT_WAIT || state == LocalState::RESOLVED) playSound(RESOLVED_SOUND, 3);
      if (state == LocalState::ESCALATED_L2) playSound(ALARM_SOUND, 5);
    }
    Serial.printf("CMD_APPLIED %s %s %s\n", kiosk.deviceId, stateLabel(state), cmdId);
    enqueueEvent(kiosk, "CMD_APPLIED", nullptr, nullptr, nullptr, cmdId); return;
  }
}
void updateIndicators(uint32_t now) {
  bool pixelsChanged = false;
  for (LogicalKiosk &kiosk : kiosks) {
    if (kiosk.lockDuration && elapsed(now, kiosk.lockStartedAt, kiosk.lockDuration)) {
      kiosk.lockDuration = 0; kiosk.suspiciousCount = 0; enqueueEvent(kiosk, "DEVICE_SYNC");
    }
    if (kiosk.csatDuration && elapsed(now, kiosk.csatStartedAt, kiosk.csatDuration)) {
      kiosk.csatDuration = 0; kiosk.localState = LocalState::READY; kiosk.activeTicketId[0] = '\0'; enqueueEvent(kiosk, "DEVICE_SYNC");
    }
    if (kiosk.localState == LocalState::CANCELLED && elapsed(now, kiosk.stateChangedAt, Config::CANCEL_FEEDBACK_MS)) {
      kiosk.localState = LocalState::READY; kiosk.activeTicketId[0] = '\0';
    }
    uint32_t color;
    if (!mqttOnline) color = (now / 450) % 2 ? kiosk.led.Color(90, 30, 0) : 0;
    else if (kiosk.lockDuration || kiosk.localState == LocalState::SPAM_LOCK)
      color = (now / 180) % 2 ? kiosk.led.Color(100, 0, 85) : kiosk.led.Color(100, 0, 0);
    else switch (kiosk.localState) {
      case LocalState::READY: color = kiosk.requestOutstanding ? kiosk.led.Color(100, 70, 0) : kiosk.led.Color(0, 8, 2); break;
      case LocalState::PENDING: color = kiosk.led.Color(110, 80, 0); break;
      case LocalState::ACKNOWLEDGED: color = kiosk.led.Color(0, 0, 140); break;
      case LocalState::ARRIVED: color = kiosk.led.Color(0, 100, 100); break;
      case LocalState::RESOLVED: case LocalState::CSAT_WAIT: color = kiosk.led.Color(0, 110, 0); break;
      case LocalState::CANCELLED: color = kiosk.led.Color(90, 0, 100); break;
      case LocalState::ESCALATED_L1: color = (now / 650) % 2 ? kiosk.led.Color(130, 0, 0) : 0; break;
      case LocalState::ESCALATED_L2: color = (now / 180) % 2 ? kiosk.led.Color(150, 0, 0) : 0; break;
      default: color = 0; break;
    }
    if (color != kiosk.lastColor) { kiosk.led.setPixelColor(0, color); pixelsChanged = true; kiosk.lastColor = color; }
  }
  if (pixelsChanged) pixelBus.show();
}
void updateDisplay(uint32_t now) {
  if (!displayReady || !elapsed(now, lastDisplayAt, Config::DISPLAY_UPDATE_MS)) return;
  lastDisplayAt = now; display.clearDisplay(); display.setTextColor(SSD1306_WHITE); display.setTextSize(1); display.setCursor(0, 0);
  display.println("SMART SUPPORT / HUIT");
  if (!mqttOnline || outboxOverflow) {
    display.println(mqttOnline ? "OUTBOX FULL - RETRY" : "MQTT OFFLINE");
    xSemaphoreTake(outboxMutex, portMAX_DELAY); int buffered = outboxCount; xSemaphoreGive(outboxMutex);
    display.printf("BUFFER: %d/%d\n", buffered, Config::OUTBOX_CAPACITY);
    display.println(filesystemReady ? "Saved to LittleFS" : "FLASH ERROR: RAM ONLY"); display.println("Orange = disconnected");
  } else switch ((now / Config::DISPLAY_ROTATE_MS) % 3) {
    case 0:
      display.println("MQTT: ONLINE"); display.printf("Queue: %d\n", serverQueueCount);
      display.println("Short: consultation"); display.println("Long: payment"); display.println("Double: cancel waiting"); break;
    case 1:
      display.printf("TOP: %s\n", serverTopTicket); display.printf("Point: %s\n", serverTopDevice);
      display.println(serverTopIntent); display.printf("ETA: %ds\n", serverTopEta); break;
    default:
      for (LogicalKiosk &kiosk : kiosks) display.printf("%s %s\n", kiosk.deviceId, stateLabel(kiosk.localState));
      display.println("BLUE -> press ARRIVED"); display.println("GREEN -> rate support"); break;
  }
  display.display();
}
void setup() {
  Serial.begin(115200); snprintf(bootId, sizeof(bootId), "%08lX", (unsigned long)esp_random());
  snprintf(mqttClientId, sizeof(mqttClientId), "huit58-sim-%08lX-%s", (unsigned long)(ESP.getEfuseMac() & 0xffffffff), bootId);
  outboxMutex = xSemaphoreCreateMutex(); incomingQueue = xQueueCreate(16, sizeof(IncomingMessage));
  if (!outboxMutex || !incomingQueue) { Serial.println("FATAL: allocation failure"); return; }
  resetPreferences.begin("iot58-reset", false);
  filesystemReady = mountOutboxFilesystem();
  if (filesystemReady) {
    if (!loadOutboxFile("/outbox.json")) {
      outboxCount = 0;
      if (!loadOutboxFile("/outbox.tmp")) { outboxCount = 0; if (!loadOutboxFile("/outbox.bak")) outboxCount = 0; }
    }
    Serial.printf("LITTLEFS restored %u events\n", outboxCount);
  } else Serial.println("FLASH_ERROR: bounded RAM FIFO; no silent drops");
  pixelBus.begin(); pixelBus.clear(); pixelBus.show();
  for (LogicalKiosk &kiosk : kiosks) pinMode(kiosk.buttonPin, INPUT_PULLUP);
  pinMode(Config::BUZZER_PIN, OUTPUT); Wire.begin(Config::SDA_PIN, Config::SCL_PIN);
  displayReady = display.begin(SSD1306_SWITCHCAPVCC, 0x3c);
  if (!displayReady) Serial.println("OLED unavailable; buttons/MQTT/LED still active");
  if (xTaskCreate(networkTask, "mqtt-worker", 12288, nullptr, 1, nullptr) != pdPASS) Serial.println("FATAL: network worker allocation failure");
}
void loop() {
  if (!outboxMutex || !incomingQueue) { yield(); return; }
  uint32_t now = millis(); IncomingMessage message;
  if (Config::ENABLE_SERIAL_DIAGNOSTICS) {
    while (Serial.available()) {
      char input = Serial.read();
      if (input == 'O' || input == 'o') requestedOffline = true;
      if (input == 'R' || input == 'r') requestedReboot = true;
    }
  }
  // A bounded batch keeps command bursts from starving buttons.
  for (uint8_t i = 0; i < 4 && xQueueReceive(incomingQueue, &message, 0) == pdTRUE; ++i) applyCommand(message, now);
  if (reconnectNeedsSync) { reconnectNeedsSync = false; for (LogicalKiosk &kiosk : kiosks) enqueueEvent(kiosk, "DEVICE_SYNC"); }
  for (LogicalKiosk &kiosk : kiosks) updateButton(kiosk, now);
  updateSound(now);
  if (elapsed(now, lastLedAt, Config::UI_UPDATE_MS)) { lastLedAt = now; updateIndicators(now); }
  updateDisplay(now);
  vTaskDelay(1); // One scheduler tick gives idle/network tasks CPU; never business timing.
}
