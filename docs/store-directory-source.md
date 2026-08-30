# Store directory source boundary

Issue #30 now has an isolated, provider-neutral source boundary in
`web/lib/store-directory.ts`. The web process accepts a bounded JSON snapshot
or a CKAN DataStore JSON response and publishes only rows that have a stable
branch identity, address/city, an authoritative verification timestamp, and
coordinates that pass the Israeli bounds check.

## Official source investigation

The Ministry of Economy and Industry's [Iron Branches dataset](https://data.gov.il/he/datasets/moital/iron-branches/f7d9c47e-3414-4524-a187-a0f0e057b08a)
is a useful public source for emergency-open branches. Its DataStore resource
ID is `f7d9c47e-3414-4524-a187-a0f0e057b08a`; the corresponding CKAN endpoint is:

```text
https://data.gov.il/api/3/action/datastore_search?resource_id=f7d9c47e-3414-4524-a187-a0f0e057b08a&limit=1000
```

The source is not a complete supermarket directory: it is an emergency
subset, and its rows use Israeli TM Grid X/Y. The importer converts EPSG:2039
(ITM) to WGS84 latitude/longitude and labels accepted rows
`status: "emergency-open"`. A missing or invalid coordinate or report date is
rejected with a row warning; no coordinate is guessed from an address.

The [Israel Basket dataset](https://data.gov.il/he/datasets/moital/israel-sal)
is also an official but participating-program subset. The public official
branch pages for [Rami Levy](https://tav.rami-levy.co.il/branches/),
[Victory](https://victory.co.il/branches/), and
[Shufersal](https://media.shufersal.co.il/policy/ShufersalBranchesOnSaturdayEveningsV3.pdf)
are authoritative single-chain surfaces, but the investigated pages do not
provide a common licensed feed with coordinates. None of these sources proves
complete cross-chain national coverage.

The primary nationwide discovery surface is the retailer `Stores` document
published under Israel's price-transparency regime. The [Food and Pharmacy
Competition Promotion Law](https://main.knesset.gov.il/Activity/Legislation/Laws/Pages/LawPrimary.aspx?lawitemid=2001381)
and the [Consumer Protection Authority's price-transparency material](https://www.gov.il/he/departments/legalInfo/cpfta_prices_regulations)
describe the obligation to publish the chain's store file alongside
branch-level price and promotion files. This is a lawful discovery surface,
but it is not a single government-owned, all-chain directory: the shared
published-prices endpoint is credential-gated in the public web flow, and
retailer-specific publication terms still need to be checked before
redistribution.

`importStoreDirectoryFromAdapters()` is the worker-facing bridge for this
surface. It asks every configured retailer adapter for `stores` documents,
downloads and parses them through the existing provider-neutral adapter
contract, and returns per-adapter discovered/downloaded/parsed counts and
failures. A full snapshot is published only when every configured adapter
completed and the row validation gate passed. If one chain is unavailable,
the candidate remains available for diagnostics but `published` is false and
the caller keeps the previous snapshot. On a shared feed, use the optional
`retailerIdForStore` mapping only after the feed's chain identifiers have been
verified; the implementation does not guess a retailer from a display name.

The adapter result's `feedState: "complete"` means only that the configured
adapter run completed. It does not mean all Israeli supermarkets are covered.
The API's `configured-complete-for-scope` status still requires an explicit
IL scope manifest with matching chain and branch counts. The Ministry's
54-branch [Israel Basket dataset](https://data.gov.il/he/datasets/moital/israel-sal)
and its [54-branch program description](https://govextra.gov.il/economy/israel-sal-26/campaign/)
remain auditable partial inputs, never a nationwide substitute.

## Configuration and safety

Set `STORE_DIRECTORY_URL` server-side to one CKAN endpoint or normalized
snapshot. For a multi-source merge, set `STORE_DIRECTORY_URLS` to a
comma-separated list. Each source is validated independently, then rows are
deduplicated by `retailerId:storeId`; a failed source cannot erase another
valid source. Do not put credentials or endpoints in the browser.
`GET /api/stores/directory?refresh=1` requests a bounded refresh; normal
requests use the five-minute cache. CKAN DataStore endpoints are paged until
their reported `total` is consumed (with a bounded page/row limit).

The accepted normalized row shape is:

```json
{
  "retailerId": "chain-id",
  "storeId": "stable-branch-id",
  "name": "branch name",
  "address": "street and number",
  "city": "city",
  "latitude": 32.08,
  "longitude": 34.78,
  "lastVerified": "2026-08-20T00:00:00.000Z",
  "source": "https://authoritative-source.example/branches.json"
}
```

An explicit `completeness.scope` manifest is required before the API can
report `configured-complete-for-scope`: it must declare `countryCode: "IL"`, a
stable scope ID and version, an `asOf` timestamp, `expectedChains`, and a
matching `expectedBranchCount`. Iron Branches intentionally has no such
whole-market manifest, so it remains `configured-partial` even when every row
in the dataset parses successfully.

Full refreshes reject empty, malformed, or unexpectedly reduced snapshots.
Incremental refreshes use the same `retailerId:storeId` identity and are safe
to replay. A failed refresh keeps the last valid snapshot; if none exists, the
development fixture is returned with `sourceState: "stale-fallback"`, an
explicit warning, and `fallbackUsed: true` from nearby search. Distances are
computed only from accepted row coordinates and are visibly marked as fixture
fallbacks when no configured source is available.
