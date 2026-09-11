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

You don't need any special permission to open a pull request — forking and
opening a PR as above works for anyone.

## Getting contributor (write) access

If you'd like write access to the repo itself (e.g. to push branches
directly instead of working from a fork), DM the maintainer on Discord
(**@director_krennic_**) with:

- Your GitHub username
- A little about your coding experience
- A rough estimate of your age, using these bands (round down to the
  nearest band at or below your actual age):
  - If you're an adult: `Major 25+`, `Major 50+`, `Major 75+`, etc. — e.g.
    someone who is 34 says `Major 25+`, someone who is 55 says `Major 50+`.
  - If you're a minor: `Minor 15+`, `Minor 13+`, etc. — e.g. someone who is
    16 says `Minor 15+`.
- The **Minimum Age** to work on this project is **14**.

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

For general questions, ideas that aren't a concrete proposal yet, or just
wanting to chat about the project, use
[GitHub Discussions](https://github.com/Krennix/fourfold/discussions) instead.
