# PRD — Nobody Plans (working name)

**"Every group chat has one person who does all the planning. I built an app so nobody has to be that person."**

Hackathon: DEV Hacktoberfest Open-Source AI Challenge, Week 3 "Slow and Steady" (build something that rewards laziness)
Hard deadline: Sun Oct 25, 11:59 PM PDT = **Mon Oct 26, 12:29 PM IST**

## 1. The problem

In every friend group or family there is one person who always plans. They ask everyone when they're free, chase replies, find a place, check if it fits everyone's budget, split jobs, and send reminders. It takes dozens of messages over days, and if they stop doing it, nothing happens.

Existing tools only do one slice: When2meet/Doodle do times, Splitwise does money, Google Maps does places. Nobody takes over the planner's whole job.

## 2. The solution

One person (or the app itself) starts a plan. Everyone opens one link and answers once. The app does the rest:

1. **Finds when everyone is free**, across time zones (Google Calendar or a quick tap-grid).
2. **Suggests 3 plans** that fit everyone's budget, distance and mood: in person, online, or at someone's home.
3. **Everyone votes.** Majority wins, ties go to whoever has done the least planning lately.
4. **Splits the jobs fairly** (book, bring snacks, send the address, host) with a swap button. Or the starter can choose "I'll handle it all."
5. **Sends the reminders** and a calendar invite, so nobody has to chase anyone.

**The hero button: "I'm bored."** Tap it, and the app checks who's free soon, finds something happening nearby or online that fits the group, and sends the group a one-tap "I'm in" vote.

## 3. Who it's for

Friend groups and families, ideally spread across US and India time zones. Also roommates, student orgs, long-distance friends.

## 4. Why open source matters

- **Privacy:** it reads calendars, locations and budgets. Gemma runs on our own server (or a laptop), and we only store what the plan needs.
- **Cost:** open models keep it free for friend groups.
- **Control:** the plan checker and fairness rules are ours; we can swap models with one env var.
- Honest limit: a bigger closed model might write livelier plan descriptions. It would still need the same plan checker.

## 5. Tech stack

| Layer | Choice | Prize category |
|---|---|---|
| Frontend | React + Vite + TypeScript + Tailwind, mobile-first | |
| Backend | FastAPI (Python) | |
| LLM | Gemma 4 via one OpenAI-compatible client: `ollama` local / `digitalocean` hosted | Gemma, DigitalOcean |
| Hosting | Render, one Docker service from `render.yaml` | Render |
| Domain | `plan.nikitha.tech` | .tech Domain |
| Calendar access | Auth0 for AI Agents with Token Vault for Google Calendar free/busy; approval before creating events | Auth0 for AI Agents |
| Places and events | SerpApi Google Maps local results + Google Events near the group's midpoint | SerpApi |
| Data | MongoDB Atlas | MongoDB Atlas |
| Reminders | Temporal workflow per plan (P1) | Temporal |
| Observability | Sentry agent tracing on every Gemma + SerpApi call; checker rejections become Sentry issues | Sentry |

Fallbacks: manual availability grid if Auth0/Google Calendar isn't ready; a simple scheduled job if Temporal isn't ready.

## 6. Core features

### 6.1 Start a plan
What for (hangout, dinner, trip, online night, family call), rough date range, who's in. Mode: "Share the work" or "I'll handle it all." Generates a share link + a WhatsApp-ready message.

### 6.2 Each member answers once (under 60 seconds)
Availability (Google Calendar or tap grid, time zone auto-detected), city/neighbourhood only, max travel distance, budget (Free / Under $15 / Under $40 / Flexible), vibes (chill, active, food, outdoors, online, at someone's home), can host.

### 6.3 Find times
Deterministic code intersects availability across time zones and returns the best 3 windows, ranked by how many people are free and how reasonable the local time is for everyone.

### 6.4 Suggest plans (Gemma + SerpApi)
Group midpoint from members' cities; SerpApi places matching the vibe + local events in the window; online options from a curated list when people are far apart. Gemma writes 3 plan cards: what, where, when, cost per person, why it fits.

### 6.5 Plan checker
Every card is checked in code: time inside a free window, cost <= the lowest budget, distance <= each member's max (in person), place came from SerpApi, event date inside the window. One retry with the failure named, then dropped. Every rejection logged to Sentry.

### 6.6 Vote
"I'm in" / "Maybe" / "Can't." Live tally. Locks on majority or when the starter locks it.

### 6.7 Fair task split
Tasks per plan type, assigned by a fairness score from task history. Swap button. "Planning load" bar per person.

### 6.8 Reminders
.ics download or Google Calendar event after approval. Reminders 1 day and 2 hours before, plus task nudges. Temporal workflow (P1).

### 6.9 "I'm bored"
Next free window in 24-48 hours, runs 6.4-6.5 quickly, sends a one-tap vote.

## 7. Data model (Atlas)

- `groups`: name, members, created_by
- `members`: name, email, time zone, city, max_distance, budget, vibes, can_host, calendar_connected
- `plans`: group, type, date_range, mode, windows, candidates, checker_results, chosen_plan, status
- `votes`: plan, member, choice
- `tasks`: plan, title, assignee, status, swap_requests
- `task_history`: member, plan, task, weight, date

## 8. Evaluation

- **Real-world test:** messages and time for the last plan vs. this one.
- **Checker test:** 20 made-up groups with tricky constraints; % of raw Gemma suggestions that broke a rule, % the checker caught.
- **Fairness check:** 10 simulated plans for a 5-person group; planning load evens out.

## 9. Build phases

### P0
1. Scaffold: FastAPI + Vite React, Dockerfile, `render.yaml`, `.env.example`, `NOTES.md`.
2. Atlas models + "Start a plan" + share link + member answer form (manual availability grid).
3. Time-finding across time zones (with unit tests).
4. SerpApi places + events; Gemma writes 3 plan cards; plan checker.
5. Voting + fair task split + swap.
6. Deploy to Render on DigitalOcean Gemma.

### P1
7. "I'm bored" button. 8. Auth0 Token Vault + Google Calendar. 9. Reminders (Temporal). 10. `plan.nikitha.tech`. 11. Evaluation runs.

### P2
12. Online activity how-to pages. 13. Planning-load chart. 14. Hotel/trip mode.

## 10. Screens

Landing, Start a plan, Member answer, Plan options, Locked plan, Group page. Friendly, clean, mobile-first, no emojis.
