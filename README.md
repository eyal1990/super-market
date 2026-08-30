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

Run the unit/API checks from the repository root:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

`npm run test` uses Node's built-in test runner and covers Hebrew/barcode search, public multi-buy rules, club-only pricing, unavailable products, empty-basket calculations, explicit branch selection, address fixtures, price freshness, and product identity. (`npm test` is equivalent.) Run only the production-neutral product-flow checks with:

```bash
cd web
node --experimental-strip-types --test tests/product-flow.test.ts
```

CI runs lint, typecheck, unit/API tests, build, and deterministic Playwright browser smoke tests on every push and pull request. The browser suite covers desktop and mobile RTL first-run state, location-gated branch selection, product search and basket mutations, delivery mode, and retailer handoff warnings.

The browser suite also checks the product discovery loading/no-results contract and direct API contracts for pagination, unavailable/stale coverage, partial basket totals, malformed baskets, and retailer-neutral handoff privacy. CI uploads Playwright diagnostics when a browser check fails.

On Windows PowerShell systems where the local execution policy blocks `npm.ps1`, use `npm.cmd` in the repository-root commands above (for example, `npm.cmd test`).

## Current product backlog

The closed legacy behavior issues are audited in [`docs/legacy-acceptance-audit.md`](./docs/legacy-acceptance-audit.md). The remaining open product backlog is:

1. [#20 — Import the complete product catalog for every supported branch](https://github.com/eyal1990/super-market/issues/20)
2. [#30 — Add nationwide Israeli store directory and coverage](https://github.com/eyal1990/super-market/issues/30)

These tests are intentionally production-neutral. Unit tests verify data and ingestion contracts; Playwright tests exercise browser-only behavior against mocked geocoding and fixture data. `web/tests/location.test.ts` covers provider behavior without requiring a live geocoder.

Run the browser journey locally after a build with Chromium installed:

```bash
npm run build
npx playwright install chromium
npm run test:e2e
```

The test suite mocks geocoding responses and uses fixture branch data; it does
not require retailer credentials or a live geocoder. Delivery handoff ends at
a retailer link or copied list and never places an order.

## Data and operations

The app uses fixture data by default and does not require retailer credentials. Product search, product prices, basket comparison, and delivery handoff use a validated `CATALOG_SOURCE_URL` snapshot when configured, then expose an explicit fixture fallback when no usable snapshot is available. The portable PostgreSQL schema is in [`db/migrations/001_init.sql`](./db/migrations/001_init.sql); start local PostgreSQL with `docker compose up -d postgres` and apply the migration with your preferred PostgreSQL client. The adapter contract and safe ingestion runner live under [`web/lib/ingestion/`](./web/lib/ingestion/), with operational notes in [`docs/ingestion-runbook.md`](./docs/ingestion-runbook.md). The nationwide branch directory is exposed by `GET /api/stores/directory`; its current fixture spans Israeli districts but is explicitly marked representative until an official complete source feed is configured.

Source and UX decisions are recorded in [`docs/source-matrix.md`](./docs/source-matrix.md), [`docs/ux-flows.md`](./docs/ux-flows.md), and [`docs/security-review.md`](./docs/security-review.md). Address search uses the configured server-side geocoder when available and deterministic fixtures for offline development/tests; exact addresses are not persisted by default.

Deployment, backup, rollback, and scheduled ingestion expectations are in [`docs/deployment.md`](./docs/deployment.md) and [`ops/ingestion-schedules.json`](./ops/ingestion-schedules.json).

## Product context

The first usable release should support nearby-store selection, Hebrew product search, branch-level price and freshness display, basket totals, clear public-versus-club promotion labeling, and comparison against at least one nearby alternate store. Keep the data layer portable and fixture-friendly; a commercial aggregator or provider-specific backend must not be required.
