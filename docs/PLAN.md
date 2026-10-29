# Speculoos — delivery plan

> Status: draft. Written 2026-10-22, before any implementation.
> Source material: `packages/core/src/index.ts`, `packages/core/src/IR-notes.md`.

## 1. What this is

Rendering API specs today is an `m × n` problem: `m` spec dialects (OpenAPI 3.0/3.1,
AsyncAPI 2.x/3.x, bare JSON Schema) against `n` rendering strategies. Every existing
tool picks one point in that grid and ships its own visual design with it.

Speculoos puts an **Intermediate Representation** in the middle, turning `m × n` into
`m + n`. Adapters lower dialects into the IR; renderers consume the IR. Neither knows
about the other. The IR describes *shapes a reader sees*, not *keywords an author wrote*.

The product promise: **you already have a docs site and a design system; you want your
API specs to render inside it without parsing anything yourself.**

That promise implies two non-negotiables:

- The IR must be rich enough that a renderer never needs to reach back to the raw spec.
- Core must ship the parts every renderer would otherwise reimplement (type labels, row
  flattening, expansion policy), so "bring your own components" doesn't mean "rewrite the
  hard 300 lines".

## 2. Architecture

```
  spec documents
        │
        ▼
  ┌───────────────┐
  │    loader     │  a PROJECT of N documents: parse YAML/JSON,
  │               │  bundle $refs (do NOT dereference), one shared registry
  └───────┬───────┘
          ▼
  ┌───────────────┐
  │   adapters    │  openapi · asyncapi · jsonschema
  │               │  per-dialect UPCAST → canonical 2020-12
  └───────┬───────┘
          ▼
  ┌───────────────┐
  │    lowering   │  canonical JSON Schema → IR nodes  (shared, dialect-blind)
  │  + simplify   │  ordered pure passes
  └───────┬───────┘
          ▼
  ┌───────────────┐
  │   ApiIR       │  ← the contract. JSON, deterministic, versioned.
  └───────┬───────┘
          │
    ┌─────┴─────┬──────────────┐
    ▼           ▼              ▼
 presentation  transforms   validate
 (FieldNode,   (user IR→IR  (JSON Schema
  labels,       passes)      GENERATED from
  expansion)                 the TS types,
    │                        CI lint gate)
    ▼
 renderers: react · html · (vue, svelte, web components — later)
```

Three rules that fall out of this diagram:

1. **Core is dependency-free.** Types plus pure functions. No YAML, no fs, no React, no Zod
   in the default export. Everything left of `ApiIR` is build-time and Node-only.
2. **Dialect knowledge stops at the upcast boundary.** Lowering code never branches on
   where a schema came from. If it does, the upcast is incomplete.
3. **The IR is the only supported contract between halves.** Renderers pin an IR major
   version; adapters emit one. Neither imports the other.

## 3. Decisions taken

Design decisions settled since the first draft, with the gap each one closes:

| Gap | Decision |
|---|---|
| No document-level IR | `ApiIR` is the root and the emitted file format |
| OpenAPI path vs AsyncAPI channel | Lifted into one `Endpoint` concept; operation shapes stay distinct |
| Renderer contract undefined | Component map, fed by a resolved `FieldNode` model from core |
| Type-label generation | One configurable pure function, `typeLabel(node, ir, opts)`, sane defaults |
| Inline vs link vs expand | `ViewOptions` on `toTree`/`toRows`; cycles resolved before the renderer sees them |
| Build-time vs runtime | **Build-time only.** Adapters may use heavy Node deps freely |
| Extension points | Ordered pure `ApiIR -> ApiIR` transforms, user-supplied |
| Anchors | Slugs assigned project-wide during build, stored on `TypeDef.slug` |
| Untrusted input | Core never sanitizes, never pre-renders markdown. No exceptions |
| Validator duplication | **JSON Schema generated from the TypeScript types**, Ajv behind `@speculoos/core/validate`. No hand-written mirror, so no drift |
| Multi-document | **A build takes a project of N documents**, not a document. Registry is project-wide |

### Deliberately kept simple

This is a presentation pipeline, not a codegen pipeline. Codegen tooling accumulates
"constrained models", naming strategies and language-specific intermediate layers because
it must produce compilable output. Speculoos must produce something a human reads. When a
choice arises between a general mechanism and a simple one, take the simple one and let a
transform cover the rest.

### Open decisions

- **OD-1 (blocks M4):** Which renderer first? Recommendation: React.
  Decision: React first, others following. Note that we will ultimately want multiple ways to render with React (i.e. with different React component libs)
  *Resolved in M4: the component map is how "multiple ways to render with React" works —
  there is one React package and a map per library, not a package per library. The reference
  integration is a deliberately minimal fake map rather than a real component library,
  because a fake can prove nothing is hardcoded in a way a real library cannot: with a real
  one you can never tell whether it works* because *of its conventions. Two unrelated fake
  maps render the same IR in the tests.*
- **OD-2 (blocked M5; resolved):** Synthesised examples and code samples (curl/fetch/python) in scope?
  Recommendation: yes, but post-1.0 as a separate package. They are pure functions over
  `ApiIR`, so deferring costs nothing provided the IR keeps `format`, `const` and `default`.
  Decision: Descope for now, but keep path to support. *Re-checked before the M5 freeze:
  everything a synthesiser needs is in the IR except OAS operation-level `servers` and
  multipart `encoding`, both of which are additive optional fields and so do not block
  `irVersion: 1`. The path is genuinely open.*
- **OD-3 (blocks M2):** OpenAPI 2.0 (Swagger)? Recommendation: no — external converters exist and the upcast surface roughly doubles.
  Decision: No Swagger 2 support. Rely on converters. *Implemented: `detectDialect`
  recognises `swagger: "2.0"` and refuses it by name, pointing at converters, rather than
  failing with "declares neither openapi nor asyncapi".*

*Settled:* build-time only; no markdown pre-rendering; endpoint unification; project-level
multi-document builds.

## 4. Cross-cutting conventions

**Build-time only.** Speculoos runs in a build step and emits `ApiIR` as JSON. Nothing in
the pipeline is designed to run in a browser against a user-supplied spec. This is what lets
adapters depend on `js-yaml`, `@asyncapi/parser` and friends without apology, and it makes
snapshot testing the natural verification strategy. Core nonetheless stays free of Node
built-ins, which costs nothing and keeps a playground possible later. If a renderer ships IR
to the client for search or filtering, it slices per page; whole-document IR is a disk
artifact, not a bundle artifact.

**Determinism.** Same inputs → byte-identical IR JSON. Source key order preserved, never
sorted. IDs derived from JSON pointers. No timestamps, no absolute paths, no `Date.now()`,
no iteration over unordered `Set`/`Map` without an explicit sort. CI asserts this by
building twice and diffing.

Note that **slugs cannot be computed per type in isolation**: two documents in one project
may both define `Job`, so collisions must be broken against the whole registry. Slugs are
therefore assigned once during the build, in registry order, and stored on `TypeDef.slug`.
Renderers read that field; they never derive anchors themselves.

**Lossy, never silently.** Anything not representable becomes an `UnsupportedNode` *and*
a `Diagnostic` with a stable code. No exceptions to this rule.

