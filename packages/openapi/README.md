# @speculoos/openapi

OpenAPI 3.0 and 3.1, into the Speculoos IR.

```ts
import { load } from "@speculoos/loader";
import { buildOpenApi } from "@speculoos/openapi";

const project = await load({ root: "specs", documents: [{ name: "api", path: "openapi.yaml" }] });
const ir = buildOpenApi({ project });

for (const d of ir.diagnostics) console.warn(d.code, d.message);
```

Paths and webhooks become endpoints, each operation with its parameters, request
body and responses by media type; schemas become named types; security schemes,
servers, tags, examples and links come along. What the IR cannot represent is
reported as a diagnostic ([`docs/DIAGNOSTICS.md`](../../docs/DIAGNOSTICS.md)),
never silently dropped.

**Swagger 2.0 is not supported.** Convert it to OpenAPI 3 first, for example
with `swagger2openapi`; the loader refuses it by name rather than misreading it.

Then render the IR with `@speculoos/react`, `@speculoos/html`, or your own
renderer; or build it from the command line with `@speculoos/cli`.
