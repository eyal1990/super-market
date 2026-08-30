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

The tests use Node's built-in test runner and cover Hebrew/barcode search, public multi-buy rules, club-only pricing, unavailable products, empty-basket calculations, explicit branch selection, address fixtures, price freshness, and product identity. Run only the production-neutral product-flow checks with:

```bash
cd web
node --experimental-strip-types --test tests/product-flow.test.ts
```

CI runs the full lint, typecheck, test, and build sequence on every push and pull request. The current test suite has no browser harness, so first-run UI state, local-storage hydration behavior, browser geolocation permission errors, shopping-mode UI, product images, and retailer delivery handoff remain documented `todo` coverage until those seams exist in production code.

On Windows PowerShell systems where the local execution policy blocks `npm.ps1`, use `npm.cmd` in the repository-root commands above (for example, `npm.cmd test`).

## Active product backlog

The following issues are the active product backlog for the next usable release. Read the relevant issue before implementing a change:

1. [#19 — Show a real product image on every product card](https://github.com/eyal1990/super-market/issues/19)
2. [#20 — Import the complete product catalog for every supported branch](https://github.com/eyal1990/super-market/issues/20)
3. [#21 — Start with an empty basket](https://github.com/eyal1990/super-market/issues/21)
4. [#22 — Support arbitrary Israeli address entry and geocoding](https://github.com/eyal1990/super-market/issues/22)
5. [#23 — Make product discovery useful at catalog scale](https://github.com/eyal1990/super-market/issues/23)
6. [#24 — Hand off a delivery basket to each supported retailer](https://github.com/eyal1990/super-market/issues/24)
7. [#25 — Add a transparent comparison and data-quality experience](https://github.com/eyal1990/super-market/issues/25)
8. [#26 — Require address or location before showing a selected store](https://github.com/eyal1990/super-market/issues/26)
9. [#27 — Add explicit shopping mode: physical shopping or delivery](https://github.com/eyal1990/super-market/issues/27)
10. [#28 — Build a first-time onboarding flow](https://github.com/eyal1990/super-market/issues/28)
11. [#29 — Add an end-to-end critical shopping journey and regression suite](https://github.com/eyal1990/super-market/issues/29)

These tests are intentionally production-neutral. They verify the existing data contracts and mark browser-only or not-yet-defined behavior as focused `todo` tests instead of introducing unapproved APIs. `web/tests/location.test.ts` is intentionally outside this change so location-agent work can proceed without overlap.

## Data and operations

The app runs with fixture data and does not require retailer credentials. The portable PostgreSQL schema is in [`db/migrations/001_init.sql`](./db/migrations/001_init.sql); start local PostgreSQL with `docker compose up -d postgres` and apply the migration with your preferred PostgreSQL client. The adapter contract and safe ingestion runner live under [`web/lib/ingestion/`](./web/lib/ingestion/), with operational notes in [`docs/ingestion-runbook.md`](./docs/ingestion-runbook.md).

Source and UX decisions are recorded in [`docs/source-matrix.md`](./docs/source-matrix.md), [`docs/ux-flows.md`](./docs/ux-flows.md), and [`docs/security-review.md`](./docs/security-review.md). Exact addresses are not persisted; live geocoding must be added behind a cached, rate-limited server proxy before production use.

Deployment, backup, rollback, and scheduled ingestion expectations are in [`docs/deployment.md`](./docs/deployment.md) and [`ops/ingestion-schedules.json`](./ops/ingestion-schedules.json).

## Product context

The first usable release should support nearby-store selection, Hebrew product search, branch-level price and freshness display, basket totals, clear public-versus-club promotion labeling, and comparison against at least one nearby alternate store. Keep the data layer portable and fixture-friendly; a commercial aggregator or provider-specific backend must not be required.
