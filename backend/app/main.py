import secrets
import threading
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, Header, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import config, llm, places, planner, tasks
from .observability import init_sentry
from .store import now_iso, store
from .times import parse_iso

init_sentry()
app = FastAPI(title=config.APP_NAME)
_generating: set[str] = set()
_gen_lock = threading.Lock()


@app.get("/api/health")
def health():
    return {"ok": True, "app": config.APP_NAME, "mode": config.MODE, "llm": config.LLM_PROVIDER, "model": llm.model_name(),
            "store": type(store()).__name__, "serpapi": bool(config.SERPAPI_KEY)}


def token() -> str:
    return secrets.token_urlsafe(12)


# ---------- helpers ----------

def _plan(pid: str) -> dict:
    p = store().get("plans", pid)
    if not p:
        raise HTTPException(404, "We couldn't find this plan. The link may be wrong or the plan was deleted.")
    return p


def _members(pid: str) -> list[dict]:
    return store().find("members", plan_id=pid)


def _me(pid: str, mid: str | None) -> dict | None:
    if not mid:
        return None
    m = store().get("members", mid)
    return m if m and m["plan_id"] == pid else None


def _need_me(pid: str, mid: str | None) -> dict:
    m = _me(pid, mid)
    if not m:
        raise HTTPException(403, "Open this plan from your invite link first.")
    return m


def _need_planner(plan: dict, mid: str | None) -> dict:
    m = _need_me(plan["id"], mid)
    if m["id"] != plan["planner_id"]:
        raise HTTPException(403, "Only the planner can do that.")
    return m


def _history_key(plan: dict) -> str:
    return plan.get("group_id") or plan["id"]


def _member_key(m: dict) -> str:
    return m["name"].strip().lower()


def _answers_ready(plan: dict, members: list[dict]) -> bool:
    answered = [m for m in members if m["status"] == "answered"]
    if plan.get("answers_closed"):
        return len(answered) >= 1
    waiting = [m for m in members if m["status"] == "invited"]
    past_deadline = plan.get("deadline") and parse_iso(plan["deadline"]) <= datetime.now(timezone.utc)
    return len(answered) >= 2 and (not waiting or bool(past_deadline))


def _tally(plan: dict, members: list[dict]) -> dict:
    votes = store().find("votes", plan_id=plan["id"])
    pub = {m["id"]: m["pub"] for m in members}
    out = {o["id"]: {"in": [], "maybe": [], "cant": []} for o in plan.get("options") or []}
    for v in votes:
        if v["option_id"] in out and v["member_id"] in pub:
            out[v["option_id"]][v["choice"]].append(pub[v["member_id"]])
    return out


def _attending(members: list[dict]) -> list[dict]:
    return [m for m in members if m["status"] == "answered" and m.get("confirm") != "no"]


def _stage(plan: dict) -> str:
    s = plan["status"]
    if s == "options":
        return "vote" if store().find("votes", plan_id=plan["id"]) else "options"
    return {"answers": "answers", "locked": "tasks", "confirmed": "confirmed"}.get(s, s)


def _public_member(m: dict, me: dict | None) -> dict:
    out = {"pub": m["pub"], "name": m["name"], "color": m["color"], "status": m["status"], "tz": m.get("tz"),
           "city": m.get("city", ""), "confirm": m.get("confirm"), "is_planner": m.get("is_planner", False),
           "has_answers": bool(m.get("availability"))}
    if me and me["id"] == m["id"]:
        out.update({k: m.get(k) for k in ("id", "email", "availability", "standing", "picks", "host_address", "avail_text")})
    return out


