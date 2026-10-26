from fastapi.testclient import TestClient

from app import checker, llm, main, places
from app.times import iso, local_to_utc

TZ = "Asia/Kolkata"
DAY = "2030-03-02"  # Saturday


def cafe(i, title, access, hours="8 AM–11 PM", lat=12.975):
    return {"ref": f"p_{i}", "source": "google_maps", "title": title, "address": f"{i} MG Road", "lat": lat, "lon": 77.6,
            "rating": 4.5, "price": "", "type": "Cafe", "types": ["Cafe"], "hours": {"saturday": hours}, "query": "cafe",
            "accessibility": access, "phone": "+91 1", "website": "https://x", "thumbnail": "", "reservation": "", "link": ""}


def test_access_status_never_assumes():
    full = {"kind": "place", "accessibility": ["Wheelchair accessible entrance", "Wheelchair accessible restroom"]}
    assert checker.access_status(full, {"step_free", "restroom"}) == ("ok", [])
    assert checker.access_status({"kind": "place", "accessibility": []}, {"step_free"})[0] == "unconfirmed"
    assert checker.access_status({"kind": "place", "accessibility": ["No wheelchair accessible entrance"]}, {"step_free"})[0] == "fails"
    assert checker.access_status(full, {"quiet"})[0] == "unconfirmed"  # no data for quiet, so never "ok"


def test_budget_activity_places_vote_fix_confirm(monkeypatch):
    results = [cafe(1, "Step Free Cafe", ["Wheelchair accessible entrance"]),
               cafe(2, "Stairs Cafe", ["No wheelchair accessible entrance"]),
               cafe(3, "Unknown Cafe", []),
               cafe(4, "Closed Cafe", ["Wheelchair accessible entrance"], hours="Closed"),
               cafe(5, "Far Cafe", ["Wheelchair accessible entrance"], lat=13.5)]
    monkeypatch.setattr(places, "search_places", lambda q, lat, lon, zoom=13: results)
    monkeypatch.setattr(main.places, "geocode", lambda name: None)
    prompts = []

    def fake(messages, **kw):
        prompts.append(messages[0]["content"])
        # Gemma tries an invented place and an over-budget one; the checker drops both
        return {"places": [{"ref": "p_1", "cost_per_person": 8, "why": "quiet and close"},
                           {"ref": "p_3", "cost_per_person": 10, "why": "cheap"},
                           {"ref": "p_99", "cost_per_person": 5, "why": "made up"},
                           {"ref": "p_1", "cost_per_person": 50, "why": "dup"}]}, {}

    monkeypatch.setattr(llm, "chat_json", fake)
    c = TestClient(main.app)
    r = c.post("/api/plans", json={"draft": True, "tz": TZ, "planner": {"name": "Asha"}}).json()
    pid, asha = r["plan_id"], r["member_id"]
    h = {"X-Member": asha}
    c.patch(f"/api/plans/{pid}", headers=h, json={"mode": "in_person", "kind": "hangout"})
    c.patch(f"/api/plans/{pid}", headers=h, json={"budget_mode": "shared", "budget_limit": 15})
    ben = c.post(f"/api/plans/{pid}/join", json={"name": "Ben", "tz": TZ}).json()["member_id"]
    slot = {"start": iso(local_to_utc(DAY, "08:00", TZ)), "end": iso(local_to_utc(DAY, "23:00", TZ))}
    c.patch(f"/api/plans/{pid}", headers=h, json={"dates": [DAY], "send": True})
    for mid, acts, access in ((asha, ["cafe", "bowling"], []), (ben, ["cafe"], ["step_free"])):
        c.patch(f"/api/plans/{pid}/me", headers={"X-Member": mid}, json={
            "availability": [slot], "lat": 12.97, "lon": 77.59, "city": "Bengaluru", "status": "answered",
            "picks": {"activities": acts, "duration": "2h", "distance": "short", "car": "yes", "access": access}})
    v = c.get(f"/api/plans/{pid}", headers=h).json()
    assert v["tallies"]["activities"][0] == {"name": "cafe", "pubs": [m["pub"] for m in v["members"]]}
    assert v["lowest_budget"] == 15 and v["mode"] == "in_person"
    v = c.post(f"/api/plans/{pid}/places", headers=h).json()
    titles = [p["title"] for p in v["places"]]
    # stairs (fails access), closed and far are dropped by code before Gemma; invented + duplicate by the checker
    assert titles == ["Step Free Cafe", "Unknown Cafe"], titles
    assert "Stairs Cafe" not in prompts[0] and "Closed Cafe" not in prompts[0] and "Far Cafe" not in prompts[0]
    assert v["places"][0]["access"] == "ok" and v["places"][1]["access"] == "unconfirmed"
    assert "Ben" not in str(v["checker"])  # never say whose access need it is
    p1, p3 = v["places"][0]["id"], v["places"][1]["id"]
    assert c.post(f"/api/plans/{pid}/place-vote", headers=h, json={"ids": [p1, p3, p1 + "x"]}).status_code == 400
    v = c.post(f"/api/plans/{pid}/place-vote", headers=h, json={"ids": [p1, p3]}).json()
    assert v["status"] == "places" and v["place_votes"][p1] == [m["pub"] for m in v["members"] if m["name"] == "Asha"]
    v = c.post(f"/api/plans/{pid}/place-vote", headers={"X-Member": ben}, json={"ids": [p1]}).json()
    # 2 of 2 picked Step Free Cafe: plan fixed, everyone asked to confirm
    assert v["status"] == "locked" and v["chosen"] == p1 and v["options"][0]["title"] == "Step Free Cafe"
    assert v["tasks"]
    c.post(f"/api/plans/{pid}/confirm", headers=h, json={"choice": "yes"})
    v = c.post(f"/api/plans/{pid}/confirm", headers={"X-Member": ben}, json={"choice": "yes"}).json()
    assert v["status"] == "confirmed"
    e = v["effort"]
    # each answered: name, dates, location, activities, duration, distance, car (+ Ben's access need)
    assert e == {"people": 2, "questions": 15, "nudges": 0, "places_checked": 5, "tasks": len(v["tasks"]),
                 "task_people": len({t["assignee"] for t in v["tasks"]})}, e
