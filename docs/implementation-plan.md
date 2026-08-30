# Supermarket Comparison Implementation Plan

Status: future-agent handoff  
Repository: `eyal1990/super-market`  
Initial market: Israel  
Initial language: Hebrew-first, RTL

## Product outcome

Build a responsive site where a customer can:

1. Enter an address or use browser location.
2. See nearby supermarket branches.
3. Select a primary branch.
4. Search for products by Hebrew name, brand, or barcode.
5. See the selected branch’s current price, unit price, and promotions.
6. Compare the same product and basket against alternate nearby branches.
7. Add products to a basket and see totals.
8. See public promotions and club-only offers separately and clearly labelled.

The first release does not split one basket across multiple stores.

## Architecture

Use a single repository with these logical subsystems:

- Next.js/TypeScript web application and server API.
- Portable PostgreSQL database with migrations.
- Node/TypeScript ingestion workers.
- Scheduled full and incremental ingestion jobs.
- OpenStreetMap geocoding proxy with caching.
- Fixture-based parser and end-to-end test suites.

Do not make Supabase, a commercial price API, or a particular hosting provider a required application dependency.

## Domain interfaces

Define an adapter contract with responsibilities equivalent to:

```ts
interface RetailerSourceAdapter {
  retailerId: string;
  discoverFiles(input: DiscoveryInput): Promise<SourceFile[]>;
  downloadFile(file: SourceFile): Promise<DownloadedSourceFile>;
  parseStores(file: DownloadedSourceFile): AsyncIterable<NormalizedStore>;
  parsePrices(file: DownloadedSourceFile): AsyncIterable<NormalizedPrice>;
  parsePromotions(file: DownloadedSourceFile): AsyncIterable<NormalizedPromotion>;
}
```

The exact method names may be refined by the implementing agent, but the contract must support:

- Full and incremental documents.
- Gzip/compressed files.
- Streaming or bounded-memory parsing.
- Source metadata and warnings.
- Safe reruns and idempotent upserts.
- Partial failures without corrupting the current dataset.

The application API should provide equivalent capabilities to:

- `GET /api/products/search`
- `GET /api/products/:barcode/prices`
- `GET /api/stores/nearby`
- `POST /api/basket/compare`
- `GET /api/ingestion/status`

Agents may choose the final route shape, validation library, and serialization details after reviewing the repository foundation.

## Data and calculation rules

- Prices are associated with a specific branch, not only a chain.
- The current selected-store total is the primary basket total.
- Alternate nearby stores may be shown for comparison.
- Public promotions are included in the public effective total when their conditions are satisfied.
- Club-only promotions are shown separately and never silently included in the public total.
- Missing products remain visible as unavailable rather than being treated as zero cost.
- Every displayed result includes source freshness information.
- The checkout price at the physical store is authoritative.

## Delivery sequence

The GitHub backlog below is the implementation sequence. Each issue must investigate current external details when the issue says so and record important findings in the issue or linked documentation.

1. Foundation and local development environment.
2. Product requirements and UX flows.
3. Retailer source inventory.
4. Database schema.
5. Generic ingestion framework.
6. Cerberus ingestion.
7. Shufersal ingestion.
8. Additional retailer adapters.
9. Product identity normalization.
10. Data quality and freshness.
11. Location and nearby branches.
12. Product/price API.
13. Comparison interface.
14. Basket.
15. Promotions and club discounts.
16. Scheduling and observability.
17. Security, privacy, accessibility, and legal disclosures.
18. End-to-end verification and deployment.

## GitHub task links

The implementation backlog is tracked in the repository issues:

