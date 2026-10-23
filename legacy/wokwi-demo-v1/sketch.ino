#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ---------------- Pin mapping ----------------
const uint8_t REQUEST_BUTTON_PIN = 18;
const uint8_t ACK_BUTTON_PIN = 19;
const uint8_t DONE_BUTTON_PIN = 23;

const uint8_t LED_PENDING_PIN = 25;
const uint8_t LED_ACK_PIN = 26;
const uint8_t LED_RESOLVED_PIN = 27;
const uint8_t LED_ESCALATED_PIN = 14;
const uint8_t BUZZER_PIN = 13;

// ---------------- Business rules ----------------
const unsigned long DEBOUNCE_MS = 50;
const unsigned long REQUEST_COOLDOWN_MS = 10000;
const unsigned long SLA_TIMEOUT_MS = 15000;

Adafruit_SSD1306 display(128, 64, &Wire, -1);

enum TicketState {
  TICKET_READY,
  TICKET_PENDING,
  TICKET_ACKNOWLEDGED,
  TICKET_RESOLVED,
  TICKET_ESCALATED
};

TicketState state = TICKET_READY;
unsigned int ticketNumber = 0;
unsigned long ticketCreatedAt = 0;
unsigned long ticketAckAt = 0;
unsigned long lastRequestAt = 0;
unsigned long lastDisplayAt = 0;
bool hasCreatedRequest = false;

struct DebouncedButton {
  uint8_t pin;
  bool stableState;
  bool lastReading;
  unsigned long changedAt;

  void begin(uint8_t buttonPin) {
    pin = buttonPin;
    pinMode(pin, INPUT_PULLUP);
    stableState = HIGH;
    lastReading = HIGH;
    changedAt = 0;
  }

  bool pressed(unsigned long now) {
    bool reading = digitalRead(pin);

    if (reading != lastReading) {
      lastReading = reading;
      changedAt = now;
    }

    if ((now - changedAt) >= DEBOUNCE_MS && reading != stableState) {
      stableState = reading;
      return stableState == LOW;
    }

    return false;
  }
};

DebouncedButton requestButton;
DebouncedButton ackButton;
DebouncedButton doneButton;

const char *stateName(TicketState value) {
  switch (value) {
    case TICKET_READY: return "READY";
    case TICKET_PENDING: return "PENDING";
    case TICKET_ACKNOWLEDGED: return "ACKNOWLEDGED";
    case TICKET_RESOLVED: return "RESOLVED";
    case TICKET_ESCALATED: return "ESCALATED";
  }
  return "UNKNOWN";
}

void logEvent(const char *eventName, const char *message) {
  Serial.print("{\"device_id\":\"ESP32_01\",\"location\":\"QUAY_A\",");
  Serial.print("\"event\":\"");
  Serial.print(eventName);
  Serial.print("\",\"ticket\":");
  Serial.print(ticketNumber);
  Serial.print(",\"state\":\"");
  Serial.print(stateName(state));
  Serial.print("\",\"message\":\"");
  Serial.print(message);
  Serial.println("\"}");
}

void beep(unsigned int frequency, unsigned int durationMs) {
  tone(BUZZER_PIN, frequency, durationMs);
}

void updateActuators(unsigned long now) {
  digitalWrite(LED_PENDING_PIN, state == TICKET_PENDING);
  digitalWrite(LED_ACK_PIN, state == TICKET_ACKNOWLEDGED);
  digitalWrite(LED_RESOLVED_PIN, state == TICKET_RESOLVED);

  // Nhap nhay LED do khi Ticket bi qua SLA.
  bool redOn = state == TICKET_ESCALATED && ((now / 350) % 2 == 0);
  digitalWrite(LED_ESCALATED_PIN, redOn);
}

void showTemporaryMessage(const char *line1, const char *line2) {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 10);
  display.println(line1);
  display.setTextSize(2);
  display.setCursor(0, 30);
  display.println(line2);
  display.display();
}