def _view(plan: dict, me: dict | None) -> dict:
    members = _members(plan["id"])
    pub = {m["id"]: m["pub"] for m in members}
    chosen = next((o for o in plan.get("options") or [] if o["id"] == plan.get("chosen")), None)
    task_list = [{**t, "assignee": pub.get(t["assignee"]), "mine": bool(me and t["assignee"] == me["id"])}
                 for t in store().find("tasks", plan_id=plan["id"])]
    address = None
    if chosen and chosen["kind"] == "home" and me and me.get("confirm") == "yes":
        host = store().get("members", chosen.get("host_id") or "")
        address = (host or {}).get("host_address")  # only for confirmed members, only after locking
    opts = [{k: v for k, v in o.items() if k != "host_id"} | {"host_pub": pub.get(o.get("host_id"))}
            for o in plan.get("options") or []]
    return {
        "id": plan["id"], "title": plan["title"], "kind": plan["kind"], "kind_other": plan.get("kind_other"),
        "start_day": plan["start_day"], "end_day": plan["end_day"], "decide": plan["decide"],
        "details": plan.get("details"), "locks": plan.get("locks") or {}, "work": plan["work"],
        "deadline": plan.get("deadline"), "status": plan["status"], "stage": _stage(plan),
        "planner": pub.get(plan["planner_id"]), "group_id": plan.get("group_id"),
        "members": [_public_member(m, me) for m in members], "me": _public_member(me, me) if me else None,
        "is_planner": bool(me and me["id"] == plan["planner_id"]),
        "answers_ready": _answers_ready(plan, members), "generating": plan["id"] in _generating,
        "options": opts, "votes": _tally(plan, members), "chosen": plan.get("chosen"),
        "problem": plan.get("problem"), "windows": plan.get("windows") or [], "searched": plan.get("searched", 0),
        "tasks": task_list, "host_address": address, "dropout": plan.get("dropout"),
        "checker": plan.get("checker_summary"), "created_at": plan["created_at"],
    }


# ---------- plans ----------

class Person(BaseModel):
    name: str
    email: str = ""
    color: str = ""


class NewPlan(BaseModel):
    kind: str
    kind_other: str = ""
    start_day: str
    end_day: str
    when_label: str = ""
    decide: str = "everyone"  # everyone | planner
    details: dict | None = None
    locks: dict | None = None
    work: str = "share"  # share | solo
    deadline: str | None = None
    planner: Person
    tz: str = "UTC"
    people: list[Person] = []
    group_id: str | None = None
    save_group_as: str = ""


KIND_TITLES = {"hangout": "a hangout", "meal": "a meal", "date": "a date", "call": "a call", "trip": "a trip"}
COLORS = ["#0072B2", "#E69F00", "#009E73", "#CC79A7", "#56B4E9", "#D55E00", "#F0E442", "#000000"]


def _next_color(used: list[str]) -> str:
    return next((c for c in COLORS if c not in used), COLORS[len(used) % len(COLORS)])


def _new_member(plan_id: str, p: Person, used: list[str], **extra) -> dict:
    color = p.color or _next_color(used)
    used.append(color)
    m = {"id": token(), "pub": secrets.token_hex(3), "plan_id": plan_id, "name": p.name.strip()[:40], "email": p.email.strip(),
         "color": color, "status": "invited", "availability": [], "picks": {}, "created_at": now_iso(), **extra}
    store().insert("members", m)
    return m


@app.post("/api/plans")
def create_plan(body: NewPlan):
    if not body.planner.name.strip():
        raise HTTPException(400, "Tell us your name first.")
    pid = token()
    title = body.kind_other.strip() if body.kind == "other" and body.kind_other.strip() else KIND_TITLES.get(body.kind, "a plan")
    group_id = body.group_id
    if not group_id and body.save_group_as.strip():
        group_id = token()
        store().insert("groups", {"id": group_id, "name": body.save_group_as.strip()[:40], "created_by": body.planner.name,
                                  "members": [body.planner.model_dump()] + [p.model_dump() for p in body.people if p.name.strip()],
                                  "created_at": now_iso()})
    plan = {"id": pid, "title": title, "kind": body.kind, "kind_other": body.kind_other, "start_day": body.start_day,
            "end_day": body.end_day, "when_label": body.when_label, "decide": body.decide,
            "details": body.details if body.decide == "planner" else None, "locks": body.locks or {}, "work": body.work,
            "deadline": body.deadline, "status": "answers", "options": [], "tz": body.tz, "group_id": group_id,
            "created_at": now_iso()}
    used: list[str] = []
    me = _new_member(pid, body.planner, used, is_planner=True, tz=body.tz, status="invited")
    plan["planner_id"] = me["id"]
    for p in body.people:
        if p.name.strip() and p.name.strip().lower() != body.planner.name.strip().lower():
            _new_member(pid, p, used)
    store().insert("plans", plan)
    store().insert("task_history", {"id": token(), "group_key": _history_key(plan), "member_key": _member_key(me),
                                    "plan_id": pid, "task": "Started the plan", "weight": tasks.STARTED_PLAN_WEIGHT,
                                    "created_at": now_iso()})
    return {"plan_id": pid, "member_id": me["id"]}


