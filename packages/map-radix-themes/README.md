# @speculoos/map-radix-themes

A component map for [Radix Themes](https://www.radix-ui.com/themes): the twelve
`Components` that `@speculoos/react` renders through, built from Radix.

**This is not a renderer.** There is one React renderer, `@speculoos/react`, and
this is one of the maps it takes. The dependency points one way: this package
knows about `@speculoos/react`, and `@speculoos/react` never learns this exists.

## Use

```tsx
import "@radix-ui/themes/styles.css";
import { Theme } from "@radix-ui/themes";
import { Operation, SpeculoosProvider } from "@speculoos/react";
import { radixThemes } from "@speculoos/map-radix-themes";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";

const Markdown = ({ children }: { children: string }) => (
  <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{children}</ReactMarkdown>
);

const components = radixThemes({ markdown: Markdown });

<Theme>
  <SpeculoosProvider ir={ir} components={components}>
    <Operation id="createJob" />
  </SpeculoosProvider>
</Theme>;
```

Make `components` once, outside render, or memoise it — the factory returns new
component identities on every call.

The `<Theme>` and the stylesheet are yours: which accent, which radius, light or
dark are decisions about your site, not about API documentation.

### `markdown` is required, and there is no default

Descriptions are raw CommonMark from a document you did not write. Rendering it
means choosing a sanitiser, and a map that shipped one would be Speculoos owning
your XSS surface. So you pass one in. Mapping elements to Radix typography is
worth doing while you are there:

```tsx
<ReactMarkdown
  rehypePlugins={[rehypeSanitize]}
  components={{
    p: ({ children }) => <Text as="p" size="2" mb="2">{children}</Text>,
    a: ({ href, children }) => <Link href={href ?? "#"}>{children}</Link>,
    code: ({ children }) => <Code>{children}</Code>,
  }}
>
```

## Options

| Option | Default | |
|---|---|---|
| `markdown` | — | **Required.** Renders and sanitises a description. |
| `size` | `"2"` | `"1"` \| `"2"` \| `"3"`. Scale of field lists, badges and tabs. |
| `presence` | `"optional"` | Which of a field's states is marked: `"optional"` (the exception, in most APIs) or `"required"`. |
| `fieldLayout` | `"stacked"` | `"stacked"`: name, type, constraints and optional on one line, description below, a rule between fields — Deepgram's. `"columns"`: name left, type and description right, stacked on phones. `"vertical"`: always stacked, the type on a line of its own. |
| `colors` | see below | Badge colours, merged entry by entry over the defaults. |
| `linkAs` | — | Your router's link component, for internal links (types, operations, tags). Receives `href` and `children`. External links stay plain `<a>`s. |
| `messageExtras` | — | Extra content in each message's card, under its heading. Receives the IR `message`, so it can render what a spec's own `x-` extensions say. |

Field rows are a Radix `DataList`, stacked: the name, type, constraints and
"optional" on one line, the description under it (`fieldLayout` has the
two-column alternative). It works in either provider
`layout` — a field's nested rows are rendered after it as siblings, indented by
depth, so nothing needs setting on the provider.

Nested rows start collapsed behind a "Show 4 properties" toggle. That is what
makes `expandRefs: "always"` practical: every named type expanded where it is
used, without a page of every field of every type. In `layout: "rows"` there is
nothing nested to hide, and no toggle.

### Colours

Badges are coloured by what they show, using `BadgeProps.value` — so GET and
DELETE differ without anything reading the badge's text.

| Group | Defaults |
|---|---|
| `method` | get `green`, post `blue`, put `orange`, patch `amber`, delete `red`, head `gray`, options `gray`, trace `gray` |
| `status` | 1xx `gray`, 2xx `green`, 3xx `blue`, 4xx `orange`, 5xx `red`, default `gray` |
| `direction` | client-sends `cyan`, server-sends `cyan` — the protocol's colour; the arrow tells them apart |
| `tone` | required `red`, deprecated `amber`, protocol `cyan`; everything else `gray` |

`tone` is also the fallback for a value with no entry. Override any single entry:

```ts
radixThemes({ markdown, colors: { method: { get: "teal" }, tone: { required: "crimson" } } });
```

`DEFAULT_COLORS` is exported if you want to read them.

## Replacing a component

`Components` is a plain object, so replacing one is a spread — no API:

```ts
const components = { ...radixThemes({ markdown }), Badge: MyBadge };
```

## Choices worth knowing

- **`Code` is a ghost.** Monospace with no fill and no colour of its own, so a
  linked type (`JobStatus`) takes the link colour and a plain one (`integer`)
  reads as text. A filled `Code` made every type look clickable.
- **A direction badge is an arrow** — ↑ for what the reader sends, ↓ for what
  they receive — round, beside "Send" or "Receive" in the heading. Its label
  ("client → server") is a tooltip, and visually hidden text for screen
  readers.
- **Few colours.** WebSocket has its own colour among the HTTP methods, and a
  channel's directions share it; security schemes, media types and
  constraints are grey.
- **A message is a card with a heading.** The renderer gives each message a
  `Section` of `kind: "message"`, anchored at its slug, because a channel's
  messages are its vocabulary and prose links to them. The map draws it as a
  `Card` with a smaller heading at the real level. Media types, statuses and
  examples are tabs.
- **Gathered examples are a list, not tabs.** `Tabs` with `kind: "examples"`
  (from `<EntryExamples>`) is one card of rows, each opening in place —
  Deepgram's panel. Their labels are too long to sit side by side as tabs.
- **A row with no name is headed by its type.** An enum's documented values,
  a union's branches and a scalar payload have no name; `"invalid_model"` or
  `string<binary>` stands in the name column rather than a dash.
- **"optional" is marked, not "required".** Most fields in most APIs are
  required, so marking those put a red word on nearly every row; marking the
  exception is quieter. `presence: "required"` marks the other way. Either is
  text, not a badge.
- **Names and types are dark, descriptions lighter.** A row is scanned by its
  name and type; the description is for whoever stops there.
- **`CodeBlock`** — Radix has none. It is a ghost `Code` in a `<pre>` on a
  `Card`, in a horizontal `ScrollArea`. `language-json` is on the `<code>` for
  highlighters.
- **Headings** use the `level` they are given, clamped to h1–h6. The visual size
  follows the level, not the other way round.

## Seeing it

```sh
pnpm --filter @speculoos/map-radix-themes dev    # http://localhost:8138
SPECULOOS_SPEC=path/to/spec.yaml pnpm --filter @speculoos/map-radix-themes dev
```

Every fixture through real Radix Themes, with layout and appearance switchable
in the sidebar. "Pages: per-entry" routes each entry — a REST operation, or a
channel with its send and receive — to its own page using nothing but an `href`
function, as a Fern-style reference would. The dev server is not shipped.