**Diagnostic codes are public API.** Catalogued in `docs/diagnostics.md`, screaming-snake,
never renamed within a major. Consumers allow-list them in CI.

**Testing layers.** (a) Unit tests per simplification pass. (b) Snapshot tests of IR JSON —
*never* of rendered HTML, so renderer and IR changes show up as separate diffs. (c) A
conformance suite every adapter must pass. (d) Type-level tests (`expectTypeOf`) asserting
the Zod mirror matches the hand-written types.

**IR versioning.** `irVersion` is a single integer. Additive optional fields and new
diagnostic codes are minor. New `Node.kind` members, removed/renamed fields, and changed
lowering semantics that alter existing snapshots are major. Renderers declare a supported
`irVersion` range and fail loudly outside it.

**Security.** Spec files are untrusted input. Core never sanitizes, never pre-renders
markdown, never resolves remote `$ref`s without explicit opt-in. Every renderer package
documents its sanitisation requirement in its README. The React binding ships no
`dangerouslySetInnerHTML` by default.

**Performance budget.** A 5 MB OpenAPI document builds in < 10s and produces IR that
gzips under 2 MB. Measured in CI from M2 onward, before it is expensive to fix.

## 5. Packages

Dependency order is the delivery order. Each package below states scope, the API it
publishes, what "done" means, and what is explicitly out of scope.

---

### `@speculoos/core` — the IR and its pure operations

**Depends on:** nothing. Hard constraint, not a preference. No Node built-ins either.

**Scope.** The IR type definitions, plus every pure function a renderer or adapter would
otherwise write itself.

**Already drafted** (in `src/index.ts`): `Node` and its 15 kinds, `Docs`, constraint types,
`Property`, `TypeDef`, `Diagnostic`, and the REST/WS wrapper types.

#### The document root

Build-time-only operation forces this: the CLI emits a file, so something has to *be* the
file. `ApiIR` is that root, and it is also where navigation lives — tags, their order,
servers and security schemes have no other home.

```ts
export interface ApiIR {
  irVersion: 1;
  info: ApiInfo;                                   // title, version, description, license, contact
  servers: Server[];                               // url, protocol, description, variables
  securitySchemes: Record<string, SecurityScheme>; // what RestOperation.security referenced but nothing defined
  tags: TagDef[];                                  // source order preserved — this is the nav
  endpoints: Endpoint[];
  schemas: Record<TypeId, TypeDef>;
  diagnostics: Diagnostic[];
  provenance: {
    dialect: "openapi" | "asyncapi" | "jsonschema";
    dialectVersion: string;
    documents: string[];        // logical names, matching SourceLocation.document
  };
}
```

#### Endpoints: one concept for paths and channels

An OpenAPI Path Item and an AsyncAPI Channel are the same idea — an **address**, with
**parameters**, carrying a set of **operations**. Unifying them gives one navigation model,
one grouping function and one anchor scheme across a docs site that has both a REST and a
WebSocket API.

What must *not* be unified is the operation shape. REST is request/response; a channel is a
long-lived connection carrying many messages in both directions. Forcing one onto the other
produces exactly the mush this library exists to avoid, so `Operation` is a discriminated
union and renderers switch on `kind`.

```ts
export interface Endpoint {
  id: string;
  /** "/v2/jobs/{id}" (OAS path) or "/v2" (AsyncAPI 3.x address / 2.x channel key). */
  address: string;
  addressKind: "path" | "channel";
  protocols: string[];                 // ["https"] | ["wss"]
  /** Shared by every operation here: OAS path-level params, AsyncAPI channel params. */
  parameters: Parameter[];
  docs: Docs;
  servers: string[];                   // ids into ApiIR.servers
  operations: Operation[];
  bindings?: Record<string, unknown>;  // AsyncAPI protocol bindings, passed through verbatim
}

export type Operation = RequestResponseOperation | MessageOperation;

interface OperationBase {
  id: string;
  docs: Docs;
  tags: string[];
  deprecated: boolean;
  security: SecurityRequirement[][];   // outer array = OR, inner = AND
  source: SourceLocation;
}

/** OpenAPI operations, including OAS 3.1 webhooks. */
export interface RequestResponseOperation extends OperationBase {
  kind: "request-response";
  method: HttpMethod;
  parameters: Parameter[];             // operation-level; merging with Endpoint.parameters is the renderer's call
  requestBody?: { required: boolean; content: MediaVariant[] };  // projected View "request"
  responses: RestResponse[];                                     // projected View "response"
  callbacks: Endpoint[];               // OAS callbacks are just endpoints, recursively
  links: Link[];
  isWebhook: boolean;
}

/** AsyncAPI 3.x operations, and 2.x publish/subscribe. */
export interface MessageOperation extends OperationBase {
  kind: "message";
  /** Always the API consumer's point of view, whatever the source dialect said. */
  direction: Direction;
  messages: WsMessage[];
  /** AsyncAPI 3.x request/reply — unrepresentable if operations fold into channels. */
  reply?: { address?: string; messages: WsMessage[] };
}
```

#### Presentation layer

The component map decides what markup is produced. This decides what is handed to it. They
are orthogonal — the recursion-through-`children` paradigm is preserved, but `children`
arrives already resolved, so no renderer implements depth budgets or cycle detection.

```ts
export interface FieldNode {
  key: string;            // stable; usable as a React key and as an anchor
  path: string[];         // ["config", "transcription", "language"]
  depth: number;
  name?: string;
  node: Node;             // the underlying IR node, always available as an escape hatch
  typeLabel: string;
  typeRef?: TypeId;       // set when typeLabel names a registry type
  required: boolean;
  nullable: boolean;
  chips: Chip[];          // { kind: "format" | "pattern" | "range" | "default" | "readOnly" | ..., label, value? }
  docs: Docs;             // resolved: property docs -> ref target docs -> none
  children:
    | { kind: "none" }
    | { kind: "inline"; nodes: FieldNode[] }
    | { kind: "variants"; label: string; nodes: FieldNode[] }   // union branches
    | { kind: "link"; target: TypeId; reason: "named" | "depth" }
    | { kind: "cycle"; target: TypeId };
}

export interface ViewOptions {
  view?: View;                                     // default "neutral"
  expandRefs?: "never" | "depth" | "always";       // default "never"
  maxDepth?: number;                               // only when expandRefs is "depth"; default 2
  label?: LabelOptions;
}

export function toTree(node: Node, ir: ApiIR, opts?: ViewOptions): FieldNode;
/** Pre-order flatten of toTree — same objects, for design systems whose Table takes rows. */
export function toRows(node: Node, ir: ApiIR, opts?: ViewOptions): FieldNode[];
```

`expandRefs: "never"` is the default because it matches how good API docs read: named types
have their own section, so linking keeps tables shallow. Two rules fell out of implementing it:

- **The root always expands**, whatever the policy says. It is what the caller asked to see,
  and a `$ref`-valued request body is the common case — linking it back to itself renders an
  empty table.
- **Anonymous structure always expands**, whatever `maxDepth` says. There is no section to
  link to, so truncating it would make that content unreachable in a static site.

`collectLinks(tree)` reports every `TypeId` reachable as a link or cycle target, so a static
renderer knows which type sections it is obliged to emit.

