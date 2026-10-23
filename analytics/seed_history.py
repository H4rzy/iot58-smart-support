"""Deterministic synthetic retail demand. Not real customer measurements."""
import argparse
import datetime as dt
import json
import math
import random
from pathlib import Path

TZ = dt.timezone(dt.timedelta(hours=7))
DEFAULT_ANCHOR = "2026-10-09"


def poisson(rng, mean):
    limit, product, count = math.exp(-mean), 1.0, 0
    while product > limit:
        count += 1
        product *= rng.random()
    return count - 1


def generate(anchor=DEFAULT_ANCHOR, seed=58):
    rng = random.Random(seed)
    end = dt.datetime.fromisoformat(anchor).replace(tzinfo=TZ, hour=0, minute=0, second=0)
    rows = []
    for days_before in range(28, 0, -1):
        day = end - dt.timedelta(days=days_before)
        weekend = day.weekday() >= 5
        for hour in range(9, 22):
            for zone in "ABC":
                baseline = {"A": 8, "B": 7, "C": 4}[zone]
                peak = 18 <= hour < 20 if zone == "A" else 17 <= hour < 19 if zone == "B" else 16 <= hour < 18
                demand = baseline + ({"A": 36, "B": 20, "C": 3}[zone] if peak else 0)
                demand *= 1.25 if weekend else 1
                if weekend and 11 <= hour <= 14:
                    demand *= 1.2
                for _ in range(poisson(rng, demand)):
                    stamp = day.replace(hour=hour, minute=rng.randrange(60), second=rng.randrange(60))
                    service = round(max(20, rng.gauss({"A": 140, "B": 110, "C": 75}[zone], 25)), 1)
                    response = round(max(2, rng.gauss(28 + (30 if peak else 0) + (8 if weekend else 0), 12)), 1)
                    rows.append({"timestamp": stamp.isoformat(), "zone": zone,
                                 "intent": "PAYMENT" if rng.random() < .25 else "CONSULTATION",
                                 "response_seconds": response, "service_seconds": service,
                                 "sla_breached": response > 60,
                                 "csat": "SATISFIED" if rng.random() < (.8 if response > 60 else .94) else "UNSATISFIED"})
    return sorted(rows, key=lambda row: (row["timestamp"], row["zone"]))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--anchor", default=DEFAULT_ANCHOR, help="Exclusive dataset end date, YYYY-MM-DD in UTC+7")
    parser.add_argument("--seed", type=int, default=58)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "node-red/data/history.json")
    args = parser.parse_args()
    rows = generate(args.anchor, args.seed)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"SYNTHETIC ONLY: {len(rows)} tickets, seed={args.seed}, four weeks before {args.anchor} -> {args.output}")


if __name__ == "__main__":
    main()
