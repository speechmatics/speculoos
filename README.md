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
| `@speculoos/html` | Framework-free HTML renderer. Emits documented class names, never styles |
| `@speculoos/cli` | `build`, `lint` and `inspect` |

## Try it

```sh
pnpm install && pnpm build

node packages/cli/dist/cli.js inspect path/to/openapi.yaml
node packages/cli/dist/cli.js inspect path/to/openapi.yaml --operation createJob --expand always
node packages/cli/dist/cli.js build  path/to/openapi.yaml -o ir.json --pretty
node packages/cli/dist/cli.js lint   path/to/openapi.yaml --allow NOT,IF
node packages/cli/dist/cli.js build  path/to/openapi.yaml --tag Jobs --hide-internal --prune
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
`Markdown`, `Code`, `Badge`, `Link`, `Table`, `FieldRow`, `Tabs`, and a few more.
All required; there are no defaults, because a default is a style decision taken
on your behalf. See [`packages/react/README.md`](packages/react/README.md).

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

- [`docs/PLAN.md`](docs/PLAN.md) — the plan, the open decisions and what each milestone proved
- [`docs/DIAGNOSTICS.md`](docs/DIAGNOSTICS.md) — all 25 diagnostic codes, their severities and meanings
- [`docs/WRITING-A-RENDERER.md`](docs/WRITING-A-RENDERER.md)
- [`docs/WRITING-AN-ADAPTER.md`](docs/WRITING-AN-ADAPTER.md)

## Status

Both dialects work and both renderers are in. M5 of the plan in
[`docs/PLAN.md`](docs/PLAN.md) is done — 370 tests across ten packages:

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
  link to the same places over the same IR, with no element name in common. That
  was the test `irVersion: 1` was waiting on.
- `@speculoos/html` renders all 1242 GitHub operations and 996 type sections in
  ~660 ms with zero dangling anchors and zero duplicate ids.
