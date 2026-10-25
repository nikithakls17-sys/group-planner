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

## API, Gemma options, fair tasks (Oct 26)

- `planner.py`: gathers candidates (SerpApi places for the top 2 moods near the group's midpoint + Google Events in
  the first member's city, a curated list of 7 online activities, and "at X's home" for anyone who can host), then
  asks Gemma for 3 options that must quote a candidate `ref` and a time window index. Every option goes through the
  checker; failures are sent back once with the reasons named ("Made-up Cafe (p_fake): not in the search results"),
  and anything failing twice is dropped. Every check is saved to a `checker_events` collection (for the eval table)
  and every rejection becomes a Sentry issue tagged with the rule.
- Online-only when people are more than 80 km apart or it's a call.
- Weather (Open-Meteo, no key) is added only to outdoor-sounding place options.
- Fair split (`tasks.py`): heaviest task first, each to whoever has the lowest running load (history + tasks given
  out so far). Starting a plan counts as 3. Confirmed plans write their tasks into `task_history`, keyed by group.
- Fairness sim, 10 plans, 5 people, worst case where person A starts every plan: loads A 30 (all from starting),
  B-E 16/15/15/15. A gets zero tasks. My first test assumed all five would be within 3 of each other, which was wrong:
  the fair outcome is that the person who always starts does nothing else.
- Votes: an option locks when more than half of the people who answered say "I'm in"; the planner can lock early
  (ties: most "I'm in", then most "Maybe"). Locking creates tasks and asks everyone "Still in?".
- Drop-outs: their open tasks are reassigned straight away; the planner chooses "go ahead" or "find a new time"
  (which sends everyone back to the times step and clears options, votes and tasks).
- Swaps: nobody takes an offered task within 12 h (or 6 h before it's due) -> the app reassigns it.
- Host address: stored only on the host, returned only to members who confirmed, only once the plan is locked.
- Member links: the share link is the plan id (unguessable `token_urlsafe(12)`); each person gets a private member
  id kept in their browser. Other people only see a short public id, name, color and status.
- Not done: reminder/nudge emails need an email provider key.
- End-to-end API test with a fake Gemma: create, claim name, join, answers, close, generate (2 of 3 first-try options
  rejected: invented place + over budget; retry fills the gap), vote, lock, tasks, swap, confirm, .ics, group load,
  delete group really deletes the plan. 18 tests pass.

## Design system (Oct 26)

- Tokens in `frontend/src/index.css`: neutral background and grays, one accent (`#2b5fd9`) for primary buttons and
  the progress tracker, type scale 14/16/20/28/36 only, one radius (16px), one shadow, spacing on Tailwind's
  4/8/12/16/24/32 steps. Inter for everything, Caveat only for a few friendly highlights.
- Member colors are Okabe-Ito (color-blind safe), always drawn as a circle with initials; text color on the avatar
  is picked by luminance so yellow gets dark initials.
- Shared components in `components/ui.tsx`: Button (primary/secondary/text, 48px min height), Chip/ChipGroup (any
  "No preference" chip clears the others), Tile, Card, Avatar/AvatarRow, Progress tracker, Help "?" tooltip, bottom
  Sheet, Toast, Screen (back arrow, one question, one primary button, a "what happens next" line), Working (loading
  lines), ErrorBox, Field.
- `APP_NAME` lives in `frontend/src/config.ts` and `backend/app/config.py`.
- A long bash heredoc with JSX in it broke the shell ("unexpected EOF"); wrote those files directly instead.

## Screens (Oct 26)

- Home (headline in Caveat, Plan something, I'm bored, your plans with a tracker each), planner flow (8 one-question
  screens + Send the invite), member flow (invite, name + color, city, when free, quick picks, done), plan page,
  Plans tab, Groups tab + group page with planning-load bars and "Delete this group and all its data".
- No accounts: the browser remembers your plans, groups, name, city, last picks and "I'm usually free" text in
  localStorage. The planner draft autosaves on every tap, and each member answer is saved to the server on Next.
- Availability: "Type it" (Gemma turns text into slots, shown back as removable chips) or "Tap times" (days x
  Morning/Afternoon/Evening/Late grid, converted to UTC in the browser). Google Calendar comes with Auth0 later.
- A name the planner added can be claimed ("Are you one of them?") so the colors and names line up.
- The plan page polls every 8 s and starts generating options by itself once the answers are in, with friendly
  loading lines. Per-person distance (colored initials + km) is computed server-side from city coordinates.
- Share: Web Share API (falls back to copy), copy, mailto email, QR code (`qrcode` package), editable message.
- Phone: bottom bar Home / Plans / Groups. Laptop: same three as a left sidebar. The step-by-step flows hide the nav.
- I'm bored (first version): opens the planner flow already set to "today or tomorrow", starting at "Who's coming?".
- Honest limit: anyone with a group's link id can delete that group. The id is unguessable and never shown to members.

## First live run: hosted Gemma + Atlas (Oct 26)

- Plan: online call, Niki in Bengaluru + Sam in Chicago, both typed their free times.
- "Type it" with `gemma-4-31B-it` on DigitalOcean: 2.6-3.9 s. "saturday morning till noon, sunday 8 to 11 am" in
  Chicago came back as 14:00-17:00 UTC on both days, which is right: US clocks change on Nov 1, so 9 AM CDT Saturday
  and 8 AM CST Sunday are both 14:00 UTC.
- Options: 4.8 s, 3 of 3 passed the checker on the first try (online only, no SerpApi key yet). Best window was
  8 PM India / 9:30 AM Chicago.
- Bug: Sam typed "sam" instead of tapping the "Are you Sam?" chip and became a second Sam, so the plan kept waiting
  on the first one. Fix: if a typed name matches exactly one unclaimed invited name, it claims it (keeping the
  planner's spelling). Covered in the flow test.
- Gemma's "why" lines are generic ("caters to both users' interests"). Prompt tuning later.
