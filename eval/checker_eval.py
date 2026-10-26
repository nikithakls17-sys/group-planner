"""Checker eval: 20 made-up groups with tricky constraints, raw Gemma suggestions, the plan checker, and an
independent answer key.

For each group, Gemma sees EVERY candidate place (no code pre-filter, unlike the app) plus the group's rules in
plain words, and is asked for 3 options. Each option is then judged twice:
  - by checker.check (what the app actually uses: parses Google-style opening-hours text and accessibility text),
  - by an answer key built from plain numbers on each made-up place (true price floor, open hours as numbers,
    access booleans) and straight-line geometry, written separately from the checker.
"% broke a rule" = options the answer key says break it / all raw options.
"% caught" = of those, how many the checker flagged for that rule.

Run from backend/:  ../.venv/Scripts/python ../eval/checker_eval.py
Uses the configured LLM (DigitalOcean Gemma in .env). About 20 calls.
"""
import json
import math
import random
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app import checker, llm  # noqa: E402
from app.times import find_windows, iso, local_to_utc, parse_iso  # noqa: E402

DAY = "2030-03-02"  # a Saturday
TZ = "Asia/Kolkata"
CENTER = (12.9716, 77.5946)  # Bengaluru
RULES = ["invented_place", "time_window", "budget", "cost_too_low", "distance", "closed", "access"]
BUDGETS = {"free": 0, "small": 15, "medium": 40}
LIMITS = {"walk": 2, "short": 15, "hour": 60}
LIMITS_NO_CAR = {"walk": 2, "short": 6, "hour": 25}


def offset(km_north: float, km_east: float):
    return CENTER[0] + km_north / 111.0, CENTER[1] + km_east / (111.0 * math.cos(math.radians(CENTER[0])))


def km(a, b):
    # equirectangular is plenty at city scale, and deliberately not the checker's haversine
    x = math.radians(b[1] - a[1]) * math.cos(math.radians((a[0] + b[0]) / 2))
    y = math.radians(b[0] - a[0])
    return 6371 * math.hypot(x, y)


def fmt_hours(o, c):
    h = lambda v: f"{(v - 1) % 12 + 1} {'AM' if v < 12 else 'PM'}"
    return "Closed" if o is None else f"{h(o)}–{h(c)}"


def make_places(rng: random.Random):
    """12 places: a mix of cheap/pricey, near/far, open/closed, accessible/not."""
    kinds = [("Cafe", "cafe"), ("Restaurant", "restaurant"), ("Bowling alley", "bowling"), ("Park", "park"),
             ("Board game cafe", "games"), ("Dessert shop", "dessert")]
    out = []
    for i in range(12):
        typ, word = kinds[i % len(kinds)]
        price_sym = "" if typ == "Park" else rng.choice(["$", "$$", "$$$"])
        floor = 0 if typ == "Park" else {"$": 8, "$$": 15, "$$$": 35}[price_sym]
        far = rng.random() < 0.3
        dist = rng.uniform(18, 40) if far else rng.uniform(0.5, 9)
        ang = rng.uniform(0, 2 * math.pi)
        lat, lon = offset(dist * math.sin(ang), dist * math.cos(ang))
        r = rng.random()
        open_h = None if r < 0.15 else (17 if r < 0.35 else 9)  # closed Saturday / evenings only / all day
        close_h = 23 if open_h is not None else None
        step_free = rng.choice([True, False, None])  # None = Google says nothing
        facts = []
        if step_free is True:
            facts.append("Wheelchair accessible entrance")
        elif step_free is False:
            facts.append("No wheelchair accessible entrance")
        out.append({
            "ref": f"p_{i}", "kind": "place", "title": f"{rng.choice(['Blue', 'Old', 'Little', 'Sunny', 'Corner', 'Green'])} {typ} {i}",
            "type": typ, "types": [typ], "price": price_sym, "lat": lat, "lon": lon, "address": f"{i} Example Road",
            "hours": {"saturday": fmt_hours(open_h, close_h)}, "accessibility": facts,
            # answer-key truth (the checker never reads these)
            "_floor": floor, "_open": open_h, "_close": close_h, "_step_free": step_free, "_word": word,
        })
    return out


