from fastapi.testclient import TestClient

from app import llm, main
from app.times import iso, local_to_utc

TZ = "UTC"


def test_edit_time_people_title_then_delete(monkeypatch):
    monkeypatch.setattr(main.places, "geocode", lambda name: None)
    monkeypatch.setattr(llm, "chat_json", lambda m, **kw: ({"options": [{"ref": "o_quiz", "window": 0, "title": "Quiz", "cost_per_person": 0}]}, {}))
    c = TestClient(main.app)
    r = c.post("/api/plans", json={"kind": "call", "start_day": "2030-03-02", "end_day": "2030-03-02", "tz": TZ,
                                   "planner": {"name": "A"}, "people": [{"name": "B"}, {"name": "C"}]}).json()
    pid, a = r["plan_id"], r["member_id"]
    v = c.get(f"/api/plans/{pid}").json()
    b = c.post(f"/api/plans/{pid}/join", json={"name": "B", "tz": TZ}).json()["member_id"]
    slot = {"start": iso(local_to_utc("2030-03-02", "17:00", TZ)), "end": iso(local_to_utc("2030-03-02", "21:00", TZ))}
    for mid in (a, b):
        c.patch(f"/api/plans/{pid}/me", headers={"X-Member": mid}, json={"availability": [slot], "status": "answered", "picks": {"where": "online"}})
    # planner removes C, who never answered: answers are now complete
    c_pub = next(m["pub"] for m in v["members"] if m["name"] == "C")
    assert c.delete(f"/api/plans/{pid}/people/{c_pub}", headers={"X-Member": b}).status_code == 403
    v = c.delete(f"/api/plans/{pid}/people/{c_pub}", headers={"X-Member": a}).json()
    assert [m["name"] for m in v["members"]] == ["A", "B"] and v["answers_ready"]
    v = c.post(f"/api/plans/{pid}/rename", headers={"X-Member": a}, json={"title": "Quiz night"}).json()
    assert v["title"] == "Quiz night"
    v = c.post(f"/api/plans/{pid}/generate", headers={"X-Member": a}).json()
    oid = v["options"][0]["id"]
    c.post(f"/api/plans/{pid}/lock", headers={"X-Member": a}, json={"option_id": oid})
    c.post(f"/api/plans/{pid}/confirm", headers={"X-Member": b}, json={"choice": "yes"})
    # moving the time asks everyone to confirm again and moves task due dates
    v = c.patch(f"/api/plans/{pid}/chosen", headers={"X-Member": a}, json={"start": "2030-03-02T19:00:00Z"}).json()
    chosen = next(o for o in v["options"] if o["id"] == oid)
    assert chosen["start"].startswith("2030-03-02T19:00") and chosen["end"].startswith("2030-03-02T20:00")
    assert next(m for m in v["members"] if m["name"] == "B")["confirm"] is None
    assert all(t["due"] < chosen["start"] for t in v["tasks"])
    assert c.patch(f"/api/plans/{pid}/chosen", headers={"X-Member": a}, json={"start": "2030-03-02T19:00:00Z", "end": "2030-03-02T18:00:00Z"}).status_code == 400
    # delete completely
    assert c.delete(f"/api/plans/{pid}", headers={"X-Member": a}).json()["ok"]
    assert c.get(f"/api/plans/{pid}").status_code == 404