@app.get("/api/plans/{pid}")
def get_plan(pid: str, x_member: str | None = Header(None)):
    plan = _plan(pid)
    _auto_reassign(plan)
    return _view(plan, _me(pid, x_member))


class Join(BaseModel):
    name: str
    claim: str | None = None  # pub id of a name the planner already added
    tz: str = "UTC"


@app.post("/api/plans/{pid}/join")
def join(pid: str, body: Join):
    plan = _plan(pid)
    members = _members(pid)
    if body.claim:
        m = next((x for x in members if x["pub"] == body.claim and not x.get("is_planner") and not x.get("claimed")), None)
        if m:
            store().update("members", m["id"], {"claimed": True, "tz": body.tz, "name": body.name.strip()[:40] or m["name"]})
            return {"member_id": m["id"]}
    if not body.name.strip():
        raise HTTPException(400, "Tell us what to call you.")
    m = _new_member(plan["id"], Person(name=body.name), [x["color"] for x in members], tz=body.tz, claimed=True)
    return {"member_id": m["id"]}


class MemberUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    email: str | None = None
    tz: str | None = None
    city: str | None = None
    availability: list[dict] | None = None
    avail_text: str | None = None
    standing: str | None = None
    picks: dict | None = None
    status: str | None = None  # answered | declined
    host_address: str | None = None


@app.patch("/api/plans/{pid}/me")
def update_me(pid: str, body: MemberUpdate, x_member: str | None = Header(None)):
    plan = _plan(pid)
    me = _need_me(pid, x_member)
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if "status" in fields and fields["status"] not in ("answered", "declined", "invited"):
        raise HTTPException(400, "bad status")
    if "city" in fields and fields["city"] != me.get("city"):
        g = places.geocode(fields["city"]) if fields["city"].strip() else None
        fields.update({"lat": (g or {}).get("lat"), "lon": (g or {}).get("lon"), "city_found": (g or {}).get("name")})
    if "host_address" in fields:
        fields["host_address"] = fields["host_address"][:200]
    store().update("members", me["id"], fields)
    return _view(plan, store().get("members", me["id"]))


class AvailText(BaseModel):
    text: str
    tz: str


@app.post("/api/plans/{pid}/parse-availability")
async def parse_avail(pid: str, body: AvailText):
    plan = _plan(pid)
    try:
        slots = await run_in_threadpool(planner.parse_availability, body.text, body.tz, plan["start_day"], plan["end_day"])
    except Exception:
        raise HTTPException(502, "We couldn't read that. Try tapping times instead.")
    return {"slots": slots}


@app.post("/api/plans/{pid}/close-answers")
def close_answers(pid: str, x_member: str | None = Header(None)):
    plan = _plan(pid)
    _need_planner(plan, x_member)
    store().update("plans", pid, {"answers_closed": True})
    return _view(_plan(pid), _me(pid, x_member))


def _run_suggest(plan: dict, avoid: list[str] | None = None) -> dict:
    res = planner.suggest(plan, _members(plan["id"]), avoid=avoid)
    rejected = res["rejected"]
    summary = {"raw": len(res["options"]) + len(rejected), "passed": len(res["options"]), "rejected": len(rejected),
               "rules": sorted({f["rule"] for r in rejected for f in r["fails"]}), "llm_error": res["llm_error"],
               "searched": res["searched"]}
    return {"options": res["options"], "windows": res["windows"], "searched": res["searched"],
            "problem": res.get("problem") or (None if res["options"] else "none_passed"), "checker_summary": summary}


