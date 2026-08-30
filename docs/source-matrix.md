# Retailer source matrix

Validated 2026-08-30 for implementation planning. Live source formats remain replaceable inputs; the committed app uses safe fixtures and does not require credentials.

| Source family | Current evidence | Adapter status | Known limitation |
| --- | --- | --- | --- |
| Cerberus shared feed | The public web client at `https://url.retail.publishedprices.co.il/` currently presents a username/password login; an account is required before files can be discovered | Fixture-compatible adapter with explicit credential-gated metadata | No credentials are committed or assumed. The production worker must inject an approved FTP/TLS/HTTP downloader and a permissioned account. A login page is observable as zero discovered files, never as complete coverage. |
| Shufersal transparency portal | The official portal at `https://prices.shufersal.co.il/` currently exposes paginated `pricefull` and `promofull` rows whose download links resolve to public Azure Blob GZ objects | Portal adapter with case-insensitive XML parser, direct blob links, and bounded pagination | Public reachability is not a redistribution licence. Written permission/open-data terms and a branch/product count manifest are still required before publication. |
| Ministry of Economy “Israel Basket” | Official open-data dataset at [`data.gov.il/he/datasets/moital/israel-sal`](https://data.gov.il/he/datasets/moital/israel-sal) | Reference-only branch/catalog input; transform it into the normalized import contract before use | It is a Carrefour program subset, not every Israeli chain, and the published branch rows do not provide coordinates required by nearby search without a separate permitted enrichment step. |
| Ministry controlled/imported food datasets | Official open datasets for [controlled consumer prices](https://data.gov.il/he/datasets/moital/price_controlled_consumer_products) and [imported-food selling points](https://data.gov.il/he/datasets/moital/import_quotas) | Reference-price validation only; never used as retailer checkout prices | They do not provide a complete branch-level supermarket catalog or current per-branch price/promotions feed. |
| Other chains | No source is promoted without current schema and permission evidence | Fixture branch metadata only; delivery handoff is manual | Use the adapter contract and add a fixture before production activation. |

## Catalog coverage contract

The application currently ships a five-product fixture catalog covering three
branch-level records so local development is deterministic. The catalog import
helper (`web/lib/ingestion/catalog.ts`) accepts complete or incremental
normalized price streams, keys records by retailer + branch + barcode/item id,
keeps the latest duplicate, and reports malformed rows. A source with skipped
rows must not replace a valid prior snapshot. `importCatalogFromAdapter()` runs
every discovered full-price document through that gate, while
`loadConfiguredCatalog()` accepts a worker-published JSON snapshot through
`CATALOG_SOURCE_URL`. A configured source is marked complete only when its
scope declares Israel, version, as-of time, and matching record/product/branch
counts; otherwise the result is visibly partial.

### Required publication manifest

A legacy `completeness.scope` object is accepted for backwards-compatible
fixture work but can only produce `configured-partial`. A complete claim must
include a top-level `manifest` with `schemaVersion: "1"`, a source URI,
version, `countryCode: "IL"`, `asOf`, an `usage` record (`open-data` or
`permissioned` plus a terms URL), and `coverage.retailers`. Every coverage
target names the retailer, exact branch IDs, and its expected record count;
the global record/product/branch counts must equal the normalized output.
Malformed source metadata, missing freshness, invalid usage evidence, missing
branches, or any count mismatch fails the refresh and preserves the prior
snapshot. This is an operator evidence gate, not a legal determination.

The JSON snapshot contract is intentionally small and provider-neutral:

```json
{
  "complete": true,
  "manifest": {
    "schemaVersion": "1",
    "sourceId": "retailer-catalog",
    "sourceUri": "https://feeds.example.invalid/catalog.json",
    "sourceVersion": "2026-08-30",
    "countryCode": "IL",
    "asOf": "2026-08-30T04:00:00Z",
    "usage": { "kind": "permissioned", "termsUrl": "https://feeds.example.invalid/terms" },
    "coverage": {
      "expectedRecordCount": 120000,
      "expectedProductCount": 30000,
      "expectedBranchCount": 120,
      "retailers": [{ "retailerId": "example-retailer", "branchIds": ["001"], "expectedRecordCount": 120000 }]
    }
  },
  "records": []
}
```

The records are normalized `NormalizedPrice` values (including source,
freshness, branch, barcode/item identity, availability, and optional image
metadata). Arrays without a completeness scope remain importable for local
work but are never presented as complete coverage.

The current web request handlers still use the committed fixture `products`
until a worker publishes a validated snapshot and the request layer is wired
to select it. This scoped data-layer change makes that handoff explicit and
safe; it does not claim that a complete external feed is currently available.

Product images use stable Open Food Facts image URLs when a barcode is present.
The browser preserves aspect ratio, reports Hebrew alt text, and falls back to
an explicitly labelled branded placeholder when the source is missing or fails.
Open Food Facts image attribution and reuse terms must be reviewed before a
public launch; images are lazy-loaded and not copied into the repository. The
app has no image service-worker or server-side cache: the browser may use the
origin's normal HTTP cache headers, while each candidate retains its source URI
and rights-review warning. A failed load is removed from the image slot and is
never presented as a verified pack shot.

Delivery data is capability metadata only: Shufersal is a partial handoff and
Rami Levy/Victory are manual-list fallbacks. Delivery coverage and fees are not
verified by the fixture data.

## Nationwide branch directory contract

`web/lib/store-directory.ts` defines the provider-neutral branch contract and
ships a representative fixture spanning the north, Haifa, central, Tel Aviv,
Jerusalem, and south districts. `GET /api/stores/directory` exposes stable
branch identity, chain, address, city, district, coordinates, active status,
source, and last-verified metadata with pagination and completeness metadata.
`importStoreDirectory()` validates Israeli coordinates, rejects malformed rows,
deduplicates by retailer plus branch identity, and keeps the last valid
snapshot safe for atomic replacement by a worker. The nearby API uses these
directory records and never turns an out-of-range request into a fake nearby
branch.

The committed directory is a development fixture, not a claim that every
Israeli branch is currently present. A production rollout must configure an
official or permissioned branch feed, run a full snapshot validation, and only
publish it when row counts, identifiers, coordinates, and source timestamps
pass the ingestion gate. This limitation is returned in both the directory and
nearby APIs and shown in the branch-selection UI.

The Ministry of Economy's open-data portal publishes the official “Israel
Basket” branch dataset (54 Carrefour branches as of 14 June 2026). It is a
useful auditable source for that program, but it is not a directory of every
Israeli supermarket chain and does not include coordinates. The application
therefore does not silently treat it as nationwide coverage. A deployment can
adapt that dataset, or a complete permitted retailer feed, to the normalized
JSON contract documented in `.env.example` and set `STORE_DIRECTORY_URL`.
The server fetches that source, validates every row, caches a passing snapshot,
and falls back to the fixture with a visible limitation when the source is
empty, malformed, unavailable, or fails its coordinate gate.

References: [official dataset](https://data.gov.il/he/datasets/moital/israel-sal),
[official program page](https://govextra.gov.il/economy/israel-sal-26/campaign/),
and the [public price-transparency feed](https://url.retail.publishedprices.co.il/).

## Licensing and attribution

The implementation follows the behavior described by public reference projects but does not copy their code or make them runtime dependencies. Reference links and source limitations are retained in [`price-data-investigation.md`](./price-data-investigation.md). Retailer data is shown with freshness and a checkout disclaimer. Shufersal's public transparency portal is linked from the UI source attribution.

## Location source

OpenStreetMap/Nominatim remains a development and low-volume option only. Any production proxy must identify itself, cache repeated lookups, throttle requests, and avoid storing exact addresses by default. See the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/).
