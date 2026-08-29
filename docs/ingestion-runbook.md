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
