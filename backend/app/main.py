from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import config, llm
from .observability import init_sentry
from .store import store

init_sentry()
app = FastAPI(title="Nobody Plans")


@app.get("/api/health")
def health():
    return {"ok": True, "mode": config.MODE, "llm": config.LLM_PROVIDER, "model": llm.model_name(),
            "store": type(store()).__name__, "serpapi": bool(config.SERPAPI_KEY)}


if config.FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=config.FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        f = config.FRONTEND_DIST / path
        if path and f.is_file():
            return FileResponse(f)
        return FileResponse(config.FRONTEND_DIST / "index.html")
