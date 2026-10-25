"""Gemma suggests options; checker.py decides which ones anyone sees."""
import json
import re
import secrets
from collections import Counter
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from . import checker, config, llm, places
from .observability import report_issue
from .store import now_iso, store
from .times import DURATION, find_windows, iso, local_to_utc, parse_iso

ONLINE = [
    {"ref": "o_gartic", "title": "Gartic Phone", "what": "Draw-and-guess telephone game in the browser", "cost_floor": 0,
     "link": "https://garticphone.com", "how": ["One person opens garticphone.com and creates a room", "Share the room link in the call", "Play 3-4 rounds, about 10 minutes each"]},
    {"ref": "o_codenames", "title": "Codenames Online", "what": "Team word-guessing game", "cost_floor": 0,
     "link": "https://codenames.game", "how": ["Open codenames.game and create a room", "Split into two teams on the call", "Pick a spymaster per team and play"]},
    {"ref": "o_skribbl", "title": "skribbl.io", "what": "Quick drawing and guessing game", "cost_floor": 0,
     "link": "https://skribbl.io", "how": ["Create a private room on skribbl.io", "Paste the invite link in the chat", "Play a few rounds"]},
    {"ref": "o_watch", "title": "Watch party", "what": "Watch a movie or episode together in sync", "cost_floor": 0,
     "link": "https://www.teleparty.com", "how": ["Pick a movie everyone can stream", "Install Teleparty (or count down and press play together)", "Keep a video call open to chat"]},
    {"ref": "o_cook", "title": "Cook-along call", "what": "Everyone cooks the same simple recipe on a video call", "cost_floor": 8,
     "link": "", "how": ["Pick one easy recipe and share the shopping list", "Start a video call with cameras on the kitchen", "Cook together, then eat together on the call"]},
    {"ref": "o_quiz", "title": "Quiz night", "what": "Take turns hosting quick quiz rounds", "cost_floor": 0,
     "link": "https://www.jetpunk.com", "how": ["Each person brings one 5-question round", "Share screen on JetPunk or a slide", "Keep score in the chat"]},
    {"ref": "o_geo", "title": "GeoGuessr party", "what": "Guess where in the world you are from street view", "cost_floor": 0,
     "link": "https://www.geoguessr.com", "how": ["One person makes a free party on geoguessr.com", "Share the party link", "Play a few rounds and compare scores"]},
]
HOME_ACTIVITIES = "board games, movie night, potluck dinner, cook together, card games"


# ---------- "Type it" availability ----------

def parse_availability(text: str, tz: str, start_day: str, end_day: str, dates: list[str] | None = None) -> list[dict]:
    if not dates:
        dates, d = [], date.fromisoformat(start_day)
        while d <= date.fromisoformat(end_day) and len(dates) < 21:
            dates.append(d.isoformat())
            d += timedelta(days=1)
    days = [f"{x} ({date.fromisoformat(x).strftime('%A')})" for x in dates[:31]]
    prompt = (
        "Turn someone's free time description into time slots.\n"
        f"Days in the plan: {', '.join(days)}\n"
        f'They wrote: "{text}"\n\n'
        'Return JSON {"slots": [{"day": "YYYY-MM-DD", "start": "HH:MM", "end": "HH:MM"}]} using 24-hour local times, '
        "only for the days listed. 'Evening' = 17:00-22:00, 'morning' = 09:00-12:00, 'afternoon' = 12:00-17:00, "
        "'all day' = 09:00-22:00, 'after 6' = 18:00-22:00. If they say they're busy at a time, leave it out."
    )
    data, _ = llm.chat_json([{"role": "user", "content": prompt}], temperature=0, max_tokens=900, operation="parse_availability")
    out = []
    allowed = set(dates)
    for s in data.get("slots") or []:
        try:
            if s["day"] not in allowed:
                continue
            a, b = local_to_utc(s["day"], s["start"], tz), local_to_utc(s["day"], s["end"], tz)
            if b > a:
                out.append({"start": iso(a), "end": iso(b)})
        except (KeyError, ValueError, TypeError):
            continue
    return out


