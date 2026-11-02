# Changelog

All packages share one version; see [`docs/RELEASING.md`](docs/RELEASING.md).
Until 1.0, any release may change the API. The IR's own version, `irVersion`,
stays `1` and only gains optional fields.

## 0.1.0-alpha.1 — 2026-11-02

Styling, from a review of the Speechmatics docs pilot.

- **Core:** a field has an `address`, its path as property names
  (`["results[]", "alternatives[]", "content"]`), without the union branches
  and enum values its `path` has. A handshake has a `slug`, so it can be
  linked to.
- **React and HTML:** the handshake section's id is its slug, for example
  `#realtime-handshake`.
- **Radix Themes map:**
  - A nested field opens into a box, one per level, and a deeply nested
    field's name is printed after its dimmed path (`results[].alternatives[].`
    **`content`**). On a phone, the boxes' padding is 4px.
  - Find-in-page finds text in collapsed rows and opens them.
  - Cards are kept for small, self-contained things, like the example list.
    The handshake is a plain section, each message is a heading under a rule,
    and code blocks have a grey fill instead of a card.
  - A heading's badge is centred on its text.

## 0.1.0-alpha.0 — 2026-10-28

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
