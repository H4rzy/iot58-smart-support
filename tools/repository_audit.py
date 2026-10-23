"""Static delivery audit. Does not claim live Wokwi/Telegram success."""
import datetime as dt
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED = {"node_modules", ".pio", ".build-tools", ".git", "context", "__pycache__"}
REQUIRED = [
    "README.md", ".gitignore", "docs/IMPLEMENTATION_CONTRACT.md",
    "wokwi-demo/sketch.ino", "wokwi-demo/diagram.json", "wokwi-demo/libraries.txt", "wokwi-demo/partitions.csv",
    "node-red/package.json", "node-red/settings.js", "node-red/flows.json", "node-red/.env.example",
    "node-red/lib/config.js", "node-red/lib/validation.js", "node-red/lib/priority.js",
    "node-red/lib/dispatch.js", "node-red/lib/ticket-engine.js", "node-red/lib/analytics.js",
    "node-red/lib/forecast.js", "node-red/lib/runtime.js", "node-red/lib/telegram.js",
    "node-red/data/staff.json", "node-red/data/history.json",
    "application/index.html", "application/app.js", "application/styles.css",
    "analytics/seed_history.py", "tools/mqtt_scenario_test.js", "tools/demo_reset.js",
    "tools/browser_smoke_test.js", "docker-compose.local.yml", "legacy/wokwi-demo-v1/sketch.ino",
    "docs/REQUIREMENTS.md", "docs/ARCHITECTURE.md", "docs/MQTT_TOPICS.md", "docs/ALGORITHMS.md",
    "docs/SECURITY.md", "docs/BOM.md", "docs/TEST_PLAN.md", "docs/TEST_RESULTS.md",
    "docs/ACCEPTANCE_MATRIX.md", "docs/DEMO_SCRIPT_FINAL.md", "docs/QUICK_DEMO.md", "docs/FULL_DEMO.md",
    "docs/REPORT_FINAL.md", "docs/SLIDES_FINAL_CONTENT.md", "docs/PRESENTATION_SCRIPT_FINAL.md",
    "docs/VIVA_QA.md", "docs/COURSE_OUTLINE_MAPPING.md", "docs/RUBRIC_TRACEABILITY.md",
    "docs/DELIVERABLE_CHECKLIST.md", "docs/HARDWARE_BONUS.md", "docs/TEN_WEEK_PLAN.md", "docs/FINAL_AUDIT.md",
    "evidence/README.md",
]


def main():
    checks, failures = [], []

    def check(label, passed, detail=None):
        checks.append({"check": label, "passed": bool(passed), "detail": detail})
        if not passed:
            failures.append(label)

    missing = [name for name in REQUIRED if not (ROOT / name).is_file()]
    check("Required delivery files", not missing, missing)
    flows = json.loads((ROOT / "node-red/flows.json").read_text(encoding="utf-8-sig"))
    identifiers = {row["id"] for row in flows}
    broken_edges = [(row["id"], target) for row in flows
                    for target in [item for output in row.get("wires", []) for item in output] + row.get("links", [])
                    if target not in identifiers]
    check("12 Node-RED tabs and valid graph edges", len([row for row in flows if row["type"] == "tab"]) == 12 and not broken_edges, broken_edges)
    sketch = (ROOT / "wokwi-demo/sketch.ino").read_text(encoding="utf-8-sig")
    diagram = json.loads((ROOT / "wokwi-demo/diagram.json").read_text(encoding="utf-8-sig"))
    parts = diagram["parts"]
    check("3 physical buttons and 3 NeoPixels", sum(p["type"] == "wokwi-pushbutton" for p in parts) == 3 and sum(p["type"] == "wokwi-neopixel" for p in parts) == 3)
    edges = [{a, b} for a, b, *_ in diagram["connections"]]
    buttons = all({f"esp:{button}", f"button{device}:1.l"} in edges
                  for device, button in [("A01", 18), ("B01", 19), ("C01", 23)])
    pixels = all(edge in edges for edge in [
        {"esp:25", "ledA01:DIN"}, {"ledA01:DOUT", "ledB01:DIN"}, {"ledB01:DOUT", "ledC01:DIN"}
    ])
    check("Firmware/diagram buttons and independently indexed pixel chain", buttons and pixels and "{18, 19, 23}" in sketch)
    check("No blocking delay or physical ACK/DONE pins in active firmware", not re.search(r"\bdelay\s*\(|ACK_BUTTON|DONE_BUTTON", sketch))
    namespace = re.search(r'BASE_TOPIC\s*=\s*"([^"]+)"', sketch).group(1)
    example = (ROOT / "node-red/.env.example").read_text(encoding="utf-8-sig")
    check("Firmware/default middleware MQTT namespace agrees", f"MQTT_BASE_TOPIC={namespace}" in example)
    history = json.loads((ROOT / "node-red/data/history.json").read_text(encoding="utf-8-sig"))
    check("Historical records cover three zones and four weeks", {r["zone"] for r in history} == {"A", "B", "C"} and len({r["timestamp"][:10] for r in history}) == 28, {"rows": len(history)})
    check("Secret template has empty Telegram token", "TELEGRAM_BOT_TOKEN=\n" in example.replace("\r\n", "\n"))

    broken_links, secret_files = [], []
    token_pattern = re.compile(r"\b\d{6,12}:[A-Za-z0-9_-]{30,}\b")
    for path in ROOT.rglob("*"):
        if not path.is_file() or any(part in EXCLUDED for part in path.parts):
            continue
        if path.suffix.lower() not in {".md", ".js", ".cjs", ".json", ".ino", ".py", ".html", ".css", ".txt"}:
            continue
        if path.name in {"state.json", "state.json.bak", "history.json"}:
            continue
        text = path.read_text(encoding="utf-8-sig", errors="replace")
        if token_pattern.search(text):
            secret_files.append(str(path.relative_to(ROOT)))  # Never print the matched value.
        if path.suffix == ".md":
            for _, target in re.findall(r"\[([^\]]+)\]\(([^)]+)\)", text):
                if re.match(r"^(https?:|#|mailto:)", target):
                    continue
                target = target.split("#")[0].strip("<>")
                if target and not (path.parent / target).exists():
                    broken_links.append([str(path.relative_to(ROOT)), target])
    check("Local Markdown links resolve", not broken_links, broken_links)
    check("No Telegram token pattern in deliverable text", not secret_files, secret_files)
    result = {"at": dt.datetime.now(dt.timezone.utc).isoformat(), "source": "Actual static repository audit; runtime acceptance is separate",
              "checks": checks, "failures": failures,
              "manual": ["Telegram live requires token", "Hardware bonus optional", "See TEST_RESULTS for Wokwi runtime evidence"]}
    (ROOT / "evidence/repository-audit.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    for row in checks:
        print(("PASS " if row["passed"] else "FAIL ") + row["check"])
    raise SystemExit(bool(failures))


if __name__ == "__main__":
    main()
