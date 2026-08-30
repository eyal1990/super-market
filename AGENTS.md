# Agent context

## Task source of truth

The GitHub issues for `eyal1990/super-market` are the authoritative task backlog and implementation sequence. Use the issue links in `docs/implementation-plan.md` when deciding what to build next; do not treat the planning document alone as completed work. Before implementing a task, read the relevant issue for its acceptance criteria and record important investigation findings in the issue or linked repository documentation when the issue requests it.

For offline or restricted agent sessions, read the checked-in acceptance snapshot in [`docs/issue-contracts`](./docs/issue-contracts/) first. These snapshots preserve the issue body and source URL so implementation can continue without a browser or live GitHub connection; GitHub remains authoritative whenever it is reachable. Refresh a contract with `npm run issues:sync -- <issue-number>` before implementation when network access is available. If the snapshot is the only available source, use it, state that external verification was unavailable, and do not treat that limitation as a repository blocker. The in-app browser is optional for issue work and must not be assumed to exist.

## Product context

This is a Hebrew-first, RTL Israeli supermarket price-comparison site. The first usable release should support nearby-store selection, Hebrew product search, branch-level price and freshness display, basket totals, public-versus-club promotion labeling, and comparison against at least one nearby alternate store. Keep the data layer portable and fixture-friendly; do not make a commercial aggregator or provider-specific backend a required dependency.

## Local development

Keep the repository runnable from a fresh checkout. Prefer explicit package scripts for install, development, build, lint, and test. A future agent should be able to start the site locally and inspect it in a browser without guessing the command.

## Completion and delivery

When an implementation task is complete, run the relevant verification commands, commit all in-scope changes with a descriptive commit message, and push the current branch to its configured `origin` remote. Do not leave completed work uncommitted or unpushed. Never include secrets or unrelated user changes; if an in-scope change overlaps unrelated work or push is blocked, report the exact blocker instead of silently dropping or overwriting changes.
