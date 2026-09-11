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

This project uses [Bun](https://bun.sh/).

```bash
bun install
cp .env.example .env   # then fill in the values (see below)
bun dev
```

The app runs as a Vite dev server; the `api/` serverless functions require
`vercel dev` (or a Vercel deployment) to execute, since Vite alone doesn't run
them. See `vercel.json` for routing.

### Environment variables

Copy `.env.example` to `.env` and fill in the values you need. At minimum:

| Variable | Purpose |
| --- | --- |
| `VITE_GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google sign-in and Calendar sync |
| `ALLOWED_EMAILS` | Comma-separated allowlist of Google accounts permitted to sign in |
| `SESSION_SECRET` | Signs app session tokens — generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Upstash Redis (set automatically if you connect the Vercel integration) |
| `ANTHROPIC_API_KEY` | Powers the scheduling agent |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Spotify now-playing/playback (optional) |

**Note:** sign-in is gated by `ALLOWED_EMAILS` — by default nobody can sign
in until you add your own email(s). This is a personal-use app, not a
multi-tenant product.

## Scripts

- `bun dev` — start the Vite dev server
- `bun run build` — typecheck and build for production
- `bun run lint` — run oxlint
- `bun run preview` — preview the production build locally

## Deployment

The app is designed to deploy on [Vercel](https://vercel.com/), which serves
`src/` as a static SPA and `api/*.ts` as serverless functions. Set the
environment variables above in your Vercel project settings.

## License

[MIT](LICENSE)
