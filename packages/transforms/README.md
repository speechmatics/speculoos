# @speculoos/transforms

IR in, IR out. This is where "fits my docs site" gets resolved.

Without it, the only way to hide an internal endpoint or reorder the navigation
is to fork an adapter — and a forked adapter stops tracking the dialect it
parses.

```ts
import { applyTransforms, filterByTag, hideInternal, pruneUnreachableTypes } from "@speculoos/transforms";
import { parseApiIR } from "@speculoos/core/validate";

const ir = applyTransforms(
  source,
  [hideInternal(), filterByTag(["Jobs"]), pruneUnreachableTypes()],
  { validate: parseApiIR },
);
```

A transform is `(ir: ApiIR) => ApiIR`. That is the whole contract, so your own
one-off pass is a first-class citizen alongside the built-ins. Every pass is
pure and returns a new document; none mutates its input.

## Built-ins

| Pass | What it does |
|---|---|
| `hideWhere(predicate)` | Drops endpoints, operations, tags or named types the predicate selects |
| `hideInternal(key?)` | `hideWhere` for the common case: a truthy `x-internal` on the thing itself |
| `filterByTag(tags, opts?)` | Keeps only operations carrying one of `tags`, and reorders the navigation to match |
| `sortTags(order, opts?)` | Reorders `ir.tags`, which *is* the navigation order |
| `renameTypes(map)` | Renames named types and reassigns their slugs |
| `redactExamples()` | Empties every `examples` array in the document |
| `pruneUnreachableTypes()` | Drops named types no endpoint can reach |

## Writing your own pass

A pass is `(ir: ApiIR) => ApiIR`, so it is a function you write. The parts the
built-ins are made of are exported for it:

| Part | What it is for |
|---|---|
| `recomputeReferencedBy(schemas)` | Any pass that removes an operation or a type must call this, or "referenced by" lists point at things that are gone |
| `reachableTypes(ir)` | The types reachable from the endpoints, chased through the registry |
| `endpointNodes(endpoint)` | Every `Node` an endpoint owns directly, callbacks included |
| `typesIn(node)` | The types a node names: `$ref` targets and `allOf` ancestors |
| `TransformError` | What `applyTransforms` throws, naming the pass, when `validate` finds invalid IR |

## Things worth knowing

**`renameTypes` does not change a `TypeId`.** An id is source identity: every
`RefNode.target` quotes it and `SourceLocation` agrees with it. `name` and `slug`
are presentation, and presentation is what a docs site wants to override. Keeping
the two apart means a rename cannot break a reference. Types you *didn't* rename
keep the slug they already had, because those are URLs somebody has linked to.

**`redactExamples` is a structural pass, not a walk of the places the IR puts
examples.** That is the point: an enumerated walk that misses one site leaks
exactly the thing you asked to remove. The IR carries examples on `Docs`, on
`MediaVariant` and on `WsMessage` — and `Docs` hangs off almost everything — plus
two pass-through bags (`Docs.extensions`, `bindings`) whose contents are by
definition unknown. `default` and `const` are left alone — those are part of the
contract, not illustrations of it.

**`pruneUnreachableTypes` is what makes `filterByTag` honest.** Filter the GitHub
REST description to one tag and you keep 200 of 1242 operations — and, without
pruning, all 996 schemas, so a renderer emitting a section per type emits 895
pages nothing links to. It is a separate pass because reachability is not always
what you want: a published schema registry is a legitimate reason to keep
unreferenced types.

**Removing things rewrites the back-links.** Any pass that drops an operation or
a type recomputes `TypeDef.referencedBy`, or the "referenced by" list on a page
points at things that are no longer in the document.

**Validation is a parameter, not a built-in.** `applyTransforms` takes
`{ validate }` and you hand it `parseApiIR`. Validation needs `ajv`, this package
has no runtime dependencies, and someone running one cheap pass over a 13 MB IR
should not pay for a schema compilation they did not ask for. When it does fire,
the error names the pass:

```
Transform renameTypes (step 3) produced invalid IR:
  /schemas/batch#~1components~1schemas~1Job/slug must be string
```

By the time a pipeline of six passes produces invalid IR, "which one" is the only
question worth answering.