void updateDisplay(unsigned long now, bool forceUpdate = false) {
  if (!forceUpdate && now - lastDisplayAt < 250) return;
  lastDisplayAt = now;

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("SMART SUPPORT - QUAY A");
  display.drawLine(0, 10, 127, 10, SSD1306_WHITE);

  if (state == TICKET_READY) {
    display.setTextSize(2);
    display.setCursor(22, 22);
    display.println("READY");
    display.setTextSize(1);
    display.setCursor(13, 50);
    display.println("Nhan nut REQUEST");
  } else {
    display.setTextSize(1);
    display.setCursor(0, 15);
    display.print("Ticket: T");
    if (ticketNumber < 100) display.print('0');
    if (ticketNumber < 10) display.print('0');
    display.println(ticketNumber);

    display.setCursor(0, 27);
    display.print("State : ");
    display.println(stateName(state));

    if (state == TICKET_PENDING || state == TICKET_ESCALATED) {
      display.setCursor(0, 39);
      display.print("Wait  : ");
      display.print((now - ticketCreatedAt) / 1000);
      display.println("s");
    } else if (state == TICKET_ACKNOWLEDGED || state == TICKET_RESOLVED) {
      display.setCursor(0, 39);
      display.print("Resp  : ");
      display.print((ticketAckAt - ticketCreatedAt) / 1000.0, 1);
      display.println("s");
    }

    display.setCursor(0, 52);
    if (state == TICKET_PENDING) display.println("Cho nhan vien ACK");
    if (state == TICKET_ACKNOWLEDGED) display.println("Dang ho tro - bam DONE");
    if (state == TICKET_RESOLVED) display.println("Hoan tat - co the tao moi");
    if (state == TICKET_ESCALATED) display.println("CANH BAO QUA SLA!");
  }

  display.display();
}

void createTicket(unsigned long now) {
  bool activeTicket = state == TICKET_PENDING || state == TICKET_ACKNOWLEDGED || state == TICKET_ESCALATED;
  if (activeTicket) {
    showTemporaryMessage("TU CHOI YEU CAU", "TICKET ACTIVE");
    logEvent("REQUEST_REJECTED", "Active ticket already exists");
    beep(350, 180);
    delay(700);
    updateDisplay(millis(), true);
    return;
  }

  if (hasCreatedRequest && now - lastRequestAt < REQUEST_COOLDOWN_MS) {
    showTemporaryMessage("BUSINESS RULE", "COOLDOWN");
    logEvent("REQUEST_REJECTED", "Request cooldown is active");
    beep(350, 180);
    delay(700);
    updateDisplay(millis(), true);
    return;
  }

  ticketNumber++;
  ticketCreatedAt = now;
  lastRequestAt = now;
  hasCreatedRequest = true;
  state = TICKET_PENDING;
  logEvent("TICKET_CREATED", "Customer requested support");
  beep(1300, 120);
  updateDisplay(now, true);
}

void acknowledgeTicket(unsigned long now) {
  if (state != TICKET_PENDING && state != TICKET_ESCALATED) {
    logEvent("ACK_REJECTED", "No waiting ticket to acknowledge");
    beep(300, 150);
    return;
  }

  ticketAckAt = now;
  state = TICKET_ACKNOWLEDGED;
  logEvent("TICKET_ACKNOWLEDGED", "Staff accepted the ticket");
  beep(1700, 120);
  updateDisplay(now, true);
}

void resolveTicket(unsigned long now) {
  if (state != TICKET_ACKNOWLEDGED) {
    logEvent("DONE_REJECTED", "Ticket must be acknowledged first");
    beep(300, 150);
    return;
  }

  state = TICKET_RESOLVED;
  logEvent("TICKET_RESOLVED", "Support request completed");
  beep(1500, 100);
  delay(140);
  beep(1900, 140);
  updateDisplay(now, true);
}

void checkSlaTimeout(unsigned long now) {
  if (state == TICKET_PENDING && now - ticketCreatedAt >= SLA_TIMEOUT_MS) {
    state = TICKET_ESCALATED;
    logEvent("SLA_ESCALATED", "Ticket exceeded the 15 second SLA");
    beep(2300, 600);
    updateDisplay(now, true);
  }
}

void setup() {
  Serial.begin(115200);

  requestButton.begin(REQUEST_BUTTON_PIN);
  ackButton.begin(ACK_BUTTON_PIN);
  doneButton.begin(DONE_BUTTON_PIN);

  pinMode(LED_PENDING_PIN, OUTPUT);
  pinMode(LED_ACK_PIN, OUTPUT);
  pinMode(LED_RESOLVED_PIN, OUTPUT);
  pinMode(LED_ESCALATED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  Wire.begin(21, 22);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("OLED initialization failed");
    while (true) delay(1000);
  }

  display.clearDisplay();
  display.display();
  logEvent("DEVICE_ONLINE", "ESP32 simulator is ready");
  beep(1000, 100);
  updateDisplay(millis(), true);
}

void loop() {
  unsigned long now = millis();

  if (requestButton.pressed(now)) createTicket(now);
  if (ackButton.pressed(now)) acknowledgeTicket(now);
  if (doneButton.pressed(now)) resolveTicket(now);

  checkSlaTimeout(now);
  updateActuators(now);
  updateDisplay(now);
  delay(5);
}
