# Writing an adapter

An adapter turns one dialect's documents into an `ApiIR`. There are two —
`@speculoos/openapi` and `@speculoos/asyncapi` — and the second one is why the
shared pieces live in `@speculoos/adapter-kit` rather than being copied.

The exit criterion that mattered for AsyncAPI was this: **the same API written
in AsyncAPI 2.6 and 3.0 must produce the same IR.** It does, deep-equal after
stripping `source` and `provenance`. Hold yourself to the equivalent.

## The division of labour

| Package | Owns |
|---|---|
| `@speculoos/loader` | Reading files, parsing, resolving `$ref` to a `SourceLocation` |
| `@speculoos/jsonschema` | Everything schema-shaped: `lower`, the type registry, slugs |
| `@speculoos/adapter-kit` | The document *around* the schemas: docs, deref, security, protocols |
| your adapter | The dialect's own shape |

If you find yourself lowering a schema, stop — `@speculoos/jsonschema` does
that, and the registry it builds is what makes two documents sharing a schema
land on one `TypeId`, one entry and one anchor.

## The rules the IR holds you to

**1. An address with parameters carrying operations is an `Endpoint`.** An
OpenAPI Path Item and an AsyncAPI Channel are the same idea. Unify them, and a
docs site with both a REST and a WebSocket API gets one navigation model.

**2. Operation *shapes* are not unified.** `Operation` is a discriminated union.
REST is request/response; a channel is a long-lived connection carrying messages
both ways. Do not invent a common denominator.

**3. Nothing holds raw schema.** Everything schema-shaped is a `Node`.

**4. Descriptions are CommonMark strings, never pre-rendered and never
sanitised.** Specs are untrusted input. Sanitising is the renderer's job.

**5. Normalise to the API consumer's point of view.** AsyncAPI 2.x `publish`
means *the application publishes*, which is the opposite of what a reader
expects. `Direction` is always what the consumer does. This is the single
highest-value thing the AsyncAPI adapter does.

## Identity

`TypeId` is `document#pointer` and follows the **definition's** canonical
location, never the referrer's. Document names end up in every `TypeId` and
therefore in every URL, so they are caller-supplied and stable — never derived
from an absolute filesystem path.

Slugs are assigned by a single slugger over the completed registry in a fixed
order, because collisions cannot be broken per type. Adapters do this once at
the end; renderers read `TypeDef.slug` and never derive anchors.

Namespace anything that could collide — OAS 3.1 webhooks become
`webhook:name` — and remember that is identity, not a label. Renderers are told
to show `address` and a badge instead.

## Views

Apply `projectForView` to inline structure and record which view the content is
in `MediaVariant.view`. You **cannot** reach through a `$ref`: a registry entry
is shared by every view, and rewriting it would mean three copies of every type.
The view travels with the content and renderers pass it on.

## Diagnostics, not guesses

Every lossy decision gets a `Diagnostic` with a stable code from
[the catalogue](./DIAGNOSTICS.md). Adding a code means adding it to
`packages/core/src/diagnostics.ts`; a test asserts that nothing is emitted which
is not in the table, and `speculoos lint --allow` warns on a code it does not
know.

Two patterns worth copying:

- **Never drop a field silently.** An unsupported keyword produces an
  `unsupported` node carrying its reason, and whatever else the schema said
  still renders. The reason reaches the page, not just the report.
- **Never guess at a conflict.** Two `allOf` branches that cannot merge become
  an `intersection` plus `ALLOF_CONFLICT`, not a coin flip.

## What adapter-kit gives you

```ts
import {
  loc, diagnostic, optional,   // boilerplate
  deref, refName,              // structural $refs — not schema refs
  docsOf, extensionsOf,        // Docs, including x- extensions
  securityFromMaps,            // the OR-of-ANDs shape
  protocolOf, anyNode,
} from "@speculoos/adapter-kit";
```

`deref` is for structural refs — a path item, a parameter, a response, a
message — which have no display identity of their own. **Schema refs are not
followed this way**: those become `RefNode`s so the registry keeps the type's
name, and so a renderer can link to it.

`optional` exists because the repo runs with `exactOptionalPropertyTypes`, where
`{ x: undefined }` is not the same as `{}`.

## Testing it

1. **Round-trip across versions of your dialect**, if it has more than one.
   Deep-equal the IRs after stripping `source` and `provenance`.
2. **Assert the exact `Node.kind` set.** There is a test that does this. A new
   dialect should not need a new kind — if yours does, that is a conversation
   about the IR, not a quiet addition.
3. **Render it.** Both renderers take any valid `ApiIR`. If a page comes out
   empty, your adapter produced something structurally valid and semantically
   wrong, which no type-check will catch.
4. **Run it against a real spec,** not a fixture. The two defects that most
   affected output were both found by building GitHub's 13.5 MB description and
   reading what came out.
