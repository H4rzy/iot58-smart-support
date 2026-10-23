#!/usr/bin/env python3
"""Webcam people counter for the vision contract (demo stand-in for the ESP32-S3 camera).

Reads frames with OpenCV, counts people with MediaPipe EfficientDet-Lite0 (CPU),
assigns each person to zone A/B/C by the horizontal centre of its box, and publishes
{BASE}/vision/{zone} every --interval seconds. Only integers and a rounded confidence
leave this process. Frames are never written to disk or sent over the network.

Examples:
  python -I vision/publisher.py --dry-run --ticks 3
  python -I vision/publisher.py --host 127.0.0.1 --port 1883
  python -I vision/publisher.py --zones draw        # click two split lines, then run with --zones
"""

from __future__ import annotations

import argparse
import bisect
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# Defaults mirror node-red/.env.example (MQTT_HOST, MQTT_PORT, MQTT_BASE_TOPIC).
DEFAULT_HOST = "broker.hivemq.com"
DEFAULT_PORT = 1883
DEFAULT_BASE_TOPIC = "huit/iot58/n20-smart-support/store/s1"
DEFAULT_INTERVAL = 1.0
DEFAULT_SCORE_THRESHOLD = 0.5
DEFAULT_MODEL = Path(__file__).resolve().parent / "models" / "efficientdet_lite0.tflite"
MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/object_detector/"
    "efficientdet_lite0/float32/latest/efficientdet_lite0.tflite"
)
KEEPALIVE_SECONDS = 30
MAX_READ_FAILURES = 10
MAX_PERSONS = 50
SCHEMA_VERSION = 1
ZONES = ("A", "B", "C")
EXIT_USAGE = 2
KEY_ENTER = (13, 10)
KEY_ESCAPE = 27
PERSON_LABEL = "person"


def build_payload(zone: str, persons: int, confidence: float, ts: str | None = None) -> str:
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


def parse_zone_boundaries(spec: str) -> list[float]:
    """Parse --zones: 'equal' (three equal columns) or 'f1,f2' as fractions of frame width."""
    if spec == "equal":
        return [1 / 3, 2 / 3]
    try:
        fractions = [float(part) for part in spec.split(",")]
    except ValueError as exc:
        raise ValueError(f"--zones must be 'equal', 'draw' or 'f1,f2': {exc}") from exc
    if len(fractions) != len(ZONES) - 1 or not 0 < fractions[0] < fractions[1] < 1:
        raise ValueError("--zones needs two increasing fractions in (0,1), e.g. 0.35,0.7")
    return fractions


def zone_for_fraction(x_fraction: float, boundaries: list[float]) -> str:
    """Map a horizontal position (0..1 of frame width) to zone A, B or C."""
    return ZONES[bisect.bisect_right(boundaries, x_fraction)]


def count_zones(detections: list[tuple[float, float]], boundaries: list[float]) -> dict[str, tuple[int, float]]:
    """Return {zone: (persons, confidence)} from (x_fraction, score) detections.

    Confidence is the mean detection score of the people in that zone, 0.0 when empty.
    """
    scores: dict[str, list[float]] = {zone: [] for zone in ZONES}
    for x_fraction, score in detections:
        scores[zone_for_fraction(x_fraction, boundaries)].append(score)
    result = {}
    for zone, values in scores.items():
        persons = min(len(values), MAX_PERSONS)
        confidence = sum(values) / len(values) if values else 0.0
        result[zone] = (persons, round(confidence, 2))
    return result


def open_detector(model_path: Path, score_threshold: float):
    """Create a MediaPipe ObjectDetector limited to the 'person' class (CPU only)."""
    if not model_path.is_file():
        raise SystemExit(f"model not found: {model_path}\ndownload it from {MODEL_URL}")
    try:
        from mediapipe.tasks import python as mp_python
        from mediapipe.tasks.python import vision as mp_vision
    except ImportError:
        raise SystemExit("mediapipe is not installed: pip install -r vision/requirements.txt")
    options = mp_vision.ObjectDetectorOptions(
        base_options=mp_python.BaseOptions(model_asset_path=str(model_path)),
        running_mode=mp_vision.RunningMode.IMAGE,
        max_results=MAX_PERSONS,
        score_threshold=score_threshold,
        category_allowlist=[PERSON_LABEL],
    )
    return mp_vision.ObjectDetector.create_from_options(options)


