from fastapi.testclient import TestClient

from app import llm, main, planner
from app.times import iso, local_to_utc

TZ = "Asia/Kolkata"
DAY = "2030-03-02"  # a Saturday


def slot(a, b):
    return {"start": iso(local_to_utc(DAY, a, TZ)), "end": iso(local_to_utc(DAY, b, TZ))}


def test_plan_end_to_end(monkeypatch):
    calls = []

    def fake_chat_json(messages, **kw):
        calls.append(messages[0]["content"])
        if len(calls) == 1:
            # first try: one good, one invented, one over budget
            return {"options": [
                {"ref": "o_gartic", "window": 0, "title": "Gartic night", "cost_per_person": 0},
                {"ref": "p_fake", "window": 0, "title": "Made-up Cafe", "cost_per_person": 5},
                {"ref": "o_cook", "window": 1, "title": "Cook-along", "cost_per_person": 50},
            ]}, {}
        assert "broke these rules" in messages[0]["content"]
        return {"options": [{"ref": "o_quiz", "window": 1, "title": "Quiz night", "cost_per_person": 0},
                            {"ref": "o_skribbl", "window": 0, "title": "Skribbl", "cost_per_person": 0}]}, {}

    monkeypatch.setattr(llm, "chat_json", fake_chat_json)
    monkeypatch.setattr(main.places, "geocode", lambda name: None)
    c = TestClient(main.app)
    r = c.post("/api/plans", json={"kind": "call", "start_day": DAY, "end_day": DAY, "tz": TZ, "work": "share",
                                   "planner": {"name": "Asha"}, "people": [{"name": "Ben"}, {"name": "Cy"}],
                                   "save_group_as": "Friends"})
    pid, asha = r.json()["plan_id"], r.json()["member_id"]
    view = c.get(f"/api/plans/{pid}").json()
    assert view["stage"] == "answers" and len(view["members"]) == 3
    ben_pub = next(m["pub"] for m in view["members"] if m["name"] == "Ben")
    ben = c.post(f"/api/plans/{pid}/join", json={"name": "Ben", "claim": ben_pub, "tz": TZ}).json()["member_id"]
    cy = c.post(f"/api/plans/{pid}/join", json={"name": "Cy", "tz": TZ}).json()["member_id"]  # new person, not claimed
    picks = {"budget": "small", "moods": ["games"], "where": "online"}
    for mid in (asha, ben):
        c.patch(f"/api/plans/{pid}/me", headers={"X-Member": mid},
                json={"availability": [slot("18:00", "22:00")], "picks": picks, "status": "answered"})
    v = c.get(f"/api/plans/{pid}").json()
    assert not v["answers_ready"]  # Cy and the unclaimed... still waiting
    c.post(f"/api/plans/{pid}/close-answers", headers={"X-Member": asha})
    v = c.post(f"/api/plans/{pid}/generate", headers={"X-Member": ben}).json()
    assert v["stage"] == "options", v.get("problem")
    titles = [o["title"] for o in v["options"]]
    assert "Made-up Cafe" not in titles and "Cook-along" not in titles
    assert v["checker"]["rejected"] == 2 and set(v["checker"]["rules"]) >= {"invented_place", "budget"}
    assert all(o["checked"] for o in v["options"])
    oid = v["options"][0]["id"]
    c.post(f"/api/plans/{pid}/vote", headers={"X-Member": asha}, json={"option_id": oid, "choice": "in"})
    v = c.post(f"/api/plans/{pid}/vote", headers={"X-Member": ben}, json={"option_id": oid, "choice": "in"}).json()
    assert v["stage"] == "tasks" and v["chosen"] == oid  # 2 of 2 answered = majority
    assert v["tasks"] and all(t["assignee"] for t in v["tasks"])
    # Asha started the plan, so she should not get the heaviest task
    heavy = max(v["tasks"], key=lambda t: t["weight"])
    asha_pub = next(m["pub"] for m in v["members"] if m["name"] == "Asha")
    assert heavy["assignee"] != asha_pub
    # swap + take
    mine = next(t for t in v["tasks"] if t["assignee"] == ben_pub)
    c.post(f"/api/plans/{pid}/tasks/{mine['id']}/swap", headers={"X-Member": ben})
    v = c.post(f"/api/plans/{pid}/tasks/{mine['id']}/take", headers={"X-Member": asha}).json()
    assert next(t for t in v["tasks"] if t["id"] == mine["id"])["assignee"] == asha_pub
    c.post(f"/api/plans/{pid}/confirm", headers={"X-Member": asha}, json={"choice": "yes"})
    v = c.post(f"/api/plans/{pid}/confirm", headers={"X-Member": ben}, json={"choice": "yes"}).json()
    assert v["stage"] == "confirmed"
    assert c.get(f"/api/plans/{pid}/invite.ics").text.startswith("BEGIN:VCALENDAR")
    g = c.get(f"/api/groups/{v['group_id']}").json()
    assert sum(m["load"] for m in g["members"]) > 3
    assert c.delete(f"/api/groups/{v['group_id']}").json()["ok"]
    assert c.get(f"/api/plans/{pid}").status_code == 404
    assert planner  # imported for monkeypatch side effects