#### Remaining surface

```ts
export function typeLabel(node: Node, ir: ApiIR, opts?: LabelOptions): string;
export function projectForView(node: Node, view: View, ir: ApiIR): Node;  // currently `declare`d only
export function walk(node: Node, visit: (n: Node, path: string[]) => void): void;
export function resolveRef(id: TypeId, ir: ApiIR): TypeDef | undefined;
export function groupByTag(ir: ApiIR): { tag: TagDef; operations: Operation[] }[];
```

`groupByTag` spanning both operation kinds is the concrete payoff of endpoint unification:
one nav tree over a REST and a WebSocket API.

**Subpath exports.**
- `@speculoos/core` — types + pure functions, zero runtime dependencies.
- `@speculoos/core/validate` — `validateApiIR` / `parseApiIR`, over a JSON Schema **generated
  from the TypeScript types**. `ajv` is an optional peer dependency, so the default export
  keeps its zero-dependency promise and nobody pays for a validator they don't call.
- `@speculoos/core/schema.json` — the generated schema as plain data. A tool about specs
  should ship one, and it lets non-JS consumers validate IR with no Node toolchain.

**On generating rather than mirroring.** The first draft of this plan called for a hand-written
Zod mirror plus a type-level conformance test. Generating the schema from the types instead
removes the duplication that test existed to police: the types are the single source of truth,
and a validator cannot drift from them by construction. `pnpm schema:check` fails the build if
the committed schema is stale.

**Done when:** ~~`ApiIR` complete; presentation layer, `projectForView`, `walk`, `resolveRef`,
`groupByTag` implemented and unit-tested; `validate` round-trips the fixture; `schema.json`
generated with a drift check.~~ **Done — see M1.**

**Out of scope:** parsing, I/O, markdown rendering, HTML, example synthesis, anything React.

**Housekeeping.** ✅ Done: `tsconfig.json` and `typescript`; the stray `external: ["react"]`
dropped from `tsup.config.ts`; `IR-notes.md` moved to `docs/design/ir-rationale.md`. The
proposed `src/ir.ts` was overtaken: the IR's types live in `schema.ts` and `document.ts`.

---

### `@speculoos/loader` — a project of documents in, one bundled registry out

**Depends on:** `core` (types only). Node-only; this is a build-time package.

**The unit of a build is a project, not a document.** If `batch.yaml` and `realtime.yaml`
both `$ref` `common.yaml#/components/schemas/Language` and each is bundled independently, you
get two `TypeDef`s for one type, duplicated in the output, with two anchors and no shared
"referenced by". So the loader takes N documents and produces one project-wide registry.

**API.** `load(project: ProjectInput): Promise<LoadedProject>` where `ProjectInput` names each
document explicitly. Logical names are **caller-supplied and must be stable** — they end up in
every `TypeId` and therefore in every URL. Deriving them from filesystem paths would make IR
differ between a laptop and CI, so the loader rejects absolute paths as document names.

**Bundle, never dereference.** Internalise external refs while *preserving* `$ref` nodes. Full
dereferencing destroys the named-type registry and loops forever on recursive schemas.

#### The subtle parts of reference resolution

These are the ones worth getting right before any adapter is written:

1. **Identity follows the definition, not the referrer.** `TypeId` derives from the canonical
   location where a schema is *defined*. Two documents referencing one shared schema must land
   on the same `TypeId`.
2. **`$id` re-bases resolution scope.** A `$ref` resolves against the nearest enclosing `$id`,
   not against the document root. Most OpenAPI documents never use it, but OAS 3.1 permits it.
   Resolve against proper base URIs and map canonical URI -> `TypeId` deterministically. Where
   we cannot fully support a construct, emit a diagnostic rather than silently mis-resolving.
3. **Non-schema refs exist too.** OpenAPI can `$ref` a whole Path Item, response, parameter or
   example from another file; AsyncAPI 3.x refs channels, operations and messages. Bundling
   cannot be schema-only.
4. **Cross-document cycles.** A refs B refs A. The bundler tracks visited canonical URIs.
5. **Name collisions are a project-level problem.** Two documents may both define `Job`. The
   `TypeId`s differ (doc-qualified) but the display names and slugs collide, which is why slug
   assignment happens once over the completed registry.
6. **Structurally identical schemas are not merged.** Two pointers with equal content stay two
   types. Merging is a presentation decision, it destroys provenance, and anyone who wants it
   can write a transform.
7. **Anonymous schemas** get pointer-derived ids and are reachable, but are not listed as
   top-level types.
8. **Remote refs are off by default** and require explicit opt-in. Fetching arbitrary URLs
   during a docs build is a supply-chain surface.

**Done when:** a two-document project sharing a third common file produces exactly one
`TypeDef` per shared schema; cyclic cross-document refs terminate; malformed YAML yields a
diagnostic with line and column, not a stack trace; building the same project from two
different absolute checkout paths produces byte-identical IR.

**Out of scope:** validating documents against their meta-schemas. Users have linters for
that. We report what we cannot *render*, not what is invalid.

---

### `@speculoos/jsonschema` — upcast and lower

**Depends on:** `core`.

This is the heart of the system and the package most likely to be underestimated. It is
deliberately separate from the adapters so that OpenAPI and AsyncAPI share one lowering
implementation rather than drifting apart.

**Scope, in two halves.**

*Upcast* — mechanical, lossless, one small function per dialect quirk:
`nullable: true` → `type: [X, "null"]`; boolean `exclusiveMinimum` → numeric; `example` →
`examples: [...]`; `definitions` → `$defs`; `items: [...]` → `prefixItems`; string
`discriminator` → `{ propertyName }`.

*Lower* — opinionated, lossy, dialect-blind. Recursive `Node`-returning function, refs
break cycles, every unrepresentable construct emits `UnsupportedNode` + `Diagnostic`.

**Simplification passes, in this fixed order** (each separately unit-tested, each a pure
`Node → Node`, order is load-bearing):

1. nullable folding — `type: [X, "null"]`, `nullable`, `anyOf: [X, null]` → `nullable: true`.
   Note `oneOf: [A, B, null]` folds to a *union with* `nullable`, not to a 3-variant union.
2. const-union → documented `enum`
3. `allOf` merge → single `object` + `composedFrom`; conflicts → `intersection` + `ALLOF_CONFLICT`
4. map detection → `MapNode`
5. discriminator inference → shared `const` property, flagged `inferred: true`
6. single-variant union unwrap

**Done when:** every keyword in the `IR-notes.md` keyword table has a tested path; the
conformance suite passes; building the fixture corpus twice is byte-identical.

**Known hazards to settle during implementation:** `allOf` merge conflict policy (which
side wins, and does it warn or error); `nullable` on a `RefNode` is a property of the
*usage*, not the target, and must not leak into the registry entry; `contains`/`minContains`
interaction; `propertyNames` on an object that also has fixed `properties`.

---

### `@speculoos/openapi` — OpenAPI 3.0 / 3.1 → `ApiIR`

**Depends on:** `core`, `loader`, `jsonschema`.

