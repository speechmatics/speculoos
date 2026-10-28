# @speculoos/adapter-kit

The shared half of writing a Speculoos adapter: the helpers `@speculoos/openapi`
and `@speculoos/asyncapi` both use, so a third dialect does not start from
nothing.

- `deref`, `refName` — follow a `$ref` and name what it points at.
- `docsOf`, `extensionsOf` — lift description, summary, examples, deprecation
  and `x-` extensions into the IR's `Docs`.
- `securityFromMaps` — security requirements, as alternatives of combinations.
- `loc`, `diagnostic` — source locations and diagnostics that point at the
  right place in the right document.
- `protocolOf`, `anyNode`, `optional` — small things every adapter needed.

How to write an adapter, and what the IR expects of one:
[`docs/WRITING-AN-ADAPTER.md`](../../docs/WRITING-AN-ADAPTER.md).
