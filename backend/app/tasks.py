"""Tasks for a chosen plan and a fair way to hand them out."""

# (title, weight). Weight is how much planning work it is; starting a plan counts as 3.
TEMPLATES = {
    "place": [("Book or reserve", 3), ("Send everyone the address and time", 1), ("Check it's still open the day before", 1)],
    "event": [("Get the tickets", 3), ("Send everyone the details", 1), ("Plan how everyone gets there", 2)],
    "home": [("Host", 3), ("Bring snacks", 2), ("Bring drinks", 1), ("Clean up after", 2)],
    "online": [("Set up the call link and share it", 2), ("Set up the game or show", 2), ("Send a reminder 1 hour before", 1)],
}
STARTED_PLAN_WEIGHT = 3

# Before anyone knows the exact place, jobs depend on what kind of plan it is
PLAN_TEMPLATES = {
    "hangout": [("Pick and book the place", 3), ("Bring snacks or games", 2), ("Send everyone the details", 1), ("Send a reminder the day before", 1)],
    "meal": [("Book the table", 3), ("Split the bill after", 2), ("Send the address and time", 1), ("Send a reminder the day before", 1)],
    "date": [("Book the place", 3), ("Plan how to get there", 1)],
    "call": [("Set up the call link", 2), ("Pick the game or show", 2), ("Send a reminder 1 hour before", 1)],
    "games": [("Pick the game and share the link", 2), ("Set up the call", 2), ("Send a reminder 1 hour before", 1)],
    "watch": [("Pick what to watch", 2), ("Set up the watch link", 2), ("Send a reminder 1 hour before", 1)],
    "trip": [("Book the stay", 3), ("Plan the transport", 3), ("Collect the money", 2), ("Make a packing list", 1)],
}


def tasks_for_plan(kind: str) -> list[tuple[str, int]]:
    return PLAN_TEMPLATES.get(kind, PLAN_TEMPLATES["hangout"])


def tasks_for(kind: str) -> list[tuple[str, int]]:
    return TEMPLATES.get(kind, TEMPLATES["place"])


def load(history: list[dict], key: str) -> int:
    return sum(h["weight"] for h in history if h["member_key"] == key)


def assign(tasks: list[tuple[str, int]], people: list[str], history: list[dict]) -> list[str]:
    """people: member keys. Heaviest task goes to whoever has done the least work so far; each task
    then adds to that person's running load, so the next one goes to whoever is lightest now.
    Ties go to the order people were listed in."""
    running = {p: load(history, p) for p in people}
    out = [""] * len(tasks)
    for i in sorted(range(len(tasks)), key=lambda i: -tasks[i][1]):
        who = min(people, key=lambda p: (running[p], people.index(p)))
        out[i] = who
        running[who] += tasks[i][1]
    return out