**Scope.** Path Items → `Endpoint[]`, operations → `RequestResponseOperation`. Path-level
parameters stay on the `Endpoint`; operation-level ones stay on the operation, and merging
them is left to the renderer. Parameters keep style/explode for display.
Request bodies projected with `View "request"`, responses with `"response"`. Media variants,
response headers, `components/schemas` → registry, `components/securitySchemes` →
`ApiIR.securitySchemes`, top-level `tags` → `TagDef[]` with source order, `servers` with
variables, `webhooks` (3.1, as endpoints flagged `isWebhook`), `callbacks` (endpoints,
recursively) and `links`.

**Done when:** it builds a real multi-megabyte public spec (Stripe or GitHub) inside the
performance budget with zero `error`-severity diagnostics, and the Speechmatics Batch spec
produces IR that a human reviewer agrees reads correctly.

**Out of scope:** Swagger 2.0 (see OD-3).

---

### `@speculoos/asyncapi` — AsyncAPI 2.x / 3.x → `ApiIR`

**Depends on:** `core`, `loader`, `jsonschema`.

**Depends on:** `core`, `adapter-kit`, `loader`, `jsonschema`.

**Scope.** Channels → `Endpoint[]` with `addressKind: "channel"`, operations →
`MessageOperation`. Messages, payloads, headers, protocol bindings, server definitions.
2.x channel keys and 3.x `address` both normalise onto `Endpoint.address`; 3.x `host` +
`pathname` join into the one `Server.url` that 2.x states outright.

**The one thing that matters most here:** direction normalisation. AsyncAPI 2.x
`publish`/`subscribe` is written from the *application's* perspective, which is the inverse
of what a reader expects; 3.0 replaced it with `send`/`receive`. Both normalise to
`"client-sends"` / `"server-sends"` from the **API consumer's** point of view, so a page
does not depend on which AsyncAPI version the spec happens to use. This deserves its own
dedicated test file with both 2.x and 3.x inputs producing identical direction values.

Second: 3.x separates operations from channels and adds `reply` for request/reply. The
`Endpoint` + `Operation` split models this directly — 3.x operations map onto
`MessageOperation` one-to-one, and 2.x `publish`/`subscribe` synthesise one operation each
under the channel's endpoint. Folding operations into the channel would make `reply`
unrepresentable.

**Done when:** a 2.x and a 3.x expression of the same API produce IR that differs only in
`provenance`; non-JSON-Schema `schemaFormat` values (Avro, Protobuf) produce
`UnsupportedNode` + diagnostic rather than a crash.

---

### `@speculoos/adapter-kit` — the shared half of writing an adapter

**Depends on:** `core`, `jsonschema`.

Not in the first draft of this plan; extracted during M3 rather than knowingly writing a
second copy. Both adapters — and any third-party one — need the same handful of things:
pulling `Docs` out of a spec object, following a structural `$ref` to where the value really
lives, turning a security map into `SecurityRequirements`, reading a URL's protocol.

What is deliberately *not* here is anything about schemas; that is `jsonschema`'s job. The
division is the point: this package is about the document around the schemas.

**Done when:** both first-party adapters use it and nothing document-shaped is duplicated
between them. ✅

---

### `@speculoos/transforms` — user-supplied IR passes

**Depends on:** `core`. Zero runtime dependencies.

**Scope.** `applyTransforms(ir, transforms: Transform[], opts?): ApiIR` where
`Transform = (ir: ApiIR) => ApiIR`, applied in order. Ships the built-ins everyone needs:
`hideWhere(predicate)`, `hideInternal(key?)`, `sortTags(order)`, `renameTypes(map)`,
`filterByTag(tags)`, `redactExamples()`, and — not in the first draft —
`pruneUnreachableTypes()`.

**Rationale for existing at all:** this is where "fits my docs site" actually gets resolved
in practice. Without it, every consumer forks the adapter, and a forked adapter stops
tracking the dialect it parses.

**Three decisions worth recording.**

1. **`renameTypes` does not rewrite the `TypeId`.** An id is source identity: every
   `RefNode.target` and `composedFrom` entry quotes it, and `SourceLocation` agrees with it.
   `name` and `slug` are presentation, and presentation is what a docs site wants to
   override. Keeping them apart means a rename cannot break a reference. Untouched types
   keep the slug they already had, because re-slugging the registry would silently move the
   anchors of types nobody renamed — and those anchors are URLs somebody has linked to.
2. **`redactExamples` is a structural pass, not a walk of the places the IR puts examples.**
   An enumerated walk that misses one site leaks exactly the thing you asked to remove, and
   two of the sites (`Docs.extensions`, `bindings`) are pass-through bags whose contents are
   by definition unknown. `default` and `const` are left alone: contract, not illustration.
3. **Validation is a parameter, not a built-in.** `applyTransforms` takes `{ validate }` and
   the caller hands it `parseApiIR`. Validation needs `ajv`, this package has none, and
   someone running one cheap pass over a 13 MB IR should not pay for a schema compilation
   they did not ask for.

**`pruneUnreachableTypes` was added because `filterByTag` without it is misleading rather
than merely wasteful.** Filter the GitHub description to one tag and you keep 200 of 1242
operations — and all 996 schemas, so a renderer emitting a section per type emits 895 pages
nothing links to. It is a separate pass because reachability is not always what you want: a
published schema registry is a legitimate reason to keep unreferenced types. Verified
against the GitHub description: it drops 352 of 996 types, leaves zero dangling refs, zero
stale `referencedBy` entries, and nothing it drops is named by any endpoint.

**Done when:** built-ins are tested, transforms compose, and a transform that produces
invalid IR is caught with a message naming which pass did it. ✅ 36 tests.

---

### `@speculoos/react` — headless React binding

**Depends on:** `core`. Peer: `react`.

**Scope.** The design-system adapter. Ships **no styles and no DOM opinions**.

```tsx
<SpeculoosProvider ir={ir} components={components} options={{ maxDepth: 2 }}>
  <OperationList />
  <Operation id="startRecognition" />
  <SchemaTable typeId="batch#/components/schemas/TranscriptionConfig" />
</SpeculoosProvider>
```

`components` is a map the consumer supplies from their own library — `Section`, `Markdown`,
`Code`, `CodeBlock`, `Badge`, `Link`, `Fields`, `FieldRow`, `Tabs`, `List`, `ListItem`,
`Empty`. Every one is required; there are no defaults to accidentally inherit.

Recursion stays in the consumer's hands, because `FieldNode.children` is already resolved by
core — no renderer implements a depth budget or cycle detection:

```tsx
const Field = ({ f }: { f: FieldNode }) => (
  <C.Row depth={f.depth} name={f.name} type={f.typeLabel} chips={f.chips}>
    <C.Markdown>{f.docs.description}</C.Markdown>
    {f.children.kind === "inline" && f.children.nodes.map(c => <Field key={c.key} f={c} />)}
    {f.children.kind === "link"   && <C.Link to={slugOf(f.children.target)} />}
    {f.children.kind === "cycle"  && <C.Badge>recursive</C.Badge>}
  </C.Row>
);
```

Hooks (`useFieldTree`, `useFieldRows`, `useOperation`, `useTypeLabel`) are exported for
consumers who want to drive their own markup entirely.

