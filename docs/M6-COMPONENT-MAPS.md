# M6 — Shipped component maps

**Status:** map built and looked at (§12). Open: versioning (§4.3, parked), maintenance policy, and
exit criterion 2 — trying it on the Speechmatics docs site.
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

### 4.1 `BadgeProps` cannot express which method it is — ✅ done

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

*Done.* Set on method, status, direction, protocol, media-type and
security-scheme badges in both renderers. Direction values are the IR's own,
`client-sends` / `server-sends`. Not set on constraint badges, which already
carry `chip` (and `data-chip` in HTML), nor where the text is fixed
(`required`, `webhook`). Documented on the `badge` entry in `CLASSES`.

### 4.2 The `Table` slot was misnamed — ✅ done, renamed `Fields`

The original worry here was "a map may have requirements on the provider
options": Radix's `Table.Row` cannot nest inside a `Table.Row`, so a
Table-based map would need `layout: "rows"`, which is a `SpeculoosProvider`
option, not a property of the map. Two fixes were proposed — the package
exporting `radixThemesOptions`, or the provider accepting map defaults.

Neither was needed. The worry came from the slot's *name*: it was called
`Table`, which reads as "fill this with a table". It is only the container
around a set of `FieldRow`s, and a definition list, a grid or a stack of rows
fits it just as well. Only a `<table>`-based map meets the nesting constraint,
and that map can work around it alone. In `layout: "tree"`, `FieldRow` gets its
nested rows as `children`; those are `FieldRow`s carrying their own `depth`, so
the map returns them *after* its own row as siblings:

```tsx
FieldRow: ({ depth, name, type, docs, children }) => (
  <>
    <Table.Row>…</Table.Row>
    {children}
  </>
)
```

Valid HTML in either layout, with no provider API. So the slot is now `Fields`
(`FieldsProps`), the `FieldRowProps.children` doc comment says the above, and
nothing was added to `SpeculoosProvider`. If a later map has a requirement it
genuinely cannot meet alone, design for it then, against a real case.

(Most nesting is rare anyway: with the default `expandRefs: "never"`, a `$ref`
property is one row with a link. Children appear only for inline objects,
arrays of inline objects and union branches.)

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
| `Fields` | `Table.Root`/`Table.Body`, or `DataList.Root` | Two modes — see below. `kind` separates parameters/headers (genuinely tabular) from schema fields. |
| `FieldRow` | `Table.Row` + `Table.Cell`, or `DataList.Item` | Indent from `depth` via `pl`. In Table mode, return `children` as siblings — see §4.2. |
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

*Done differently.* The map got its own Vite dev server instead
(`pnpm preview:radix`, :8138, source in `packages/map-radix-themes/dev/`). Static
`renderToStaticMarkup` pages would have shown dead tabs — Radix `Tabs` needs
hydration — and would not have run React's client-side DOM-nesting checks,
which are exactly the ones a Table map needs (§8). The dev server builds the
IRs in Node and hands them to the page as a virtual module, reloads on edit,
and switches layout and light/dark from the sidebar.
`SPECULOOS_SPEC=path.yaml` previews any spec. `preview/build.mjs` is unchanged
and stays the HTML renderer's harness.

## 8. Testing a map (different from testing the renderer)

The existing renderer tests prove Speculoos emits *no* markup. A map is supposed
to emit markup, so those techniques do not transfer. What does:

1. **Completeness** — every slot filled. Free at the type level.
2. **Renders every fixture** — every operation of both dialects and every type
   section, without throwing. This is the test that actually catches things.
