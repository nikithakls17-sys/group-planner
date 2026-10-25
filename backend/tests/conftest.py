import os
import tempfile

# Tests never touch Atlas, Sentry, SerpApi or a real model
os.environ.update({"MONGODB_URI": "", "SENTRY_DSN": "", "SERPAPI_KEY": "", "LLM_PROVIDER": "ollama"})

import pytest  # noqa: E402

from app import config, store  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_store(monkeypatch):
    d = tempfile.mkdtemp()
    from pathlib import Path
    monkeypatch.setattr(config, "DATA_DIR", Path(d))
    store._store = None
    yield
    store._store = None
