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

## Redesign round 1: poster/sketch style + backend for the new flow (Oct 26)

- Testing feedback asked for a new planner order (group link first, then what, when with my own free times, who,
  details, task table, deadline, send), auto location for friends, a step bar with tappable finished steps, square
  corners everywhere, and a look based on Niki's references (Cool Cat Jazz Club, House Party, Dia dos Namorados,
  Notion poster) plus "anthropomorphic" and "conceptual sketch" styles.
- Style: cream paper (#f1ece1) with a faint SVG noise grain, black ink 2px boxes, one poster green (#0f8a43, white
  text passes AA), printed offset shadow (3px 3px 0 ink) instead of soft blur, `border-radius: 0` on everything.
  Type: Oswald uppercase for poster headings, Patrick Hand for hand-lettered notes, Inter for everything you need to
  read fast. Small uppercase tracked labels like the "GOOD DRINKS - GOOD TUNES" line.
- Mascot "Cal": an ink-line calendar page with eyes, cheeks (crosshatched), arms and legs, in 4 moods (sleepy, happy,
  thinking, wave). The loading spinner is now Cal bobbing while thinking. Home has dashed, labelled slots for the
  illustrations Niki will send.
- Backend: plans can start as drafts (`draft: true`) so the group link works from step 1; `PATCH /api/plans/{id}`
  (planner only) fills in kind, specific dates (not just a range), details, optional start/end time, work, deadline,
  and `send`. Time-finding only looks at the picked dates, and ranks the day most people said "suits me best" right
  after "most people free". Optional start + end time override the default length.
- Task table before anything is chosen: jobs per plan kind (meal: book the table, split the bill...), split fairly.
  The planner drags tasks between people (`task-move`); anyone can ask one person "Can we swap?" (`task-ask`), who can
  take it or decline. Locking keeps the arranged table and only adds due dates (and a Host task for at-home plans).
- Members can send `lat`/`lon` detected in the browser instead of typing a city.
- Bug: the new `/tasks/{id}/move` route was swallowed by the older `/tasks/{id}/{action}` route (FastAPI matches in
  order), so moves returned "unknown action". Renamed to `/task-move/{id}` and `/task-ask/{id}`. 19 tests pass.

## Redesign round 2: fewer steps, new fonts and colors, settings, editing (Oct 26)

- Feedback: text should look more like the reference posters, more color, an About page and Settings with light/dark,
  editing a planned meeting (time, people, anything) and deleting it, and the fewest steps possible with swipe,
  Back/Next everywhere, a tappable progress bar and nothing lost going back.
- Fonts: Anton (the tall HOUSE PARTY headline) for headings, Permanent Marker (the COOL CAT hand lettering) for small
  hand-written notes, Inter for body. Type scale moved to rem so "Large text" in Settings scales everything.
- Color: five poster spot colors (green, tomato, mustard, sky, pink) used as blocks of paper (plan cards, kind tiles,
  sections), never as text color, so contrast stays AA. Dark theme swaps paper and ink and darkens the spots.
- Settings: Light / Dark / Match my phone, Normal / Large text, Normal / Reduce motion, name, usual color, "Forget
  everything on this device". The theme is applied by a tiny inline script in index.html before React loads, so
  there's no flash of the wrong theme. About page: 5 numbered steps, Cal's intro, why open source, stack.
- Step counts (the number Niki asked for):
  - Planner: 5 steps + the send screen. 1 Who (name, auto location, group name, people, and the group link with
    QR/Share appears right there), 2 What (tapping a tile moves on), 3 When (calendar + "This weekend" + my free
    times on the same screen), 4 Details (who decides, picks, which day suits best with everyone's faces per day,
    optional start/end), 5 Tasks and deadline (fair task table with drag and drop + answer-by). Was 8 + send.
  - Friend: 3 steps + a done screen. 1 You (the invite text, "Can't make it", name, color, auto location),
    2 Free times (calendar of the planner's days + tap/type/Google), 3 Quick picks (pre-filled from last time, best
    day). Was invite + 5 steps + done.
