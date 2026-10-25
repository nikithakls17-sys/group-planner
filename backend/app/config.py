import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, "").strip() or default


APP_NAME = _env("APP_NAME", "Nobody Plans")  # not final: change it here (and frontend/src/config.ts)

MODE = _env("MODE", "local")
HOSTED = MODE == "hosted"

LLM_PROVIDER = _env("LLM_PROVIDER", "digitalocean" if HOSTED else "ollama")
OLLAMA_BASE_URL = _env("OLLAMA_BASE_URL", "http://localhost:11434/v1")
OLLAMA_MODEL = _env("OLLAMA_MODEL", "gemma4:e4b")
DO_INFERENCE_BASE_URL = _env("DO_INFERENCE_BASE_URL", "https://inference.do-ai.run/v1")
DO_MODEL_ACCESS_KEY = _env("DO_MODEL_ACCESS_KEY")
DO_MODEL = _env("DO_MODEL")
PROMPT_VERSION = _env("PROMPT_VERSION", "v1")

SERPAPI_KEY = _env("SERPAPI_KEY")

MONGODB_URI = _env("MONGODB_URI")
MONGODB_DB = _env("MONGODB_DB", "nobodyplans")

SENTRY_DSN = _env("SENTRY_DSN")
SENTRY_ENVIRONMENT = _env("SENTRY_ENVIRONMENT", "dev")

PUBLIC_URL = _env("PUBLIC_URL", "http://localhost:5173")

AUTH0_DOMAIN = _env("AUTH0_DOMAIN")
AUTH0_CLIENT_ID = _env("AUTH0_CLIENT_ID")
AUTH0_CLIENT_SECRET = _env("AUTH0_CLIENT_SECRET")
RESEND_API_KEY = _env("RESEND_API_KEY")
EMAIL_FROM = _env("EMAIL_FROM")

DATA_DIR = ROOT / "data"
FRONTEND_DIST = ROOT / "frontend" / "dist"
