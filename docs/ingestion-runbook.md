# Ingestion runbook

This foundation keeps retailer feeds replaceable and does not require a commercial aggregator. It is intentionally fixture-friendly: discovery and download can be injected, while the default HTTP downloader enforces timeouts, bounded response sizes, retries, gzip detection, and a checksum.

## Local database

Start PostgreSQL from the repository root:

```sh
docker compose up -d postgres
```

Migration `db/migrations/001_init.sql` is mounted into the first-start initialization directory. The local connection is:

```text
postgresql://supermarket:supermarket-local-only@localhost:5432/supermarket
```

The database is disposable local development state. To apply a changed migration during development, stop the service and remove only the named `supermarket-postgres` volume, then start it again; never do this against a production volume.

## Adapter flow

1. Select an adapter from `createAdapterRegistry()` and create a stable `runKey` for the logical scheduled run.
2. Discover `SourceFile` records and filter to the required full or incremental document kinds.
3. Download each source. `downloadSourceFile()` accepts HTTP(S), retries transient responses, aborts on timeout, rejects oversized compressed bodies, recognizes gzip by magic bytes/headers/filename, and applies a separate decompressed-size limit.
4. Parse XML through the case-insensitive, namespace-tolerant helpers in `web/lib/ingestion/xml.ts`. The adapters warn and skip price rows without a store ID, retailer item ID, or numeric price.
5. Write each document through an `IngestionSink` transaction. Upserts should use the source IDs/checksum and commit only after parsing completes. Roll back the document on any parser or database error.
6. Persist the returned `IngestionRunResult` in `ingestion_runs`, and each successfully committed file in `ingestion_documents`. Reusing a run key replays the saved result; a previously completed source checksum can be skipped safely.

Full documents establish a complete snapshot for the relevant source scope. Incremental documents should be applied in publication order. Do not delete the current valid snapshot until a full document has passed download, parsing, validation, and commit.

### Catalog publication and configured snapshots

Use `importCatalogFromAdapter()` for a retailer adapter. It discovers every
requested full-price document, parses all records, and sends the aggregate
through `importCatalogPrices()`. A parser error, malformed row, empty source,
unexpected count, or dangerous full-feed drop leaves the previous snapshot
untouched. The adapter result is deliberately labelled `configured-partial`
until a separate source manifest proves the scope.

Workers that persist a validated result for the web process may publish a JSON
snapshot at `CATALOG_SOURCE_URL`. The payload may use `records`, `prices`, or
`products`, but each normalized record must include `retailerId`, `storeId`,
`retailerItemId` (or the documented item alias), `priceNis` (or `price`),
`observedAt`, and source metadata. An unavailable item must use
`priceNis: null` and `isAvailable: false`; it must not be converted to zero.

To be reported as complete, the payload must set `complete: true` and provide
`completeness.scope` with `countryCode: "IL"`, a stable `id`, `sourceVersion`,
valid `asOf`, and a matching `expectedRecordCount`. Supply
`expectedProductCount`, `expectedBranchCount`, and `expectedRetailers` whenever
the source publishes those totals. A bare array or mismatched manifest is
accepted only as partial data and never as a claim of nationwide coverage.
`loadConfiguredCatalog()` caches a validated snapshot and returns it when a
later refresh fails; it never promotes an invalid or empty refresh.

Set `CATALOG_SOURCE_MAX_BYTES` and `CATALOG_SOURCE_TIMEOUT_MS` to bound the
server-side JSON snapshot fetch. Keep credentials, FTP/TLS clients, and raw
retailer files in the worker environment; they are not browser configuration.

### Branch directory refresh

Store documents normalize through `importStoreDirectory()` in
`web/lib/store-directory.ts`. It validates branch identity, non-empty names,
and coordinates within Israel; duplicate `retailerId/storeId` rows resolve
deterministically to the row with the newest source timestamp (and then the later
row on a tie). A full refresh is safe
only when the result has no skipped rows and meets the configured minimum row
count. Keep the previous directory when that gate fails. Incremental refreshes
must use the same identity keys and preserve active/inactive status rather than
silently deleting an existing branch.

## Fixture usage

Tests or a worker can supply `listFiles` and `download` functions to either adapter. A fixture downloader should return a `DownloadedSourceFile` with the fixture bytes, a deterministic checksum, and `compression: 'none'` or `'gzip'`; alternatively, serve the fixture over HTTP and use the default downloader. Keep fixtures small enough for the configured limits and include uppercase/namespaced XML, malformed rows, and gzipped examples.

The parser is deliberately not a schema validator. A successful XML parse does not mean a document is safe to publish. Validate minimum identifiers, non-negative prices, sensible dates, expected row counts, and duplicate rates in the sink/worker before committing a full snapshot.

## Cerberus

The Cerberus adapter represents the shared retailer feed and recognizes `Stores`, `PriceFull`, `Price`, `PromoFull`, and `Promo` filename families. The built-in downloader supports only HTTP(S); production FTP/TLS access must be supplied through the adapter's injected `download` function, with the same timeout/size/retry policy implemented by the FTP client. Verify current credentials, filename conventions, store extraction, and acceptable request rates before scheduling it. The endpoint can be geo-blocked or flaky outside Israel.

## Shufersal

The Shufersal adapter targets the transparency portal and recognizes the same document families, including uppercase SAP-style XML. A portal session, pagination, category IDs, cookies, or Azure Blob redirect can change; inject `listFiles` when the current listing flow needs a session-aware client. Verify portal reachability, current selectors, gzip behavior, and XML fixtures from an allowed Israeli-hosted environment before production use.

## Failure handling and recovery

- `completed` means every discovered document committed.
- `partial` means at least one document committed and at least one failed; the current valid dataset remains available.
- `failed` means no document committed or discovery failed.
- Retry only failures marked `retryable`; malformed XML, unsupported transport, and size-limit failures are not transient.
- Alert on repeated partial/failed runs, stale source timestamps, large row-count changes, and checksum churn without expected publication.
- The physical checkout price is authoritative. UI/API consumers should expose source freshness and keep club-only promotions separate from the public total.

Never replace a current dataset from a file that merely downloaded successfully. Commit normalized records atomically per document, retain the run/document failure metadata, and investigate warnings before widening a source's schedule.
