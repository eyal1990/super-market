# Retailer source matrix

Validated 2026-08-30 for implementation planning. Live source formats remain replaceable inputs; the committed app uses safe fixtures and does not require credentials.

| Source family | Current evidence | Adapter status | Known limitation |
| --- | --- | --- | --- |
| Cerberus shared feed | Public web client reachable at `https://url.retail.publishedprices.co.il/`; FTP/TLS access and retailer credentials are deployment-dependent | Fixture-compatible adapter with discovery metadata | Built-in downloader intentionally handles HTTP(S); inject an FTP/TLS downloader in the worker. Filename/store conventions must be verified per retailer. |
| Shufersal transparency portal | `https://prices.shufersal.co.il/` currently lists GZ `stores`, `price`, and `promofull` documents with paginated branch rows | Portal adapter with case-insensitive XML parser and pagination metadata | Session/cookie, download URL, and geo/network behavior must be monitored; portal changes produce a failed health run. |
| Other chains | No source is promoted without current schema and permission evidence | Fixture branch metadata only; delivery handoff is manual | Use the adapter contract and add a fixture before production activation. |

## Catalog coverage contract

The application currently ships a five-product fixture catalog covering three
branch-level records so local development is deterministic. The catalog import
helper (`web/lib/ingestion/catalog.ts`) accepts complete or incremental
normalized price streams, keys records by retailer + branch + barcode/item id,
keeps the latest duplicate, and reports malformed rows. A source with skipped
rows must not replace a valid prior snapshot. The UI and product APIs expose
this as fixture data and show the limitation instead of claiming complete live
coverage.

Product images use stable Open Food Facts image URLs when a barcode is present.
The browser preserves aspect ratio, reports Hebrew alt text, and falls back to
an explicitly labelled branded placeholder when the source is missing or fails.
Open Food Facts image attribution and reuse terms must be reviewed before a
public launch; images are lazy-loaded and not copied into the repository.

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

## Licensing and attribution

The implementation follows the behavior described by public reference projects but does not copy their code or make them runtime dependencies. Reference links and source limitations are retained in [`price-data-investigation.md`](./price-data-investigation.md). Retailer data is shown with freshness and a checkout disclaimer. Shufersal's public transparency portal is linked from the UI source attribution.

## Location source

OpenStreetMap/Nominatim remains a development and low-volume option only. Any production proxy must identify itself, cache repeated lookups, throttle requests, and avoid storing exact addresses by default. See the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/).
