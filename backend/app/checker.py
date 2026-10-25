"""The plan checker. Gemma suggests; this code decides. Every option passes here before anyone sees it."""
from zoneinfo import ZoneInfo

from . import places
from .times import is_free, local_ok, parse_iso

BUDGET = {"free": 0, "small": 15, "medium": 40, "big": None, "nopref": None}
RULES = ["invented_place", "time_window", "local_time", "budget", "cost_too_low", "distance",
         "closed", "event_date", "notes", "locks", "access"]

# Access needs -> what Google Maps says when a place meets them. "quiet" and "other" have no data, so they can
# only ever be "not confirmed".
ACCESS_FACTS = {
    "step_free": "wheelchair accessible entrance",
    "restroom": "wheelchair accessible restroom",
    "parking": "wheelchair accessible parking",
    "seating": "wheelchair accessible seating",
}


def access_status(cand: dict, needs: set[str]) -> tuple[str, list[str]]:
    """('ok' | 'unconfirmed' | 'fails', unmet needs). Missing data is never assumed fine."""
    if not needs:
        return "ok", []
    facts = [f.lower() for f in cand.get("accessibility") or []]
    if cand.get("kind") == "online":
        return "ok", []
    fails, unknown = [], []
    for n in needs:
        fact = ACCESS_FACTS.get(n)
        if not fact:
            unknown.append(n)
        elif any(f.startswith("no ") and fact in f for f in facts):
            fails.append(n)
        elif not any(fact in f and not f.startswith("no ") for f in facts):
            unknown.append(n)
    if fails:
        return "fails", fails
    return ("unconfirmed", unknown) if unknown else ("ok", [])


def group_access_needs(members: list[dict]) -> set[str]:
    return {n for m in members for n in ((m.get("picks") or {}).get("access") or []) if n}

# "Anything we should know" notes -> place words that break them
NOTE_CONFLICTS = {
    "alcohol": ("bar", "pub", "brewery", "wine", "cocktail", "taproom", "nightclub"),
    "vegetarian": ("steakhouse", "bbq", "barbecue", "seafood", "fish", "chicken", "kebab"),
    "vegan": ("steakhouse", "bbq", "barbecue", "seafood", "dairy", "chicken", "kebab"),
    "kid": ("bar", "pub", "nightclub", "brewery", "lounge"),
    "child": ("bar", "pub", "nightclub", "brewery", "lounge"),
}


def budget_limit(member: dict) -> float | None:
    picks = member.get("picks") or {}
    if picks.get("shared_limit") is not None:  # "one limit for everyone" set by the group
        return float(picks["shared_limit"])
    if picks.get("budget") == "custom" and picks.get("budget_custom") not in (None, ""):
        return float(picks["budget_custom"])
    return BUDGET.get(picks.get("budget") or "nopref")


def group_budget(members: list[dict]) -> float | None:
    """The LOWEST budget in the group, ignoring No preference."""
    limits = [b for b in (budget_limit(m) for m in members) if b is not None]
    return min(limits) if limits else None


def distance_limit(member: dict) -> float | None:
    picks = member.get("picks") or {}
    table = places.DISTANCE_KM_NO_CAR if picks.get("car") == "no" else places.DISTANCE_KM
    return table.get(picks.get("distance") or "nopref")


def _place_words(c: dict) -> str:
    return " ".join([c.get("title", ""), c.get("type", ""), " ".join(c.get("types") or [])]).lower()


