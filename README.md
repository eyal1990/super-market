# Super Market

Hebrew-first, RTL Israeli supermarket price comparison site. The application currently lives in [`web/`](./web/).

## Task source of truth

The GitHub issues for [`eyal1990/super-market`](https://github.com/eyal1990/super-market/issues) are the authoritative backlog and implementation sequence. Use the linked issues in [`docs/implementation-plan.md`](./docs/implementation-plan.md) to decide what to build next, and read the relevant issue before implementing it. The planning document provides context and links; it is not a substitute for the issue acceptance criteria or proof that work is complete.

## Prerequisites

- Node.js 22.13 or newer
- npm (included with Node.js)

The web app is the existing npm project in `web/`. Keep using its `package-lock.json`; do not initialize a second package manager or project for the app.

## Install

From the repository root:

```bash
npm run install:web
```

This runs `npm ci` in `web/` using the committed lockfile.

## Run locally

Start the development server from the repository root:

```bash
npm run dev
```

Open the local URL printed by the dev server in a browser. The root `dev` script delegates to `web/` and does not require changing directories.

To run the production build locally:

```bash
npm run build
npm run start
```

## Validate changes

Run the web app's linter from the repository root:

```bash
npm run lint
```

Run the checks from the repository root:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

The tests use Node's built-in test runner and cover Hebrew/barcode search, public multi-buy rules, club-only pricing, and unavailable products. CI runs the same commands on every push and pull request.

## Data and operations

The app runs with fixture data and does not require retailer credentials. The portable PostgreSQL schema is in [`db/migrations/001_init.sql`](./db/migrations/001_init.sql); start local PostgreSQL with `docker compose up -d postgres` and apply the migration with your preferred PostgreSQL client. The adapter contract and safe ingestion runner live under [`web/lib/ingestion/`](./web/lib/ingestion/), with operational notes in [`docs/ingestion-runbook.md`](./docs/ingestion-runbook.md).

Source and UX decisions are recorded in [`docs/source-matrix.md`](./docs/source-matrix.md), [`docs/ux-flows.md`](./docs/ux-flows.md), and [`docs/security-review.md`](./docs/security-review.md). Exact addresses are not persisted; live geocoding must be added behind a cached, rate-limited server proxy before production use.

## Product context

The first usable release should support nearby-store selection, Hebrew product search, branch-level price and freshness display, basket totals, clear public-versus-club promotion labeling, and comparison against at least one nearby alternate store. Keep the data layer portable and fixture-friendly; a commercial aggregator or provider-specific backend must not be required.
