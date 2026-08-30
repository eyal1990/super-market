# UX and interaction decisions

The first release is Hebrew-first and right-to-left. It keeps one primary branch for the basket and exposes nearby alternatives for comparison; it never silently splits one basket across stores.

## States covered

- First visit: a usable Tel Aviv fixture is shown, while the location pill opens address search or permission-based browser location.
- Address search: live Israeli geocoding is used through the server proxy by default, with known fixture results retained for offline development and tests. No-result, denied-permission, and unsupported-browser messages keep the location flow recoverable.
- Store selection: branch cards expose chain, branch name, distance, opening state, and selected state. Selection updates every product price and basket total.
- Search: Hebrew names, brand, category, punctuation-normalized text, and exact barcode are supported. Empty results offer a reset action.
- Product comparison: each result shows branch price, unit price, freshness, source category, public promotion, and club-only price when present.
- Basket: quantity controls are bounded to 99, survive a browser restart in local storage, and expose missing prices as unavailable rather than zero.
- Comparison: the full basket modal lists each nearby store, total, distance, and missing-item count. Public totals and club savings are separate.
- Data health: freshness is visible near product data, and the API exposes retailer run status, warnings, failures, and the partial-run policy.

## Accessibility notes

Semantic headings, labelled controls, pressed states, focus-visible outlines, a skip link, live announcements for basket/store changes, keyboard shortcut focus, and RTL document metadata are included. Color is paired with text for promotion and availability states. Long Hebrew names truncate inside fixed rows without changing the calculation.

## Deliberate limitations

Address lookup uses a server-side, rate-limited, short-lived cached OpenStreetMap/Nominatim proxy by default. The deterministic fixture geocoder remains available to tests and can be used by omitting the API route's provider configuration in direct library calls. Barcode camera scanning is deferred because keyboard barcode entry already works on all supported browsers and camera support requires a permission-heavy device flow.
