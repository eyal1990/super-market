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