def make_group(i: int, rng: random.Random):
    n = rng.randint(3, 5)
    tricks = []
    members = []
    for j in range(n):
        lat, lon = offset(rng.uniform(-3, 3), rng.uniform(-3, 3))
        picks = {"budget": rng.choice(["small", "medium", "nopref"]), "distance": rng.choice(["short", "hour"]), "car": "yes", "access": []}
        members.append({"id": f"m{j}", "name": f"Friend{j + 1}", "tz": TZ, "lat": lat, "lon": lon, "picks": picks})
    # every group gets 2 tricks
    for t in rng.sample(["zero_budget", "far_member", "no_car", "step_free", "evening_only", "us_member"], 2):
        tricks.append(t)
        m = rng.choice(members)
        if t == "zero_budget":
            m["picks"]["budget"] = "free"
        elif t == "far_member":
            m["lat"], m["lon"] = offset(rng.uniform(25, 35), rng.uniform(-5, 5))
            m["picks"]["distance"] = "short"
        elif t == "no_car":
            m["picks"]["car"] = "no"
            m["picks"]["distance"] = "short"
        elif t == "step_free":
            m["picks"]["access"] = ["step_free"]
        elif t == "evening_only":
            m["_evening"] = True
        elif t == "us_member":
            m["tz"] = "America/Chicago"
    for m in members:
        if m.get("_evening"):
            m["slots"] = [(local_to_utc(DAY, "18:00", m["tz"]), local_to_utc(DAY, "23:00", m["tz"]))]
        elif m["tz"] == "America/Chicago":
            m["slots"] = [(local_to_utc(DAY, "08:00", m["tz"]), local_to_utc(DAY, "13:00", m["tz"]))]
        else:
            m["slots"] = [(local_to_utc(DAY, "10:00", m["tz"]), local_to_utc(DAY, "23:00", m["tz"]))]
    return {"id": i + 1, "members": members, "tricks": tricks}


def prompt(g, places, windows):
    people = "\n".join(
        f"  - {m['name']}: budget {m['picks']['budget']}, travels {m['picks']['distance']}"
        f"{' (no car)' if m['picks']['car'] == 'no' else ''}{', needs step-free access' if 'step_free' in m['picks']['access'] else ''},"
        f" lives at ({m['lat']:.3f}, {m['lon']:.3f})" for m in g["members"])
    wins = "\n".join(f"  window {k}: {w['start']} to {w['end']} UTC, {len(w['free'])} of {len(g['members'])} free" for k, w in enumerate(windows))
    lines = "\n".join(
        f"  - {p['ref']} | {p['title']} | price {p['price'] or 'free'} | Saturday hours {p['hours']['saturday']} | at ({p['lat']:.3f}, {p['lon']:.3f})"
        f" | access: {', '.join(p['accessibility']) or 'not listed'}" for p in places)
    return f"""Suggest 3 different places for a group hangout on Saturday {DAY}, 2 hours long.
Budgets: free = $0, small = under $15, medium = under $40 per person. Travel: short = 15 km (6 km without a car), hour = 60 km.
People:
{people}
Free times:
{wins}
Places (copy the ref exactly):
{lines}
Return JSON {{"options": [{{"ref": "...", "window": 0, "cost_per_person": 0}}]}} with a realistic cost per person in dollars."""


def answer_key(opt, g, places, windows, min_free):
    """Which rules this option truly breaks, from plain numbers, not the checker's parsing."""
    broken = set()
    p = next((x for x in places if x["ref"] == opt.get("ref")), None)
    if not p:
        return {"invented_place"}
    try:
        w = windows[int(opt.get("window", 0))]
    except (ValueError, IndexError, TypeError):
        return {"time_window"}
    start, end = parse_iso(w["start"]), parse_iso(w["end"])
    free = [m for m in g["members"] if any(s <= start and end <= e for s, e in m["slots"])]
    if len(free) < min_free:
        broken.add("time_window")
    budgets = [BUDGETS[m["picks"]["budget"]] for m in g["members"] if m["picks"]["budget"] in BUDGETS]
    cost = opt.get("cost_per_person")
    if not isinstance(cost, (int, float)):
        broken.add("budget")
    else:
        if budgets and cost > min(budgets):
            broken.add("budget")
        if cost < p["_floor"]:
            broken.add("cost_too_low")
    for m in free:
        lim = (LIMITS_NO_CAR if m["picks"]["car"] == "no" else LIMITS).get(m["picks"]["distance"])
        if lim is not None and km((m["lat"], m["lon"]), (p["lat"], p["lon"])) > lim:
            broken.add("distance")
    local_start = start.astimezone(__import__("zoneinfo").ZoneInfo(TZ))
    local_end = end.astimezone(__import__("zoneinfo").ZoneInfo(TZ))
    if p["_open"] is None or not (p["_open"] <= local_start.hour and (local_end.hour + local_end.minute / 60) <= p["_close"]):
        broken.add("closed")
    if any("step_free" in m["picks"]["access"] for m in free) and p["_step_free"] is False:
        broken.add("access")
    return broken


