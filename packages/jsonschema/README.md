# @speculoos/jsonschema

JSON Schema, from any dialect a spec might use, into the Speculoos IR's `Node`
trees and named types.

Two steps. **Upcast** brings each dialect — OpenAPI 3.0's schema object, 3.1's,
AsyncAPI's — to canonical JSON Schema 2020-12, so `nullable: true`,
`exclusiveMinimum: true` and `type: [x, "null"]` all mean one thing. **Lower**
then turns canonical JSON Schema into IR nodes, keeping docs, constraints,
`$ref`s as references to named types, and reporting what it cannot represent as
diagnostics rather than dropping it.

This package is for adapter authors: `@speculoos/openapi` and
`@speculoos/asyncapi` are built on it. If you are rendering a spec, you want one
of those instead.

```ts
import { buildSchemas } from "@speculoos/jsonschema";

// `project` is a loaded project (@speculoos/loader); the dialect says how to upcast.
const schemas = buildSchemas({ resolver: project, dialect: "openapi-3.1" });
const node = schemas.lowerInline(rawSchema, location);
```

See [`docs/WRITING-AN-ADAPTER.md`](../../docs/WRITING-AN-ADAPTER.md).
