# @speculoos/core

The Speculoos intermediate representation, `ApiIR`, and the pure operations
every renderer would otherwise write for itself.

Adapters (`@speculoos/openapi`, `@speculoos/asyncapi`) produce an `ApiIR`;
renderers (`@speculoos/react`, `@speculoos/html`, or your own) consume one. This
package is the contract between them, and has no runtime dependencies.

```ts
import { apiEntries, entrySlug, typeLabel, type ApiIR } from "@speculoos/core";

declare const ir: ApiIR;

// One entry per REST operation, one per WebSocket channel: a page each, if you like.
for (const entry of apiEntries(ir)) {
  console.log(entrySlug(entry), entry.kind);
}
```

## What is in it

- **The IR's types.** `ApiIR` and everything under it: endpoints (paths and
  channels alike), operations, messages, named types and their `Node` trees,
  security, servers and diagnostics. `irVersion` is `1`, and only additive,
  optional fields join it.
- **Navigation.** `apiEntries`, `allOperations`, `groupByTag`, `walk`,
  `resolveRef`, `endpointUrl`, `entryExamples` and friends.
- **Presentation.** `toTree`/`toRows`/`toFieldList` turn a schema into the rows
  a field table shows; `typeLabel` writes `string | null` and
  `"a" | "b"`; `chipsFor` gives constraints as badges. Each takes the same
  decisions for every renderer, so two renderers over one IR agree.
- **Links and slugs.** `defaultHref`, `slugify`, `createSlugger`.
- **Diagnostics.** The catalogue of codes an adapter can report:
  [`docs/DIAGNOSTICS.md`](../../docs/DIAGNOSTICS.md).

## Validating an IR

```ts
import { parseApiIR, validateApiIR } from "@speculoos/core/validate";

const ir = parseApiIR(JSON.parse(text)); // throws, listing the first few problems
const { valid, errors } = validateApiIR(value);
```

`./validate` needs `ajv` (an optional peer dependency); the rest of the package
does not. The IR's JSON Schema itself is `@speculoos/core/schema.json`.
