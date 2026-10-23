#!/usr/bin/env python3
"""Fake camera publisher for the vision contract (no webcam needed).

Publishes {BASE}/vision/{zone} with schema 1, one message per zone every
--interval seconds (a heartbeat even when counts do not change).

Examples:
  python -I vision/simulate.py --dry-run A=2,B=0,C=1
  python -I vision/simulate.py A=2,B=0,C=1 --host 127.0.0.1 --duration 30
  python -I vision/simulate.py timeline.json --host 127.0.0.1
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Dict, List, Optional

# Defaults mirror node-red/.env.example (MQTT_HOST, MQTT_PORT, MQTT_BASE_TOPIC).
DEFAULT_HOST = "broker.hivemq.com"
DEFAULT_PORT = 1883
DEFAULT_BASE_TOPIC = "huit/iot58/n20-smart-support/store/s1"
DEFAULT_INTERVAL = 1.0
DEFAULT_CONFIDENCE = 0.9
DEFAULT_DRY_RUN_TICKS = 3
KEEPALIVE_SECONDS = 30
EXIT_USAGE = 2
SCHEMA_VERSION = 1
ZONES = ("A", "B", "C")
MAX_PERSONS = 50

Counts = Dict[str, int]
Scenario = Callable[[float], Counts]


def build_payload(zone: str, persons: int, confidence: float, ts: Optional[str] = None) -> str:
    """Return the JSON text of one vision message (contract section 2)."""
    body = {
        "schema": SCHEMA_VERSION,
        "camera_id": f"CAM-{zone}",
        "zone": zone,
        "persons": persons,
        "confidence": round(confidence, 2),
        "ts": ts or utc_timestamp(),
    }
    return json.dumps(body, separators=(",", ":"))


def utc_timestamp() -> str:
    """Return the current UTC time as ISO 8601 with milliseconds and a Z suffix."""
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def check_persons(value: object, where: str) -> int:
    """Validate a person count: an integer from 0 to MAX_PERSONS (bools are rejected)."""
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= MAX_PERSONS:
        raise ValueError(f"{where}: persons must be an integer 0..{MAX_PERSONS}, got {value!r}")
    return value


def parse_inline_counts(spec: str) -> Counts:
    """Parse 'A=2,B=0,C=1'. Zones not mentioned count as 0."""
    counts: Counts = {zone: 0 for zone in ZONES}
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        zone, sep, value = part.partition("=")
        zone = zone.strip().upper()
        if not sep or zone not in ZONES:
            raise ValueError(f"bad segment {part!r}: expected ZONE=COUNT with ZONE in A,B,C")
        try:
            counts[zone] = check_persons(int(value.strip()), part)
        except ValueError as exc:
            raise ValueError(f"bad segment {part!r}: {exc}") from exc
    return counts


def load_timeline(path: Path) -> Scenario:
    """Load a JSON timeline and return a function giving zone counts at time t (seconds).

    Accepted shapes: a list of steps, or {"steps": [...]}. Each step is
    {"at": seconds, "A": n, "B": n, "C": n}; zones omitted keep their last value
    (initially 0). The last step holds until the run ends.
    """
    data = json.loads(path.read_text(encoding="utf-8"))
    steps = data.get("steps") if isinstance(data, dict) else data
    if not isinstance(steps, list) or not steps:
        raise ValueError("timeline must be a non-empty list of steps (or {\"steps\": [...]})")
    resolved: List[tuple] = []
    current: Counts = {zone: 0 for zone in ZONES}
    for index, step in enumerate(steps):
        where = f"step {index}"
        at = step.get("at") if isinstance(step, dict) else None
        if isinstance(at, bool) or not isinstance(at, (int, float)) or at < 0:
            raise ValueError(f"{where}: 'at' must be a number >= 0")
        for key, value in step.items():
            if key == "at":
                continue
            zone = str(key).upper()
            if zone not in ZONES:
                raise ValueError(f"{where}: unknown zone {key!r}")
            current[zone] = check_persons(value, where)
        resolved.append((float(at), dict(current)))
    resolved.sort(key=lambda item: item[0])

    def counts_at(seconds: float) -> Counts:
        chosen = resolved[0][1]
        for at, counts in resolved:
            if at <= seconds:
                chosen = counts
        return dict(chosen)

    return counts_at


def load_scenario(source: str) -> Scenario:
    """Turn the positional argument into a scenario: inline counts or a JSON timeline file."""
    if source.lower().endswith(".json"):
        return load_timeline(Path(source))
    constant = parse_inline_counts(source)
    return lambda _seconds: dict(constant)


def tick_messages(base_topic: str, counts: Counts, confidence: float) -> List[tuple]:
    """Return (topic, payload) for every zone; confidence is 0.0 for zones with no one."""
    messages = []
    for zone in ZONES:
        persons = counts[zone]
        conf = confidence if persons > 0 else 0.0
        messages.append((f"{base_topic}/vision/{zone}", build_payload(zone, persons, conf)))
    return messages


def connect_client(host: str, port: int):
    """Create a connected paho-mqtt client with its network loop running."""
    try:
        import paho.mqtt.client as mqtt
    except ImportError:
        raise SystemExit("paho-mqtt is not installed: pip install -r vision/requirements.txt")
    client_id = f"vision-simulate-{os.getpid()}"
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=client_id)
    try:
        client.connect(host, port, keepalive=KEEPALIVE_SECONDS)
    except OSError as exc:
        raise SystemExit(f"cannot connect to MQTT broker {host}:{port}: {exc}") from exc
    client.loop_start()
    return client


def publish_tick(client, base_topic: str, counts: Counts, confidence: float) -> None:
    """Publish one message per zone for this tick."""
    for topic, payload in tick_messages(base_topic, counts, confidence):
        client.publish(topic, payload, qos=0)


def run_live(args: argparse.Namespace, scenario: Scenario) -> int:
    """Publish ticks in real time until --duration elapses (0 = until Ctrl+C)."""
    client = connect_client(args.host, args.port)
    start = time.monotonic()
    tick = 0
    try:
        while True:
            elapsed = time.monotonic() - start
            if args.duration and elapsed > args.duration:
                break
            publish_tick(client, args.base_topic, scenario(elapsed), args.confidence)
            tick += 1
            time.sleep(max(0.0, start + tick * args.interval - time.monotonic()))
    except KeyboardInterrupt:
        pass
    finally:
        client.loop_stop()
        client.disconnect()
    print(f"published {tick} ticks to {args.base_topic}/vision/{{A,B,C}}", file=sys.stderr)
    return 0


def run_dry(args: argparse.Namespace, scenario: Scenario) -> int:
    """Print the first ticks without sleeping or touching the network."""
    if args.duration:
        ticks = int(args.duration / args.interval) + 1
    else:
        ticks = DEFAULT_DRY_RUN_TICKS
    for tick in range(ticks):
        for topic, payload in tick_messages(args.base_topic, scenario(tick * args.interval), args.confidence):
            print(f"{topic} {payload}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    """Define the command-line interface."""
    parser = argparse.ArgumentParser(description="Publish simulated vision counts (contract schema 1).")
    parser.add_argument("scenario", help="inline counts like A=2,B=0,C=1, or a .json timeline file")
    parser.add_argument("--host", default=DEFAULT_HOST, help="MQTT broker host (default: %(default)s)")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="MQTT broker port (default: %(default)s)")
    parser.add_argument("--base-topic", default=DEFAULT_BASE_TOPIC, help="topic prefix (default: %(default)s)")
    parser.add_argument("--interval", type=float, default=DEFAULT_INTERVAL, help="seconds between ticks (default: %(default)s)")
    parser.add_argument("--duration", type=float, default=0.0, help="stop after N seconds; 0 runs until Ctrl+C (default: 0)")
    parser.add_argument("--confidence", type=float, default=DEFAULT_CONFIDENCE, help="confidence sent for zones with people (default: %(default)s)")
    parser.add_argument("--dry-run", action="store_true", help="print payloads instead of publishing; no broker needed")
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    """Entry point: parse arguments, build the scenario, then dry-run or publish."""
    args = build_parser().parse_args(argv)
    if args.interval <= 0:
        print("--interval must be > 0", file=sys.stderr)
        return EXIT_USAGE
    try:
        scenario = load_scenario(args.scenario)
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        print(f"invalid scenario: {exc}", file=sys.stderr)
        return EXIT_USAGE
    if args.dry_run:
        return run_dry(args, scenario)
    return run_live(args, scenario)


if __name__ == "__main__":
    sys.exit(main())
