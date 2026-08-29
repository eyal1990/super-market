# Deployment and recovery runbook

## Cost-conscious topology

The Next.js/Vinext site can be deployed to the existing Sites/Cloudflare-compatible target. Keep PostgreSQL portable: a small managed PostgreSQL instance or a self-hosted Postgres VM can serve the normalized data, while scheduled ingestion runs in a worker or CI runner with Israeli-network access when a retailer requires it. The app must not depend on Supabase or a commercial aggregator.

The schedule contract is committed in [`ops/ingestion-schedules.json`](../ops/ingestion-schedules.json). Full snapshots run separately from two-hour incremental updates. The runner must enforce one active run per retailer and persist `ingestion_runs` before returning.

## Release sequence

1. Run `npm ci --prefix web`, then `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
2. Apply additive PostgreSQL migrations during a maintenance window; take a backup first.
3. Deploy the app and worker with secrets supplied by the environment, never by Git.
4. Trigger one controlled full run, inspect counts/warnings/freshness, then enable incremental scheduling.
5. Verify Hebrew search, address/store selection, basket totals, club labels, and privacy/terms routes.

## Backup and rollback

Use a daily PostgreSQL logical backup plus provider snapshots when available. Test restoring a copy at least before each schema release. To roll back the app, redeploy the prior known-good site version and leave normalized data in place. To recover ingestion, rerun the same `runKey`; the idempotency layer skips completed documents. Never delete a valid current snapshot because a new source file is empty or malformed.

## Incident signals

Alert on failed or partial retailer runs, missing files past freshness thresholds, sudden row-count changes, repeated parser warnings, and checksum churn without a corresponding publication. Alerts must name the retailer and document kind and must not include credentials, raw cookies, or exact user addresses.
