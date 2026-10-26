"""Seed two real plans through the API, then screenshot every main screen on phone and laptop.
Runs against the live site by default; SHOT_BASE=http://localhost:8000 for a local app.
  .venv/Scripts/python eval/screenshots.py [YYYY-MM-DD]"""
import json
import os
import sys
from pathlib import Path

import httpx
from playwright.sync_api import sync_playwright

B = os.environ.get("SHOT_BASE", "https://nobody-plans.onrender.com")
OUT = Path(__file__).resolve().parents[1] / "docs" / "screenshots"


def _check(r: httpx.Response) -> httpx.Response:
    # say which call failed and why, instead of a bare JSONDecodeError on an HTML error page
    if r.status_code >= 400 or "json" not in r.headers.get("content-type", ""):
        raise SystemExit(f"{r.request.method} {r.request.url} -> {r.status_code}: {r.text[:300]}")
    return r


c = httpx.Client(base_url=B + "/api", timeout=240, event_hooks={"response": [lambda r: r.read() and None]})
_send = c.send
c.send = lambda req, **kw: _check(_send(req, **kw))
DAY = sys.argv[1] if len(sys.argv) > 1 else "2026-11-01"


def seed(confirm: bool):
    r = c.post("/plans", json={"draft": True, "tz": "Asia/Kolkata", "planner": {"name": "Niki"}, "kind": "hangout", "save_group_as": "Flatmates"}).json()
    pid, niki = r["plan_id"], r["member_id"]
    h = {"X-Member": niki}
    c.patch(f"/plans/{pid}", headers=h, json={"mode": "in_person", "budget_mode": "shared", "budget_limit": 20})
    ids = {"Niki": niki}
    for name in ("Sam", "Priya"):
        ids[name] = c.post(f"/plans/{pid}/join", json={"name": name, "tz": "Asia/Kolkata"}).json()["member_id"]
    c.patch(f"/plans/{pid}", headers=h, json={"dates": [DAY], "send": True})
    slot = {"start": f"{DAY}T02:30:00Z", "end": f"{DAY}T17:30:00Z"}
    people = {"Niki": (["cafe", "park"], [], 12.97, 77.59, "#FFD54F"), "Sam": (["cafe"], ["step_free"], 12.93, 77.62, "#A3B454"),
              "Priya": (["cafe", "games"], [], 12.99, 77.57, "#FFB366")}
    for name, (acts, access, lat, lon, color) in people.items():
        c.patch(f"/plans/{pid}/me", headers={"X-Member": ids[name]}, json={
            "availability": [slot], "lat": lat, "lon": lon, "city": "Bengaluru", "status": "answered", "color": color,
            "picks": {"activities": acts, "duration": "2h", "distance": "short", "car": "yes", "access": access}})
    c.post(f"/plans/{pid}/plan-tasks", headers=h)
    v = c.post(f"/plans/{pid}/places", headers=h).json()
    if confirm and v["places"]:
        first = v["places"][0]["id"]
        for name in ids:  # the plan locks as soon as most people pick the same place
            if c.post(f"/plans/{pid}/place-vote", headers={"X-Member": ids[name]}, json={"ids": [first]}).json()["status"] != "places":
                break
        for name in ids:
            c.post(f"/plans/{pid}/confirm", headers={"X-Member": ids[name]}, json={"choice": "yes"})
    else:
        c.post(f"/plans/{pid}/place-vote", headers={"X-Member": ids["Sam"]}, json={"ids": [p["id"] for p in v["places"][:2]]})
    return pid, niki, v


def main():
    a, a_m, va = seed(confirm=False)
    b, b_m, vb = seed(confirm=True)
    print("seeded", a, len(va["places"]), "places;", b)
    group = c.get(f"/plans/{a}", headers={"X-Member": a_m}).json()["group_id"]
    store = {
        "np.plans": json.dumps([{"id": a, "member": a_m, "title": "Hangout", "saved": "2026-10-26"},
                                {"id": b, "member": b_m, "title": "Hangout", "saved": "2026-10-26"}]),
        "np.groups": json.dumps([{"id": group, "name": "Flatmates"}]),
        "np.name": json.dumps("Niki"), "np.city": json.dumps("Bengaluru"),
        "np.settings": json.dumps({"theme": "light", "size": "normal", "motion": "reduce"}),
    }
    screens = [
        ("01-home", "/"), ("02-plans", "/plans"), ("03-groups", "/groups"), ("04-settings", "/settings"), ("05-about", "/about"),
        ("06-new-what", "/new"), ("07-who", f"/p/{a}?tab=who"), ("08-dates", f"/p/{a}?tab=dates"), ("09-budget", f"/p/{a}?tab=budget"),
        ("10-activity", f"/p/{a}?tab=activity"), ("11-where", f"/p/{a}?tab=where"), ("12-places", f"/p/{a}?tab=places"),
        ("13-tasks", f"/p/{a}?tab=tasks"), ("14-confirmed", f"/p/{b}?tab=places"),
    ]
    with sync_playwright() as p:
        br = p.chromium.launch(channel="msedge")
        for device, w, h in (("laptop", 1440, 900), ("phone", 390, 844)):
            ctx = br.new_context(viewport={"width": w, "height": h}, color_scheme="light", device_scale_factor=1)
            ctx.add_init_script("const s=" + json.dumps(store) + ";for(const k in s){localStorage.setItem(k,s[k])}")
            pg = ctx.new_page()
            for name, path in screens:
                pg.goto(B + path)
                pg.wait_for_timeout(1500)
                pg.screenshot(path=str(OUT / f"{name}-{device}.jpg"), type="jpeg", quality=82, full_page=device == "phone")
            # close-ups of the map on a place card and on the confirmed plan
            for name, path in (("16-map-place-card", f"/p/{a}?tab=places"), ("17-map-confirmed", f"/p/{b}?tab=places")):
                pg.goto(B + path)
                pg.wait_for_selector(".mini-map .leaflet-tile-loaded", timeout=20000)
                pg.wait_for_timeout(1200)
                pg.locator("article:has(.mini-map)").first.screenshot(path=str(OUT / f"{name}-{device}.jpg"), type="jpeg", quality=85)
            # a friend opening the link for the first time
            fr = br.new_context(viewport={"width": w, "height": h}, color_scheme="light")
            fr.add_init_script("localStorage.setItem('np.settings', JSON.stringify({motion:'reduce'}))")
            fp = fr.new_page()
            fp.goto(f"{B}/p/{a}")
            fp.wait_for_timeout(1500)
            fp.screenshot(path=str(OUT / f"15-friend-joins-{device}.jpg"), type="jpeg", quality=82, full_page=device == "phone")
            ctx.close(); fr.close()
        br.close()
    print("saved", len(list(OUT.glob("*.jpg"))), "screenshots to", OUT)


if __name__ == "__main__":
    main()
