from app.checker import check, group_budget
from app.places import open_ranges
from app.times import local_to_utc, iso

TZ = "Asia/Kolkata"


def member(name, budget="small", distance="short", car="yes", notes="", lat=12.97, lon=77.59):
    day = [(local_to_utc("2026-10-31", "10:00", TZ), local_to_utc("2026-10-31", "22:00", TZ))]
    return {"id": name, "name": name, "tz": TZ, "slots": day, "lat": lat, "lon": lon,
            "picks": {"budget": budget, "distance": distance, "car": car, "notes": notes}}


CAFE = {"ref": "p_1", "title": "Third Wave Coffee", "type": "Coffee shop", "price": "$$", "lat": 12.98, "lon": 77.60,
        "hours": {"saturday": "8 AM–11 PM"}}
BAR = {"ref": "p_2", "title": "Toit Brewpub", "type": "Brewery", "price": "$$", "lat": 12.98, "lon": 77.64, "hours": None}


def ctx(members, cands=(CAFE, BAR), **kw):
    return {"members": members, "candidates": {c["ref"]: c for c in cands}, "min_free": len(members),
            "start_day": "2026-10-31", "end_day": "2026-11-01", "locks": {}, "planner_tz": TZ, **kw}


def opt(ref="p_1", kind="place", cost=15, at="18:00", until="20:00", title="Coffee"):
    return {"kind": kind, "ref": ref, "title": title, "cost_per_person": cost,
            "start": iso(local_to_utc("2026-10-31", at, TZ)), "end": iso(local_to_utc("2026-10-31", until, TZ))}


def rules(fails):
    return {f["rule"] for f in fails}


def test_good_option_passes():
    assert check(opt(), ctx([member("A"), member("B")])) == []


def test_budget_uses_lowest_and_ignores_no_preference():
    ms = [member("A", "free"), member("B", "nopref")]
    assert group_budget(ms) == 0
    assert "budget" in rules(check(opt(cost=15), ctx(ms)))


def test_invented_place_caught():
    assert "invented_place" in rules(check(opt(ref="p_999"), ctx([member("A")])))


def test_cost_too_low_for_place():
    assert "cost_too_low" in rules(check(opt(cost=2), ctx([member("A")])))


def test_distance_without_car_is_tighter():
    far = member("Far", car="no", lat=13.05, lon=77.59)  # ~8 km from the cafe
    assert "distance" in rules(check(opt(), ctx([member("A"), far])))
    assert "distance" not in rules(check(opt(), ctx([member("A"), member("Car", lat=13.05, lon=77.59)])))


def test_not_free_and_closed():
    assert "time_window" in rules(check(opt(at="22:00", until="23:30"), ctx([member("A")])))
    early = {**CAFE, "hours": {"saturday": "4 PM–11 PM"}}
    assert "closed" in rules(check(opt(at="11:00", until="13:00"), ctx([member("A")], cands=(early,))))


def test_notes_no_alcohol():
    assert "notes" in rules(check(opt(ref="p_2"), ctx([member("A", notes="No alcohol please")])))


def test_planner_lock_day():
    assert "locks" in rules(check(opt(), ctx([member("A")], locks={"day": "2026-11-01"})))


def test_opening_hours_parser():
    assert open_ranges("11 AM–2:30 PM, 5–10 PM")[1][0].hour == 17
    assert open_ranges("11–2 PM")[0][0].hour == 11
    assert open_ranges("Closed") == []
    assert open_ranges("Open 24 hours")[0][1].minute == 59