def detect_people(detector, frame) -> tuple[list[tuple[float, float]], list[tuple[int, int, int, int]]]:
    """Run the detector on one BGR frame.

    Returns ((x_fraction, score) per person, (x, y, w, h) boxes in pixels for --show).
    """
    import cv2
    import mediapipe as mp

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    result = detector.detect(image)
    width = frame.shape[1]
    people, boxes = [], []
    for detection in result.detections:
        box = detection.bounding_box
        centre_x = box.origin_x + box.width / 2
        people.append((centre_x / width, detection.categories[0].score))
        boxes.append((box.origin_x, box.origin_y, box.width, box.height))
    return people, boxes


def open_camera(index: int):
    """Open the webcam; DirectShow on Windows opens noticeably faster."""
    import cv2

    backend = cv2.CAP_DSHOW if sys.platform == "win32" else cv2.CAP_ANY
    capture = cv2.VideoCapture(index, backend)
    if not capture.isOpened():
        raise SystemExit(f"cannot open camera index {index} (try --camera-index)")
    return capture


def draw_zone_lines(frame, boundaries: list[float]) -> None:
    """Draw the zone split lines on a frame (display only)."""
    import cv2

    height, width = frame.shape[:2]
    for fraction in boundaries:
        x = int(fraction * width)
        cv2.line(frame, (x, 0), (x, height), (0, 255, 255), 2)


def draw_preview(frame, boundaries, boxes, counts) -> None:
    """Show the frame with boxes, zone lines and per-zone counts in a window."""
    import cv2

    draw_zone_lines(frame, boundaries)
    for x, y, w, h in boxes:
        cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 255, 0), 2)
    edges = [0.0] + boundaries + [1.0]
    height, width = frame.shape[:2]
    for index, zone in enumerate(ZONES):
        label = f"{zone}: {counts[zone][0]}"
        cv2.putText(frame, label, (int((edges[index] + 0.02) * width), 30), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 255), 2)
    cv2.imshow("vision publisher (q to quit)", frame)


def draw_zones_interactively(camera_index: int) -> int:
    """Let the user click two split lines on one frame and print the --zones value."""
    import cv2

    capture = open_camera(camera_index)
    ok, frame = capture.read()
    capture.release()
    if not ok:
        raise SystemExit("cannot read a frame for zone drawing")
    clicks: list[float] = []

    def on_mouse(event, x, _y, _flags, _param):
        if event == cv2.EVENT_LBUTTONDOWN:
            clicks.append(x / frame.shape[1])
            del clicks[:-2]

    window = "draw zones: click 2 lines, ENTER to print, ESC to cancel"
    cv2.namedWindow(window)
    cv2.setMouseCallback(window, on_mouse)
    try:
        while True:
            view = frame.copy()
            draw_zone_lines(view, sorted(clicks))
            cv2.imshow(window, view)
            key = cv2.waitKey(30) & 0xFF
            if key == KEY_ESCAPE:
                return EXIT_USAGE
            if key in KEY_ENTER and len(clicks) == len(ZONES) - 1:
                print(f"--zones {','.join(f'{value:.3f}' for value in sorted(clicks))}")
                return 0
    finally:
        cv2.destroyAllWindows()


def connect_client(host: str, port: int):
    """Create a connected paho-mqtt client with its network loop running."""
    try:
        import paho.mqtt.client as mqtt
    except ImportError:
        raise SystemExit("paho-mqtt is not installed: pip install -r vision/requirements.txt")
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"vision-publisher-{os.getpid()}")
    try:
        client.connect(host, port, keepalive=KEEPALIVE_SECONDS)
    except OSError as exc:
        raise SystemExit(f"cannot connect to MQTT broker {host}:{port}: {exc}") from exc
    client.loop_start()
    return client


