The core design choice is that the IR describes **shapes a reader sees**, not **keywords an author wrote**. JSON Schema is a validation language: it lets you say the same thing many ways and lets you say things that have no visual form. The IR should have one way to say each displayable thing and an explicit escape hatch for the rest.

I've written the full type definitions as an annotated TypeScript file (below). Here is the reasoning behind the non-obvious parts.

## Two stages of translation, not one

Do the conversion in two steps, each simple on its own:

1. **Upcast:** convert each dialect to one canonical JSON Schema (roughly 2020-12). This is mechanical and lossless. Examples: OAS 3.0's `nullable: true` becomes `type: [X, "null"]`, boolean `exclusiveMinimum` becomes numeric, `example` becomes `examples: [...]`, draft-07 `definitions` becomes `$defs`, tuple-style `items: [...]` becomes `prefixItems`, and AsyncAPI's string `discriminator` becomes OpenAPI's `{ propertyName }` object.
2. **Lower:** convert canonical JSON Schema to the display IR. This is opinionated and lossy, but it only ever sees one dialect.

This split is what makes OpenAPI vs AsyncAPI manageable. All dialect knowledge lives in a small upcast function per format, and the lowering code never branches on where a schema came from.

## Key decisions in the IR

**Named types live in a registry and are referenced, never inlined.** Bundle the specs but keep `$ref`s. Every named schema (`components/schemas`, AsyncAPI `components/schemas` and message payloads) becomes a `TypeDef` with a stable ID derived from its JSON pointer. Inside a schema, a reference becomes a `ref` node pointing at that ID. This gives you:
- free recursion handling (no infinite expansion),
- the type names that make output readable ("`TranscriptionConfig`" rather than an anonymous blob),
- "referenced by" back-links,
- the choice to render inline or as a link, made in the renderer rather than baked into the data.

**Usage docs are separate from type docs.** In OAS 3.1 a property can be `{ $ref: "#/.../Language", description: "Language of the audio" }`. That description describes *this use* of `Language`, not the type itself. So `Property` carries its own `docs`, separate from the `TypeDef`'s `docs`. The renderer shows the property description first and the type description as a fallback. Most renderers get this wrong.

**Nullability is a flag, not a union.** `type: ["string", "null"]`, OAS 3.0 `nullable`, and `anyOf: [X, { type: "null" }]` all lower to node X with `nullable: true`. This is probably the most noticeable UX improvement, because "string | null" shown as a two-variant union looks clumsy.

**Unions get labels and discriminators at lowering time.** `oneOf` and `anyOf` become a `union` node. Each variant gets a label with a recorded source, tried in this order: the variant's `title`, then its ref name, then the discriminator mapping value, then a `const` value on the discriminating property, then "Option N". If there's no explicit discriminator but every variant is an object with a `const` on the same property, the discriminator is *inferred* and flagged `inferred: true`. Your Realtime API's `message` field is exactly this pattern, so the AsyncAPI side gets a proper "pick a message type" UI without any spec changes.

**Some idioms are collapsed into simpler nodes:**

| Source idiom | Becomes |
|---|---|
| `oneOf` where every branch is a `const` with a description | `enum` with documented members |
| Object with no `properties` and a schema for `additionalProperties` | `map` (a `Record<string, X>`) |
| `allOf` of compatible objects | merged `object`, plus `composedFrom` (for "extends X") |
| `allOf` that can't be merged | `intersection` (fallback) |
| Single-variant union | unwrapped to the variant itself |
| `{}` / `true` | `any` |
| `false` | `never` |

**`readOnly`/`writeOnly` are applied per view.** They're lifted onto `Property` as flags. A pure function, `projectForView(node, "request" | "response")`, removes properties that don't apply to that view. The IR stores one representation, and the REST wrapper asks for the view it needs.

**Unsupported constructs produce a node and a diagnostic.** Anything without a sensible display (`if/then/else`, `not`, `dependentSchemas`, `unevaluatedProperties`, `$dynamicRef`) becomes an `unsupported` node holding the raw schema and a reason, plus a `Diagnostic` with a stable code. The renderer shows a "raw schema" block for it, and CI fails on any diagnostic not explicitly allow-listed. This is the lint loop from before, built into the pipeline itself.

## What happens to each keyword

| Keyword(s) | Where it goes |
|---|---|
| `type` | node kind; `"null"` member → `nullable` |
| `properties`, `required` | `object.properties[]` (source order preserved) |
| `additionalProperties`, `patternProperties`, `propertyNames` | `object.additional` / `patternProperties`, or `map` |
| `items` / `prefixItems` | `array` / `tuple` |
| `enum`, `const` | `enum`, `const` |
| `oneOf`, `anyOf`, `discriminator` | `union` (or `enum` / nullable folding) |
| `allOf` | merged `object` with `composedFrom`, else `intersection` |
| `minLength`, `maximum`, `pattern`, `format`, `multipleOf`, `uniqueItems`, `minItems`, `contains`, `contentMediaType`… | typed `constraints` on the node |
| `title`, `description`, `deprecated`, `default`, `examples`/`example`, `externalDocs` | `docs` |
| `readOnly`, `writeOnly` | `Property` flags + view projection |
| `x-*` | `docs.extensions`, passed through for custom renderers |
| `dependentRequired` | a short note in `docs` (e.g. "requires `foo`") |
| `if/then/else`, `not`, `dependentSchemas`, `unevaluated*`, `$dynamicRef` | `unsupported` + diagnostic |
| `$id`, `$schema`, `$anchor`, `$comment`, `xml` | dropped |

## The translation pipeline

1. **Load & bundle** each document, keeping refs. Use `@asyncapi/parser` for AsyncAPI, and a bundler (not a full dereferencer) for OpenAPI.
2. **Upcast** every schema to canonical form.
3. **Collect** named schemas into the registry. Anonymous inline schemas get pointer-based IDs but aren't listed as top-level types.
4. **Lower** each schema with a recursive function that returns `Node` plus diagnostics, using refs to break cycles.
5. **Simplify** in small, separately tested passes over the IR, in a fixed order: nullable folding, const-union → enum, `allOf` merging, map detection, discriminator inference, single-variant unwrap.
6. **Validate** the result against a Zod mirror of the types, then write it out as JSON along with a diagnostics report.

Determinism comes from all of these being pure functions with stable ordering: source key order preserved, IDs derived from pointers, no timestamps. Snapshot-test the IR JSON itself, not the rendered HTML. That way renderer changes and IR changes show up as separate diffs.

## How the wrappers connect

The REST and WebSocket wrapper types are at the bottom of the file. Both reference schema `Node`s and never contain raw schema. One thing to settle in the wrapper layer is **message direction**. AsyncAPI 2.x `publish`/`subscribe` is written from the application's perspective, which is famously the inverse of what readers expect, and 3.0 changed it to `send`/`receive`. Normalise both to `"client-sends"` / `"server-sends"` from the API consumer's point of view, so the Realtime page doesn't depend on which AsyncAPI version the spec happens to use.

The types are in `schema-ir.ts`. A good next step is to sketch the lowering for two or three real schemas from your Realtime spec, such as `StartRecognition` and its config, before building any components. Doing that tends to show quickly whether the node set is right.
