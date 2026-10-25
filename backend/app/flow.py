"""The planner-book flow: budget -> activity -> distance and time -> a checked list of real places -> everyone picks
up to 2 -> the majority place is fixed. Gemma ranks the places and writes why they fit; checker.py decides."""
import secrets
from collections import Counter

from . import checker, llm, places
from .observability import report_issue
from .planner import ONLINE, member_ctx
from .store import now_iso, store
from .times import DURATION, find_windows, iso, parse_iso

ACTIVITY_QUERIES = {
    "cafe": "cafe", "food": "restaurant", "bowling": "bowling alley", "park": "park", "movie": "cinema",
    "games": "board game cafe", "museum": "museum", "karaoke": "karaoke", "shopping": "shopping mall",
    "hike": "hiking trail", "bar": "bar", "dessert": "dessert shop",
}
DURATION_HOURS = {"1h": 1, "2h": 2, "half": 4, "full": 8}
MAX_PLACES = 6


def tallies(members: list[dict]) -> dict:
    """What the group picked, for everyone to see (activities, durations, distances). Budgets and access needs are
    private, so only the lowest budget is shared, never who set it."""
    answered = [m for m in members if m.get("status") != "declined"]
    acts: dict[str, list[str]] = {}
    for m in answered:
        for a in (m.get("picks") or {}).get("activities") or []:
            acts.setdefault(a.strip().lower(), []).append(m["pub"])
    dur = Counter((m.get("picks") or {}).get("duration") for m in answered if (m.get("picks") or {}).get("duration"))
    dist = Counter((m.get("picks") or {}).get("distance") for m in answered if (m.get("picks") or {}).get("distance"))
    return {
        "activities": sorted(({"name": k, "pubs": v} for k, v in acts.items()), key=lambda x: (-len(x["pubs"]), x["name"])),
        "duration": dur.most_common(1)[0][0] if dur else None,
        "durations": dict(dur),
        "distance": dist.most_common(1)[0][0] if dist else None,
        "distances": dict(dist),
    }


def _ctx_members(plan: dict, members: list[dict]) -> list[dict]:
    ms = member_ctx(members, plan)
    if plan.get("budget_mode") == "shared" and plan.get("budget_limit") not in (None, ""):
        for m in ms:
            m["picks"]["shared_limit"] = float(plan["budget_limit"])
    return ms


def plan_hours(plan: dict, t: dict) -> float:
    return DURATION_HOURS.get(t.get("duration") or "", DURATION.get(plan["kind"], 2))


