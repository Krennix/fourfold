# FourFold

A personal productivity dashboard combining an Eisenhower matrix, habit
tracker, calendar, Pomodoro timer, and school/homework tracking in one app —
built with React, TypeScript, and Vite, backed by Vercel serverless functions.

## Features

- **Home dashboard** — an overview combining widgets from every module.
- **Eisenhower Matrix** — prioritize tasks by urgency/importance, and link
  them to calendar events or times.
- **Habit Tracker** — daily checklists, streaks, and yearly grids.
- **Calendar** — two-way sync with Google Calendar, plus a read-only ICS
  "secret address" fallback.
- **Pomodoro Timer** — with ambient background sound and optional Spotify
  now-playing/playback control.
- **School** — homework tracking that can merge in assignments from a
  Schoology ICS feed, and (optionally) a school bell-schedule integration
  (`src/lib/harkerBell.ts` talks to a public Harker Middle School API — swap
  this out or remove it if your school doesn't have an equivalent).
- **Scheduling agent** — an Anthropic-powered assistant (`api/agent.ts`) that
  can help auto-schedule tasks/habits into free calendar time.

## Tech stack

- [Vite](https://vitejs.dev/) + [React](https://react.dev/) + TypeScript
- [React Router](https://reactrouter.com/)
- [Vercel](https://vercel.com/) serverless functions (`api/`)
- [Upstash Redis](https://upstash.com/) for server-side storage
- [Anthropic SDK](https://docs.anthropic.com/) for the scheduling agent
- Google OAuth (sign-in + Calendar sync) and Spotify OAuth (playback)

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

### 5. Upstash Redis (server-side storage)

Easiest path — via Vercel:

1. Push the repo to your own GitHub and [import it into Vercel](https://vercel.com/new).
2. In the Vercel project, **Storage → Create Database → Upstash → Redis**,
   then connect it to the project. This sets `KV_REST_API_URL` and
   `KV_REST_API_TOKEN` for your deployment automatically.
3. For local dev, pull them down with `vercel link` then `vercel env pull .env`,
   or copy the REST URL/token from the [Upstash console](https://console.upstash.com/)
   into `.env` yourself.

### 6. Anthropic API key (scheduling agent)

Create a key at [console.anthropic.com](https://console.anthropic.com/settings/keys)
and set it in `.env`:

```
ANTHROPIC_API_KEY=<your key>
```

### 7. Spotify (optional — now-playing/playback on the Pomodoro page)

1. Create an app at the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Add a **Redirect URI** for each origin you use, matching the pattern
   `<origin>/api/spotifyOAuthCallback`, e.g.:
   - `http://localhost:3000/api/spotifyOAuthCallback`
   - `https://your-app.vercel.app/api/spotifyOAuthCallback`
3. Copy the **Client ID** and **Client secret** into `.env` as
   `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`. Skip this section if you
   don't need Spotify integration — the app runs fine without it.

### 8. Run it

```bash
vercel dev
```

This serves the Vite frontend and the `api/` functions together (default
`http://localhost:3000`). Plain `bun dev` also works if you only need the
frontend and don't need auth, Calendar/Spotify sync, or the scheduling
agent — those all require the `api/` functions.

### Environment variable reference

| Variable | Purpose |
| --- | --- |
| `VITE_GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google sign-in and Calendar sync |
| `ALLOWED_EMAILS` | Comma-separated allowlist of Google accounts permitted to sign in |
| `SESSION_SECRET` | Signs app session tokens |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Upstash Redis |
| `ANTHROPIC_API_KEY` | Powers the scheduling agent |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Spotify now-playing/playback (optional) |

## Scripts

- `bun dev` — start the Vite dev server
- `bun run build` — typecheck and build for production
- `bun run lint` — run oxlint
- `bun run preview` — preview the production build locally

## Deployment

The app is designed to deploy on [Vercel](https://vercel.com/), which serves
`src/` as a static SPA and `api/*.ts` as serverless functions. Set the
environment variables above in your Vercel project settings.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
