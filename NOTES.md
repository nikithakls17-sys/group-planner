# Build notes

Running log of decisions, bugs and fixes. Becomes "How I Built It" in the post.

## Step 1: scaffold (Oct 25-26)

- New repo, separate from the Week 2 project (Articulate Me). Reused from it:
  - `backend/app/llm.py`: the one LLM client. `LLM_PROVIDER=ollama|digitalocean`, defaults from `MODE`.
    Keeps the Gemma 4 `reasoning_effort: none` fix for Ollama and the empty-`{}` JSON-mode retry for DigitalOcean.
  - `backend/app/observability.py`: Sentry init, `gen_ai_span` for agent tracing, `report_issue` for checker rejections.
  - Dockerfile (Node build stage, then Python 3.12 slim) and `render.yaml` shape.
- Store: MongoDB Atlas when `MONGODB_URI` is set, JSON files in `data/local_store` otherwise, same interface,
  so local dev and tests need no database.
- Default local model is `gemma4:e4b` (installed). `gemma3:1b` is the fallback if RAM is tight.
- Render plan set to `free` to start.
- Local Python is 3.14, but the Docker image uses 3.12, so the venv is 3.12 (`py -3.12`) to match.
- Bug: first frontend build failed with `Cannot find module './index.css'`. Fix: add `src/vite-env.d.ts`.
- Bug: the first venv was created inside `frontend/` (wrong working directory), so `pip install` could not find
  `backend/requirements.txt` and installed nothing, and uvicorn failed with exit 127. Fix: recreate `.venv` at the
  repo root with absolute paths. Backend `/api/health` returns 200 after that.
- Port 5173 was taken by another local app, so Vite moved to 5174.