- Navigation: Back and Next on every step; swipe right = Back, swipe left = Next (ignored when starting on an input or
  the task table, and Next only fires when it's allowed); every step in the bar is tappable once the plan exists.
  Planner draft and friend answers are mirrored to localStorage on every change, so going back or closing the tab
  loses nothing.
- Editing: planner can edit dates/details/tasks before options exist (same flow, opened at "When"), and after a
  plan is picked can move its time (`PATCH /chosen`: everyone confirms again, task due dates move), rename it, remove
  a person (their votes go, their tasks are reassigned), or delete the plan completely. Test added; 20 pass.
- Location: detected in the browser and rounded to ~1 km before reverse-geocoding to a city (BigDataCloud's free
  client endpoint, no key). Needs https, so on the local Wi-Fi test link it falls back to typing a city.

## Redesign round 3: the planner book (Oct 26)

- New direction from Niki: a planner book (open notebook, binder clip, pastel tab dividers, stickers), a sunset /
  ochre gender-neutral palette, and dropping the mascot and sketch styles. New reference images: a planner-book
  portfolio spread, an illustrated city map poster, a handwritten to-do list, a hand-lettered "Dundee Dance Walk".
- Laptop: the whole app is an open two-page spread on an ochre-to-sunset desk (theme tokens `--desk`, `--desk-2`),
  off-white paper with faint ruled lines, a spine shadow, a binder clip on the left edge, tabs out of the right
  edge. Left page = the current tab, right page = a live summary (plan so far, who answered, matched dates ranked by
  how many are free, jobs). Phone: one page, clip at the top, tabs as a scrollable strip.
- A plan is now one book with tabs What, Who, Dates, Budget, Plans, Tasks (+ Go and Money once the plan is picked).
  This replaces the separate planner flow, friend flow and plan page; old `/p/:id/answer` links redirect.
  Planner: type name + tap a kind (the plan and group link exist right away) -> Who (link, QR, add/remove people)
  -> Dates -> Budget -> Plans. Friend: Who (name, color, auto location, I'm in) -> Dates -> Budget.
- Dates tab ("When are you free?"): Connect Google Calendar first (recommended, enabled once Auth0 is set up), or
  pick free dates on a calendar. Dates are required, times optional: "Any time preferences?" with Morning /
  Afternoon / Evening / Any time and a Skip button. Skip = 8 AM-11 PM on those dates, so skipping never blocks a
  match; the existing time-finding then ranks by how many people are free. The planner's free dates become the
  plan's dates that friends choose from.
- Budget tab adds the private access-needs question (step-free, accessible restroom, seating, quiet, close parking,
  other); stored in the member's own picks, which the API only returns to that member.
- Type: Rubik Doodle Shadow (outlined) for page headings only, tinted with the tab's color and a rule across the
  page; Inter for everything else; Caveat for tiny notes and loading lines. Pastel tab colors double as the 12
  member colors, always with initials. Headings use a deep tint on light paper and the pastel on dark paper.
- Stickers only on plan options (white border, slight tilt) and the picked plan, which gets a "Picked" /
  "Confirmed" stamp. Tabs switch with a small page-turn (off with reduced motion).
- Bugs found with screenshots: (1) in dark mode the text on pastel tiles/tabs was light-on-pastel and unreadable;
  fixed with an `.on-pastel` rule that always uses dark ink. (2) "Phone" screenshots looked cut off; headless Edge
  ignores window widths under ~500 px (measured `innerWidth` 496 at `--window-size=390`), so the page wasn't
  overflowing, the screenshot was cropped. Phone shots need a 390 px iframe harness.

## Round 4a: Niki's palette, a real page turn, plan list actions (Oct 26)

- Palette from Niki's swatch image: Sunshine yellow #FFD54F, Soft butter #FFE8A1, Warm cream #FFF7E1, Peach glow
  #FFB366, Sunlit green #A3B454. Desk = sunshine to peach gradient, paper = warm cream, text = deep olive-brown
  (#3b2e0c, like the swatch labels), primary buttons = deep sunlit green #56631a (white text 6.4:1). The first four
  tab/member colors are the swatches; backend member colors now use the same pastel set.
- Page turn (after looking at book-flip references): a paper leaf with a shading gradient rotates 180 degrees over
  the spine on laptop (forward = right page turns left, back = left page turns right), and curls away from the left
  edge on phone. The new page is already underneath, so the leaf reveals it. Skipped entirely when reduced motion is
  on (the leaf is never rendered, so it can't get stuck if animations are disabled). Removed after 800 ms.
- Plans page: New plan, and on each plan Edit (opens its What page) and Delete for everyone (planner) or Leave
  (others, removes it from this device), with a confirmation sheet.
- SerpApi is live. Google Maps results include `extensions[].accessibility`, e.g. "Wheelchair accessible entrance",
  "Wheelchair accessible restroom", "Wheelchair accessible parking lot", "Wheelchair accessible seating", plus
  phone, website and opening hours, which the access check and task help will use. Bengaluru results had no
  `price` field, so cost will lean on Gemma's estimate checked against the group budget.
