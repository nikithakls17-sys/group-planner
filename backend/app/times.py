"""Find when everyone is free. Pure code, no AI. All intervals are UTC datetimes."""
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

STEP = timedelta(minutes=30)
# Nobody's local start or end time may fall outside this range (no 3 AM calls)
EARLIEST_LOCAL, LATEST_LOCAL = time(8, 0), time(23, 0)
COMFORT_START, COMFORT_END = 10, 21  # hours that score best

DURATION = {"hangout": 2, "meal": 2, "date": 2, "call": 1, "trip": 8, "other": 2}


def parse_iso(s: str) -> datetime:
    d = datetime.fromisoformat(s.replace("Z", "+00:00"))
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def iso(d: datetime) -> str:
    return d.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def local_to_utc(day: str, hhmm: str, tz: str) -> datetime:
    h, m = (int(x) for x in hhmm.split(":"))
    if h == 24:
        return local_to_utc((date.fromisoformat(day) + timedelta(days=1)).isoformat(), "00:00", tz)
    return datetime.combine(date.fromisoformat(day), time(h, m), ZoneInfo(tz)).astimezone(timezone.utc)


def is_free(slots: list[tuple[datetime, datetime]], start: datetime, end: datetime) -> bool:
    """True if [start, end) is covered by the union of the slots."""
    t = start
    for s, e in sorted(slots):
        if s <= t < e:
            t = e
            if t >= end:
                return True
    return t >= end


def local_ok(tz: str, start: datetime, end: datetime) -> bool:
    ls, le = start.astimezone(ZoneInfo(tz)), (end - timedelta(minutes=1)).astimezone(ZoneInfo(tz))
    return ls.date() == le.date() and EARLIEST_LOCAL <= ls.time() and le.time() <= LATEST_LOCAL


def _comfort(tz: str, start: datetime, hours: float) -> float:
    """0 = squarely in comfortable hours, grows as the window drifts early or late."""
    h = start.astimezone(ZoneInfo(tz)).hour + start.astimezone(ZoneInfo(tz)).minute / 60
    return max(0, COMFORT_START - h) + max(0, h + hours - COMFORT_END)


def find_windows(members: list[dict], start_day: str, end_day: str, hours: float, *,
                 now: datetime | None = None, limit: int = 3, days: set[str] | None = None,
                 day_tz: str = "UTC", preferred: dict[str, int] | None = None) -> list[dict]:
    """members: [{"id", "tz", "slots": [(start, end), ...]}]. Returns the best `limit` windows,
    most people free first, then the day most people said suits them best, then the most comfortable
    local times for everyone. `days` limits windows to the planner's picked dates (in `day_tz`)."""
    preferred = preferred or {}
    if not members:
        return []
    now = now or datetime.now(timezone.utc)
    tzs = [m["tz"] for m in members]
    # Search from the earliest local midnight to the latest local end-of-day across all time zones
    lo = min(local_to_utc(start_day, "00:00", tz) for tz in tzs)
    hi = max(local_to_utc(end_day, "24:00", tz) for tz in tzs)
    lo = max(lo, (now + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0))
    dur = timedelta(hours=hours)
    cands = []
    t = lo
    while t + dur <= hi:
        day = t.astimezone(ZoneInfo(day_tz)).date().isoformat()
        if days and day not in days:
            t += STEP
            continue
        free = [m for m in members if is_free(m["slots"], t, t + dur) and local_ok(m["tz"], t, t + dur)]
        if free:
            discomfort = sum(_comfort(m["tz"], t, hours) for m in free)
            cands.append((-len(free), -preferred.get(day, 0), discomfort, t, [m["id"] for m in free]))
        t += STEP
    cands.sort(key=lambda c: c[:4])
    picked = []
    for _, _, disc, s, ids in cands:
        if any(abs((s - p["_start"]).total_seconds()) < hours * 3600 for p in picked):
            continue  # keep windows from overlapping
        picked.append({"_start": s, "start": iso(s), "end": iso(s + dur), "free": ids,
                       "everyone": len(ids) == len(members), "discomfort": round(disc, 2)})
        if len(picked) == limit:
            break
    for p in picked:
        del p["_start"]
    return picked
