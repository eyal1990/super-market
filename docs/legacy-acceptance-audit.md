# Legacy issue acceptance audit

This document records the repository evidence for the legacy product backlog
that was closed after implementation. GitHub remains authoritative for issue
state; these notes are a compact handoff for future agents.

| Issue | Evidence in the repository |
| --- | --- |
| [#19](https://github.com/eyal1990/super-market/issues/19) | Product image metadata, stable image sizing, Hebrew alt text, missing/broken-image fallback, attribution notes, and browser failure coverage in `web/app/page.tsx`, `web/lib/data.ts`, `web/tests/product-flow.test.ts`, and the Playwright shopping journey. |
| [#21](https://github.com/eyal1990/super-market/issues/21) | Empty initial basket, safe local persistence, invalid-value filtering, and add/change/remove coverage in `web/app/page.tsx`, `web/lib/shopping.ts`, `web/tests/shopping.test.ts`, and `web/e2e/shopping.spec.ts`. |
| [#22](https://github.com/eyal1990/super-market/issues/22) | Provider-neutral Israeli address directory/geocoder boundary, server-side configuration, rate limiting, caching, explicit failure states, and mocked provider tests in `web/lib/address-directory.ts`, `web/app/api/location/search/route.ts`, and `web/tests/location.test.ts`. |
| [#23](https://github.com/eyal1990/super-market/issues/23) | Hebrew/Latin/barcode search, category filtering, relevance/price/unit sorting, pagination, freshness/availability labels, and configured-catalog rendering in `web/app/page.tsx`, `web/app/api/products/search/route.ts`, and `web/e2e/shopping.spec.ts`. |
| [#24](https://github.com/eyal1990/super-market/issues/24) | Retailer-neutral delivery handoff contract, capability labels, validation, privacy boundary, and no-order-placed messaging in `web/lib/shopping.ts`, `web/app/api/basket/handoff/route.ts`, and `web/e2e/shopping.spec.ts`. |
| [#25](https://github.com/eyal1990/super-market/issues/25) | Source/freshness panel, public-versus-club labeling, stale/unavailable states, coverage metadata, and partial-total tests in `web/app/page.tsx`, `web/lib/shopping.ts`, and `web/tests/shopping.test.ts`. |
| [#26](https://github.com/eyal1990/super-market/issues/26) | No implicit branch selection, location-gated prices/actions, explicit restore semantics, and denied-location coverage in `web/app/page.tsx`, `web/lib/location-state.ts`, and `web/e2e/shopping.spec.ts`. |
| [#27](https://github.com/eyal1990/super-market/issues/27) | Physical/delivery mode choice, local mode persistence, capability filtering, revalidation, and RTL browser coverage in `web/app/page.tsx`, `web/lib/shopping.ts`, and `web/e2e/shopping.spec.ts`. |
| [#28](https://github.com/eyal1990/super-market/issues/28) | Hebrew first-run value proposition, progress indicator, recoverable location/mode/product path, focus management, and mobile/desktop smoke tests in `web/app/page.tsx` and `web/e2e/shopping.spec.ts`. |
| [#29](https://github.com/eyal1990/super-market/issues/29) | Deterministic unit/API tests, desktop/mobile RTL Playwright journeys, CI commands, and production build verification in `web/tests/`, `web/e2e/`, `.github/workflows/ci.yml`, and `README.md`. |

The remaining data issues are tracked separately because they require verified
external source coverage: [#20](https://github.com/eyal1990/super-market/issues/20)
for complete product catalogs and [#30](https://github.com/eyal1990/super-market/issues/30)
for nationwide branch coverage.