@app.post("/api/plans/{pid}/generate")
async def generate(pid: str, x_member: str | None = Header(None)):
    plan = _plan(pid)
    _need_me(pid, x_member)
    if plan["status"] not in ("answers", "options"):
        raise HTTPException(400, "This plan already has a chosen option.")
    with _gen_lock:
        if pid in _generating:
            return _view(plan, _me(pid, x_member))
        _generating.add(pid)
    try:
        regen = plan["status"] == "options"
        if regen:
            avoid = [o["ref"] for o in plan.get("options") or []]
        else:
            if not _answers_ready(plan, _members(pid)):
                raise HTTPException(400, "Still waiting on answers.")
            avoid = None
        fields = await run_in_threadpool(_run_suggest, plan, avoid)
        if fields["options"]:
            fields["status"] = "options"
            if regen:
                for v in store().find("votes", plan_id=pid):
                    store().delete("votes", v["id"])
        elif regen:
            fields = {"problem": "no_more"}  # keep the old options
        store().update("plans", pid, fields)
    finally:
        _generating.discard(pid)
    return _view(_plan(pid), _me(pid, x_member))


# ---------- vote, lock ----------

class Vote(BaseModel):
    option_id: str
    choice: str  # in | maybe | cant


@app.post("/api/plans/{pid}/vote")
def vote(pid: str, body: Vote, x_member: str | None = Header(None)):
    plan = _plan(pid)
    me = _need_me(pid, x_member)
    if plan["status"] != "options":
        raise HTTPException(400, "Voting is closed for this plan.")
    if body.choice not in ("in", "maybe", "cant") or body.option_id not in [o["id"] for o in plan["options"]]:
        raise HTTPException(400, "bad vote")
    for v in store().find("votes", plan_id=pid, member_id=me["id"], option_id=body.option_id):
        store().delete("votes", v["id"])
    store().insert("votes", {"id": token(), "plan_id": pid, "member_id": me["id"], "option_id": body.option_id,
                             "choice": body.choice, "created_at": now_iso()})
    if me["status"] == "invited":  # voting from the link counts as joining in
        store().update("members", me["id"], {"status": "answered"})
    members = _members(pid)
    voters = [m for m in members if m["status"] == "answered"]
    tally = _tally(plan, members)
    winner = _majority(tally, len(voters))
    if winner:
        _lock(plan, winner)
    return _view(_plan(pid), store().get("members", me["id"]))


def _majority(tally: dict, n: int) -> str | None:
    """An option wins when more than half say I'm in. Ties: most I'm in, then most Maybe."""
    winners = [oid for oid, t in tally.items() if len(t["in"]) * 2 > n]
    if not winners:
        return None
    return max(winners, key=lambda o: (len(tally[o]["in"]), len(tally[o]["maybe"])))


def best_option(tally: dict) -> str | None:
    if not tally:
        return None
    return max(tally, key=lambda o: (len(tally[o]["in"]), len(tally[o]["maybe"]), -len(tally[o]["cant"])))


class Lock(BaseModel):
    option_id: str | None = None


@app.post("/api/plans/{pid}/lock")
def lock(pid: str, body: Lock, x_member: str | None = Header(None)):
    plan = _plan(pid)
    _need_planner(plan, x_member)
    if plan["status"] != "options":
        raise HTTPException(400, "Nothing to lock yet.")
    oid = body.option_id or best_option(_tally(plan, _members(pid)))
    if oid not in [o["id"] for o in plan["options"]]:
        raise HTTPException(400, "bad option")
    _lock(plan, oid)
    return _view(_plan(pid), _me(pid, x_member))