def main():
    rng = random.Random(26)
    groups = [make_group(i, rng) for i in range(20)]
    rows, raw_total = [], 0
    broke = {r: 0 for r in RULES}
    caught = {r: 0 for r in RULES}
    false_alarm = {r: 0 for r in RULES}
    any_broke = 0
    any_caught = 0
    for g in groups:
        places = make_places(rng)
        windows = find_windows(g["members"], DAY, DAY, 2, now=datetime(2030, 3, 1, tzinfo=timezone.utc))
        if not windows:
            rows.append({"group": g["id"], "tricks": g["tricks"], "note": "no common window"})
            continue
        min_free = len(windows[0]["free"])
        try:
            data, _ = llm.chat_json([{"role": "user", "content": prompt(g, places, windows)}], temperature=0.6, max_tokens=900, operation="eval")
            opts = (data.get("options") or [])[:3]
        except Exception as e:
            rows.append({"group": g["id"], "tricks": g["tricks"], "note": f"llm error {str(e)[:80]}"})
            continue
        cands = {p["ref"]: p for p in places}
        ctx = {"members": g["members"], "candidates": cands, "min_free": min_free, "start_day": DAY, "end_day": DAY,
               "locks": {}, "planner_tz": TZ, "place_tz": TZ}
        for o in opts:
            raw_total += 1
            try:
                w = windows[int(o.get("window", 0))]
                opt = {"kind": "place", "ref": o.get("ref"), "title": o.get("ref"), "cost_per_person": o.get("cost_per_person"),
                       "start": w["start"], "end": w["end"]}
            except (ValueError, IndexError, TypeError):
                opt = {"kind": "place", "ref": o.get("ref"), "title": o.get("ref"), "cost_per_person": o.get("cost_per_person")}
            flagged = {f["rule"] for f in checker.check(opt, ctx)}
            truth = answer_key(o, g, places, windows, min_free)
            if truth:
                any_broke += 1
                if truth & flagged:
                    any_caught += 1
            for r in RULES:
                if r in truth:
                    broke[r] += 1
                    caught[r] += r in flagged
                elif r in flagged:
                    false_alarm[r] += 1
            rows.append({"group": g["id"], "tricks": g["tricks"], "ref": o.get("ref"), "cost": o.get("cost_per_person"),
                         "truth": sorted(truth), "checker": sorted(flagged)})
    pct = lambda a, b: f"{100 * a / b:.0f}%" if b else "n/a"
    table = ["| Rule | Raw Gemma options breaking it | Caught by the checker | Checker false alarms |", "|---|---|---|---|"]
    for r in RULES:
        table.append(f"| {r} | {broke[r]} of {raw_total} ({pct(broke[r], raw_total)}) | {caught[r]} of {broke[r]} ({pct(caught[r], broke[r])}) | {false_alarm[r]} |")
    table.append(f"| **any rule** | **{any_broke} of {raw_total} ({pct(any_broke, raw_total)})** | **{any_caught} of {any_broke} ({pct(any_caught, any_broke)})** | |")
    out = Path(__file__).with_name("checker_eval_results.json")
    out.write_text(json.dumps({"raw_options": raw_total, "rows": rows, "broke": broke, "caught": caught, "false_alarm": false_alarm}, indent=1))
    print("\n".join(table))
    print(f"\nmodel: {llm.model_name()}, groups: {len(groups)}, raw options: {raw_total}, details: {out.name}")


if __name__ == "__main__":
    main()