**Done when:** a reference integration renders the Speechmatics Batch and Realtime specs
using a third-party component library with no Speculoos CSS loaded at all; markdown
rendering and sanitisation are entirely the consumer's `Markdown` component's job, and the
README says so in the first paragraph. ✅ 39 tests.

**Deviations from the sketch above, all deliberate.**

- **No `Cell`, and no `Disclosure`.** A generic `Cell` would make Speculoos decide the
  column layout, which is precisely the design-system decision it must not make; `FieldRow`
  takes semantic props instead. `Disclosure` turned out to have no caller: a `FieldRow`
  already receives its nested rows as `children`, so collapsing them is a decision that is
  already the consumer's and already in the right place. A required slot nothing ever calls
  is worse than no slot — it makes the map look like it has a say it does not have.
- **`FieldRow` gets both halves.** `name`, `type`, `chips` and `docs` arrive already built
  from the consumer's own `Code`, `Link`, `Badge` and `Markdown`, so a row only decides
  where things go; `field` carries every underlying value for when that is not enough.
  Passing only raw data would have made every consumer reassemble the same four nodes;
  passing only nodes would have closed the escape hatch.
- **A parameter list is an `ObjectNode`.** Parameters and response headers are "a name, a
  schema, a required flag and some docs, repeated", so they are wrapped in a synthetic
  object and handed to `toTree`. That buys docs precedence through a `$ref`, chips, nested
  expansion and cycle detection for free; a second row-building path would have drifted.
- **`TypeSection` / `TypeSections` added.** `expandRefs: "never"` is the default, so a
  `$ref` becomes a link — and a link needs something to land on. `collectLinks` exists for
  exactly this. They render every registry entry, not just reachable ones: deciding what is
  worth keeping is `transforms`' job, and a renderer that quietly dropped types would make
  that decision invisible.
- **Parameters are grouped by `in`, not merged into one list.** The plan left "whether to
  merge the endpoint's and the operation's lists" to the renderer. Grouping by location
  answers it better than either choice: readers look for "the query parameters", and the
  endpoint's shared ones belong in the same group as the operation's own.

---

### `@speculoos/html` — framework-free string renderer

**Depends on:** `core`.

**Scope.** `renderOperation(op, ir, opts): string`. Semantic HTML with stable, documented
class names, and anchors from the slugs the IR already carries. For Hugo/Jekyll/Eleventy/Astro sites that are
not React. Sanitisation of markdown is the caller's responsibility and the API makes that
explicit by taking a `renderMarkdown` function rather than embedding one.

**Priority:** after React unless OD-1 says otherwise. Deliberately scheduled second so the
`FieldNode` model gets validated against two independent renderers before 1.0 — one
renderer is not enough evidence that the presentation layer is framework-neutral.

---

### `@speculoos/cli` — build and lint

**Depends on:** `loader`, adapters, `core/validate`, `transforms`.

```
speculoos build spec.yaml -o ir.json      # auto-detect dialect, emit IR
speculoos lint spec.yaml --allow IF_THEN_ELSE,NOT_SCHEMA   # exit 1 on un-allow-listed diagnostics
speculoos inspect spec.yaml --type TranscriptionConfig     # print lowered IR for one type
```

**Why this lands early:** it makes the IR independently valuable and gives the project a
CI story (`lint`) before any renderer exists. `inspect` is also the fastest debugging loop
for adapter work.

**Transforms reach the CLI as flags, not a config file** (`--hide-internal`, `--tag`,
`--sort-tags`, `--rename Old=New`, `--redact-examples`, `--prune`, `--validate`). A config
file would mean inventing a format and a loader before anyone has asked for one; flags cover
the whole built-in set today and a config file can still arrive later.

They are applied in a **fixed order** regardless of the order they appear on the command
line, because the useful order is not obvious and getting it wrong is quiet: prune before
filter and you prune against the unfiltered document; rename after prune and you rename
things that are already gone. One documented order that always works beats a flexible one
that usually does.

---

### `@speculoos/fixtures` — private, not published

Created in M4, once there were four consumers. It holds the shared spec corpus and
**nothing else**: `specDir` and `specPath(name)`, no dependencies at all.

That emptiness is the design. The obvious version of this package hands out ready-made IR,
which means importing an adapter — and then `openapi` devDepends on `fixtures` while
`fixtures` depends on `openapi`, the workspace has a dependency cycle, and `pnpm -r build`
has nothing safe to order. So it hands out paths, and each consumer builds IR with the
adapter it already depends on.

It replaced two test files reaching sideways into each other's directories
(`../../openapi/test/specs`), which is what the CLI's tests were already doing.

Expected-IR snapshots are deliberately *not* here. The IR is not frozen until 1.0, and a
committed snapshot of an unfrozen format is a test that fails for the right reason and the
wrong one indistinguishably. `packages/core/test/fixture.ts` stays where it is: core must
have zero dependencies, including on this.

---

## 6. Milestones

**M0 — Foundations (small). ✅ Done.** Root `tsconfig.base.json`, per-package `tsconfig.json`
and tsup config, `typescript` devDependency, CI running build + typecheck + test across the
workspace, and the core housekeeping above. Lint and format came last, with the alpha:
Biome, in CI.

**M1 — IR complete and provable. ✅ Done, except as noted.** `ApiIR` finished; presentation
layer (`toTree`/`toRows`/`typeLabel`/chips) implemented; `projectForView`, `walk`,
`groupByTag`, slugging implemented; `core/validate` over a generated JSON Schema. 45 tests.

Four defects the presentation layer found in the IR design, all now fixed — this is exactly
why M1 builds the renderer-facing half before any adapter:

1. A `$ref` root rendered an empty table, because the default policy linked it to itself.
2. Chips and docs did not resolve through a `$ref`, so a field typed `$ref: Language` showed
   none of `Language`'s pattern, default or examples.
3. `Docs` had no defined precedence between a `TypeDef`'s docs and its node's docs — a named
   scalar's `default` lives on the latter, and was being dropped.
4. Small enums appeared twice, once in the type label and once as chips.

*Closed in M4:* `@speculoos/fixtures` exists, holding the shared **spec corpus** — not the
hand-built IR. `packages/core/test/fixture.ts` stays in core, because core must have zero
dependencies including on a fixtures package; and downstream packages turned out to be better
served by real adapter output than by a hand-made document. See that package's section above.

**M2 — Pipeline for one dialect. ✅ Done.** `loader`, `jsonschema`, `openapi`, `cli`.
169 tests across five packages.

*Exit criterion met.* The GitHub REST description — 13.5 MB, 823 paths, 1242 operations,
996 schemas, OpenAPI 3.0.3 — builds in **2.7s** (budget: 10s) to IR that gzips to
**1.3 MB** (budget: 2 MB), byte-identical across runs, and validates against the generated
schema. Note the input is 2.7× the 5 MB the budget was written for.

Three defects the real spec found, all now fixed:

1. **`allOf` overwrote instead of intersecting.** GitHub routinely restates a property to
   refine it (`{format: uri}` in one member, plain `string` in the next). "Last writer wins"
   silently discarded the tighter constraint. `allOf` means every member applies at once, so
   members now merge — and the noise dropped from **304 warnings to 27**, all 27 genuine
   kind clashes. A diagnostic firing 304 times is not a diagnostic, it is a thing people
   allow-list and stop reading.