def _lock(plan: dict, oid: str):
    opt = next(o for o in plan["options"] if o["id"] == oid)
    members = _members(plan["id"])
    store().update("plans", plan["id"], {"status": "locked", "chosen": oid, "locked_at": now_iso()})
    for m in members:
        store().update("members", m["id"], {"confirm": None})
    _make_tasks(plan, opt, [m for m in members if m["status"] == "answered"])


def _make_tasks(plan: dict, opt: dict, people: list[dict]):
    for t in store().find("tasks", plan_id=plan["id"]):
        store().delete("tasks", t["id"])
    todo = tasks.tasks_for(opt["kind"])
    if opt["kind"] == "home" and opt.get("host_id"):
        host = opt["host_id"]
        todo_rest = [t for t in todo if t[0] != "Host"]
        others = [m for m in people if m["id"] != host] or people
    else:
        host, todo_rest, others = None, todo, people
    start = parse_iso(opt["start"])
    if plan["work"] == "solo":
        owners = [plan["planner_id"]] * len(todo_rest)
    else:
        history = store().find("task_history", group_key=_history_key(plan))
        keys = [_member_key(m) for m in others]
        picked = tasks.assign(todo_rest, keys, history)
        by_key = {_member_key(m): m["id"] for m in others}
        owners = [by_key[k] for k in picked]
    rows = ([("Host", 3, host)] if host else []) + [(t, w, o) for (t, w), o in zip(todo_rest, owners)]
    for title, weight, owner in rows:
        due = start - (timedelta(days=1) if weight >= 3 else timedelta(hours=3))
        store().insert("tasks", {"id": token(), "plan_id": plan["id"], "title": title, "weight": weight,
                                 "assignee": owner, "due": due.isoformat(), "done": False, "swap_open": False,
                                 "swap_since": None, "created_at": now_iso()})


# ---------- tasks ----------

def _task(pid: str, tid: str) -> dict:
    t = store().get("tasks", tid)
    if not t or t["plan_id"] != pid:
        raise HTTPException(404, "Task not found")
    return t


@app.post("/api/plans/{pid}/tasks/{tid}/{action}")
def task_action(pid: str, tid: str, action: str, x_member: str | None = Header(None)):
    plan = _plan(pid)
    me = _need_me(pid, x_member)
    t = _task(pid, tid)
    if action == "done":
        if t["assignee"] != me["id"] and me["id"] != plan["planner_id"]:
            raise HTTPException(403, "Only the person doing this task can tick it off.")
        store().update("tasks", tid, {"done": not t["done"]})
    elif action == "swap":
        if t["assignee"] != me["id"]:
            raise HTTPException(403, "You can only offer your own tasks.")
        store().update("tasks", tid, {"swap_open": True, "swap_since": now_iso()})
    elif action == "unswap":
        store().update("tasks", tid, {"swap_open": False, "swap_since": None})
    elif action == "take":
        if not t["swap_open"] or t["assignee"] == me["id"]:
            raise HTTPException(400, "This task isn't up for swapping.")
        store().update("tasks", tid, {"assignee": me["id"], "swap_open": False, "swap_since": None})
    elif action == "reassign":
        _reassign(plan, t)
    else:
        raise HTTPException(404, "unknown action")
    return _view(_plan(pid), me)


def _reassign(plan: dict, t: dict):
    """Nobody took the swap: the app hands it to whoever has the lightest load now (not the person offering it)."""
    members = [m for m in _attending(_members(plan["id"])) if m["id"] != t["assignee"]]
    if not members:
        store().update("tasks", t["id"], {"swap_open": False, "swap_since": None})
        return
    history = store().find("task_history", group_key=_history_key(plan))
    open_load = {}
    for x in store().find("tasks", plan_id=plan["id"]):
        open_load[x["assignee"]] = open_load.get(x["assignee"], 0) + x["weight"]
    who = min(members, key=lambda m: tasks.load(history, _member_key(m)) + open_load.get(m["id"], 0))
    store().update("tasks", t["id"], {"assignee": who["id"], "swap_open": False, "swap_since": None})


SWAP_WAIT = timedelta(hours=12)


