# @speculoos/html

A framework-free HTML renderer for the Speculoos IR. Strings in, strings out —
no DOM, no React, no bundler, no runtime. For Hugo, Jekyll, Eleventy, Astro and
anything else that builds a page by concatenating markup.

> **It does not sanitise markdown.** Descriptions come from a document you did
> not write and arrive as raw CommonMark. Pass `renderMarkdown`; whatever it
> returns is written into the page verbatim. Leave it unset and the source text
> is escaped and shown as-is — safe, and obviously unfinished.

> **It ships no CSS.** It emits [documented class names](#class-names) and
> nothing else. There is no stylesheet in this package and there never will be.

## Install

```sh
npm install @speculoos/html
```

## Use

```ts
import { renderApi, renderNav, renderOperation } from "@speculoos/html";
import MarkdownIt from "markdown-it";

const md = new MarkdownIt({ html: false }); // `html: false` is the safe part
const renderMarkdown = (src) => md.render(src);

// The whole document as one fragment — operations grouped by tag, plus the
// type sections its $ref links point at.
const body = renderApi(ir, { renderMarkdown });

// Or the pieces, for a site with a sidebar and a page per operation.
const nav = renderNav(ir, { renderMarkdown });
const one = renderOperation(entry, ir, { renderMarkdown, href: myHref });
```

Everything returns a fragment, never a document: no `<html>`, no `<head>`, no
stylesheet link. Paste it into whatever is already building your pages.

## Entry points

| Function | Renders |
|---|---|
| `renderApi(ir, opts)` | Title, servers, every operation grouped by tag, every named type |
| `renderNav(ir, opts)` | The operation index, grouped by tag |
| `renderOperation(entry, ir, opts)` | One operation and everything hanging off it |
| `renderOperationById(id, ir, opts)` | The same, looked up by `operation.id` |
| `renderType(def, ir, opts)` | One named type, as the section its links point at |
| `renderTypes(ir, opts)` | Every named type under one heading |
| `renderSchema(node, ir, opts)` | A field table for one node |

## Options

| Option | Default | |
|---|---|---|
| `renderMarkdown` | escape only | CommonMark → HTML. **Yours to sanitise.** |
| `href` | `#slug` | Where links point. Shared with `@speculoos/react`. |
| `classPrefix` | `"spec"` | Prefix on every class name. |
| `headingLevel` | `2` | Heading level of the outermost section. |
| `expandRefs` | `"never"` | `"never"` \| `"depth"` \| `"always"` |
| `maxDepth` | `2` | Only when `expandRefs` is `"depth"`. |
| `layout` | `"tree"` | `"tree"` nests children; `"rows"` flattens with `data-depth`. |
| `idPrefix` | `""` | Namespaces generated ids, for more than one IR on a page. |

## Anchors

Anchors come from the IR's own slugs, which are assigned project-wide so two
documents defining `Job` do not collide. This package never derives one.

That means **every `$ref` link needs a type section to point at.** `renderApi`
emits them; if you call `renderOperation` yourself, call `renderTypes` too, or
set `href` to point at wherever your site puts them. `includeTypes: false`
exists for exactly that case and will otherwise leave you with dead links.

## Class names

Every class is `{prefix}-{block}` with modifiers as `{prefix}-{block}--{mod}`.
The full catalogue is `CLASSES`, exported from the package and asserted against
real rendered output by the test suite — a class cannot be emitted without
being documented.

```ts
import { CLASSES, classNames } from "@speculoos/html";
classNames("spec"); // every name this package can emit
```

`language-json` on a `<code>` is deliberately *not* prefixed: it is what Prism,
highlight.js and Shiki look for. It is listed in `INTEROP_CLASSES`.

### Field tables are lists

A schema is a tree, and `<tr>` cannot contain `<tr>`. So a field table is a
`<ul class="spec-fields">` of `<li class="spec-field">`, which nests natively
and reads correctly to assistive technology. Six lines of CSS grid make it look
like a table — and those six lines are yours, which is the point.

Each field carries `data-key`, `data-path`, `data-depth`, and `data-in` for a
parameter.

### Badges

`spec-badge--method` says a badge is an HTTP method; `data-value` says which —
`get`, `delete`. Status, direction, protocol, media type and security scheme
badges carry it too, so colouring by value is an attribute selector rather than
a class per method:

```css
.spec-badge--method[data-value="get"]    { background: #e6f6ec; }
.spec-badge--method[data-value="delete"] { background: #fdecec; }
```

### Tabs

There are none. HTML has no tabs without script, and shipping script would make
this a site generator. What you get is `spec-group`: a labelled list of
regions, all present, all findable by in-page search, with class names to turn
into tabs or an accordion if you want them.

## Seeing it

The repository has a preview harness that renders the fixtures and styles them
with a demo stylesheet built *only* from the documented class names:

```sh
pnpm preview:serve   # http://localhost:8137
```

It is not part of this package. Its job is to prove the class names are enough,
and to let a human look at the output — which is how two rendering defects were
found.

## Relationship to @speculoos/react

They share `@speculoos/core` and nothing else. A test in `@speculoos/react`
renders the same IR through both and asserts they show the same fields and link
to the same places, with no element name in common. If you are choosing: React
when a design system owns the markup, this when the page is a string.