2. **`Example.value` was required but is genuinely optional** — an OAS Example carries
   either `value` or `externalValue`, and `undefined` does not survive a JSON round-trip.
   Caught by validating real IR against the generated schema, which is precisely the job
   that schema exists to do.
3. **`MediaVariant` needed to carry its `view`.** An adapter cannot project readOnly /
   writeOnly through a `$ref` — the registry entry is shared by every view — so a
   `$ref`-valued request body showed its readOnly fields. The view now travels with the
   content and renderers pass it to `toTree`.

A fourth, from the CLI: **`composedFrom` never reached the presentation layer**, so an
`allOf`-merged type gave a renderer no way to say "extends BaseConfig" or link to it.
`FieldNode` now carries it, and `collectLinks` includes it so the link cannot dangle.

*Known limitation:* intersecting a union with a scalar (`oneOf: [integer, string]` ∩
`string`) is not attempted — it warns and keeps the first member. That is the whole of the
remaining 27 diagnostics on the GitHub spec.

**M3 — Second dialect. ✅ Done.** `asyncapi` (2.x and 3.x) and `adapter-kit`.
220 tests across seven packages.

*Exit criteria met.* The same API written in AsyncAPI 2.6 and 3.0 produces IR that is deep-equal
after stripping `source` and `provenance` — which is to say it differs only in where it came
from. `speculoos inspect` renders byte-identical pages from the two. Avro and Protobuf payloads
become `UnsupportedNode` + diagnostic rather than crashing, in both the 2.x message-level and
3.x payload-level spellings of `schemaFormat`.

**No new `Node` kinds were needed.** That was the real purpose of scheduling a second dialect
before any renderer, and a test now asserts the exact kind set so a future change has to be
deliberate. The IR survived contact with a second dialect unchanged, which is the strongest
evidence so far that M1 got it right.

Two defects AsyncAPI found:

1. **Message discriminators only worked for inline payloads.** Real specs always `$ref` their
   payloads, so the `message: "AddAudio"` inference never fired on anything real. Adapters now
   look through a ref mid-build via `Registry.peek`.
2. **3.x parameters carry no schema**, so their nodes are synthesised — and they were
   duplicating the description that 2.x puts on `Parameter.docs`. That alone made the two
   versions produce different IR for the same API. Synthesised nodes now carry only value-level
   facts (`default`, `examples`); the description stays usage-level, where the IR's own
   precedence rule says it belongs.

Also fixed in passing: `deref` was losing the *document* on a cross-document ref (an M2 bug,
latent because nothing exercised it), and `docsOf` no longer repeats a description as the
title when a spec sets `summary` and `description` to the same string. Across the 13.5 MB
GitHub description that second change altered exactly one leaf, and the build stayed
deterministic. *If AsyncAPI forces a
new `Node.kind`, the IR was wrong and M1 needs revisiting — that is the real purpose of
scheduling a second dialect before the renderers.*

**M4 — First renderer. ✅ Done.** `react`, `transforms` and `fixtures`.
312 tests across nine packages (core 45, jsonschema 80, adapter-kit 20, loader 14,
openapi 26, asyncapi 27, react 41, transforms 36, cli 23).

*Exit criteria met.* Both specs render through a component map with no Speculoos CSS loaded,
because there is none to load. The tests prove that mechanically rather than by assertion: a
fake component library whose every element is a custom element named `x-…`, and a test that
scans the rendered markup and fails if any tag did not come from the map. A second, unrelated
map (`y-…`, definition lists instead of tables, flat rows instead of nesting) renders the
same operations from the same IR, which is the actual claim — one IR, two design systems,
nothing in common between them. The AsyncAPI 2.6 and 3.0 specs render byte-identical pages.

**At scale.** Against the GitHub REST description: all 1242 operations plus 996 type
sections render to 12.8 MB of markup in **995 ms**. `pruneUnreachableTypes` drops 352 of 996
types and cuts the IR from 1.37 MB gzipped to 0.61 MB; `filterByTag` plus prune takes it to
200 operations, 101 types and 0.09 MB.

Two defects the renderer found in its own output, and two the scale check found upstream:

1. **A composed type's `extends` link vanished in its own section.** `SchemaTable` drops a
   nameless object root — a row saying "(no name): object" tells a reader nothing — and that
   took the root's `composedFrom` with it. So `Job.config` correctly said "extends
   BaseConfig" while `TranscriptionConfig`'s own section said nothing. The composition is now
   lifted out above the table.
2. **A webhook showed `webhook:jobFinished`.** `Endpoint.id` namespaces webhooks so they
   cannot collide with a path. That is identity, not a label; the page now gets the address
   and a badge saying which it is.