3. **No React warnings** — capture `console.error` during render and assert it
   is empty, in **both** layouts. Catches missing keys and unknown props.
   **Not** invalid DOM nesting: `renderToStaticMarkup` does not validate it
   (checked — only react-dom's client does), so the `<tr>`-in-`<tr>` case §4.2
   relies on avoiding needs its own structural assertion.
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
- ~~**`CodeBlock`** has no natural Radix equivalent.~~ Ghost `Code` in a `<pre>` on a `Card`, in a
  horizontal `ScrollArea`. Reads well; see §12.

## 10. Exit criteria

1. Both fixture APIs render through real Radix Themes in the preview harness,
   and someone has looked at them in a browser.
2. The Speechmatics docs site can start from `radixThemes({ markdown })` plus
   overrides rather than from a blank `Components`.
3. Every factory option documented, with the colour defaults shown.
4. **The open item carried since M4 is closed**: the reference integration is a
   real component library, not a fake one.

## 11. Suggested order

1. ~~§4.1 `BadgeProps.value` (+ the `@speculoos/html` equivalent).~~ Done.
2. ~~§4.2 decide and implement the provider-options story.~~ Resolved by renaming `Table` → `Fields`.
3. ~~Scaffold `packages/map-radix-themes`.~~
4. ~~The twelve components, Table mode first.~~
5. ~~Wire into a preview; **look at it**.~~ Dev server — see §7.
6. ~~`DataList` mode; compare; pick a default.~~ `DataList`, and the option removed — see §12.
7. ~~Tests (§8), README, PLAN.md entry.~~

Both rendering defects in M5 were found by looking at output, not by reading
code. Get to step 5 quickly.

## 12. What building it found

*Recorded after the fact, for whoever picks this up next.*

**The map** is `radixThemes(options)` in `packages/map-radix-themes`: ~520 lines
including comments, more than the 150–250 estimated, mostly because colours are
data. Its build imports only `@radix-ui/themes` and
`react/jsx-runtime` — `@speculoos/react` is used for types alone, so the
one-way dependency is visible in the bundle. 31 tests.

**Signature, as built.** As §5 proposed, minus `fields` (below), and colours are one nested option,
`colors: { method, status, direction, tone }`, instead of `methodColors` and
`toneColors`. Statuses colour by class (2xx green, 5xx red) and directions by
value; two flat options could not express either. `linkAs` takes a component
receiving `href` and `children`, and applies to internal links only.

**Looking at it found three things, none visible in code or tests:**

1. *A renderer defect.* The operation list read "GET/jobs List jobs".
   `OperationLabel` in `@speculoos/react` put the method badge and the path
   side by side with no whitespace, and because the label sits inside a
   `Link` — inline — no map's layout could separate them. The same class of
   defect M5 found in the HTML renderer. Fixed in the renderer, with a test
   that strips tags and reads the text.
2. *Every type looked clickable.* Radix `Code` is accent-coloured and filled,
   so `integer` and a linked `JobStatus` were indistinguishable. `Code` is now
   a ghost, which inherits colour: link-coloured inside a `Link`, body text
   elsewhere.
3. *Tables did not line up.* Auto layout sized each table's columns to its own
   content. Fixed layout, 28% / 32% / rest.

**Table or DataList: DataList, and no option.** Both were built and compared in the
browser. `DataList` read better for everything — schemas, parameters and headers
alike — and the `Table`'s column headers bought nothing a reader needed, so the
`fields` option and the Table code were removed rather than kept as a second
path to maintain. The sibling-rows technique from §4.2 still matters: it is
what lets the map ignore `layout`.

**Messages are alternatives, not tabs.** Tabbing a channel's messages hid the
thing a reader is doing — comparing what they may send. The map renders `Tabs`
with `kind: "message"` as a stack of `Card`s with "or" between; media types,
statuses and examples stay tabs. No renderer change: `kind` exists for exactly
this. (A card's title is bold text, not a heading, because `TabsProps` carries
no `level`. If that matters for navigation, `level` is an additive prop.)

**DataList does not nest either.** A `<dl>` could, but a row cannot tell which
layout it is in — `children` is absent on a tree leaf and on every row in "rows"
— so nesting in one and indenting in the other would indent twice. Both modes
return nested rows as indented siblings.

**What §8's warning test can and cannot see.** `renderToStaticMarkup` reports
missing keys but does **not** validate DOM nesting; only react-dom's client does.
So nesting has its own structural test (now on `<dl>`), and the dev server's
browser console was checked clean in every fixture and mode.

## 13. Endpoints as the unit (partly superseded — see §14)

*Also surfaced by looking at the map, and wider than the map: it changed both
renderers.*

**What was wrong.** Both renderers were operation-first. A channel with a send and
a receive showed its address, protocol and address parameters twice, and a REST
path with GET and POST did the same. And nothing rendered `endpoint.docs` at all —
a channel's own description ("The transcription socket.") was in the IR and on no
page. The IR had the right shape all along: an OpenAPI path and an AsyncAPI channel
both lower to `Endpoint`, which owns its address, docs, parameters and operations.
Only the renderers ignored that level.

**What changed.**

- `<Endpoint>` / `renderEndpoint`: the address is the heading; protocol,
  description and shared parameters are shown once; each operation follows one
  level down without repeating them. Same for both dialects.
- Under an endpoint, a REST operation is headed by its summary (or method), and a
  message operation by `DIRECTION_VERB` — "Send" / "Receive", new in core — with
  the direction badge and the title beside it. Speechmatics' common case is one
  channel, two operations, and the verb is what tells them apart.
- `HrefTarget` gains `{ kind: "endpoint" }`, and `defaultHref` maps it to the
  endpoint's slug. With an operation's target already carrying its endpoint, one
  `href` function routes a page per endpoint with an anchor per operation. That is
  the Speechmatics requirement: one page per REST path, routed upstream.
- `useEndpoints` / `useEndpoint`, and `EndpointList` for navigation.
  `@speculoos/html`'s `renderApi` and `renderNav` now group by endpoint by
  default (`groupBy: "tag"` keeps the old behaviour); `renderNav`'s `byTag`
  boolean became `groupBy: "endpoint" | "tag" | "none"`.
- `ListProps.kind` gains `"endpoints"`; the HTML catalogue gains
  `spec-link--endpoint` and `spec-list--endpoints`.
- `<Operation>` standing alone is unchanged.

**Parity holds.** The cross-renderer test now also compares every endpoint of both
dialects, and the endpoint navigation, for the same field keys and link targets.

**In the map.** Direction badges carry ↑ (send) / ↓ (receive). The dev page's
"Pages: per-endpoint" mode routes each endpoint to its own page through an `href`
function alone, as a site would.

**Endpoints with no operations are left out of listings.** In AsyncAPI 3 a channel
is an address plus the messages that *can* travel on it, and an operation is what
the application does there; `reply` can name a different channel for the response
to land on. So a reply-only channel (`pong` in `reply-v3.yaml`) has no operation of
its own, and its message is already shown inside the operation that expects it.
`listedEndpoints(ir)` in core — used by `renderApi`, `renderNav`, `useEndpoints`
and `EndpointList` — skips such endpoints; they remain in `ir.endpoints` and render
by id ("No operations"). This exposed a gap: both renderers headed a reply by
`reply.address` only, which the adapter sets just for a runtime address, so a reply
on a declared channel said "Reply" and nothing told the reader where it arrives.
`replyAddress` in core now falls back to the named channel's address: "Reply on
/pong".

**Tags: parked.** Standard in both specs — a subject-area label on operations, used
for sidebar sections (Swagger UI, Redoc) and per-tag client classes, typically
spanning several paths. Still supported (`groupBy: "tag"`, `OperationList`), but
no longer a default anywhere, and nothing more is built for them until there is a
UI use case — most likely section headings over endpoint pages.

## 14. Entries, not endpoints, are the page unit

*§13 made the endpoint the page unit for both dialects. That conflated two things.*

**The model.** Reference sites like Fern list one sidebar entry, and one page, per
REST operation — `POST /projects` — and one per WebSocket channel, `WSS /realtime`,
whose page holds its send and receive. So the key is *verb + address*, where for a
channel the protocol is the verb. The asymmetry is real: a request/response pair is
self-contained, while a channel's operations only make sense together, as the two
directions of one connection. On the page, a channel's send/receive play the part a
REST operation's request/response play.

**What changed** — small, because both page bodies already existed:

- Core: `ApiEntry` = `{ kind: "operation", endpoint, operation }` for each operation
  on a path (webhooks included) | `{ kind: "channel", endpoint }` for each channel
  with operations. `apiEntries(ir)` lists them in document order, on top of
  `listedEndpoints`; `entrySlug(entry)` is the anchor.
- React: `useEntries()`, `<Entry>` (renders `<Operation>` or `<Endpoint>`), and
  `<EntryList>`, which **replaces `EndpointList`**. HTML: `renderEntry`; `renderApi`
  and `renderNav` default to `groupBy: "entry"`. `ListProps.kind` and the HTML
  catalogue's `"endpoints"` list became `"entries"`.
- Labels follow Fern: a REST entry is method + summary, falling back to the path; a
  channel is protocol + title, falling back to the address.
- A channel's page is now headed like a REST operation's: its title when it has one,
  with `WSS /v2/{language}` beside it as `POST /jobs` would be.
- Unchanged: `<Endpoint>` (now the channel page, and still usable for a whole REST
  path), Send/Receive headings, the endpoint link target, `listedEndpoints`,
  `replyAddress`. The link targets needed nothing new: an operation's target already
  carries its endpoint, so one `href` sends a channel's operation to the channel's
  page and anchor.

**Tags, again.** Fern's categories are tags in all but name, so the parked UI use
case is now concrete: category headings over the entry list. REST entries would take
their operation's tags; a channel its own or its operations'. Still parked until the
flat list has been used.


## 15. Piloting on the Speechmatics docs

*The map and both renderers, used for real: the Realtime WebSocket reference and one
Batch REST operation (`POST /jobs`), on the Docusaurus site that already documents both,
side by side with the live pages. The `speculoos-pilot` branch of `speechmatics/docs`.*

### Setup, and its traps

Speculoos is installed from tarballs: `pnpm pack:local` packs every public package into
`.packs/` under version-free names, and the site depends on
`file:../speculoos/.packs/speculoos-*.tgz`. Tarballs rather than `npm link`, because a
symlinked package resolves `react` from this repository and breaks hooks. Two caches
then hide a new pack, because the version never changes: npm reuses its cached tarball
(the lockfile pins the integrity hash), and webpack's persistent cache treats a
same-version package as unchanged. The site's `speculoos:refresh` reinstalls the
tarballs and clears webpack's cache; then restart the dev server.

The site builds IR at `start`/`build`: `speculoos build` for the Realtime spec, and for
Batch a conversion first (below). That step runs *after* the site's own spec generation,
not beside it — it reads a file that step writes.

### The specs were the biggest lever

Most of what made the pages read well was a better spec, not a better renderer — the
working rule was to rewrite specs rather than teach the library their quirks.

- **Realtime, rewritten as canonical AsyncAPI 3.** One channel holding all 24 messages,
  with `receive`/`send` operations from the server's point of view; the channel's `title`
  and `description` head the page. Message examples moved from payload schemas to
  `message.examples`. Enums whose values were described in a Markdown table became
  `oneOf`s of documented `const`s — with a `title` each, which the old plugin uses to
  label its tabs. A binary `AddAudio` payload, two security schemes on the server
  (`Authorization: Bearer`, or `?jwt=` for browsers), and `bindings.ws.method: GET`.
- **Batch stays Swagger 2.0**, generated upstream. It is converted to OpenAPI 3 at
  build time (`swagger2openapi --anchors`) and patched with an **OpenAPI Overlay 1.0**
  (`spec/batch.overlay.yaml`): `openapi: 3.1.0`; the multipart `config` part as a
  `JobConfig` sent as JSON (Swagger 2.0's formData can only call it a string, so no page
  could show `JobConfig`); HTTP Bearer; status enums as documented values. The overlay is
  applied by a short script over `jsonpath-plus`, not a library, so that an action
  matching nothing fails the build — a renamed upstream field cannot silently drop its
  patch. Actions remove only what changes and merge the rest, keeping upstream order and
  prose. The one cost: prose the overlay replaces no longer follows upstream edits.
- Found along the way: the live Batch page omits two documented query parameters
  (`wait`, `format`); and WebSocket close codes do not map one-to-one onto `Error`
  types (two codes have no type, six types have no documented code) — so close codes
  are their own table, not folded into the types.

### What changed in Speculoos

Core and both renderers, at parity:

- **Message summaries** render as Markdown (AsyncAPI's `summary` is often where the
  prose is). **Messages are anchored sections** — `WsMessage.slug`, additive under
  `irVersion: 1`, assigned after every other slug so none moves — straight under their
  operation; no "Messages" wrapper, no discriminator badge repeating the payload.
- **Full URLs.** `endpointUrl` joins the one applicable server and the address (none for
  a webhook, which the reader serves). Entry headings show it, REST and channel alike.
- **The handshake.** `endpointHandshake` describes a WebSocket channel's upgrade:
  method (from the `ws` binding, else GET), URL, the applicable servers' security and
  description. Rendered as a "Handshake" section; `handshakeExtras` ends it with the
  page's own content (responses, an example exchange). AsyncAPI has no place for the
  upgrade's responses, so they stay the page's.
- **Authentication** is one presentation for both dialects: each alternative, how to
  send it (`securityUsage`: "Authorization: Bearer <token>", "?jwt=<key>"), and the
  scheme's description — replacing operation-level "Security" badges.
  `securityLabel` is shared. A 3.x server's security list is read as alternatives (it
  was read as all-of, a bug).
