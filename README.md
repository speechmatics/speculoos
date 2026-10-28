# speculoos

Render OpenAPI and AsyncAPI specs inside your own design system.

Most spec renderers ship a rendering strategy along with the parsing. That makes
an `m × n` problem — `m` spec dialects against `n` visual designs — and leaves
you fighting someone else's CSS. Speculoos puts an intermediate representation in
the middle, turning that into `m + n`: adapters lower dialects into the IR,
renderers consume it, and neither knows about the other.

```
spec documents → loader → adapter → ApiIR → your components (or HTML)
```

> **Alpha.** Releases are `0.1.0-alpha.N`, under npm's `alpha` tag, so ask for it.
> The IR (`irVersion: 1`) only gains optional fields from here, but any package's
> API may still change between alphas. See [`CHANGELOG.md`](CHANGELOG.md).

```sh
npm install @speculoos/loader@alpha @speculoos/openapi@alpha @speculoos/react@alpha
```

## Packages

| Package | What it does |
|---|---|
| `@speculoos/core` | The IR, and the pure operations every renderer would otherwise rewrite: `toTree`/`toRows`, `typeLabel`, chips, view projection, slugs |
| `@speculoos/jsonschema` | Upcast dialects to canonical JSON Schema, then lower to IR |
| `@speculoos/loader` | Load a project of documents and resolve `$ref`s across them |
| `@speculoos/adapter-kit` | Shared helpers for writing an adapter |
| `@speculoos/openapi` | OpenAPI 3.0 / 3.1 → `ApiIR` |
| `@speculoos/asyncapi` | AsyncAPI 2.x / 3.x → `ApiIR` |
| `@speculoos/transforms` | IR-to-IR passes: hide, filter, sort, rename, redact, prune |
| `@speculoos/react` | Headless React binding. No styles, no CSS, no DOM |
| `@speculoos/map-radix-themes` | A component map for `@speculoos/react`, built from Radix Themes |
| `@speculoos/html` | Framework-free HTML renderer. Emits documented class names, never styles |
| `@speculoos/cli` | `build`, `lint` and `inspect` |

## Try it

```sh
npx @speculoos/cli@alpha inspect path/to/openapi.yaml
npx @speculoos/cli@alpha inspect path/to/openapi.yaml --operation createJob --expand always
npx @speculoos/cli@alpha build   path/to/openapi.yaml -o ir.json --pretty
npx @speculoos/cli@alpha lint    path/to/openapi.yaml --allow NOT,IF
npx @speculoos/cli@alpha build   path/to/openapi.yaml --tag Jobs --hide-internal --prune
```

## Rendering it

```tsx
<SpeculoosProvider ir={ir} components={yourComponents}>
  <OperationList />
  <Operation id="createJob" />
  <TypeSections />
</SpeculoosProvider>
```

`yourComponents` is a map of twelve components from your own library — `Section`,
`Markdown`, `Code`, `Badge`, `Link`, `Fields`, `FieldRow`, `Tabs`, and a few more.
All required; there are no defaults, because a default is a style decision taken
on your behalf. See [`packages/react/README.md`](packages/react/README.md) — or
start from [`@speculoos/map-radix-themes`](packages/map-radix-themes/README.md),
a complete map for Radix Themes.

Or, for a static site that builds pages by concatenating strings:

```ts
import { renderApi } from "@speculoos/html";

const body = renderApi(ir, { renderMarkdown });
```

No DOM, no React, no bundler. It emits
[documented class names](packages/html/README.md#class-names) and no CSS
whatsoever.

Either way, descriptions arrive as raw CommonMark from a document you did not
write: **sanitising them is yours**, and nothing in Speculoos will do it for
you.

To see it, with a demo stylesheet built only from the documented class names:

```sh
pnpm preview:serve   # http://localhost:8137
```

## Documentation

- [`docs/WRITING-A-RENDERER.md`](docs/WRITING-A-RENDERER.md) and
  [`docs/WRITING-AN-ADAPTER.md`](docs/WRITING-AN-ADAPTER.md)
- [`docs/DIAGNOSTICS.md`](docs/DIAGNOSTICS.md) — all 25 diagnostic codes, their severities and meanings
- [`docs/PLAN.md`](docs/PLAN.md) — the design, the decisions taken and what each milestone proved
- [`docs/M6-COMPONENT-MAPS.md`](docs/M6-COMPONENT-MAPS.md) — the Radix Themes map, and what piloting it on a real docs site taught
- [`docs/RELEASING.md`](docs/RELEASING.md) and [`CHANGELOG.md`](CHANGELOG.md)

## Status

Both dialects, both renderers and the Radix Themes map are in. On a branch of
the Speechmatics docs, their whole API reference — four APIs, REST and WebSocket
— renders from Speculoos, with nothing left on the renderer it replaced. 491
tests across eleven packages.

- The OpenAPI pipeline builds the 13.5 MB GitHub REST description in under three
  seconds, deterministically. All 1242 operations and 996 type sections then
  render to 12.8 MB of markup in under a second.
- The same API written in AsyncAPI 2.6 and 3.0 produces the same IR and
  byte-identical pages, so a page never depends on which version a spec happens
  to use. `publish`/`subscribe` and `send`/`receive` all normalise to the API
  consumer's point of view.
- Adding a second dialect needed no new node kinds, which is the best evidence
  so far that the IR is right.
- The React package contributes no markup of its own, and a test proves it
  rather than claiming it: the fixture component library emits only custom
  elements, and the test fails if any tag in the output did not come from the
  map.
- Two independent renderers — one React, one strings — show the same fields and
  link to the same places over the same IR, with no element name in common.

## Developing

```sh
pnpm install && pnpm build
pnpm test && pnpm typecheck && pnpm lint
pnpm preview:serve        # every fixture through the HTML renderer, http://localhost:8137
pnpm preview:radix        # every fixture through the Radix map
pnpm release:check        # what a consumer would install; see docs/RELEASING.md
```
