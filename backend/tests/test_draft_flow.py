from fastapi.testclient import TestClient

from app import llm, main
from app.times import iso, local_to_utc

TZ = "Asia/Kolkata"


def slot(day, a, b):
    return {"start": iso(local_to_utc(day, a, TZ)), "end": iso(local_to_utc(day, b, TZ))}


def test_new_planner_flow_draft_dates_task_table_and_best_day(monkeypatch):
    monkeypatch.setattr(main.places, "geocode", lambda name: None)
    c = TestClient(main.app)
    # a. Who are we planning with: the plan (and group) exists straight away, as a draft
    r = c.post("/api/plans", json={"draft": True, "tz": TZ, "planner": {"name": "Asha"}, "save_group_as": "Flatmates"}).json()
    pid, asha = r["plan_id"], r["member_id"]
    h = {"X-Member": asha}
    v = c.get(f"/api/plans/{pid}", headers=h).json()
    assert v["status"] == "draft" and v["group_id"] and not v["answers_ready"]
    # a friend can join from the group link before anything else is decided
    ben = c.post(f"/api/plans/{pid}/join", json={"name": "Ben", "tz": TZ}).json()["member_id"]
    # b. what, c. when: specific dates (not a range), planner's own free times on the same screen
    c.patch(f"/api/plans/{pid}", headers=h, json={"kind": "meal"})
    v = c.patch(f"/api/plans/{pid}", headers=h, json={"dates": ["2030-03-09", "2030-03-02"]}).json()
    assert v["dates"] == ["2030-03-02", "2030-03-09"] and v["start_day"] == "2030-03-02" and v["title"] == "a meal"
    # only the planner can edit the plan
    assert c.patch(f"/api/plans/{pid}", headers={"X-Member": ben}, json={"kind": "trip"}).status_code == 403
    # f. task table: fair split, then drag a task to someone else, then "Can we swap?"
    c.patch(f"/api/plans/{pid}", headers=h, json={"work": "share"})
    v = c.post(f"/api/plans/{pid}/plan-tasks", headers=h).json()
    assert len(v["tasks"]) == 4
    pubs = {m["name"]: m["pub"] for m in v["members"]}
    heavy = max(v["tasks"], key=lambda t: t["weight"])
    assert heavy["assignee"] == pubs["Ben"]  # Asha started the plan
    v = c.post(f"/api/plans/{pid}/task-move/{heavy["id"]}", headers=h, json={"to": pubs["Asha"]}).json()
    assert next(t for t in v["tasks"] if t["id"] == heavy["id"])["assignee"] == pubs["Asha"]
    assert c.post(f"/api/plans/{pid}/task-move/{heavy["id"]}", headers={"X-Member": ben}, json={"to": pubs["Ben"]}).status_code == 403
    v = c.post(f"/api/plans/{pid}/task-ask/{heavy["id"]}", headers=h, json={"to": pubs["Ben"]}).json()
    t = next(t for t in v["tasks"] if t["id"] == heavy["id"])
    assert t["swap_open"] and t["swap_to"] == pubs["Ben"]
    v = c.post(f"/api/plans/{pid}/tasks/{heavy['id']}/take", headers={"X-Member": ben}).json()
    assert next(t for t in v["tasks"] if t["id"] == heavy["id"])["assignee"] == pubs["Ben"]
    # h. send: answers open
    v = c.patch(f"/api/plans/{pid}", headers=h, json={"deadline": "2030-03-01T12:30:00Z", "send": True}).json()
    assert v["status"] == "answers"
    # both free on both Saturdays; Ben and Asha both say the 9th suits them best
    for mid in (asha, ben):
        c.patch(f"/api/plans/{pid}/me", headers={"X-Member": mid}, json={
            "availability": [slot("2030-03-02", "18:00", "22:00"), slot("2030-03-09", "18:00", "22:00")],
            "lat": 12.97, "lon": 77.59, "city": "Bengaluru", "status": "answered",
            "picks": {"budget": "small", "where": "online", "best_day": "2030-03-09"}})
    me = c.get(f"/api/plans/{pid}", headers=h).json()["me"]
    assert me["city"] == "Bengaluru"

    seen = {}

    def fake(messages, **kw):
        seen["prompt"] = messages[0]["content"]
        return {"options": [{"ref": "o_quiz", "window": 0, "title": "Quiz", "cost_per_person": 0}]}, {}

    monkeypatch.setattr(llm, "chat_json", fake)
    v = c.post(f"/api/plans/{pid}/generate", headers=h).json()
    assert v["windows"][0]["start"].startswith("2030-03-09"), "best day should rank first"
    assert all(w["start"][:10] in ("2030-03-02", "2030-03-09") for w in v["windows"])
    # locking keeps the arranged task table instead of making a new one
    oid = v["options"][0]["id"]
    c.post(f"/api/plans/{pid}/vote", headers=h, json={"option_id": oid, "choice": "in"})
    v = c.post(f"/api/plans/{pid}/vote", headers={"X-Member": ben}, json={"option_id": oid, "choice": "in"}).json()
    assert v["stage"] == "tasks" and len(v["tasks"]) == 4 and all(t["due"] for t in v["tasks"])
    assert next(t for t in v["tasks"] if t["id"] == heavy["id"])["assignee"] == pubs["Ben"]