- **Examples gathered in one place.** `entryExamples(entry)` lists an entry's examples
  with what each is of; `<EntryExamples>` / `renderEntryExamples` render them, in a
  given order if the page supplies one; `inlineExamples: false` stops them repeating
  under each payload.
- **Enums.** A small enum behind a `$ref` showed its values nowhere (the label is the
  type's name); now it has chips. An enum with documented values gets a row per value.
  `type` beside a `oneOf` of consts of that type restates them, so it no longer makes an
  intersection.
- **Content.** `groupMediaVariants` gives media types with the same schema one tab —
  `application/json` and a vendor alias of it — ignoring where in the spec each came
  from, and taking all their examples.
- A channel operation's direction badge sits in its heading ("Send ↑").

### What the map learnt

Defaults changed by looking at real pages next to Deepgram's reference:

- **Stacked field rows** (`fieldLayout: "stacked"`, now default): name, type,
  constraints and presence on one line, description below, a rule between fields.
  Descriptions get the width a name column took. `"columns"` and `"vertical"` remain.
- **`presence: "optional"`** (default) marks the exception rather than putting a red
  "required" on most rows. Names and types near-black, descriptions lighter.
- **Nested properties collapse** behind "Show N properties", which makes
  `expandRefs: "always"` usable — types inline, no Types section to jump to. Messages
  stay open: find-in-page must work.
- **Cards** for messages and the handshake, `size="1"`; headings inside a card step
  down so its title is the largest thing in it. Security alternatives stack like field
  rows. A single tab shows no tab bar. A row with no name is headed by its type.
- **Badges.** A direction is a round arrow with its label as a tooltip. Few colours:
  WebSocket has its own (cyan by default; the site passes its sidebar's teal), both
  directions share it, schemes and media types are grey.
- Field values shrink to their column (`min-width: 0` at every level), so a wide table
  in a description scrolls instead of widening the card; lists stack below `sm`.

### What stayed the site's

Deliberately not in the library, because they are this site's decisions or knowledge:
the session panel (a compact sequence diagram beside a channel — client left, server
right, the audio loop bracketed — whose order a spec cannot express); code samples from
`x-codeSamples` beside a REST operation; the close-code table and handshake responses as
MDX partials; a page per entry (`<SpeculoosReference entry="post-jobs">`) with the
entry's heading as the page's h1 (`hide_title`); the sidebar's badge colours; and a
`.rt-Code` reset for what Infima's global `code` style leaked into Radix.

### Docusaurus traps

Every Markdown file needs a front-matter `description` — partials too — or the site's
config exits the dev server. `unlisted: true` crashed (the site's `Admonition` map has no
`caution`). Headings rendered by components are not in Docusaurus's build-time TOC; the
pilot pages hide it.

### Open

- **A page per entry, generated.** A standalone script turning every entry into a stub
  page and a sidebar entry — deliberately not a Docusaurus plugin, since the site may not
  stay on Docusaurus.
- **Agent STT and Realtime as one spec**, two channels on one server. Same host, a shared
  vocabulary that has drifted: 13 message names in common, 4 identical; 21 schema names,
  none identical. Needs a drift-versus-real-difference pass and a single source of truth;
  moving Agent STT's house overlay to the Overlay standard goes with it.
- Smaller: a TOC helper; Infima typography leftovers; paragraph margins inside cards;
  tags as category headings; versioning; the maintenance policy for a second map.
