# M6 — Shipped component maps

**Status:** planned, not started.
**Pilot:** Radix Themes, because it is the basis of the Speechmatics design system.

This is a working plan, written to be picked up cold. It assumes nothing about
what you remember.

---

## 1. What this is, in one paragraph

`@speculoos/react` renders an `ApiIR` through a `Components` map — twelve
components supplied by the caller, all required, no defaults. That contract is
deliberate and does not change here. M6 adds a **shipped map** for Radix Themes
so that adopting Speculoos does not start with writing twelve components from a
blank file. The core packages still ship no styles and no components.

## 2. The layering, which is the thing most easily got wrong

```
ApiIR  →  @speculoos/react  →  Components map  →  your page
          (the renderer)       (Radix Themes)
```

A component map is **not** a renderer. There is one React renderer and a map per
library. This distinction gets blurred every time it is discussed, which is why
the package name should carry it.

**The one constraint that must hold forever:** dependency direction is one-way.
`@speculoos/react` must never import, reference or know about a design system.
If that inverts, the architecture is gone. Nothing else in this document matters
as much.

## 3. Decisions already taken

Do not re-litigate these; they were argued out already.

| Decision | Reasoning |
|---|---|
| A **published package**, not an example | A map is one of the `n` in `m + n`. Shipping it costs maintenance, which is linear, not the `m × n` multiplication. The earlier objection that it "re-creates `m × n`" was wrong. |
| A **factory taking options**, not a frozen object | The common need is "keep your Badge, change the colour mapping", not wholesale replacement. |
| **Spread for replacement** | `Components` is a plain object. `{ ...radixThemes(), Badge: MyBadge }` already works and needs no API. |
| Name carries the layer: **`@speculoos/map-radix-themes`** | The renderer/map confusion is real and recurring; the package name is the cheapest place to settle it, and it scales honestly to `map-mui`. |
| `@radix-ui/themes` and `react` are **peer** dependencies | Two copies of Radix means a broken theme context. |
| Lives in **this monorepo** for now | CI then renders every fixture through real Radix on every change. Split it out only if release cadence becomes the problem. |

## 4. Prerequisite work in `@speculoos/react`

Do these **first**, before any map exists, while they are still free. Once a map
ships, `Components` stops being a consumer-facing interface and becomes a public
*implementation* contract: adding a required component becomes breaking for
every map in existence.

### 4.1 `BadgeProps` cannot express which method it is

`BadgeProps` is `{ tone, children, chip? }`. The most universal convention in
API documentation is colouring by HTTP method — GET green, DELETE red — but
`tone: "method"` does not say *which* method. A map would have to read
`children` as a string, which is grim and fragile.

Add an optional discriminating value:

```ts
export interface BadgeProps {
  tone: BadgeTone;
  children: ReactNode;
  chip?: Chip | undefined;
  /** The raw value behind the badge: "get", "200", "wss". For colour maps. */
  value?: string | undefined;
}
```

Then set it at every `C.Badge` call site in `operation.tsx`, `fields.tsx` and
`navigation.tsx`. Purely additive. **`@speculoos/html` has the same problem** —
it emits `spec-badge--method` with no indication of which method — so add a
`data-value` attribute there in the same change, and a `badge` entry to
`CLASSES` if the catalogue needs it.

### 4.2 A map may have requirements on the provider options

This surfaced before a line was written and is the more interesting of the two.

Radix's Table is `Table.Root > Table.Body > Table.Row > Table.Cell`, built on
real `<table>`/`<tr>`/`<td>`. **You cannot nest a `Table.Row` inside a
`Table.Row`**, so a Table-based map requires `layout: "rows"` — the flat
pre-order list where every `FieldRow` carries `depth`. (This is exactly why that
option exists, and the `terse` fake map in `packages/react/test/fake.tsx` is
built flat-row, so the path is real and tested.)

But `layout` is a **`SpeculoosProvider` option**, not a property of the map. A
consumer can set `layout: "tree"` and get invalid HTML with no warning.

Recommended fix, least invasive: the package exports its preferred options
alongside the map, and the README shows both being passed.

```ts
export const radixThemesOptions: SpeculoosOptions = { layout: "rows" };
```

Alternative worth considering: let `SpeculoosProvider` accept
`{ components, options }` so a map can carry its own defaults, with explicit
provider options winning. More invasive; decide before building.

### 4.3 State the React API's stability

`irVersion: 1` is frozen. `@speculoos/react` is at `0.0.1` with an unstated
contract that maps are about to depend on. Those should land together — see the
open version question in §9.

## 5. The map itself

Twelve components. Expect 150–250 lines.

| Slot | Radix Themes | Notes |
|---|---|---|
| `Section` | `Box` + `Heading as={h1..h6}` | `level` is 1–6; clamp it. `kind` drives spacing/variant. |
| `Markdown` | **none — required option** | See §6. |
| `Code` | `Code` | |
| `CodeBlock` | `pre` + `Code variant="ghost"`, maybe in `ScrollArea` | Radix has no code block; this needs deciding. |
| `Badge` | `Badge color variant` | `variant` defaults to `"soft"`; `color` from the tone/value map. |
| `Link` | `Link` | Offer an `asChild` escape so a router `Link` can be slotted in. |
| `Table` | `Table.Root`/`Table.Body`, or `DataList.Root` | Two modes — see below. |
| `FieldRow` | `Table.Row` + `Table.Cell`, or `DataList.Item` | Indent from `depth` via `pl`. |
| `Tabs` | `Tabs.Root`/`List`/`Trigger`/`Content` | `defaultValue={tabs[0].id}`; `Trigger value={tab.id}`. |
| `List` | `Flex direction="column"` | `kind` drives gap. |
| `ListItem` | `Box` | |
| `Empty` | `Text color="gray"` | |

