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

## Build instructions v2 (Oct 26)

- Got a fuller spec (one question per screen, member colors, plan page tracker, final confirmation). It replaces
  the PRD flow where they conflict.
- Keys: reused the DigitalOcean Gemma (`gemma-4-31B-it`), Atlas and Sentry keys from Articulate Me in the local
  `.env`; Atlas uses a new database, `nobodyplans`. Local dev uses hosted Gemma because `gemma4:e4b` needs ~5 GB RAM
  and this laptop often has ~1-2 GB free.

## Time-finding and plan checker (code, no AI)

- `times.py`: availability is stored as UTC intervals. The search runs in 30-minute steps from the earliest local
  midnight to the latest local end of day across everyone's time zones. A window counts for a person only if their
  local start and end fall between 8 AM and 11 PM. Ranking: most people free first, then least "discomfort" (time
  outside 10 AM-9 PM local), and the top 3 never overlap.
- `checker.py` rules: invented_place, time_window, local_time, budget (lowest budget in the group, "No preference"
  ignored), cost_too_low (Gemma can't call a `$$$` place $5: a minimum cost comes from Google's price level, parks are
  free), distance (limits per choice, tighter with no car: short drive 15 km vs 6 km), closed (Google opening hours),
  event_date, notes (keyword conflicts like "no alcohol" vs brewery), locks (planner's day/time/place).
- Opening hours that Google doesn't list count as "unknown", not "closed". Honest limit.
- Locations are city-level (Open-Meteo geocoding, no key), so distances are city-centre to place. "Walking distance"
  is only meaningful for people who name a neighbourhood.
- Windows needs `tzdata` for `zoneinfo`.
- Tests: 15 pass. One test was wrong at first (the "far" friend was 5.6 km away, under the 6 km no-car limit).