def plan_hours(plan: dict) -> float:
    """Default length per kind, unless the planner gave an optional start and end time."""
    locks = plan.get("locks") or {}
    if locks.get("time") and locks.get("end_time"):
        h1, m1 = (int(x) for x in locks["time"].split(":"))
        h2, m2 = (int(x) for x in locks["end_time"].split(":"))
        mins = (h2 * 60 + m2) - (h1 * 60 + m1)
        if mins >= 30:
            return mins / 60
    return DURATION.get(plan["kind"], 2)


# ---------- context ----------

def member_ctx(members: list[dict], plan: dict) -> list[dict]:
    """Answered members with slots as datetimes and the planner's details applied when the planner decided."""
    out = []
    for m in members:
        if m.get("status") != "answered":
            continue
        picks = dict(m.get("picks") or {})
        if plan.get("decide") == "planner":
            picks = {**(plan.get("details") or {}), "car": picks.get("car"), "notes": picks.get("notes"),
                     "can_host": picks.get("can_host"), "best_day": picks.get("best_day")}
        out.append({"id": m["id"], "name": m["name"], "tz": m.get("tz") or "UTC", "picks": picks,
                    "lat": m.get("lat"), "lon": m.get("lon"), "city": m.get("city", ""),
                    "slots": [(parse_iso(s["start"]), parse_iso(s["end"])) for s in m.get("availability") or []]})
    return out


def _event_day(text: str, start_day: str) -> str | None:
    """'Oct 31' -> '2026-10-31' using the plan's year."""
    try:
        d = datetime.strptime(f"{text.strip()} {start_day[:4]}", "%b %d %Y").date()
        return d.isoformat()
    except ValueError:
        return None


def gather(plan: dict, ms: list[dict]) -> dict:
    """Everything the planner prompt and the checker need."""
    hours = plan_hours(plan)
    preferred = Counter(m["picks"].get("best_day") for m in ms if m["picks"].get("best_day"))
    windows = find_windows(ms, plan["start_day"], plan["end_day"], hours, days=set(plan.get("dates") or []) or None,
                           day_tz=plan.get("tz") or "UTC", preferred=dict(preferred))
    pts = [(m["lat"], m["lon"]) for m in ms if m.get("lat") is not None]
    spread = max((places.km(a, b) for a in pts for b in pts), default=0)
    where = Counter((m["picks"].get("where") or "anywhere") for m in ms)
    moods = Counter(x for m in ms for x in (m["picks"].get("moods") or []) if x != "nopref")
    far_apart = spread > 80 or plan["kind"] == "call"
    cands: dict[str, dict] = {}
    want_out = not far_apart and (where["out"] + where["anywhere"] + where["nopref"] > 0 or not where)
    mid = places.midpoint(pts) if pts else None
    place_tz = None
    if mid:
        nearest = min(ms, key=lambda m: places.km((m["lat"], m["lon"]), mid) if m.get("lat") is not None else 1e9)
        place_tz = nearest["tz"]
    searched = 0
    if want_out and mid and config.SERPAPI_KEY:
        kind_q = {"meal": "restaurant", "date": "cafe", "trip": "things to do"}.get(plan["kind"])
        queries = [kind_q] if kind_q else []
        for mood, _ in moods.most_common(3):
            q = places.MOOD_QUERIES.get(mood)
            if q and q not in queries:
                queries.append(q)
        for q in (queries or ["cafe"])[:2]:
            for c in places.search_places(q, *mid):
                cands[c["ref"]] = {**c, "kind": "place"}
                searched += 1
        city = next((m["city"] for m in ms if m.get("city")), "")
        if city and plan["kind"] not in ("meal", "call"):
            for e in places.search_events(city):
                g = places.geocode(e["address"].split(",")[-1]) if e["address"] else None
                cands[e["ref"]] = {**e, "kind": "event", "event_date": _event_day(e["start_date"], plan["start_day"]) if e["start_date"] else None,
                                   "lat": (g or {}).get("lat"), "lon": (g or {}).get("lon")}
                searched += 1
    if far_apart or where["online"] or where["anywhere"] or not want_out:
        for o in ONLINE:
            cands[o["ref"]] = {**o, "kind": "online"}
    hosts = [m for m in ms if m["picks"].get("can_host")]
    if not far_apart and (where["home"] or where["anywhere"]):
        for h in hosts:
            cands["h_" + h["id"][:8]] = {"ref": "h_" + h["id"][:8], "kind": "home", "title": f"At {h['name']}'s home",
                                          "host_id": h["id"], "host": h["name"], "lat": h["lat"], "lon": h["lon"], "cost_floor": 0}
    return {"hours": hours, "windows": windows, "candidates": cands, "far_apart": far_apart, "spread_km": round(spread),
            "where": dict(where), "moods": dict(moods), "searched": searched, "place_tz": place_tz,
            "budget": checker.group_budget(ms)}


