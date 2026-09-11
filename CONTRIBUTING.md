# Contributing to FourFold

Thanks for your interest in contributing! FourFold is a small personal
productivity app, so keep expectations proportional — this isn't a large
project with a big review team, but pull requests are welcome.

## Getting set up

See the [README](README.md#getting-started) for installing dependencies,
configuring environment variables, and running the app locally.

## Development workflow

1. Fork the repo and create a branch off `main` for your change.
2. Make your change.
3. Before opening a pull request, make sure it passes:
   ```bash
   bun run lint
   bun run build
   ```
   (`build` runs the TypeScript compiler as well as Vite, so it catches type
   errors too.)
4. Open a pull request against `main` describing what changed and why.

## Code style

- Match the existing style in the file you're editing (this project doesn't
  use Prettier — `oxlint` is the source of truth for lint rules).
- Keep changes focused. Prefer small, reviewable PRs over large ones that
  bundle unrelated changes.

## Tests

There's no automated test suite yet. Tests aren't required for every change,
but for larger or more complex changes, a reviewer may ask you to add
tests (or a manual test plan in the PR description) before merging.

## Commit sign-off (DCO)

All commits must be signed off, certifying you have the right to submit the
code under this project's license (the
[Developer Certificate of Origin](https://developercertificate.org/)).

Add a `Signed-off-by` line to every commit — the easiest way is the `-s` flag:

```bash
git commit -s -m "Your commit message"
```

This appends a line like:

```
Signed-off-by: Your Name <your.email@example.com>
```

PRs with unsigned commits will need to be amended before merging.

## Reporting bugs / requesting features

Open a [GitHub issue](https://github.com/Krennix/fourfold/issues) with as
much detail as you can — steps to reproduce for bugs, or the use case for
feature requests.
