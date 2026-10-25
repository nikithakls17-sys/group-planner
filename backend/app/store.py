"""App data. MongoDB Atlas when MONGODB_URI is set, JSON files on disk otherwise."""
import json
import threading
from datetime import datetime, timezone

from . import config

COLLECTIONS = ["groups", "members", "plans", "votes", "tasks", "task_history"]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class MongoStore:
    def __init__(self, uri: str, db: str):
        from pymongo import MongoClient

        self.db = MongoClient(uri, appname="nobody-plans")[db]
        for c in COLLECTIONS:
            self.db[c].create_index("id", unique=True)
        self.db.members.create_index("group_id")
        self.db.plans.create_index("group_id")
        self.db.votes.create_index("plan_id")
        self.db.tasks.create_index("plan_id")
        self.db.task_history.create_index("member_id")

    def insert(self, coll: str, doc: dict):
        self.db[coll].insert_one(dict(doc))

    def get(self, coll: str, doc_id: str):
        return self.db[coll].find_one({"id": doc_id}, {"_id": 0})

    def find(self, coll: str, **flt):
        return list(self.db[coll].find(flt, {"_id": 0}).sort("created_at", 1))

    def update(self, coll: str, doc_id: str, fields: dict):
        self.db[coll].update_one({"id": doc_id}, {"$set": fields})

    def delete(self, coll: str, doc_id: str):
        self.db[coll].delete_one({"id": doc_id})


class JsonStore:
    """One JSON file per collection under data/local_store. Fine for local dev and tests."""

    def __init__(self, root):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self.lock = threading.Lock()

    def _load(self, coll):
        f = self.root / f"{coll}.json"
        return json.loads(f.read_text(encoding="utf-8")) if f.exists() else []

    def _save(self, coll, docs):
        (self.root / f"{coll}.json").write_text(json.dumps(docs, indent=1), encoding="utf-8")

    def insert(self, coll, doc):
        with self.lock:
            docs = self._load(coll)
            docs.append(dict(doc))
            self._save(coll, docs)

    def get(self, coll, doc_id):
        return next((d for d in self._load(coll) if d.get("id") == doc_id), None)

    def find(self, coll, **flt):
        docs = [d for d in self._load(coll) if all(d.get(k) == v for k, v in flt.items())]
        return sorted(docs, key=lambda d: d.get("created_at", ""))

    def update(self, coll, doc_id, fields):
        with self.lock:
            docs = self._load(coll)
            for d in docs:
                if d.get("id") == doc_id:
                    d.update(fields)
            self._save(coll, docs)

    def delete(self, coll, doc_id):
        with self.lock:
            self._save(coll, [d for d in self._load(coll) if d.get("id") != doc_id])


_store = None


def store():
    global _store
    if _store is None:
        _store = MongoStore(config.MONGODB_URI, config.MONGODB_DB) if config.MONGODB_URI \
            else JsonStore(config.DATA_DIR / "local_store")
    return _store
