"""Geocoding, SerpApi places + events, distances, opening hours and weather."""
import math
import re
from datetime import datetime, time
from functools import lru_cache
from zoneinfo import ZoneInfo

import httpx

from . import config
from .observability import tool_span

# Members give a city or neighbourhood only; these are the travel limits in km for each choice
DISTANCE_KM = {"walk": 2, "short": 15, "hour": 60, "any": None, "nopref": None}
DISTANCE_KM_NO_CAR = {"walk": 2, "short": 6, "hour": 25, "any": None, "nopref": None}

# What to search for on Google Maps for each mood
MOOD_QUERIES = {
    "chill": "cafe", "food": "restaurant", "active": "bowling alley", "outdoors": "park",
    "games": "board game cafe", "new": "things to do", "nopref": "cafe",
}
FREE_TYPES = ("park", "garden", "beach", "trail", "lake", "museum free", "hiking")
PRICE_FLOOR = {"$": 8, "$$": 15, "$$$": 35, "$$$$": 60, "₹": 3, "₹₹": 6, "₹₹₹": 15, "₹₹₹₹": 30}


@lru_cache(maxsize=512)
def geocode(name: str) -> dict | None:
    """City-level only. Open-Meteo geocoding needs no key."""
    name = name.strip()
    if not name:
        return None
    first = name.split(",")[0].strip()
    with tool_span("geocode", name):
        r = httpx.get("https://geocoding-api.open-meteo.com/v1/search",
                      params={"name": first, "count": 5, "format": "json"}, timeout=10)
    res = r.json().get("results") or []
    if not res:
        return None
    rest = name.lower()
    best = next((x for x in res if (x.get("country") or "").lower() in rest or (x.get("admin1") or "").lower() in rest), res[0])
    return {"name": best["name"], "lat": best["latitude"], "lon": best["longitude"],
            "country": best.get("country", ""), "tz": best.get("timezone", "")}


def km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def midpoint(points: list[tuple[float, float]]) -> tuple[float, float]:
    return sum(p[0] for p in points) / len(points), sum(p[1] for p in points) / len(points)


def price_floor(place: dict) -> float | None:
    """Lowest believable cost per person from what Google says, so Gemma can't call a $$$ place $5."""
    kind = " ".join([place.get("type", "")] + place.get("types", [])).lower()
    if any(t in kind for t in FREE_TYPES):
        return 0
    p = (place.get("price") or "").strip()
    nums = re.findall(r"\d+", p)
    if nums:
        return float(nums[0])
    return PRICE_FLOOR.get(p)


def _serp(params: dict, label: str) -> dict:
    if not config.SERPAPI_KEY:
        return {}
    with tool_span("serpapi", label) as span:
        r = httpx.get("https://serpapi.com/search.json", params={**params, "api_key": config.SERPAPI_KEY}, timeout=25)
        data = r.json()
        span.set_data("status", r.status_code)
    if data.get("error"):
        raise RuntimeError(f"SerpApi: {data['error']}")
    return data


def search_places(query: str, lat: float, lon: float, zoom: int = 13) -> list[dict]:
    data = _serp({"engine": "google_maps", "type": "search", "q": query, "ll": f"@{lat},{lon},{zoom}z"}, f"maps {query}")
    out = []
    for p in (data.get("local_results") or [])[:8]:
        gps = p.get("gps_coordinates") or {}
        if not gps.get("latitude"):
            continue
        out.append({
            "ref": "p_" + str(p.get("place_id") or p.get("data_id") or p.get("title")),
            "source": "google_maps", "title": p.get("title", ""), "address": p.get("address", ""),
            "lat": gps["latitude"], "lon": gps["longitude"], "rating": p.get("rating"),
            "price": p.get("price", ""), "type": p.get("type", ""), "types": p.get("types") or [],
            "hours": p.get("operating_hours") or None, "query": query,
            "link": f"https://www.google.com/maps/search/?api=1&query={p.get('title', '')}&query_place_id={p.get('place_id', '')}",
        })
    return out