1. [Task 01 — Project foundation and portable development environment](https://github.com/eyal1990/super-market/issues/1)
2. [Task 02 — Product requirements and UX flows](https://github.com/eyal1990/super-market/issues/2)
3. [Task 03 — Retailer source inventory and adapter feasibility](https://github.com/eyal1990/super-market/issues/3)
4. [Task 04 — Normalized data model and database schema](https://github.com/eyal1990/super-market/issues/4)
5. [Task 05 — Generic retailer ingestion framework](https://github.com/eyal1990/super-market/issues/5)
6. [Task 06 — Cerberus FTP ingestion](https://github.com/eyal1990/super-market/issues/6)
7. [Task 07 — Shufersal ingestion](https://github.com/eyal1990/super-market/issues/7)
8. [Task 08 — Additional retailer adapters](https://github.com/eyal1990/super-market/issues/8)
9. [Task 09 — Data normalization and product identity](https://github.com/eyal1990/super-market/issues/9)
10. [Task 10 — Data-quality and freshness system](https://github.com/eyal1990/super-market/issues/10)
11. [Task 11 — Address search and nearby-store selection](https://github.com/eyal1990/super-market/issues/11)
12. [Task 12 — Product search and price comparison API](https://github.com/eyal1990/super-market/issues/12)
13. [Task 13 — Comparison and store-selection interface](https://github.com/eyal1990/super-market/issues/14)
14. [Task 14 — Shopping basket](https://github.com/eyal1990/super-market/issues/13)
15. [Task 15 — Promotion and club-discount calculation](https://github.com/eyal1990/super-market/issues/15)
16. [Task 16 — Scheduled ingestion and observability](https://github.com/eyal1990/super-market/issues/16)
17. [Task 17 — Security, privacy, accessibility, and legal disclosures](https://github.com/eyal1990/super-market/issues/17)
18. [Task 18 — End-to-end verification and deployment](https://github.com/eyal1990/super-market/issues/18)

## Current product backlog

The original implementation sequence above is closed, but the current product still has major gaps. The following open issues are the active backlog for the next usable release:

1. [Start with an empty basket](https://github.com/eyal1990/super-market/issues/21)
2. [Support arbitrary Israeli address entry and geocoding](https://github.com/eyal1990/super-market/issues/22)
3. [Make product discovery useful at catalog scale](https://github.com/eyal1990/super-market/issues/23)
4. [Hand off a delivery basket to each supported retailer](https://github.com/eyal1990/super-market/issues/24)
5. [Add a transparent comparison and data-quality experience](https://github.com/eyal1990/super-market/issues/25)
6. [Require address or location before showing a selected store](https://github.com/eyal1990/super-market/issues/26)
7. [Add explicit shopping mode: physical shopping or delivery](https://github.com/eyal1990/super-market/issues/27)
8. [Build a first-time onboarding flow](https://github.com/eyal1990/super-market/issues/28)
9. [Add an end-to-end critical shopping journey and regression suite](https://github.com/eyal1990/super-market/issues/29)
10. [Show a real product image on every product card](https://github.com/eyal1990/super-market/issues/19)
11. [Import the complete product catalog for every supported branch](https://github.com/eyal1990/super-market/issues/20)
12. [Add nationwide Israeli store directory and coverage](https://github.com/eyal1990/super-market/issues/30)

Recommended execution order is #20/#22/#30 first (data, location, and branch-directory foundations), then #21/#26/#27/#28 (first-run experience), followed by #19/#23/#25 (product trust and discovery), #24 (delivery handoff), and #29 (full regression coverage).

## Acceptance baseline

The first usable release is complete only when a test or demo can:

- Ingest representative retailer fixtures.
- Display a Hebrew product search result.
- Resolve an address to nearby branches.
- Select a branch and display current price/freshness metadata.
- Add multiple products to a basket.
- Calculate public and club-labelled totals correctly for at least one supported retailer.
- Compare the basket with at least one alternate nearby branch.
- Survive a failed or malformed source file without replacing valid current data.

## Explicit non-goals for the first release

- Split-basket route optimization.
- Checkout, payment, delivery, or retailer account integration.
- Guaranteeing inventory availability.
- Treating third-party aggregator APIs as the canonical source.
- Storing exact customer addresses in a permanent user profile.
- Full English localization.

## Related research

See [`price-data-investigation.md`](./price-data-investigation.md) for source findings, risks, references, and required external validation.
