from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient

from app import calendar, config, main


def utc(s):
    return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)


def test_free_slots_skip_busy_and_short_gaps():
    busy = [(utc("2030-03-02T10:00"), utc("2030-03-02T12:30")), (utc("2030-03-02T13:00"), utc("2030-03-02T18:00"))]
    slots = calendar.free_slots(["2030-03-02"], "UTC", busy)
    # 8-10 free, 12:30-13:00 too short, 18-23 free
    assert [(s["start"][11:16], s["end"][11:16]) for s in slots] == [("08:00", "10:00"), ("18:00", "23:00")]


def test_state_is_signed(monkeypatch):
    monkeypatch.setattr(config, "AUTH0_CLIENT_SECRET", "s")
    st = calendar.make_state(p="x", m="y", b="/p/x")
    assert calendar.read_state(st)["p"] == "x"
    assert calendar.read_state(st[:-1] + ("0" if st[-1] != "0" else "1")) is None


def test_connect_and_callback(monkeypatch):
    for k, v in (("AUTH0_DOMAIN", "t.auth0.com"), ("AUTH0_CLIENT_ID", "cid"), ("AUTH0_CLIENT_SECRET", "s")):
        monkeypatch.setattr(config, k, v)
    c = TestClient(main.app)
    r = c.post("/api/plans", json={"kind": "call", "dates": ["2030-03-02"], "tz": "UTC", "planner": {"name": "A"}}).json()
    pid, a = r["plan_id"], r["member_id"]
    go = c.get("/api/calendar/connect", params={"plan": pid, "m": a, "back": f"/p/{pid}?tab=dates"}, follow_redirects=False)
    q = parse_qs(urlparse(go.headers["location"]).query)
    assert q["connection_scope"] == [calendar.SCOPE] and q["connection"] == ["google-oauth2"]

    monkeypatch.setattr(calendar, "google_token", lambda code, uri: ("g", "r"))
    monkeypatch.setattr(calendar, "revoke", lambda r: None)
    monkeypatch.setattr(calendar, "busy", lambda g, s, e: [(utc("2030-03-02T08:00"), utc("2030-03-02T20:00"))])
    back = c.get("/api/calendar/callback", params={"state": q["state"][0], "code": "c"}, follow_redirects=False)
    assert back.headers["location"] == f"/p/{pid}?tab=dates&cal=ok"
    me = next(m for m in c.get(f"/api/plans/{pid}", headers={"X-Member": a}).json()["members"] if m.get("id") == a)
    assert [(s["start"][11:16], s["end"][11:16]) for s in me["cal_slots"]] == [("20:00", "23:00")]

    def boom(code, uri):
        raise RuntimeError("nope")
    monkeypatch.setattr(calendar, "google_token", boom)
    back = c.get("/api/calendar/callback", params={"state": q["state"][0], "code": "c"}, follow_redirects=False)
    assert back.headers["location"].endswith("cal=fail")
