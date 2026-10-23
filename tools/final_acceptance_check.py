"""Cross-check saved actual test evidence and the live READY middleware.

Run from root after QA: python tools/final_acceptance_check.py
This verifies evidence; it does not rerun Wokwi or Telegram.
"""
import hashlib
import json
import os
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(name):
    return (ROOT / name).read_text(encoding="utf-8-sig")


def main():
    proof = json.loads(read("evidence/wokwi-e2e-results.json"))
    offline = json.loads(read("evidence/wokwi-offline-results.json"))
    source = (ROOT / "wokwi-demo/sketch.ino").read_bytes()
    overlay = source.replace(
        b"const bool ENABLE_SERIAL_DIAGNOSTICS = false;",
        b"const bool ENABLE_SERIAL_DIAGNOSTICS = true;",
    )
    digest = hashlib.sha256(source).hexdigest()
    assert proof["delivery_source_sha256"] == digest
    assert proof["tested_source_sha256"] == hashlib.sha256(overlay).hexdigest()
    assert b"ENABLE_SERIAL_DIAGNOSTICS = false;" in source
    state = proof["state"]
    tickets = {t["device_id"]: t for t in state["tickets"]}
    assert tickets["B01"]["state"] == "RESOLVED"
    assert tickets["B01"]["csat"] == "SATISFIED"
    assert tickets["C01"]["state"] == "CANCELLED"
    assert tickets["A01"]["state"] == "ESCALATED_L2"
    assert state["devices"]["A01"]["state"] == "SPAM_LOCK"
    parse = lambda value: datetime.fromisoformat(value.replace("Z", "+00:00"))
    b = tickets["B01"]
    response = (parse(b["arrived_at"]) - parse(b["created_at"])).total_seconds()
    service = (parse(b["resolved_at"]) - parse(b["arrived_at"])).total_seconds()
    assert b["response_time_ms"] == round(response * 1000)
    assert b["service_time_ms"] == round(service * 1000)
    expected_aht = .3 * service + .7 * 120
    assert abs(state["metrics"]["aht_by_zone"]["B"] - expected_aht) < .00001
    assert len(offline["state"]["tickets"]) == 2
    assert [t["origin_msg_id"] for t in offline["state"]["tickets"]] == [
        q["msg_id"] for q in offline["queuedIds"]
    ]
    assert "LITTLEFS restored 5 events" in offline["serial_after"]
    unit = read("evidence/unit-tests.txt")
    unit_count = int(re.search(r"tests\s+(\d+)", unit).group(1))
    assert unit_count >= 49 and re.search(r"fail\s+0", unit)
    mqtt_count = read("evidence/mqtt-scenarios.txt").count("PASS ")
    assert mqtt_count >= 5
    rows = re.findall(
        r"^\| (AC\d+) \| ([^|]+) \| ([^|]+) \|",
        read("docs/ACCEPTANCE_MATRIX.md"), re.M,
    )
    ids = [row[0] for row in rows]
    assert len(ids) >= 40 and ids == [f"AC{i:02d}" for i in range(1, len(ids) + 1)]
    statuses = {row[2].strip() for row in rows}
    assert statuses <= {"PASS", "MANUAL", "STATIC", "NOT RUN"}, statuses
    manual = [row[0] for row in rows if row[2].strip() == "MANUAL"]
    assert manual == ["AC31", "AC58", "AC59"], manual
    counts = {s: sum(1 for row in rows if row[2].strip() == s) for s in sorted(statuses)}
    api = {}
    origin = os.getenv("API_URL", "http://localhost:1880").rstrip("/")
    for endpoint in ["health", "flow-health", "state", "queue", "staff", "metrics", "forecast"]:
        with urllib.request.urlopen(origin + "/api/iot58/" + endpoint, timeout=10) as response:
            data = json.load(response)
            api[endpoint] = {"status": response.status}
            if endpoint == "health":
                api[endpoint]["body"] = data
                assert data["mqtt"]["connected"]
            if endpoint == "state":
                assert not data["tickets"] and not data["queue"]
                assert all(d["state"] == "READY" for d in data["devices"].values())
                api[endpoint]["ready_devices"] = list(data["devices"])
    result = {
        "at": datetime.now(timezone.utc).isoformat(),
        "source": "Lead cross-check of actual test artifacts, source hashes, KPI arithmetic and live APIs; Telegram live not tested",
        "acceptance": [{"id": i, "condition": c.strip(), "status": s.strip()} for i, c, s in rows],
        "counts": counts,
        "unit_tests": unit_count, "mqtt_scenarios": mqtt_count,
        "wokwi_business_e2e": "PASS actual browser",
        "wokwi_offline_reboot": "PASS actual browser; diagnostics-only overlay",
        "delivery_source_sha256": digest, "api": api,
    }
    (ROOT / "evidence/acceptance-summary.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"PASS: {len(rows)} acceptance rows {counts}; {unit_count} unit tests and {mqtt_count} MQTT scenario results in evidence; Wokwi E2E/offline/KPI/hashes; live APIs checked against {origin}")


if __name__ == "__main__":
    main()
