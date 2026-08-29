# Retailer source matrix

Validated 2026-08-30 for implementation planning. Live source formats remain replaceable inputs; the committed app uses safe fixtures and does not require credentials.

| Source family | Current evidence | Adapter status | Known limitation |
| --- | --- | --- | --- |
| Cerberus shared feed | Public web client reachable at `https://url.retail.publishedprices.co.il/`; FTP/TLS access and retailer credentials are deployment-dependent | Fixture-compatible adapter with discovery metadata | Built-in downloader intentionally handles HTTP(S); inject an FTP/TLS downloader in the worker. Filename/store conventions must be verified per retailer. |
| Shufersal transparency portal | `https://prices.shufersal.co.il/` currently lists GZ `stores`, `price`, and `promofull` documents with paginated branch rows | Portal adapter with case-insensitive XML parser and pagination metadata | Session/cookie, download URL, and geo/network behavior must be monitored; portal changes produce a failed health run. |
| Other chains | No source is promoted without current schema and permission evidence | Not enabled | Use the adapter contract and add a fixture before production activation. |

## Licensing and attribution

The implementation follows the behavior described by public reference projects but does not copy their code or make them runtime dependencies. Reference links and source limitations are retained in [`price-data-investigation.md`](./price-data-investigation.md). Retailer data is shown with freshness and a checkout disclaimer. Shufersal's public transparency portal is linked from the UI source attribution.

## Location source

OpenStreetMap/Nominatim remains a development and low-volume option only. Any production proxy must identify itself, cache repeated lookups, throttle requests, and avoid storing exact addresses by default. See the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/).
