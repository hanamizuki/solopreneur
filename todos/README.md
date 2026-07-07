# Solopreneur Dogfood Backlog

This directory is the public dogfood backlog for the solopreneur marketplace
repo. It shows the file shape used by the `todos-*`, `worktree-handoff`, and
`autopilot` workflows on real repository work.

## Layout

- `backlog/` — open items that have not started yet.
- `doing/` — active or partially completed items.
- `done/` — completed items kept as examples and audit history.
- `private/` — ignored local notes or archived drafts that should not be part
  of the public dogfood backlog.

## Public Backlog Policy

Only repository-local work belongs here. Good examples include plugin packaging,
release workflow changes, skill architecture, docs, and bug reports that can be
understood from public code.

Do not add private customer information, credentials, private infrastructure
details, business strategy, unrelated repo tasks, or local-only machine state.
When a task needs that context, keep the private notes outside this repo and
commit only a sanitized public summary here.
