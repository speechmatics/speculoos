# @speculoos/asyncapi

AsyncAPI 2.x and 3.x, into the Speculoos IR.

```ts
import { load } from "@speculoos/loader";
import { buildAsyncApi } from "@speculoos/asyncapi";

const project = await load({ root: "specs", documents: [{ name: "realtime", path: "asyncapi.yaml" }] });
const ir = buildAsyncApi({ project });
```

Channels become endpoints, in the same IR an OpenAPI document produces, so one
renderer shows both. Operations carry their messages and a direction: AsyncAPI
2.x's `publish`/`subscribe` and 3.x's `send`/`receive` are written from the
application's point of view, and all normalise to the API consumer's, so a page
never depends on which version a spec happens to use. The same API written in
2.6 and in 3.0 produces the same IR.

Message payloads in JSON Schema (AsyncAPI's own schema format, or JSON Schema
itself) are lowered like any other schema. Server security, bindings and message
examples come along.