# ---------- Gemma ----------

def _prompt(plan: dict, ms: list[dict], g: dict, n: int, avoid: list[str], feedback: list[str]) -> str:
    def local(w):
        s = parse_iso(w["start"])
        return "; ".join(f"{m['name']} {s.astimezone(ZoneInfo(m['tz'])).strftime('%a %d %b %I:%M %p')}" for m in ms)

    wins = "\n".join(f"  window {i}: {w['start']} to {w['end']} (UTC). Local: {local(w)}. Free: {len(w['free'])} of {len(ms)}"
                     for i, w in enumerate(g["windows"]))
    lines = []
    for c in g["candidates"].values():
        if c["ref"] in avoid:
            continue
        bits = [c["ref"], c["kind"], c["title"]]
        if c["kind"] == "place":
            bits += [c.get("type", ""), f"price {c.get('price') or 'unknown'}", f"rating {c.get('rating')}", c.get("address", "")]
        elif c["kind"] == "event":
            bits += [f"when {c.get('when')}", c.get("address", "")]
        elif c["kind"] == "online":
            bits += [c["what"], f"min cost ${c['cost_floor']}"]
        else:
            bits += [f"host {c['host']}", HOME_ACTIVITIES]
        lines.append("  - " + " | ".join(str(b) for b in bits if b))
    people = "\n".join(
        f"  - {m['name']}: city {m.get('city') or 'unknown'}, budget {m['picks'].get('budget') or 'no preference'}"
        f"{' $' + str(m['picks'].get('budget_custom')) if m['picks'].get('budget') == 'custom' else ''}, "
        f"distance {m['picks'].get('distance') or 'no preference'}, car {m['picks'].get('car') or 'unknown'}, "
        f"moods {', '.join(m['picks'].get('moods') or []) or 'any'}, notes: {m['picks'].get('notes') or 'none'}, "
        f"ideas: {m['picks'].get('ideas') or 'none'}" for m in ms)
    budget = "no limit" if g["budget"] is None else f"${g['budget']:g} per person"
    locks = plan.get("locks") or {}
    fb = ("\nYour last suggestions broke these rules, fix them:\n" + "\n".join(f"  - {f}" for f in feedback)) if feedback else ""
    return f"""You plan group outings. Suggest {n} different options for this group.

Plan: {plan['kind']}{' - ' + plan['kind_other'] if plan.get('kind_other') else ''}, {g['hours']} hours long.
People:
{people}
Lowest budget in the group: {budget}.
Planner locked: {json.dumps(locks) if locks else 'nothing'}.

Times when people are free:
{wins}

You may ONLY use these options (copy the ref exactly):
{chr(10).join(lines)}
{fb}
Return JSON: {{"options": [{{"ref": "...", "window": 0, "title": "short catchy title", "what": "one sentence on what you'll do",
"cost_per_person": 0, "why": "one sentence on why it fits these people"}}]}}
cost_per_person is a number in dollars, realistic for that place. Use different windows or refs where you can."""


