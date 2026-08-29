# Security, privacy, and release review

## Implemented controls

- No credentials, cookies, database URLs, or API keys are committed. Production adapters receive secrets from environment/secret storage.
- API routes validate query lengths, coordinates, radius, basket shape, and quantity bounds. Malformed JSON returns a safe Hebrew error without internals.
- The browser keeps the anonymous basket locally; exact address text is not persisted. Geolocation is permission-based and has a manual fallback.
- Current price freshness, source type, missing items, club eligibility, and checkout authority are shown in the interface.
- Privacy and terms routes explain local storage, location handling, data limitations, and public versus club pricing.
- Administrative ingestion is not exposed as a public mutation route. The status endpoint is read-only and contains no credentials or exact user locations.

## Before public launch

- Put the geocoder behind a server-side cache/rate limiter with an application User-Agent and review OSM attribution requirements.
- Add deployment-level security headers and an origin/rate-limit policy for public API routes.
- Keep database migrations additive, back up before release, and rehearse restore/rollback.
- Review retailer terms, data reuse permissions, and Israeli privacy/legal requirements with qualified counsel.

## Accessibility checklist

Keyboard-only flow, visible focus, labelled inputs/buttons, semantic headings, RTL metadata, live basket updates, text equivalents for color states, and responsive mobile layout are covered in the app. Run a browser accessibility audit against a deployed build before launch.