def check(option: dict, ctx: dict) -> list[dict]:
    """Returns failures [{"rule", "detail"}]; empty list = passed.
    ctx: members (answered, with tz/slots/picks/lat/lon), candidates {ref: c}, min_free, start_day, end_day, locks, planner_tz."""
    fails = []

    def fail(rule, detail):
        fails.append({"rule": rule, "detail": detail})

    members = ctx["members"]
    kind = option.get("kind")
    cand = ctx["candidates"].get(option.get("ref"))
    if kind in ("place", "event") and not cand:
        fail("invented_place", f"'{option.get('title')}' is not in the search results")
    if kind in ("online", "home") and not cand:
        fail("invented_place", f"'{option.get('title')}' is not one of the listed {kind} options")

    try:
        start, end = parse_iso(option["start"]), parse_iso(option["end"])
    except (KeyError, ValueError, TypeError):
        fail("time_window", "no valid start/end time")
        return fails

    free = [m for m in members if is_free(m["slots"], start, end)]
    if len(free) < ctx["min_free"]:
        missing = [m["name"] for m in members if m not in free]
        fail("time_window", f"only {len(free)} of {len(members)} free; not free: {', '.join(missing)}")
    late = [m["name"] for m in free if not local_ok(m["tz"], start, end)]
    if late:
        fail("local_time", f"unreasonable local time for {', '.join(late)}")

    cost = option.get("cost_per_person")
    limit = group_budget(members)
    if not isinstance(cost, (int, float)):
        fail("budget", "no cost per person given")
    else:
        if limit is not None and cost > limit:
            fail("budget", f"${cost:g} per person is over the lowest budget (${limit:g})")
        floor = places.price_floor(cand) if cand and kind == "place" else (cand or {}).get("cost_floor")
        if floor is not None and cost < floor:
            fail("cost_too_low", f"${cost:g} is below what this place costs (at least ${floor:g})")

    if kind in ("place", "event", "home") and cand and cand.get("lat") is not None:
        too_far = []
        for m in free:
            lim = distance_limit(m)
            if lim is not None and m.get("lat") is not None:
                d = places.km((m["lat"], m["lon"]), (cand["lat"], cand["lon"]))
                if d > lim:
                    too_far.append(f"{m['name']} ({d:.0f} km, limit {lim:g})")
        if too_far:
            fail("distance", "too far for " + ", ".join(too_far))

    if kind == "place" and cand:
        open_now = places.is_open(cand.get("hours"), start, end, ctx.get("place_tz") or ctx["planner_tz"])
        if open_now is False:
            fail("closed", f"{cand['title']} is closed then")

    if kind == "event" and cand:
        sd = cand.get("event_date")
        if not sd:
            fail("event_date", "event has no date we can check")
        else:
            local_day = start.astimezone(ZoneInfo(ctx.get("place_tz") or ctx["planner_tz"])).date().isoformat()
            if not (ctx["start_day"] <= sd <= ctx["end_day"]):
                fail("event_date", f"event is on {sd}, outside {ctx['start_day']} to {ctx['end_day']}")
            elif local_day != sd:
                fail("event_date", f"plan is on {local_day} but the event is on {sd}")

    if cand and kind in ("place", "event"):
        words = _place_words(cand)
        for m in free:
            note = ((m.get("picks") or {}).get("notes") or "").lower()
            for key, bad in NOTE_CONFLICTS.items():
                if key in note and any(b in words for b in bad):
                    fail("notes", f"{cand['title']} conflicts with {m['name']}'s note '{note}'")
                    break
            if ("wheelchair" in note or "accessib" in note) and cand.get("accessible") is False:
                fail("notes", f"{cand['title']} is not wheelchair accessible ({m['name']})")

    if cand and kind in ("place", "event"):
        status, unmet = access_status(cand, group_access_needs(free))
        if status == "fails":
            # never say whose need it is
            fail("access", f"{cand['title']} doesn't meet a group access need ({', '.join(sorted(unmet))})")

    locks = ctx.get("locks") or {}
    ptz = ZoneInfo(ctx["planner_tz"])
    if locks.get("day") and start.astimezone(ptz).date().isoformat() != locks["day"]:
        fail("locks", f"planner locked the day to {locks['day']}")
    if locks.get("time"):
        h, mm = (int(x) for x in locks["time"].split(":"))
        ls = start.astimezone(ptz)
        if abs((ls.hour * 60 + ls.minute) - (h * 60 + mm)) > 30:
            fail("locks", f"planner locked the time to {locks['time']}")
    if locks.get("place"):
        want = locks["place"].lower()
        have = " ".join([option.get("title", ""), (cand or {}).get("title", ""), (cand or {}).get("address", "")]).lower()
        if want not in have:
            fail("locks", f"planner locked the place to '{locks['place']}'")
    return fails