def _to_option(raw: dict, g: dict) -> dict:
    c = g["candidates"].get(raw.get("ref"), {})
    try:
        w = g["windows"][int(raw.get("window", 0))]
        start = parse_iso(w["start"])
    except (ValueError, IndexError, TypeError):
        w, start = None, None
    if raw.get("start"):
        try:
            start = parse_iso(raw["start"])
        except ValueError:
            pass
    cost = raw.get("cost_per_person")
    if isinstance(cost, str):
        nums = re.findall(r"\d+(?:\.\d+)?", cost)
        cost = float(nums[0]) if nums else None
    opt = {"id": secrets.token_hex(4), "ref": raw.get("ref"), "kind": c.get("kind") or raw.get("kind") or "place",
           "title": raw.get("title") or c.get("title", ""), "what": raw.get("what", ""), "why": raw.get("why", ""),
           "cost_per_person": cost, "place": c.get("title"), "address": c.get("address", ""),
           "link": c.get("link", ""), "how": c.get("how") or [], "host": c.get("host"), "host_id": c.get("host_id"),
           "lat": c.get("lat"), "lon": c.get("lon"), "rating": c.get("rating"), "when_text": c.get("when")}
    if start:
        opt["start"], opt["end"] = iso(start), iso(start + timedelta(hours=g["hours"]))
    return opt


def _check_ctx(plan: dict, ms: list[dict], g: dict) -> dict:
    min_free = len(g["windows"][0]["free"]) if g["windows"] else len(ms)
    return {"members": ms, "candidates": g["candidates"], "min_free": min_free, "start_day": plan["start_day"],
            "end_day": plan["end_day"], "locks": plan.get("locks") or {}, "planner_tz": plan.get("tz") or "UTC",
            "place_tz": g.get("place_tz")}


def _log(plan: dict, opt: dict, fails: list[dict], attempt: int, source: str):
    store().insert("checker_events", {"id": secrets.token_hex(6), "plan_id": plan["id"], "attempt": attempt,
                                      "source": source, "title": opt.get("title"), "ref": opt.get("ref"),
                                      "rules": [f["rule"] for f in fails], "fails": fails, "created_at": now_iso()})
    for f in fails:
        report_issue(f"Plan checker rejected an option: {f['rule']}", rule=f["rule"], plan_kind=plan["kind"],
                     attempt=attempt, detail=f["detail"][:150])


def suggest(plan: dict, members: list[dict], n: int = 3, avoid: list[str] | None = None) -> dict:
    ms = member_ctx(members, plan)
    g = gather(plan, ms)
    result = {"windows": g["windows"], "searched": g["searched"], "far_apart": g["far_apart"],
              "candidates_count": len(g["candidates"]), "options": [], "rejected": [], "llm_error": None}
    if not g["windows"]:
        result["problem"] = "no_time"
        return result
    if not g["candidates"]:
        result["problem"] = "no_places"
        return result
    ctx = _check_ctx(plan, ms, g)
    avoid = list(avoid or [])
    feedback: list[str] = []
    for attempt in (1, 2):
        need = n - len(result["options"])
        if need <= 0:
            break
        try:
            data, _ = llm.chat_json([{"role": "user", "content": _prompt(plan, ms, g, need, avoid, feedback)}],
                                    temperature=0.6, max_tokens=1500, operation="suggest_plans")
            raws = data.get("options") or []
        except Exception as e:  # model down or bad JSON: say so, the retry below may still work
            result["llm_error"] = str(e)[:200]
            raws = []
        feedback = []
        for raw in raws[:need]:
            opt = _to_option(raw, g)
            fails = checker.check(opt, ctx)
            if opt["ref"] in [o["ref"] for o in result["options"]]:
                fails.append({"rule": "duplicate", "detail": f"{opt['title']} was already suggested"})
            _log(plan, opt, fails, attempt, "gemma")
            if fails:
                result["rejected"].append({**opt, "fails": fails, "attempt": attempt})
                feedback += [f"{opt['title']} ({opt['ref']}): {f['detail']}" for f in fails]
                if attempt == 2:
                    avoid.append(opt["ref"] or "")
            else:
                opt["checked"] = True
                words = " ".join([opt["what"], opt["title"], g["candidates"][opt["ref"]].get("type", "")]).lower()
                if opt["kind"] in ("place", "event") and opt.get("lat") and any(
                        w in words for w in ("park", "walk", "hike", "outdoor", "beach", "garden", "trail", "lake")):
                    opt["weather"] = places.weather(opt["lat"], opt["lon"], parse_iso(opt["start"]))
                result["options"].append(opt)
                avoid.append(opt["ref"])
    return result