def build_places(plan: dict, members: list[dict]) -> dict:
    ms = _ctx_members(plan, members)
    t = tallies(members)
    hours = plan_hours(plan, t)
    preferred = Counter(m["picks"].get("best_day") for m in ms if m["picks"].get("best_day"))
    windows = find_windows(ms, plan["start_day"], plan["end_day"], hours, days=set(plan.get("dates") or []) or None,
                           day_tz=plan.get("tz") or "UTC", preferred=dict(preferred), limit=5)
    out = {"windows": windows, "places": [], "rejected": [], "problem": None, "searched": 0, "hours": hours}
    if not windows:
        out["problem"] = "no_time"
        return out
    acts = [a["name"] for a in t["activities"]][:3] or [{"meal": "food", "date": "cafe", "trip": "park"}.get(plan["kind"], "cafe")]
    pts = [(m["lat"], m["lon"]) for m in ms if m.get("lat") is not None]
    cands: dict[str, dict] = {}
    place_tz = plan.get("tz") or "UTC"
    if plan.get("mode") == "online":
        for o in ONLINE:
            cands[o["ref"]] = {**o, "kind": "online"}
    else:
        if not pts:
            out["problem"] = "no_location"
            return out
        mid = places.midpoint(pts)
        place_tz = min(ms, key=lambda m: places.km((m["lat"], m["lon"]), mid) if m.get("lat") is not None else 1e9)["tz"]
        for a in acts:
            for c in places.search_places(ACTIVITY_QUERIES.get(a, a), *mid):
                cands.setdefault(c["ref"], {**c, "kind": "place", "activity": a})
                out["searched"] += 1
        for h in [m for m in ms if m["picks"].get("can_host")]:
            ref = "h_" + h["id"][:8]
            cands[ref] = {"ref": ref, "kind": "home", "title": f"At {h['name']}'s home", "host_id": h["id"], "host": h["name"],
                          "lat": h.get("lat"), "lon": h.get("lon"), "cost_floor": 0, "activity": "home"}
    if not cands:
        out["problem"] = "no_places"
        return out

    min_free = len(windows[0]["free"])
    ctx = {"members": ms, "candidates": cands, "min_free": min_free, "start_day": plan["start_day"], "end_day": plan["end_day"],
           "locks": plan.get("locks") or {}, "planner_tz": plan.get("tz") or "UTC", "place_tz": place_tz}
    needs = checker.group_access_needs(ms)

    def as_option(c: dict, cost) -> dict:
        # first window where the place is open (opening hours are checked again by the checker)
        w = next((w for w in windows if places.is_open(c.get("hours"), parse_iso(w["start"]), parse_iso(w["end"]), place_tz) is not False), windows[0])
        status, _ = checker.access_status(c, needs) if c["kind"] in ("place", "event") else ("ok", [])
        return {"id": secrets.token_hex(4), "ref": c["ref"], "kind": c["kind"], "title": c["title"], "place": c["title"],
                "activity": c.get("activity"), "address": c.get("address", ""), "lat": c.get("lat"), "lon": c.get("lon"),
                "rating": c.get("rating"), "link": c.get("link", ""), "website": c.get("website", ""), "phone": c.get("phone", ""),
                "reservation": c.get("reservation", ""), "thumbnail": c.get("thumbnail", ""), "how": c.get("how") or [],
                "what": c.get("what", ""), "host": c.get("host"), "host_id": c.get("host_id"),
                "start": w["start"], "end": w["end"], "cost_per_person": cost, "access": status if needs else "ok"}

    # 1. code-only filter first, so Gemma only sees places that can work (distance, open, access)
    pre = []
    for c in cands.values():
        probe = as_option(c, 0)
        fails = [f for f in checker.check(probe, ctx) if f["rule"] not in ("budget", "cost_too_low")]
        if fails:
            out["rejected"].append({"title": c["title"], "fails": fails, "stage": "code"})
            _log(plan, probe, fails, 0, "code")
        else:
            pre.append(c)
    if not pre:
        out["problem"] = "none_passed"
        return out
    pre = pre[:14]

    # 2. Gemma ranks, estimates cost and says why; 3. the checker has the last word (one retry with reasons)
    limit = checker.group_budget(ms)
    feedback: list[str] = []
    chosen: list[dict] = []
    used: set[str] = set()
    for attempt in (1, 2):
        need = MAX_PLACES - len(chosen)
        pool = [c for c in pre if c["ref"] not in used]
        if need <= 0 or not pool:
            break
        try:
            data, _ = llm.chat_json([{"role": "user", "content": _prompt(plan, ms, t, pool, need, limit, feedback)}],
                                    temperature=0.4, max_tokens=1400, operation="rank_places")
            picks = data.get("places") or []
        except Exception as e:  # model down: fall back to rating order, cost from Google's price level
            out["llm_error"] = str(e)[:200]
            picks = [{"ref": c["ref"], "cost_per_person": places.price_floor(c) if c["kind"] == "place" else c.get("cost_floor", 0),
                      "why": ""} for c in sorted(pool, key=lambda c: -(c.get("rating") or 0))[:need]]
        feedback = []
        for p in picks[:need]:
            c = cands.get(p.get("ref"))
            cost = p.get("cost_per_person")
            opt = as_option(c, cost) if c else {"ref": p.get("ref"), "title": p.get("ref"), "kind": "place", "start": windows[0]["start"],
                                                 "end": windows[0]["end"], "cost_per_person": cost}
            opt["why"] = (p.get("why") or "")[:200]
            fails = checker.check(opt, ctx)
            if c and c["ref"] in used:
                fails.append({"rule": "duplicate", "detail": f"{c['title']} was already picked"})
            _log(plan, opt, fails, attempt, "gemma")
            if fails:
                out["rejected"].append({"title": opt["title"], "fails": fails, "stage": f"gemma {attempt}"})
                feedback += [f"{opt['title']} ({opt['ref']}): {f['detail']}" for f in fails]
            else:
                opt["checked"] = True
                chosen.append(opt)
                used.add(opt["ref"])
            if c:
                used.add(c["ref"])
    # confirmed access first, then Gemma's order
    chosen.sort(key=lambda o: 0 if o.get("access") == "ok" else 1)
    out["places"] = chosen
    if not chosen:
        out["problem"] = "none_passed"
    return out


