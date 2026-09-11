# Security Policy

FourFold is a personal productivity app. It's maintained by one person in
their spare time, not a company with a dedicated security team — please
keep that in mind when it comes to response times.

## Supported versions

There's no versioned release process — only the `main` branch is
supported. If you find a vulnerability, please check it still applies to
the latest commit on `main` before reporting.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, use GitHub's private vulnerability reporting:
[Report a vulnerability](https://github.com/Krennix/fourfold/security/advisories/new)
(repo → **Security** tab → **Report a vulnerability**). This opens a
private conversation with the maintainer that isn't visible to the public
until it's resolved.

If that's not available for some reason, open a normal issue asking the
maintainer to get in touch privately, without including exploit details.

**For critical/high-severity vulnerabilities** (e.g. anything that could
expose other users' data or tokens, or bypass authentication entirely),
please reach out directly instead of waiting on the above:

- Email: **tog.ironridge@gmail.com**
- Discord: **@Director_Krennic** (DM)

Please include, where relevant:

- A description of the vulnerability and its impact
- Steps to reproduce (or a proof of concept)
- The affected file(s)/endpoint(s)

You should get an initial response within a few days. There's no bug
bounty — this is an unfunded personal project — but you'll be credited if
you'd like.

## Scope

Things that are in scope and taken seriously:

- Authentication/session handling (`api/session.ts`, `api/_lib/session.ts`)
  — bypassing the `ALLOWED_EMAILS` allowlist, forging or replaying session
  tokens, etc.
- OAuth token handling for Google/Spotify (`api/google.ts`, `api/spotify.ts`,
  `api/_lib/*OAuth.ts`, `api/_lib/*Tokens.ts`) — these store refresh tokens
  server-side in Redis; anything that exposes another user's tokens or lets
  one user read/write another user's data is a real issue.
- Injection or data-leak issues in the `api/*.ts` serverless functions.

Out of scope / known, accepted limitations for a small personal-use app:

- Denial-of-service / rate-limiting reports — there's no rate limiting on
  most endpoints today. If you find something that meaningfully worsens
  this, it's still worth a report, just expect it to be lower priority.
- Reports that require access to someone's own `ANTHROPIC_API_KEY`,
  `SESSION_SECRET`, or other self-hosted secrets that were never meant to
  be shared — this app assumes whoever deploys it controls their own
  environment variables.
- Vulnerabilities in third-party dependencies without a demonstrated path
  to actually affecting this app — please report those upstream first.
