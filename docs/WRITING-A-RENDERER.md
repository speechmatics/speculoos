# Writing a renderer

A renderer turns an `ApiIR` into a page. There are two in this repository —
`@speculoos/react` and `@speculoos/html` — and they share nothing but
`@speculoos/core`. That is deliberate: it is the only evidence that the IR is
not shaped around one of them.

This is what the second one taught us, written down before a third forgets it.

## What core already decided

Do not re-implement any of these. Each one is a place where getting it wrong
breaks a build rather than a page.

**Cycle detection and depth budgets.** `toTree` returns `children` already
resolved. `{ kind: "link" }` means "stop here and link to the target's own
section"; `{ kind: "cycle" }` means "expanding this would not terminate". A
renderer that decides these itself will hang on a self-referential schema.

**Docs precedence.** A property's description describes *this use* of a type;
the `$ref` target's describes the type. `FieldNode.docs` is already merged, most
specific first. Most renderers get this backwards.

**Anchors.** `TypeDef.slug` and `Operation.slug` are assigned over the completed
document in a fixed order, so two documents both defining `Job` do not collide.
Never call `slugify` on a name yourself — you will produce a different answer
than the one the links point at.

**Which rows to show.** `toFieldList(tree, layout)` drops an unnamed object root
(a row reading "(no name): object" tells a reader nothing) and hands back what
that dropped row was carrying in `composedFrom`. This used to live in the React
package, where the lifting was missed and composed types lost their "extends
BaseConfig" link.

**Link targets.** `HrefTarget` and `defaultHref` are in core, and both renderers
take the same `href` callback. A site should be able to write one function.

**Labels.** `typeLabel` is the string in the type column. `DIRECTION_LABEL`
spells a normalised direction. `formatValue` renders a literal.

## What is yours

Markup, class names, layout, and the three things core deliberately leaves out
of `chips` because they are not constraints:

```ts
if (field.nullable) /* "nullable" */;
if (field.children.kind === "cycle") /* "recursive" */;
if (field.children.kind === "link" && field.children.reason === "unresolved")
  /* "unresolved reference" */;
```

Also yours: **markdown**. `Docs.description` is raw CommonMark from an untrusted
document. Never render it, never sanitise it, and say so loudly in your README.
Take a function.

## The two shapes stay two shapes

`Operation` is a discriminated union. A request/response operation has a method,
a body and statuses; a message operation has a direction and a set of messages.
Switch on `kind` and render them differently. Folding them together produces a
lowest common denominator that reads like neither.

Likewise `Endpoint.addressKind`: "Path parameters" is wrong over a WebSocket
channel, so the heading follows the address, not the IR field name.

## Identity is not a label

Two traps, both of which have been fallen into:

- `Endpoint.id` namespaces an OAS 3.1 webhook as `webhook:name` so it cannot
  collide with a path. Show `endpoint.address` and a badge.
- `FieldNode.key` is unique within one tree, not within one page. Two operations
  can both have a `config/language`. Use it as a React key or a data attribute,
  not as an element id.

## Views

`MediaVariant.view` says which projection the content is. The adapter applied it
to inline structure but **could not reach through a `$ref`** — a registry entry
is shared by every view, and rewriting it would mean three copies of every type.
So the view travels with the content and you must pass it on:

```ts
toTree(variant.node, ir, { view: variant.view });
```

Without this, a `$ref`-valued request body shows its read-only fields.

## If you emit your own markup

`@speculoos/react` hands markup to a component map and so sidesteps all of this.
A string renderer owns it, and owes two things the class names cannot provide:

**Legibility without CSS.** Adjacent inline elements with no whitespace render
flush together — `limitintegerdefault: 20`. A flex gap hides it, which is why
`@speculoos/html` shipped it until someone read the page as text. Put a space
between inline siblings.

**Meaning in words, not only in classes.** A `spec-section--deprecated` class
says "deprecated" to a stylesheet and to nobody else. If a reader needs to know
it, write it.

## Prove it against another renderer

The highest-value test in this repository renders the same IR through both
renderers and compares *content, never markup*:

```ts
expect(fieldKeys(htmlOutput)).toEqual(fieldKeys(reactOutput));
expect(hrefs(htmlOutput)).toEqual(hrefs(reactOutput));
expect(sharedElementNames).toEqual([]); // guards against a vacuous pass
```

See `packages/react/test/parity.test.tsx`. If your renderer shows fewer fields
than another, one of you is dropping content — and historically it has been the
renderer, not the IR.

## Check it at scale

The fixtures will not find your performance or collision bugs. GitHub's REST
description — 823 endpoints, 1242 operations, 996 schemas — will. What to assert:

- no dangling same-page anchor (every `href="#x"` has an `id="x"`);
- no duplicate id;
- byte-identical output across two runs;
- rendering time and output size.

`@speculoos/html` renders all of it in ~660 ms. If yours takes minutes, you are
probably re-resolving refs per field.