def _auto_reassign(plan: dict):
    if plan["status"] not in ("locked", "confirmed"):
        return
    now = datetime.now(timezone.utc)
    for t in store().find("tasks", plan_id=plan["id"]):
        if t["swap_open"] and t["swap_since"]:
            due = parse_iso(t["due"])
            if now - parse_iso(t["swap_since"]) > SWAP_WAIT or due - now < timedelta(hours=6):
                _reassign(plan, t)


# ---------- final confirmation ----------

class Confirm(BaseModel):
    choice: str  # yes | no


@app.post("/api/plans/{pid}/confirm")
def confirm(pid: str, body: Confirm, x_member: str | None = Header(None)):
    plan = _plan(pid)
    me = _need_me(pid, x_member)
    if plan["status"] not in ("locked", "confirmed") or body.choice not in ("yes", "no"):
        raise HTTPException(400, "Nothing to confirm yet.")
    store().update("members", me["id"], {"confirm": body.choice})
    members = _members(pid)
    fields: dict = {}
    if body.choice == "no":
        dropped = [m["name"] for m in members if m.get("confirm") == "no"]
        fields["dropout"] = {"names": dropped, "decided": None}
        # their open tasks go back to the app to hand out
        for t in store().find("tasks", plan_id=pid, assignee=me["id"]):
            if not t["done"]:
                _reassign(plan, t)
    going = [m for m in members if m["status"] == "answered" and m.get("confirm") != "no"]
    if going and all(m.get("confirm") == "yes" for m in going) and not (fields.get("dropout") and not fields["dropout"]["decided"]):
        fields["status"] = "confirmed"
        _record_history(plan)
    if fields:
        store().update("plans", pid, fields)
    return _view(_plan(pid), store().get("members", me["id"]))


class Dropout(BaseModel):
    decision: str  # go_ahead | new_time


@app.post("/api/plans/{pid}/dropout")
def dropout(pid: str, body: Dropout, x_member: str | None = Header(None)):
    plan = _plan(pid)
    _need_planner(plan, x_member)
    members = _members(pid)
    if body.decision == "go_ahead":
        d = plan.get("dropout") or {}
        store().update("plans", pid, {"dropout": {**d, "decided": "go_ahead"}})
        going = [m for m in members if m["status"] == "answered" and m.get("confirm") != "no"]
        if going and all(m.get("confirm") == "yes" for m in going):
            store().update("plans", pid, {"status": "confirmed"})
            _record_history(plan)
    elif body.decision == "new_time":
        # Back to answers: everyone gives times again, options/votes/tasks are cleared
        for coll in ("votes", "tasks"):
            for x in store().find(coll, plan_id=pid):
                store().delete(coll, x["id"])
        for m in members:
            st = m["status"] if m.get("confirm") != "no" else "declined"
            store().update("members", m["id"], {"confirm": None, "availability": [], "status": "invited" if st == "answered" else st})
        store().update("plans", pid, {"status": "answers", "options": [], "chosen": None, "dropout": None,
                                      "answers_closed": False, "problem": None,
                                      "deadline": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()})
    else:
        raise HTTPException(400, "bad decision")
    return _view(_plan(pid), _me(pid, x_member))


def _record_history(plan: dict):
    """When a plan is confirmed, its tasks count towards everyone's planning load for next time."""
    if store().find("task_history", plan_id=plan["id"], task="__recorded__"):
        return
    members = {m["id"]: m for m in _members(plan["id"])}
    for t in store().find("tasks", plan_id=plan["id"]):
        m = members.get(t["assignee"])
        if m:
            store().insert("task_history", {"id": token(), "group_key": _history_key(plan), "member_key": _member_key(m),
                                            "plan_id": plan["id"], "task": t["title"], "weight": t["weight"], "created_at": now_iso()})
    store().insert("task_history", {"id": token(), "group_key": _history_key(plan), "member_key": "", "plan_id": plan["id"],
                                    "task": "__recorded__", "weight": 0, "created_at": now_iso()})


