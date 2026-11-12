# FourFold

A personal productivity dashboard combining an Eisenhower matrix, habit
tracker, calendar, Pomodoro timer, and school/homework tracking in one app —
built with React, TypeScript, and Vite, backed by Vercel serverless functions.

## Features

- **Home dashboard** — a "today" view: a one-line summary, at-a-glance stats
  (open/overdue tasks, habit progress, focus sessions, what's next), a
  **focus list** of overdue / due-soon / "Do first" work you can check off
  in place, a timeline of today's events and scheduled tasks with a "now"
  marker, plus habits, focus timer, assistant and countdowns.
- **Quick add with natural language** — type `Essay tomorrow 3pm 45m !1` and
  FourFold fills in the due date, books the time on your calendar (or finds a
  free slot for a time estimate) and files it in the right quadrant.
  Available from Home, every Matrix quadrant, the command palette (`N`) and
  the mobile `+` button. Most actions offer **Undo**.
- **Command palette** (`Ctrl/⌘ K` or `/`) — jump to any page, run actions
  (start focus, plan my day, toggle theme…), search tasks, habits,
  countdowns, friends and events, or hand a question to the assistant.
- **Keyboard shortcuts** — `G` then `H/M/C/S/B/P/F/A` to navigate, `N` new
  task, `F` start/pause focus, `T` theme, `?` for the full list.
- **Eisenhower Matrix** — colour-coded quadrants, inline add per quadrant,
  drag tasks between quadrants, sort by due date, friendly due labels with
  overdue highlighting, and a per-task menu (move, schedule, lock, delete).
- **Habit Tracker** — daily checklists, streaks, and yearly grids.
- **Friends** — track friends with notes, birthdays (auto-synced to a
  Countdowns entry), addresses, phone numbers, and custom fields. The friend
  detail dialog can also link arbitrary calendar events and countdowns to a
  friend, via a unified search (`:cd`/`:evnt` to scope it to just countdowns
  or events) — a linked countdown shows a small badge wherever it's
  displayed.
- **Calendar** — two-way sync with Google Calendar, plus a read-only ICS
  "secret address" fallback.
- **Pomodoro Timer** — focus-session history (today + last 7 days), with ambient background sound and optional Spotify
  now-playing/playback control.
- **School** — one homework list across all classes (add with
  `Problem set 4 fri`, filter by class, check off, undo), where each item
  shows which matrix quadrant it lands in and why: your priority decides
  importance, and anything overdue or due within 2 days counts as urgent.
  Homework tracking merges in assignments from Schoology
  (ICS feed, or its API for points possible), Canvas (personal access
  token), and Google Classroom (reuses the Google OAuth connection from
  Calendar sync), plus (optionally) a school bell-schedule integration
  (`src/lib/harkerBell.ts` talks to a public Harker Middle School API — swap
  this out or remove it if your school doesn't have an equivalent). A
  personal API token (Settings → Personal API access) opens the
  [public API](#public-api) to outside tools.
- **Public API** — read *and write* your calendar, tasks, homework, habits and
  countdowns from scripts, automations or an AI assistant. See
  [Public API](#public-api).
- **Scheduling agent** — an Anthropic-powered assistant (`api/agent.ts`) that
  can read and change your calendar, tasks, homework, habits and countdowns,
  plan your day, and auto-schedule tasks into free calendar time.

## Public API

Generate a token in **Settings → Personal API access** and send it as
`Authorization: Bearer <token>`. Everything below reads and writes the same data
the app shows (a signed-in session token works too). Dates are `YYYY-MM-DD`,
times are 24-hour `HH:MM`, in the timezone given by `?tz=` (an IANA name such as
`America/Los_Angeles`; default UTC). Errors are `{ "error": "…" }` with a
sensible status (`400` bad input, `401` auth, `404`, `423` item is locked).

```bash
curl -H "Authorization: Bearer $TOKEN" "https://your-app.vercel.app/api/v1/summary?tz=America/Los_Angeles"
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"class":"Chemistry","title":"Lab report","due":"2026-11-20","priority":"high"}' \
  "https://your-app.vercel.app/api/v1/homework"
```

| Endpoint | What it does |
| --- | --- |
| `GET /api/v1` | Lists every endpoint |
| `GET /summary` | Today at a glance: events, overdue/due-today tasks, homework, habits, countdowns |
| `GET /events?from=&to=` | Calendar events from FourFold, linked Google calendars and ICS feeds (≤ 92 days) |
| `POST /events` | `{title, date, startTime?, durationMin?\|endTime?, allDay?, description?, location?, calendar?}` — `calendar` is `local` (default), `google`, or an id from `GET /calendars` |
| `GET/PATCH/DELETE /events/:id` | `PATCH` takes the same fields plus `{locked, color}`. ICS events are read-only upstream, so edits and deletes are local overrides, as in the app |
| `GET /calendars` | Calendars events can be written to |
| `GET/POST /tasks` | Matrix tasks. `GET ?quadrant=q1..q4&status=open\|done\|all&due_before=` · `POST {title, quadrant?, dueDate?, durationMin?, description?}` |
| `GET/PATCH/DELETE /tasks/:id` | `PATCH {title, done, dueDate, quadrant, time, durationMin, locked, …}` |
| `GET/POST /homework` | Homework from the app *and* Schoology/Canvas/Classroom, each with its class and matrix quadrant. `GET ?status=&class=&quadrant=&days=` · `POST {class, title, due?, priority?}` |
| `GET/PATCH/DELETE /homework/:id` | `PATCH {done, title, due, priority}`. Imported assignments only accept `{done}` |
| `GET /classes` | Your classes |
| `GET/POST /habits`, `GET/PATCH/DELETE /habits/:id` | Habits with today's status and streak. `PATCH {done: true\|false, date?}` checks off or un-checks a day |
| `GET/POST /countdowns`, `GET/PATCH/DELETE /countdowns/:id` | Countdowns with `daysUntil` |
| `GET /friends` | Friends (read-only) |

Locked tasks and events ("set in stone") refuse edits and deletes with `423`
until you `PATCH {"locked": false}`. The older
`GET /api/lms?action=homework` endpoint keeps working.

Calling from a sandboxed tool (for example a scheduled AI run)? The sandbox's
network allowlist must include your FourFold domain, or the request is blocked
before it ever reaches the app.

## Tech stack

- [Vite](https://vitejs.dev/) + [React](https://react.dev/) + TypeScript
- [React Router](https://reactrouter.com/)
- [Vercel](https://vercel.com/) serverless functions (`api/`)
- [Upstash Redis](https://upstash.com/) for server-side storage
- [Anthropic SDK](https://docs.anthropic.com/) for the scheduling agent
- Google OAuth (default sign-in + Calendar sync) — with an optional
  email+PIN fallback sign-in — and Spotify OAuth (playback)

## Getting started

### Prerequisites

- [Bun](https://bun.sh/)
- [Vercel CLI](https://vercel.com/docs/cli) (`npm i -g vercel`, or `bunx vercel`)
  — the `src/` frontend runs fine under plain `vite`, but the `api/*.ts`
  serverless functions (auth, Google/Spotify OAuth, the scheduling agent)
  only execute under `vercel dev` or a real Vercel deployment.

### 1. Clone and install

```bash
git clone https://github.com/Krennix/fourfold.git
cd fourfold
bun install
cp .env.example .env
```

You'll fill in `.env` in the next steps. `vercel dev` and Vite both load it
automatically — you don't need to export anything by hand.

### 2. Google OAuth (sign-in + Calendar sync)

FourFold uses one Google OAuth client for two things: Google Identity
Services sign-in (browser-side) and the Calendar sync flow (server-side).

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and
   create a project (or pick an existing one).
2. **APIs & Services → Enabled APIs** → enable the **Google Calendar API**.
3. **APIs & Services → OAuth consent screen** → configure it (External is
   fine for personal use; add yourself as a test user if it's in Testing
   mode).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**,
   type **Web application**.
5. Under **Authorized JavaScript origins**, add the origin(s) you'll run the
   app from, e.g.:
   - `http://localhost:3000` (default `vercel dev` port)
   - your production URL, e.g. `https://your-app.vercel.app`
6. Under **Authorized redirect URIs**, add, for each origin above:
   - `<origin>/api/googleOAuthCallback` (e.g.
     `http://localhost:3000/api/googleOAuthCallback`)
7. Save, then copy the **Client ID** and **Client secret** into `.env`:
   ```
   VITE_GOOGLE_CLIENT_ID=<client id>
   GOOGLE_CLIENT_ID=<same client id>
   GOOGLE_CLIENT_SECRET=<client secret>
   ```

### 3. Allowlist your account

Sign-in is gated by an allowlist — by default nobody can sign in. Add your
own Google account email(s), comma-separated, to `.env`:

```
ALLOWED_EMAILS=you@gmail.com
```

### 4. Session secret

App session tokens are HMAC-signed with a secret you generate once:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Put the output in `.env` as `SESSION_SECRET`.

### 5. Optional: email + PIN fallback sign-in

If the Google popup isn't convenient on a given device, you can enable a
fallback: an allowed email (from step 3) plus a shared passcode. Set

```
LOGIN_PIN=some-shared-passcode
```

in `.env` to turn it on; leave it unset to disable the fallback entirely.
Google sign-in stays the default — the fallback only appears as a "Use
email + PIN instead" link on the sign-in screen.

### 6. Upstash Redis (server-side storage)

Easiest path — via Vercel:

1. Push the repo to your own GitHub and [import it into Vercel](https://vercel.com/new).
2. In the Vercel project, **Storage → Create Database → Upstash → Redis**,
   then connect it to the project. This sets `KV_REST_API_URL` and
   `KV_REST_API_TOKEN` for your deployment automatically.
3. For local dev, pull them down with `vercel link` then `vercel env pull .env`,
   or copy the REST URL/token from the [Upstash console](https://console.upstash.com/)
   into `.env` yourself.

### 7. Anthropic API key (scheduling agent)

Create a key at [console.anthropic.com](https://console.anthropic.com/settings/keys)
and set it in `.env`:

```
ANTHROPIC_API_KEY=<your key>
```

### 8. Spotify (optional — now-playing/playback on the Pomodoro page)

1. Create an app at the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Add a **Redirect URI** for each origin you use, matching the pattern
   `<origin>/api/spotifyOAuthCallback`, e.g.:
   - `http://localhost:3000/api/spotifyOAuthCallback`
   - `https://your-app.vercel.app/api/spotifyOAuthCallback`
3. Copy the **Client ID** and **Client secret** into `.env` as
   `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`. Skip this section if you
   don't need Spotify integration — the app runs fine without it.

### 9. Run it

```bash
vercel dev
```

This serves the Vite frontend and the `api/` functions together (default
`http://localhost:3000`). Plain `bun dev` also works if you only need the
frontend and don't need auth, Calendar/Spotify sync, or the scheduling
agent — those all require the `api/` functions.

**No Vercel / Upstash account? Run the API locally with Bun:**

```bash
bun run dev:api   # serves api/*.ts on :3001 (in-memory Redis if KV_* is unset)
bun dev           # Vite proxies /api to it
```

`dev:api` reads `.env` like `vercel dev` does. With `ALLOWED_EMAILS` and
`LOGIN_PIN` set you can sign in with email + PIN and use the whole app
offline (stored data resets when the process restarts).

### Environment variable reference

| Variable | Purpose |
| --- | --- |
| `VITE_GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google sign-in and Calendar sync |
| `ALLOWED_EMAILS` | Comma-separated allowlist of Google accounts permitted to sign in |
| `LOGIN_PIN` | Optional shared passcode enabling the email+PIN fallback sign-in |
| `SESSION_SECRET` | Signs app session tokens |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Upstash Redis |
| `ANTHROPIC_API_KEY` | Powers the scheduling agent |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Spotify now-playing/playback (optional) |

## Scripts

- `bun dev` — start the Vite dev server
- `bun run build` — typecheck and build for production
- `bun run lint` — run oxlint
- `bun run preview` — preview the production build locally
- `bun run dev:api` — run the `api/` functions locally without `vercel dev`
- `bun run test:api` — end-to-end smoke test of every API endpoint (auth,
  data sync, API tokens, the public `/api/v1`, LMS routing, all assistant modes) against an
  in-memory Redis and a fake Anthropic endpoint — no credentials needed

## Deployment

The app is designed to deploy on [Vercel](https://vercel.com/), which serves
`src/` as a static SPA and `api/*.ts` as serverless functions. Set the
environment variables above in your Vercel project settings.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Community

- **Bugs and feature requests** → [GitHub Issues](https://github.com/Krennix/fourfold/issues)
- **Questions, ideas, and general discussion** → [GitHub Discussions](https://github.com/Krennix/fourfold/discussions)
- **Security vulnerabilities** → see [SECURITY.md](SECURITY.md)

## License

[MIT](LICENSE)
