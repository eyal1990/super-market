# Agent context

## Task source of truth

The GitHub issues for `eyal1990/super-market` are the authoritative task backlog and implementation sequence. Use the issue links in `docs/implementation-plan.md` when deciding what to build next; do not treat the planning document alone as completed work. Before implementing a task, read the relevant issue for its acceptance criteria and record important investigation findings in the issue or linked repository documentation when the issue requests it.

## Product context

This is a Hebrew-first, RTL Israeli supermarket price-comparison site. The first usable release should support nearby-store selection, Hebrew product search, branch-level price and freshness display, basket totals, public-versus-club promotion labeling, and comparison against at least one nearby alternate store. Keep the data layer portable and fixture-friendly; do not make a commercial aggregator or provider-specific backend a required dependency.

## Local development

Keep the repository runnable from a fresh checkout. Prefer explicit package scripts for install, development, build, lint, and test. A future agent should be able to start the site locally and inspect it in a browser without guessing the command.
