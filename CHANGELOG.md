# Changelog

All packages share one version; see [`docs/RELEASING.md`](docs/RELEASING.md).
Until 1.0, any release may change the API. The IR's own version, `irVersion`,
stays `1` and only gains optional fields.

## 0.1.0-alpha.0 — unreleased

The first published release.

- **Adapters:** OpenAPI 3.0 and 3.1 (`@speculoos/openapi`), AsyncAPI 2.x and
  3.x (`@speculoos/asyncapi`), into one IR (`@speculoos/core`), with a loader
  for multi-document projects (`@speculoos/loader`).
- **Renderers:** headless React (`@speculoos/react`), with a component map for
  Radix Themes (`@speculoos/map-radix-themes`); framework-free HTML strings
  (`@speculoos/html`).
- **Transforms:** hide, filter, sort, rename, redact and prune passes over the
  IR (`@speculoos/transforms`).
- **CLI:** `build`, `lint` and `inspect` (`@speculoos/cli`).