def search_events(city: str) -> list[dict]:
    data = _serp({"engine": "google_events", "q": f"events in {city}", "htichips": "date:week"}, f"events {city}")
    out = []
    for e in (data.get("events_results") or [])[:8]:
        out.append({
            "ref": "e_" + re.sub(r"\W+", "_", e.get("title", ""))[:60], "source": "google_events",
            "title": e.get("title", ""), "address": ", ".join(e.get("address") or []),
            "when": (e.get("date") or {}).get("when", ""), "start_date": (e.get("date") or {}).get("start_date", ""),
            "link": e.get("link", ""), "venue": (e.get("venue") or {}).get("name", ""),
            "ticket": ", ".join(t.get("source", "") for t in (e.get("ticket_info") or [])[:2]),
        })
    return out


# ---------- opening hours ----------

_T = r"(\d{1,2})(?::(\d{2}))?\s*([AP]M)?"


def _to_time(h: str, m: str | None, ap: str | None) -> time:
    hh = int(h)
    if ap == "PM" and hh != 12:
        hh += 12
    elif ap == "AM" and hh == 12:
        hh = 0
    return time(min(hh, 23), int(m or 0))


def open_ranges(text: str) -> list[tuple[time, time]] | None:
    """'11 AM–2:30 PM, 5–10 PM' -> [(11:00, 14:30), (17:00, 22:00)]. None = can't tell."""
    t = (text or "").replace(" ", " ").replace(" ", " ").strip()
    if not t:
        return None
    if "24 hours" in t.lower():
        return [(time(0, 0), time(23, 59))]
    if t.lower().startswith("closed"):
        return []
    out = []
    for part in t.split(","):
        m = re.search(_T + r"\s*[–\-to]+\s*" + _T, part.strip(), re.I)
        if not m:
            continue
        h1, m1, a1, h2, m2, a2 = m.groups()
        a1, a2 = (a1 or "").upper() or None, (a2 or "").upper() or None
        if not a1:
            # "5–10 PM" shares the PM, but "11–2 PM" means 11 AM
            a1 = "AM" if a2 == "PM" and int(h1) != 12 and int(h1) > int(h2) % 12 else a2
        start, end = _to_time(h1, m1, a1), _to_time(h2, m2, a2)
        if end <= start:
            end = time(23, 59)  # closes after midnight
        out.append((start, end))
    return out or None


def is_open(hours: dict | None, start: datetime, end: datetime, tz: str) -> bool | None:
    """True/False if Google lists hours for that day, None if it doesn't."""
    if not hours:
        return None
    ls, le = start.astimezone(ZoneInfo(tz)), end.astimezone(ZoneInfo(tz))
    day = ls.strftime("%A").lower()
    text = hours.get(day) or hours.get(day.capitalize())
    ranges = open_ranges(text) if text else None
    if ranges is None:
        return None
    end_t = le.time() if le.date() == ls.date() else time(23, 59)
    return any(a <= ls.time() and end_t <= b for a, b in ranges)


# ---------- weather ----------

def weather(lat: float, lon: float, when: datetime) -> str | None:
    """Short forecast for outdoor plans, from Open-Meteo (no key, up to 16 days ahead)."""
    try:
        with tool_span("weather", f"{lat:.2f},{lon:.2f}"):
            r = httpx.get("https://api.open-meteo.com/v1/forecast", params={
                "latitude": lat, "longitude": lon, "hourly": "temperature_2m,precipitation_probability",
                "timezone": "UTC", "forecast_days": 16}, timeout=10)
        h = r.json()["hourly"]
        key = when.strftime("%Y-%m-%dT%H:00")
        if key not in h["time"]:
            return None
        i = h["time"].index(key)
        return f"{round(h['temperature_2m'][i])}°C, {h['precipitation_probability'][i]}% chance of rain"
    except Exception:
        return None
