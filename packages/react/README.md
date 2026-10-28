# @speculoos/react

A headless React binding for the Speculoos IR.

**Descriptions in an API spec are raw CommonMark written by whoever wrote the
spec, and this package hands them to you untouched.** Rendering and
**sanitising** them is your `Markdown` component's job. Nothing here parses
markdown, escapes HTML, or will do it for you later — a renderer that
pre-rendered prose would be making a security decision on behalf of a site it
knows nothing about.

It also ships no styles, no CSS and no DOM. Every element on the page comes from
a component map you supply.

```tsx
<SpeculoosProvider ir={ir} components={components} options={{ maxDepth: 2 }}>
  <EntryList />
  <Operation id="createJob" />
  <Endpoint id="/v2/{language}" />
  <SchemaTable typeId="batch#/components/schemas/TranscriptionConfig" />
  <TypeSections />
</SpeculoosProvider>
```

## Entries: what a reference page is

An API reference is a list of **entries**, the unit a site gives a page and a
sidebar link:

- **A REST operation is an entry.** `POST /projects` is a page, rendered by
  `<Operation>`: its summary as the heading, method and path beside it, then
  parameters, request and responses.
- **A channel is one entry,** holding all its operations. `WSS /v2/{language}`
  is a page, rendered by `<Endpoint>`: its address (or title), the protocol where
  a method would stand, the shared parameters once, then **Send** and
  **Receive** — the parts a request and response play on a REST page.

`apiEntries(ir)` in `@speculoos/core` lists them in document order;
`useEntries()` is the hook; `<Entry entry={e} />` renders either kind;
`<EntryList>` is the sidebar. Routing one page per entry is two pieces:

```tsx
import { apiEntries, entrySlug } from "@speculoos/core";

// Pages: one per entry.
apiEntries(ir).map((e) => ({ path: `/api/${entrySlug(e)}`, render: () => <Entry entry={e} /> }));

// Links: tell Speculoos where things live. An operation's target carries its
// endpoint, so one on a channel can point at the channel's page and its anchor.
const href = (t: HrefTarget) =>
  t.kind === "operation"
    ? t.endpoint.addressKind === "channel"
      ? `/api/${t.endpoint.slug}#${t.operation.slug}`
      : `/api/${t.operation.slug}`
  : t.kind === "endpoint" ? `/api/${t.endpoint.slug}`
  : t.kind === "type" && t.def ? `/api/types#${t.def.slug}`
  : t.kind === "external" ? t.url
  : undefined;
```

### Examples beside the reference

`<EntryExamples entry={e} />` gathers every example on an entry — a REST
operation's request and response examples, a channel's message examples — into
one section, each labelled by what it is of ("Send StartRecognition", "200
Response"). It is for a panel beside the reference, as Stripe and Deepgram lay
theirs out. Set `inlineExamples: false` on the provider so they are not shown
under each payload as well. `entryExamples(entry)` in `@speculoos/core` is the
same list as data.

A channel with no operations — typically an AsyncAPI reply-only address, whose
reply is already shown inside the operation that expects it — is not an entry,
though `<Endpoint id>` still renders it. `<Endpoint>` also works on a REST path,
for a site that wants all of a path's methods on one page.

## The component map

Twelve components, all required. There are no defaults, because a default is a
style decision taken on your behalf and it hides a slot you forgot to fill.

| Component | Where it appears |
|---|---|
| `Section` | Every titled region: an operation, a type, a tag, a response |
| `Markdown` | Descriptions. **Sanitise here.** |
| `Code` | Short literals: a field name, a type, a path template |
| `CodeBlock` | Example payloads |
| `Badge` | Constraint chips, methods, statuses, direction, media types. `tone` says which kind; `value` says which one (`"get"`, `"200"`) |
| `Link` | Type links, operation links, external docs |
| `Fields` | Wraps a set of field rows. A table, a grid or a definition list — your call |
| `FieldRow` | One property, parameter or response header |
| `Tabs` | Media types, response statuses, message variants, examples |
| `List` / `ListItem` | Operation lists, security alternatives, back-links |
| `Empty` | Where the IR has nothing to show |

`FieldRow` gets both halves of what it needs: `name`, `type`, `chips` and `docs`
arrive already built from *your* `Code`, `Link`, `Badge` and `Markdown`, so a row
only has to decide where things go — and `field` carries every underlying value
for when that is not enough.

There is deliberately no `Disclosure`. A `FieldRow` already receives its nested
rows as `children`, so whether to collapse them is a decision that is already
yours and already in the right place.

## Recursion

`FieldNode.children` arrives resolved. `"link"`, `"cycle"` and depth truncation
are decisions `@speculoos/core` has already taken, so nothing here — and nothing
you write — implements a depth budget or cycle detection. Get that wrong once and
a self-referential schema hangs the build.

```tsx
const Field = ({ f }: { f: FieldNode }) => (
  <Row name={f.name} type={f.typeLabel}>
    {f.children.kind === "inline" && f.children.nodes.map((c) => <Field key={c.key} f={c} />)}
  </Row>
);
```

## Options

| Option | Default | What it decides |
|---|---|---|
| `href` | `#slug` | Where links point. Replace this and nothing else for a page-per-entry site — see Entries. |
| `layout` | `"tree"` | `"rows"` hands `Fields` a flat pre-order list carrying `depth`, for design systems that cannot nest a row inside a row. |
| `expandRefs` | `"never"` | `"depth"` or `"always"` inline referenced types instead of linking to them. |
| `maxDepth` | `2` | Only consulted when `expandRefs` is `"depth"`. |
| `headingLevel` | `2` | The level the outermost `Section` renders at; nested sections count up. |
| `untaggedLabel` | `"Other"` | Bucket name for operations carrying no declared tag. |
| `inlineExamples` | `true` | Render examples under the payload they belong to. Turn off when the page uses `<EntryExamples>`. |

## Hooks

`useFieldTree`, `useFieldRows`, `useEntries`, `useEndpoint`, `useEndpoints`, `useOperation`, `useOperations`, `useTagGroups`,
`useTypeLabel`, `useTypeDef`. Everything the shipped components do goes through
these, so writing your own markup entirely is not a lesser path:
`SchemaTable` is forty lines over `useFieldTree`.

## Parts for your own sections

To lay a page out your own way — a panel beside the reference, a schema table in
a guide — without giving up the map:

| Part | What it is for |
|---|---|
| `useComponents()` | The map in context, to render through the same `Section`, `Badge` or `Code` the shipped components use |
| `useHref(target)` | Where a link target points, through the `href` option, so your links agree with the page's |
| `<DocsBody docs>` | A `Docs`' description and external link, through the map's `Markdown` and `Link` |
| `<FieldRows fields nested>` | Field rows from `useFieldRows`/`toFieldList`, through `FieldRow` — the body of a `SchemaTable` |
| `<SchemaTable node expanded>` | A whole field table for any node, not only a named type. `expanded` starts nested rows open, for a table whose point is its nesting, such as one property shown on its own |

## Views

Request bodies hide `readOnly` fields and responses hide `writeOnly` ones — but
an adapter cannot project through a `$ref`, because one registry entry is shared
by every view. So the view travels with the content, and you pass it on:

```tsx
<SchemaTable node={variant.node} view={variant.view} />
```

`<Operation>` already does this. If you build your own, forgetting it is how a
request body ends up advertising server-assigned ids.