def _prompt(plan, ms, t, pool, n, limit, feedback):
    acts = ", ".join(f"{a['name']} ({len(a['pubs'])})" for a in t["activities"]) or "anything"
    lines = []
    for c in pool:
        bits = [c["ref"], c["kind"], c["title"], c.get("type", ""), f"rating {c.get('rating')}", c.get("price") or "", c.get("address", ""),
                c.get("what", ""), f"for: {c.get('activity', '')}"]
        lines.append("  - " + " | ".join(str(b) for b in bits if b))
    budget = "no limit" if limit is None else f"${limit:g} per person"
    fb = ("\nYour last picks broke these rules, choose others:\n" + "\n".join(f"  - {f}" for f in feedback)) if feedback else ""
    return f"""You help a group of {len(ms)} friends choose where to go for {plan['title']}.
What they want to do (votes): {acts}.
Lowest budget in the group: {budget}.
Places you may choose from (copy the ref exactly, never invent one):
{chr(10).join(lines)}
{fb}
Pick the {n} best places, mixing the activities people voted for (more votes = more places).
Return JSON {{"places": [{{"ref": "...", "cost_per_person": 0, "why": "one short sentence for this group"}}]}}
cost_per_person is a realistic number in dollars for one person there."""


def _log(plan: dict, opt: dict, fails: list[dict], attempt: int, source: str):
    store().insert("checker_events", {"id": secrets.token_hex(6), "plan_id": plan["id"], "attempt": attempt, "source": source,
                                      "title": opt.get("title"), "ref": opt.get("ref"), "rules": [f["rule"] for f in fails],
                                      "fails": fails, "created_at": now_iso()})
    if source == "gemma":
        for f in fails:
            report_issue(f"Plan checker rejected a place: {f['rule']}", rule=f["rule"], plan_kind=plan["kind"], attempt=attempt)


def place_tally(plan: dict, members: list[dict]) -> dict[str, list[str]]:
    pub = {m["id"]: m["pub"] for m in members}
    out = {p["id"]: [] for p in plan.get("places") or []}
    for v in store().find("votes", plan_id=plan["id"], choice="place"):
        if v["option_id"] in out and v["member_id"] in pub:
            out[v["option_id"]].append(pub[v["member_id"]])
    return out


def winner(plan: dict, members: list[dict], force: bool = False) -> str | None:
    """Majority of the people who answered, or (when everyone voted, or the planner fixes it) the most votes.
    Ties go to the place ranked higher."""
    t = place_tally(plan, members)
    if not t:
        return None
    voters = [m for m in members if m.get("status") == "answered"]
    order = [p["id"] for p in plan.get("places") or []]
    best = max(order, key=lambda i: (len(t[i]), -order.index(i)))
    if len(t[best]) * 2 > len(voters):
        return best
    voted = {v["member_id"] for v in store().find("votes", plan_id=plan["id"], choice="place")}
    if force or (voters and all(m["id"] in voted for m in voters)):
        return best if t[best] else (order[0] if force else None)
    return None


def to_option(place: dict) -> dict:
    return {**place, "id": place["id"], "checked": True}


