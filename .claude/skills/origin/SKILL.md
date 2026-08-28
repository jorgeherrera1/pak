---
name: origin
description: Use for any forge operation in this repository — creating, viewing, reviewing, or updating pull requests, checking CI status, or querying repo state. This repo is hosted on Cursor Origin, not GitHub; `gh` does not work here.
---

# Cursor Origin

This repo's forge is Cursor Origin. `gh` does not work here. Use the `origin` CLI — it is `gh`-shaped:

- `origin pr create | list | status | view | diff | checks | checkout | comment | review | ready | refresh | edit | thread | close`
- `origin api <endpoint>` — escape hatch, works like `gh api` (against `api.cursor.com/v1/origin`)
- `origin ruleset list` — read the repo's merge-time and push-time rules

For flags, run `origin <cmd> --help` — do not guess `gh` flag names.

## Differences from GitHub

- `origin pr create` defaults to **draft**. Pass `--status open` (or run `origin pr ready`) when the PR is meant for review. `-f`/`--fill` takes title and body from the commits.
- PRs are version-snapshotted. After pushing new commits to a PR branch, run `origin pr refresh` so the PR picks up the new SHA.
- Most `pr` subcommands infer the target from the current branch — no need to pass a PR number while on the branch.
- `--request-changes` is not supported yet; reviews are approve or comment only.
- Review comment threads (the address-feedback loop): `origin pr thread` — list, reply, resolve, reopen.

## Boundary

`origin pr merge` exists — never call it. Merging is a human decision (see AGENTS.md → Git workflow).