def tick_messages(base_topic: str, zone_counts: dict[str, tuple[int, float]]) -> list[tuple[str, str]]:
    """Return (topic, payload) for each zone, with one timestamp for the whole tick."""
    ts = utc_timestamp()
    return [
        (f"{base_topic}/vision/{zone}", build_payload(zone, persons, confidence, ts))
        for zone, (persons, confidence) in zone_counts.items()
    ]


def run(args: argparse.Namespace) -> int:
    """Capture, count and publish (or print) once per interval until stopped."""
    import cv2

    boundaries = parse_zone_boundaries(args.zones)
    detector = open_detector(Path(args.model), args.score_threshold)
    capture = open_camera(args.camera_index)
    client = None if args.dry_run else connect_client(args.host, args.port)
    failures = 0
    tick = 0
    try:
        while not (args.ticks and tick >= args.ticks):
            started = time.monotonic()
            ok, frame = capture.read()
            if not ok:
                failures += 1
                if failures >= MAX_READ_FAILURES:
                    raise SystemExit("camera stopped delivering frames; nothing published")
                time.sleep(args.interval)
                continue
            failures = 0
            people, boxes = detect_people(detector, frame)
            zone_counts = count_zones(people, boundaries)
            for topic, payload in tick_messages(args.base_topic, zone_counts):
                if client is None:
                    print(f"{topic} {payload}")
                else:
                    client.publish(topic, payload, qos=0)
            tick += 1
            if args.show:
                draw_preview(frame, boundaries, boxes, zone_counts)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break
            time.sleep(max(0.0, started + args.interval - time.monotonic()))
    except KeyboardInterrupt:
        pass
    finally:
        capture.release()
        if client is not None:
            client.loop_stop()
            client.disconnect()
        if args.show:
            cv2.destroyAllWindows()
    return 0


def build_parser() -> argparse.ArgumentParser:
    """Define the command-line interface."""
    parser = argparse.ArgumentParser(description="Count people per zone from a webcam and publish them (schema 1).")
    parser.add_argument("--host", default=DEFAULT_HOST, help="MQTT broker host (default: %(default)s)")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="MQTT broker port (default: %(default)s)")
    parser.add_argument("--base-topic", default=DEFAULT_BASE_TOPIC, help="topic prefix (default: %(default)s)")
    parser.add_argument("--camera-index", type=int, default=0, help="OpenCV camera index (default: %(default)s)")
    parser.add_argument("--interval", type=float, default=DEFAULT_INTERVAL, help="seconds between publishes (default: %(default)s)")
    parser.add_argument("--zones", default="equal", help="'equal', 'draw' (interactive), or 'f1,f2' split fractions (default: %(default)s)")
    parser.add_argument("--model", default=str(DEFAULT_MODEL), help="path to efficientdet_lite0.tflite (default: %(default)s)")
    parser.add_argument("--score-threshold", type=float, default=DEFAULT_SCORE_THRESHOLD, help="minimum detector score (default: %(default)s)")
    parser.add_argument("--show", action="store_true", help="show a preview window (off by default)")
    parser.add_argument("--dry-run", action="store_true", help="print payloads instead of publishing")
    parser.add_argument("--ticks", type=int, default=0, help="stop after N publishes; 0 runs until Ctrl+C (default: 0)")
    return parser


def main(argv: list[str] | None = None) -> int:
    """Entry point: validate arguments, then count and publish, or draw zones."""
    args = build_parser().parse_args(argv)
    if args.interval <= 0 or args.ticks < 0:
        print("--interval must be > 0 and --ticks >= 0", file=sys.stderr)
        return EXIT_USAGE
    if args.zones == "draw":
        return draw_zones_interactively(args.camera_index)
    try:
        parse_zone_boundaries(args.zones)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return EXIT_USAGE
    return run(args)


if __name__ == "__main__":
    sys.exit(main())