3. **`oneOf`/`anyOf` discarded its sibling keywords.** `lowerAllOf` has always treated
   keywords alongside `allOf` as another member of the merge. `lowerUnion` did not — it
   returned the union and dropped the rest. On the GitHub description that silently emptied
   fifteen request bodies: a schema declaring five properties *and* an `anyOf` saying which
   of them are required rendered as two empty branches, and
   `code-scanning-alert-create-request` disappeared from the IR altogether. This is the M2
   `allOf` defect one level up — every keyword present applies at once — and it was invisible
   until something tried to *draw* those request bodies. Sibling keywords now intersect with
   the union; and because the overwhelmingly common idiom is branches that constrain only
   `required`, that case folds into a note ("At least one of these is required: `state`,
   `assignees`.") instead of an intersection nobody can read. Two `UNION_WITH_SIBLINGS`
   diagnostics remain on the whole 13.5 MB description, both genuine.
4. **OAS 3.0 `nullable: true` alongside a union was dropped.** Found by a test written for
   defect 3. `nullable` with no `type` upcasts to a marker, and only the null-only branch
   was reading it, so a union returned earlier never saw it.

Found while building `transforms`, not by it: **`filterByTag` and `hideWhere` need different
rules for an unused tag.** `hideWhere` keeps a tag that was *already* unused — it was
declared that way on purpose — and drops only one that its own predicate emptied.
`filterByTag` drops every tag outside its list, because the caller has named the tags they
want and leaving the others in the navigation would contradict them. Both tests failed
against one shared rule, which is how the distinction surfaced.

*Still open from M4:* the reference integration is a fake component library, not the
Speechmatics design system. That was a deliberate choice — a fake proves nothing is
hardcoded in a way a real library cannot, because with a real library you can never tell
whether it works *because* of its conventions. Wiring the real one is a consumer task, not a
package task.

**M5 — Second renderer and 1.0. ✅ Done.** `html`.
370 tests across ten packages (core 50, jsonschema 80, adapter-kit 20, loader 14,
openapi 26, asyncapi 27, html 40, transforms 36, react 48, cli 29).

*Exit criterion met, and it is the one the whole schedule was built around.*
`packages/react/test/parity.test.tsx` renders the same IR through both renderers and
compares content, never markup: the same field keys, the same link targets, across every
operation of both dialects and the whole type registry. A third assertion checks that the
two share **no element name at all**, so the parity cannot pass vacuously. M4's two
component maps were weak evidence because both were React; this is not.

**What the second renderer moved into core.** Each of these was in `@speculoos/react` on the
assumption that it was a React concern, and each turned out to be a decision about *content*
that both renderers need identically:

| Moved | Why it was not a React concern |
|---|---|
| `HrefTarget`, `defaultHref` → `core/link.ts` | Both renderers ask "does this type have a page, and where?". A site should write one `href` function and hand it to both |
| `toFieldList` → `core/present.ts` | Which rows to show, and lifting `composedFrom` off a dropped root. This is where the M4 "extends BaseConfig" defect lived; one copy, one fix |
| `parametersNode`, `propertiesNode` → `core/synth.ts` | The HTML renderer needed them verbatim |
| `DIRECTION_LABEL` → `core/label.ts` | Both renderers spell it the same way |

That list is the real answer to "is `FieldNode` React-shaped?". It was not — but four things
sitting *next to* it were in the wrong package, and only a second renderer could show which.

**Design decisions.** Field tables are `<ul>`/`<li>`, not `<table>`: a schema is a tree and
`<tr>` cannot contain `<tr>`, which is the very constraint that forced React's
`layout: "rows"` escape hatch. Both layouts are still offered, and a test asserts they show
the same field set. There are no tabs — HTML has none without script, and shipping script
would make this a site generator — so `spec-group` is a labelled list of regions, all present
and all findable by in-page search, with class names to turn into tabs if a site wants them.

**The class-name contract.** This is the first point where Speculoos emits markup of its own,
so it emits styling hooks too. That is not a breach of "no styles, ever" — there is no
stylesheet in the package — but it is a new contract, so it is data: `CLASSES` in
`packages/html/src/classes.ts`, with a test that sweeps real rendered output and fails on any
class not in the catalogue. `language-json` is deliberately left unprefixed, because it is
what Prism and highlight.js look for.

**Two defects, both found by reading the page as text rather than as markup:**

1. **The output was illegible without CSS.** Adjacent inline elements were emitted with no
   whitespace between them — `limitintegerdefault: 20`, `example.com/v2https`. The demo
   stylesheet's flex gaps hid it completely. A renderer that owns its markup owes legibility
   to reader modes, text browsers and copy-paste, so inline siblings are now joined with a
   space and four tests assert it against stripped text.
2. **Deprecation was conveyed only by a class name.** `spec-section--deprecated` says
   "deprecated" to a stylesheet and to nobody else — not to a reader, not to assistive
   technology. Deprecated sections now carry the word.

Neither was reachable from the fixtures' markup; both were obvious the moment the page was
read as prose. That is what the preview harness is for.

**At scale.** Against the GitHub REST description: 1242 operations and 996 type sections
render to 41.8 MB of markup in **664 ms**, byte-identical across runs, gzipping to 2.37 MB.
10,690 ids with **zero duplicates and zero dangling anchors**; 76 distinct classes, none
undocumented; no `style=` and no `<script>` anywhere. The `rows` layout produces the same
10,692 field paths as `tree`. It is bulkier than the React fake map's 12.8 MB, which is what
class names and data attributes cost — and 42 MB is one page; nobody would ship GitHub's docs
that way rather than per-operation.

**The preview harness** (`preview/`, `pnpm preview:serve`) is dev tooling, not a package, for
the same reason: Speculoos does not generate sites. `preview/preview.css` styles the output
using only the documented class names, which is the honest test of whether the catalogue is
sufficient. It was — no rule needed a tag selector outside `.spec-markdown`, whose contents
come from the caller's markdown renderer and not from Speculoos.

**The diagnostic catalogue** is `DIAGNOSTIC_CODES` in `packages/core/src/diagnostics.ts` —
25 codes, 13 error, 9 warning, 3 info — with `docs/DIAGNOSTICS.md` generated from it by
`pnpm docs:diagnostics` so the two cannot drift. A test in `cli` (the one package that
depends on everything) asserts that every code the fixtures emit is in the table and carries
the severity the table claims. `speculoos lint --allow` now warns on a code it does not
recognise, because a typo there silently allows nothing and leaves a build red for an
invisible reason. Writing it down also found that `IF_THEN_ELSE`, used as the example in
`Diagnostic.code`'s own doc comment, is not a code that is ever emitted — the generated form
of `if` is `IF`.

**`irVersion: 1` is frozen.** Additions only from here.

*OD-2 re-checked before freezing, as promised.* A curl/fetch/python synthesiser needs server
URLs and variables, address and parameters with `style`/`explode`, method, media type,
security scheme key and location, and enough of a `Node` to invent a value — `format`,
`const`, `default`, `enum`, `examples`. All present. Two things are missing: OAS
operation-level `servers` (path-item level is handled) and multipart `encoding`. **Neither
blocks the freeze**, because both are optional additive fields, and a freeze forbids removing
and reshaping, not adding. So OD-2 stays descoped with the path genuinely open.

**Guides:** `docs/WRITING-A-RENDERER.md` and `docs/WRITING-AN-ADAPTER.md`.

*Still open:* the reference integration is still a fake component library rather than the
Speechmatics design system. Unchanged from M4, and still a consumer task.

**M6 — Shipped component maps. ✅ Done, but for the maintenance policy for a second map.** A Radix Themes map, as a package rather than an
example, with a factory taking options and spread for wholesale replacement. Twelve
components, not a renderer: there is one React renderer and a map per library. Closes the
reference-integration item carried since M4. Full plan in
[`M6-COMPONENT-MAPS.md`](./M6-COMPONENT-MAPS.md).

*The architecture question it settles.* Shipping a map was initially resisted on the grounds
that a package per library re-creates `m × n`. That was wrong — a map is one of the `n`, and
shipping it costs maintenance, which is linear. The genuine objection is narrower: the map is
the least differentiated and hardest-to-get-right part of adoption, so shipping one lowers the
cliff without compromising anything, *provided* dependency direction stays one-way.
`@speculoos/react` must never know a design system exists.

*Two things the pilot surfaced before a line was written.* `BadgeProps` could not say which
HTTP method a method badge is for, so a map could not colour GET green and DELETE red without
parsing `children` — and `@speculoos/html` had the same gap. Fixed: `BadgeProps.value` and
`data-value`. The second looked like "a map can have requirements on the *provider*
options" — a Radix `Table` map needing `layout: "rows"` because `<tr>` cannot nest — but it
was a naming problem. The slot was called `Table`, which invited filling it with a table;
it is the container for field rows and is now called `Fields`. Only a `<table>`-based map
meets the nesting constraint, and it can meet it without help by returning a `FieldRow`'s
nested rows as siblings after its own. No provider API was added. Both changes were free
only because no map had shipped yet.

*Built.* `@speculoos/map-radix-themes` exports `radixThemes({ markdown, size, colors, linkAs })`:
field rows as a Radix `DataList` (a `Table` mode was built, compared and dropped), and a
channel's messages as stacked cards rather than tabs. A Vite dev server
(`pnpm preview:radix`) renders every fixture through real Radix in either layout and
appearance. Looking at it found a renderer
defect — the operation list's label read "GET/jobs List jobs", unseparated inside an
inline `Link` — now fixed in `@speculoos/react`. Details in §12 of the M6 plan.

*Endpoints became the unit.* Looking at the map also showed both renderers were
operation-first: a channel's address and parameters repeated under each operation, and
`endpoint.docs` rendered nowhere. `<Endpoint>` / `renderEndpoint` now render a path or
channel once with its operations beneath, headed "Send" / "Receive" for messages;
`HrefTarget` gains `endpoint`, so one `href` function routes a page per endpoint; and the
HTML renderer groups by endpoint by default. Parity extends to endpoints. §13 of the M6
plan.

*Then entries became the unit.* A reference's page and sidebar unit is verb + address: one
per REST operation (`POST /projects`), one per channel (`WSS /v2/{language}`, holding its
send and receive). `apiEntries` in core, `<Entry>` / `<EntryList>` / `useEntries` in React,
`renderEntry` and `groupBy: "entry"` in HTML; `EndpointList` is gone. §14 of the M6 plan.

*Then it met the Speechmatics docs.* The Realtime WebSocket reference and one Batch REST
operation, rendered through the map on the real site beside the live pages. Most of the
improvement came from the specs — Realtime rewritten as canonical AsyncAPI 3; Batch, still
Swagger 2.0 upstream, converted to OpenAPI 3.1 and patched with an Overlay — and the rest
from additions at parity across both renderers: anchored messages, full URLs, a handshake
section, one Authentication presentation, gathered examples, documented enum values, and
grouped media types. The map's defaults changed to stacked field rows, "optional" marks
and collapsible nested properties. It then became the site's whole API reference — four
APIs, REST and WebSocket, a page per entry, and the schema tables in guide pages — and the
OpenAPI plugin it replaced was removed. §15 of the M6 plan.

**Alpha. ✅ Published: `0.1.0-alpha.0`.** Every package except `fixtures` is published,
in lockstep as `0.1.0-alpha.N` under npm's `alpha` tag, MIT-licensed, with a README each.
`pnpm release:check`, in CI, checks what a consumer would install: versions and metadata,
publint, and the packed tarballs installed into a fresh project where every entry point
typechecks and loads from ESM and CommonJS. The public API was inventoried export by
export and trimmed to what is meant to be used — 158 values and 169 types to 123 and 164 —
with the building blocks for custom sections and passes documented rather than left as
accidents. Releases are published by GitHub Actions with npm trusted publishing (OIDC,
provenance), never from a laptop. `docs/RELEASING.md`.

**M7 — Styling. Planned.** A review of the docs pilot in a browser (2026-10-29): every
reference page, light and dark, at 1534, 820 and 390 pixels wide. The map works; what it
lacks is hierarchy. Nested fields are told apart by indent alone, and cards wrap whole
sections, so nothing stands out. Each item says where it lands: **map**
(`@speculoos/map-radix-themes`, released as a new alpha) or **react** (`@speculoos/react`,
with its `@speculoos/html` counterpart, at parity). What the review found on the
Speechmatics site itself — page width, the session and side panels, `<Schema>` in guides —
is planned in that repo's `SPECULOOS-PLAN.md`, so the two can proceed in parallel. Only
item 2 is a dependency across them: the site picks up the rest with the new alpha.

*Nesting.* The largest item; see the design below.

1. **map** A bordered, tinted box around each open level of nested rows, in place of the
   indent.
2. **react** An additive optional `path` on `FieldRowProps`: the names of the field's
   ancestors, with `[]` after an array, such as `["results[]", "alternatives[]"]`.
   `@speculoos/html` gets the same as `data-path`.
3. **map** From depth 3, the path printed before the name, dimmed:
   `config.transcription_config.` then **`language`**.
4. **map** Below `sm`, a smaller inner padding per level, so a third level still leaves
   room on a phone.
5. *Later:* a deep-link anchor per field path. Field ids must be unique on a page where
   one type appears in both the request and a response, so each id needs its section's
   id as a prefix.

*Cards.* A card holds something small and self-contained. It never holds a whole section.
On a channel page, the handshake, Send and Receive are plain sections against the page
background. Status tabs are not carded, on a channel page or a REST one.

6. **map** The handshake becomes a plain section, headed at the same size as Send and
   Receive, with its own anchor; today it has none.
7. **map** A message becomes a heading over a rule, not a card. `CardSection` and `InCard`
   go.
8. **map** No card around a code block: the `<pre>` gets its own background, so code also
   shows in dark mode inside a container.
9. **map** The example list keeps its card but loses the inner border, so it has one
   frame.

*Consistency.*

10. **map** Enums take one form. Today `diarization` shows an inline union, `model` a type
    name and then value badges, and `status` reads "enum one of" behind "Show 4 options".
11. **map** Status codes are coloured badges everywhere; the WebSocket handshake's tabs are
    bare numbers.
12. **map** Code in a hover card, and in a narrow side panel, wraps rather than being cut
    off at the edge.
13. **react** A constraint chip agrees in number: "≥ 1 character", not "≥ 1 characters".

*Checked and fine:* status badges and the dashed repeat box read clearly in dark mode, and
no page scrolls sideways at phone width.

*The nesting design.* The rows stay siblings: a `<tr>` cannot contain a `<tr>`, and the
`FieldRow` contract allows for that. What changes is the wrapper the map already puts
around a row's children. Today it is `display: contents`; it becomes a real box:
- It sits under the parent row, with a 1px `--gray-a5` border, a `--gray-a2` fill and the
  Radix radius.
- Each level then draws its own box inside its parent's, and the depth-indexed padding
  goes.
- The parent row's toggle opens and closes its box, so what a box holds is always the
  answer to "Show 14 properties".
- Rows inside a box keep their rules, inset to its padding.
- In the stacked and vertical layouts a `DataList` is a flex column, so the box is a plain
  block.
- In `columns` it spans both grid columns and uses `subgrid`, so its labels still line up
  with the list's.

A box shows *that* a row is nested; the path shows *where*. At depth 2 the parent's row sits
directly above the box, so the box is enough and a prefix would be noise. From depth 3 the
parent's name can be a screen above, so the prefix starts there and stays dimmed, in the
type's colour. It breaks after any dot, so a long path wraps at a dot on a phone.

**Post-1.0:** example synthesis and code samples (OD-2); further framework bindings; an
MDX/Docusaurus/Astro integration package; a playground app.

## 7. Risks

| Risk | Why it bites | Mitigation |
|---|---|---|
| IR proves wrong after renderers exist | Breaking change across every package at once | M3 before M4 — prove the IR against two dialects before any renderer depends on it |
| ~~`FieldNode` is React-shaped~~ **Retired in M5** | The second renderer needs different traversal | `@speculoos/html` shares only `@speculoos/core` with the React binding and shows the same fields and links over the same IR, with no element name in common (`packages/react/test/parity.test.tsx`). `FieldNode` needed no change; four *neighbouring* pieces moved into core |
| `allOf` merge semantics | Endless edge cases, silent wrong output | Conflicts become `intersection` + diagnostic rather than a guess |
| IR size on large specs | Unusable for Stripe-scale specs | Budget measured in CI from M2; per-operation emit if breached |
| Scope creep into a docs framework | Speculoos becomes the thing it was built to avoid | No styles, no CSS, no routing, no site generation — ever |
