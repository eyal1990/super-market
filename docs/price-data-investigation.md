# Israeli Supermarket Price Data Investigation

Status: research handoff for future implementation agents  
Scope: Israel, Hebrew-first, retailer price comparison  
Research date: 2026-08-30

## Executive conclusion

The recommended primary source is the public retailer price-transparency feed required by Israeli food and consumer-goods transparency rules. This is not one stable, centralized REST API. Retailers publish downloadable files, usually compressed XML, and each retailer or platform may expose them differently.

The project should own a small adapter-based ingestion pipeline rather than make a commercial aggregator API a hard dependency. The normalized application API should be ours; the retailer feeds should be replaceable inputs.

The initial implementation should target:

1. Retailers using the Cerberus shared FTP service.
2. Shufersal’s separate transparency portal.
3. Additional chains only after an agent verifies their current source and file behavior.

Reference sources:

- [Israeli price-transparency regulations](https://www.gov.il/he/departments/legalInfo/cpfta_prices_regulations)
- [State Comptroller report on food-market concentration and price transparency](https://library.mevaker.gov.il/sites/DigitalLibrary/Pages/Reports/5272-1.aspx)
- [OpenIsraeliSupermarkets scraper](https://github.com/OpenIsraeliSupermarkets/israeli-supermarket-scarpers)
- [OpenIsraeliSupermarkets parsers](https://github.com/OpenIsraeliSupermarkets/israeli-supermarket-parsers)
- [Reference TypeScript scraper/application](https://github.com/amichai1/israeli-price-comparison)
- [Older Go price-data project](https://github.com/fluhus/prices)

## What the source data contains

The transparency ecosystem commonly exposes these document categories:

| Document | Purpose |
| --- | --- |
| `Stores` | Branch identifiers, names, addresses, cities, and sub-chain data |
| `PriceFull` | Complete current price snapshot per store |
| `Price` | Incremental price updates |
| `PromoFull` | Complete current promotion snapshot |
| `Promo` | Incremental promotion updates |

Common product and price fields include:

- Chain, sub-chain, and store identifiers.
- Product barcode or retailer item code.
- Product name, manufacturer, description, and country of origin.
- Item price in NIS.
- Quantity, unit of measure, quantity per package, and unit-of-measure price.
- Weighted-item flags and item status.
- Price-update timestamps.

Common promotion fields include:

- Promotion identifier and description.
- Start and end date/time.
- Product/item code.
- Minimum quantity or amount.
- Discount type, discount rate, discounted price, and reward type.
- Club identifier or other eligibility information.

The exact casing, nesting, encoding, filename convention, and semantics must be treated as retailer-specific until verified with current fixtures.

## Source families

### Cerberus FTP

Several chains publish files through the shared Cerberus endpoint commonly referenced as `url.retail.publishedprices.co.il`. The open-source scraper project documents a Python client that discovers files, downloads them, and optionally emits them to disk or a queue. Its README lists broad chain coverage and warns that some sources are flaky or blocked outside Israel.

The TypeScript reference implementation uses:

- TLS FTP access.
- Date and document-type filename filtering.
- Store-ID extraction from filenames.
- One latest file per store for a given run.
- Gzip decompression.
- Streaming XML parsing.
- Batched database upserts.

The new project should reuse the behavior pattern, not copy code without reviewing licensing and current correctness.

### Shufersal

Shufersal uses a separate portal at [prices.shufersal.co.il](https://prices.shufersal.co.il/). The reference research identifies:

- A paginated HTML file listing.
- Category IDs for stores, full prices, incremental prices, full promotions, and incremental promotions.
- Download links that may point to Azure Blob Storage.
- A session/cookie step before accessing listings.
- Gzip-compressed files.
- A Shufersal-specific SAP-style XML representation, including uppercase element names.

This source may apply geo-blocking or access restrictions. An implementation agent must validate the current portal behavior from an Israeli-hosted environment or another permitted environment before relying on it in production.

### Other chains

Other chains may use Cerberus, a newer API-backed source, a legacy portal, or a custom catalog. The source inventory issue must verify each candidate chain instead of assuming that a shared filename pattern or parser will work everywhere.

## Open-source and commercial options

### Open-source references

- `OpenIsraeliSupermarkets/israeli-supermarket-scarpers`: Python download clients for many supermarket sources.
- `OpenIsraeliSupermarkets/israeli-supermarket-parsers`: Python parsing/conversion layer.
- `amichai1/israeli-price-comparison`: TypeScript/Node ingestion examples, Shufersal handling, a relational schema, and scheduled workflows.
- `fluhus/prices`: older Go tooling and a historical data schema.

These projects are references and possible starting points for fixture discovery. Before copying or depending on code, agents must check the repository license, maintenance status, dependency health, and whether the implementation still matches the current retailer endpoints.

### Commercial aggregators

Services such as [SaveMyCart](https://savemycart.net/developers), PriceIL, and Cheapersal expose convenient APIs for product search, prices, branches, promotions, and basket comparison. They may be useful for a prototype, a data-quality cross-check, or a fallback, but they introduce API keys, quotas, pricing, availability, and vendor lock-in. They are not the primary architecture for this project.

The [government controlled-price dataset](https://data.gov.il/datasets/moital/price_controlled_consumer_products) is useful for regulated maximum-price reference data, but it is not a replacement for retailer-level catalog and branch price feeds.

## Reliability and data-quality risks

The site must not present retailer files as guaranteed checkout truth. Known risks include:

- Retailer file format changes.
- Missing or delayed files.
- Partial retailer coverage.
- Products listed without inventory.
- Incorrect or inconsistent product identifiers.
- Different prices by branch, sub-chain, online channel, or club membership.
- Promotions whose quantity rules are difficult to interpret.
- Encoding differences, including possible Windows-1255 data.
- Sources that block non-Israeli traffic or enforce rate limits.

Every normalized price and promotion should retain source metadata, including:

- Retailer and source adapter.
- Source filename or URL metadata.
- Source document timestamp.
- Ingestion timestamp.
- Ingestion run status.
- Parser warnings where applicable.

The UI should show “last updated” information, missing-item states, and a short disclaimer that the checkout price at the branch is authoritative.

## Recommended normalized model

The database should use portable PostgreSQL and avoid provider-specific APIs. Store raw files outside the relational tables when retention is needed; store source metadata and normalized records in PostgreSQL.

Core entities:

- `chains`: retailer identity and adapter configuration.
- `stores`: branch identity, address, city, coordinates, and source identifiers.
- `products`: canonical product identity, Hebrew name, brand/manufacturer, barcode, quantity, and unit.
- `store_products`: optional retailer-specific item identity and availability.
- `prices`: current price observations by product and store.
- `promotions`: store-level promotion definitions and validity windows.
- `promotion_items`: products participating in promotions and the rule details.
- `ingestion_runs`: source, document type, start/end time, counts, warnings, and failures.

Keep public prices and club-only prices distinguishable. A basket calculation must be able to produce a public-promotion total and a separate club-eligible alternative without silently assuming membership.

## Location strategy

Use OpenStreetMap geocoding for the first release, with:

- A server-side proxy rather than unrestricted browser calls.
- Aggressive caching and throttling.
- A clear, configurable User-Agent.
- No permanent storage of an exact user address unless the product later adds an explicit account feature.
- Coordinates retained only as needed for the current search or local browser preference.
- Manual store selection when geocoding is uncertain.

Store coordinates may come from retailer data if available; otherwise an ingestion/admin process can geocode branch addresses and retain a confidence/status field. Distance can initially use a Haversine calculation without requiring PostGIS.

## Recommended technical direction

- Next.js and TypeScript for the site and application API.
- Node/TypeScript ingestion workers in the same repository.
- PostgreSQL with a portable migration tool/ORM.
- Docker Compose for local database setup.
- Scheduled jobs that run full and incremental ingestion separately.
- No mandatory Supabase dependency; a managed PostgreSQL provider may be selected later for convenience.
- Hebrew-first RTL interface, with English kept as a future localization concern.

## Required future investigation

Agents implementing source-related tasks must verify current facts before coding:

- Which chains are currently required for the first usable release.
- Whether each source is reachable from the deployment region.
- Current FTP credentials/access expectations and acceptable request rates.
- Current Shufersal selectors, cookies, download URLs, and pagination.
- XML schemas and encoding for representative current files.
- Promotion semantics, especially multi-buy, gifts, and club restrictions.
- Current licenses and permitted reuse of reference-project code.
- OpenStreetMap/Nominatim operational limits and whether a hosted or self-hosted geocoder is needed.

