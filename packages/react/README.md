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
  <OperationList />
  <Operation id="createJob" />
  <SchemaTable typeId="batch#/components/schemas/TranscriptionConfig" />
  <TypeSections />
</SpeculoosProvider>
```

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
| `href` | `#slug` | Where links point. Replace this and nothing else for a page-per-operation site. |
| `layout` | `"tree"` | `"rows"` hands `Fields` a flat pre-order list carrying `depth`, for design systems that cannot nest a row inside a row. |
| `expandRefs` | `"never"` | `"depth"` or `"always"` inline referenced types instead of linking to them. |
| `maxDepth` | `2` | Only consulted when `expandRefs` is `"depth"`. |
| `headingLevel` | `2` | The level the outermost `Section` renders at; nested sections count up. |
| `untaggedLabel` | `"Other"` | Bucket name for operations carrying no declared tag. |

## Hooks

`useFieldTree`, `useFieldRows`, `useOperation`, `useOperations`, `useTagGroups`,
`useTypeLabel`, `useTypeDef`. Everything the shipped components do goes through
these, so writing your own markup entirely is not a lesser path:
`SchemaTable` is forty lines over `useFieldTree`.

## Views

Request bodies hide `readOnly` fields and responses hide `writeOnly` ones — but
an adapter cannot project through a `$ref`, because one registry entry is shared
by every view. So the view travels with the content, and you pass it on:

```tsx
<SchemaTable node={variant.node} view={variant.view} />
```

`<Operation>` already does this. If you build your own, forgetting it is how a
request body ends up advertising server-assigned ids.
