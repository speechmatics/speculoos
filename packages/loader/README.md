# @speculoos/loader

Loads a project of OpenAPI and AsyncAPI documents and resolves `$ref`s across
them, into one registry an adapter builds from.

```ts
import { load } from "@speculoos/loader";

const project = await load({
  root: "specs",
  documents: [{ name: "batch", path: "batch.yaml" }],
});
```

- **Documents have names.** A document's `name` appears in every type id the IR
  gives it, and so in URLs. It is yours to choose, and never derived from a
  filesystem path, so ids do not change when the checkout moves.
- **Referenced documents load themselves.** A `$ref` into `common.yaml` brings
  `common.yaml` into the project.
- **Remote `$ref`s are off by default.** Fetching arbitrary URLs during a docs
  build is a supply-chain risk; pass `allowRemoteRefs: true` to ask for it.
- **The dialect is detected** (`detectDialect`): OpenAPI 3.0 or 3.1, AsyncAPI 2.x
  or 3.x. Swagger 2.0 is refused by name: convert it to OpenAPI 3 first, for
  example with `swagger2openapi`.

YAML and JSON are both read; documents can also be passed as `content` rather
than a `path`. Reading from disk makes this package Node-only.