**Try `DataList` as well as `Table` for field rows.** It is built for
label/value pairs and has no nesting constraint, so it may read better for a
schema than a grid does. Make it the `fields: "table" | "datalist"` option and
decide from the rendered output, not from first principles.

**Verify before building on it:** Radix Themes 3.0 removed native `color`,
`defaultValue` and `defaultChecked` from components that inherited them from
HTML elements. Confirm `defaultValue` still behaves as expected on `Tabs.Root`.

### Proposed factory signature

```ts
export function radixThemes(options: RadixMapOptions): Components;

export interface RadixMapOptions {
  /** Required. Speculoos never renders or sanitises markdown — see §6. */
  markdown: ComponentType<{ children: string }>;
  size?: "1" | "2" | "3";
  fields?: "table" | "datalist";
  /** HTTP method → Radix colour. Merged over the defaults. */
  methodColors?: Partial<Record<HttpMethod, string>>;
  /** Badge tone → Radix colour, for everything that is not a method. */
  toneColors?: Partial<Record<BadgeTone, string>>;
  /** Wraps `Link` in `asChild` so a router link can be slotted in. */
  linkAs?: ElementType;
}
```

## 6. `Markdown` must stay the consumer's

A shipped map **cannot** ship a `Markdown` component, because that would mean
Speculoos shipping a sanitiser — the one thing every README in this repo warns
against. Descriptions are raw CommonMark from a document nobody here wrote.

So `markdown` is a **required** factory option. No default, no fallback that
renders HTML. The README should show the wiring and say why:

```tsx
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";

const Markdown = ({ children }: { children: string }) => (
  <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{children}</ReactMarkdown>
);
```

## 7. Preview harness

`preview/build.mjs` is currently a pure-string pipeline: it calls
`@speculoos/html` and writes files. Adding the map means:

- `react-dom/server`'s `renderToStaticMarkup` at build time;
- Radix's stylesheet (`@radix-ui/themes/styles.css`) copied into `preview/out`;
- a `<Theme>` wrapper in the page template;
- a second set of pages, e.g. `batch-radix.html` next to `batch.html`, so the
  two renderers can be compared side by side in a browser.

This will be the first time real CSS has been loaded over this output. That is
the point of the exercise.

Note the harness has `--serve`; `preview/build.mjs` writes to `preview/out/`
(gitignored) and `pnpm preview:serve` serves it on :8137.

## 8. Testing a map (different from testing the renderer)

The existing renderer tests prove Speculoos emits *no* markup. A map is supposed
to emit markup, so those techniques do not transfer. What does:

1. **Completeness** — every slot filled. Free at the type level.
2. **Renders every fixture** — every operation of both dialects and every type
   section, without throwing. This is the test that actually catches things.
3. **No React warnings** — capture `console.error` during render and assert it
   is empty. Catches missing keys and invalid DOM nesting, which is exactly the
   `<tr>`-in-`<tr>` failure mode.
4. **Snapshot one operation per dialect** — to make review of changes readable.
5. **Heading levels descend** — `level` is passed through, so a map that
   hard-codes `h2` is a real accessibility bug.

The cross-renderer parity test in `packages/react/test/parity.test.tsx` does
**not** apply here; it compares two renderers, not two maps.

Fixtures: `@speculoos/fixtures` exports `specDir`; build IR with
`load()` + `buildOpenApi`/`buildAsyncApi`. See `packages/html/test/ir.ts` for
the pattern.

## 9. Open questions

- **Versioning.** Every package is `0.0.1` while `irVersion` is frozen at 1.
  Those two statements disagree. Settle before a map depends on the React API.
- **Maintenance policy.** One map is a pilot; three means owning three upgrade
  cycles. Write down what qualifies a second map — real demand, or a contributor
  who owns it — before it becomes an unfunded mandate by drift.
- **`CodeBlock`** has no natural Radix equivalent. Decide from rendered output.
- **Provider options**: exported constant (§4.2) or `SpeculoosProvider` change?

## 10. Exit criteria

1. Both fixture APIs render through real Radix Themes in the preview harness,
   and someone has looked at them in a browser.
2. The Speechmatics docs site can start from `radixThemes({ markdown })` plus
   overrides rather than from a blank `Components`.
3. Every factory option documented, with the colour defaults shown.
4. **The open item carried since M4 is closed**: the reference integration is a
   real component library, not a fake one.

## 11. Suggested order

1. §4.1 `BadgeProps.value` (+ the `@speculoos/html` equivalent) — additive, free now.
2. §4.2 decide and implement the provider-options story.
3. Scaffold `packages/map-radix-themes` — copy `packages/html`'s tsconfig/tsup setup.
4. The twelve components, Table mode first.
5. Wire into the preview harness; **look at it**.
6. `DataList` mode; compare; pick a default.
7. Tests (§8), README, PLAN.md entry.

Both rendering defects in M5 were found by looking at output, not by reading
code. Get to step 5 quickly.