# ---------- calendar ----------

def _ics_text(s: str) -> str:
    return s.replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\n", "\\n")


@app.get("/api/plans/{pid}/invite.ics")
def ics(pid: str, m: str | None = None):
    plan = _plan(pid)
    opt = next((o for o in plan.get("options") or [] if o["id"] == plan.get("chosen")), None)
    if not opt:
        raise HTTPException(404, "No chosen plan yet.")
    me = _me(pid, m)
    fmt = lambda d: parse_iso(d).strftime("%Y%m%dT%H%M%SZ")
    where = opt.get("address") or opt.get("link") or ""
    if opt["kind"] == "home":
        host = store().get("members", opt.get("host_id") or "")
        where = (host or {}).get("host_address") if me and me.get("confirm") == "yes" else f"{opt.get('host')}'s home"
    body = "\r\n".join([
        "BEGIN:VCALENDAR", "VERSION:2.0", f"PRODID:-//{config.APP_NAME}//EN", "BEGIN:VEVENT",
        f"UID:{pid}@nobodyplans", f"DTSTAMP:{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}",
        f"DTSTART:{fmt(opt['start'])}", f"DTEND:{fmt(opt['end'])}", f"SUMMARY:{_ics_text(opt['title'])}",
        f"LOCATION:{_ics_text(where or '')}", f"DESCRIPTION:{_ics_text(opt.get('what', '') + ' ' + config.PUBLIC_URL + '/p/' + pid)}",
        "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", "DESCRIPTION:Reminder", "END:VALARM",
        "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", "DESCRIPTION:Tomorrow", "END:VALARM",
        "END:VEVENT", "END:VCALENDAR", ""])
    return Response(body, media_type="text/calendar", headers={"Content-Disposition": 'attachment; filename="plan.ics"'})


# ---------- groups ----------

@app.get("/api/groups/{gid}")
def get_group(gid: str):
    g = store().get("groups", gid)
    if not g:
        raise HTTPException(404, "Group not found")
    history = store().find("task_history", group_key=gid)
    loadmap = {}
    for h in history:
        if h["member_key"]:
            loadmap[h["member_key"]] = loadmap.get(h["member_key"], 0) + h["weight"]
    plans = [{"id": p["id"], "title": p["title"], "status": p["status"], "stage": _stage(p), "created_at": p["created_at"]}
             for p in store().find("plans", group_id=gid)]
    members = [{"name": m["name"], "color": m.get("color") or COLORS[i % len(COLORS)], "email": m.get("email", ""),
                "load": loadmap.get(m["name"].strip().lower(), 0)} for i, m in enumerate(g["members"])]
    return {"id": gid, "name": g["name"], "members": members, "plans": plans}


@app.delete("/api/groups/{gid}")
def delete_group(gid: str):
    """Really deletes the group, its plans, members, votes, tasks and history."""
    if not store().get("groups", gid):
        raise HTTPException(404, "Group not found")
    for p in store().find("plans", group_id=gid):
        for coll in ("members", "votes", "tasks", "checker_events"):
            for x in store().find(coll, plan_id=p["id"]):
                store().delete(coll, x["id"])
        store().delete("plans", p["id"])
    for h in store().find("task_history", group_key=gid):
        store().delete("task_history", h["id"])
    store().delete("groups", gid)
    return {"ok": True}


@app.delete("/api/plans/{pid}")
def delete_plan(pid: str, x_member: str | None = Header(None)):
    plan = _plan(pid)
    _need_planner(plan, x_member)
    for coll in ("members", "votes", "tasks", "checker_events"):
        for x in store().find(coll, plan_id=pid):
            store().delete(coll, x["id"])
    for h in store().find("task_history", plan_id=pid):
        store().delete("task_history", h["id"])
    store().delete("plans", pid)
    return {"ok": True}


if config.FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=config.FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        f = config.FRONTEND_DIST / path
        if path and f.is_file():
            return FileResponse(f)
        return FileResponse(config.FRONTEND_DIST / "index.html")
