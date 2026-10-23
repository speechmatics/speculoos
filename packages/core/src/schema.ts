/**
 * Schema-level IR: a display-oriented representation of the JSON Schema found in
 * OpenAPI 3.0 / 3.1 and AsyncAPI 2.x / 3.x documents.
 *
 * Pipeline:  source doc → bundle (keep $refs) → UPCAST to canonical JSON Schema
 *            (≈2020-12) → LOWER to this IR → simplification passes → validate.
 *
 * The document half of the IR — endpoints, operations, servers, security — lives
 * in ./document.ts and references the `Node` type defined here, never raw schema.
 *
 * Design rules
 *  1. Describe shapes a reader sees, not keywords an author wrote.
 *  2. Lossy by design, never silently: anything not representable becomes an
 *     UnsupportedNode AND a Diagnostic.
 *  3. Named types live in a registry and are referenced, never inlined.
 *  4. Usage-level docs (on a property) are kept separate from type-level docs.
 *  5. Pure, JSON-serialisable data with stable ordering and stable ids, so the
 *     same spec always produces byte-identical IR.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Identity & provenance
// ─────────────────────────────────────────────────────────────────────────────

/** Stable id derived from source location, e.g. "realtime#/components/schemas/AddAudio". */
export type TypeId = string;

export interface SourceLocation {
  /** Logical document name, e.g. "batch" | "realtime". */
  document: string;
  /** JSON pointer into the bundled (not dereferenced) source document. */
  pointer: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Documentation metadata
// ─────────────────────────────────────────────────────────────────────────────

export interface Docs {
  title?: string;
  /** CommonMark. Rendered by the consumer, never pre-rendered here. */
  description?: string;
  deprecated?: boolean;
  /** Normalised from both `example` (OAS 3.0) and `examples` (JSON Schema / 3.1). */
  examples?: unknown[];
  default?: unknown;
  externalDocs?: { url: string; description?: string };
  /** Human-readable notes synthesised during lowering, e.g. from dependentRequired. */
  notes?: string[];
  /** All `x-*` keys, passed through untouched for custom renderers. */
  extensions?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constraints (typed, so the UI can render them as "chips")
// ─────────────────────────────────────────────────────────────────────────────

export interface Bound {
  value: number;
  /** Normalised from boolean (OAS 3.0 / draft-04) and numeric (2020-12) forms. */
  exclusive: boolean;
}

export interface StringConstraints {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  /** e.g. "date-time", "uri", "uuid", "binary", "byte". Kept verbatim. */
  format?: string;
  contentMediaType?: string;
  contentEncoding?: string;
}

export interface NumberConstraints {
  minimum?: Bound;
  maximum?: Bound;
  multipleOf?: number;
  /** e.g. "int32", "int64", "float", "double". */
  format?: string;
}

export interface ArrayConstraints {
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  contains?: { node: Node; min?: number; max?: number };
}

export interface ObjectConstraints {
  minProperties?: number;
  maxProperties?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Nodes
// ─────────────────────────────────────────────────────────────────────────────

interface NodeBase {
  source: SourceLocation;
  /**
   * Docs attached to this node. For a RefNode these are usage-level docs from
   * $ref siblings (OAS 3.1 / 2020-12); type-level docs live on the TypeDef.
   */
  docs: Docs;
  /**
   * Folded from: type: [X, "null"], OAS 3.0 `nullable: true`,
   * and anyOf/oneOf: [X, { type: "null" }].
   */
  nullable: boolean;
}

export interface StringNode extends NodeBase {
  kind: "string";
  constraints: StringConstraints;
}

export interface NumberNode extends NodeBase {
  kind: "number";
  integer: boolean;
  constraints: NumberConstraints;
}

export interface BooleanNode extends NodeBase {
  kind: "boolean";
}

/** Only emitted when null is the *sole* allowed value; otherwise see `nullable`. */
export interface NullNode extends NodeBase {
  kind: "null";
}

/** `const`. Common for message-type fields, e.g. message: "StartRecognition". */
export interface ConstNode extends NodeBase {
  kind: "const";
  value: unknown;
}

export interface EnumMember {
  value: unknown;
  /** Populated when lowered from the oneOf-of-documented-consts idiom. */
  docs?: Docs;
}

export interface EnumNode extends NodeBase {
  kind: "enum";
  /** Inferred from `type` or from member values; undefined if mixed. */
  baseType?: "string" | "number" | "integer" | "boolean";
  members: EnumMember[];
}

export interface Property {
  name: string;
  node: Node;
  required: boolean;
  /** Lifted from the property's subschema. Used by projectForView(). */
  readOnly: boolean;
  writeOnly: boolean;
  deprecated: boolean;
  /**
   * Usage-level docs. Renderer precedence for description:
   * property.docs → ref target TypeDef docs → nothing.
   */
  docs: Docs;
}

export type AdditionalProperties =
  | { kind: "forbidden" } // additionalProperties: false
  | { kind: "any" } //       absent or true
  | { kind: "schema"; node: Node };

export interface ObjectNode extends NodeBase {
  kind: "object";
  /** Source key order preserved; never sorted. */
  properties: Property[];
  additional: AdditionalProperties;
  patternProperties: { pattern: string; node: Node }[];
  /** From propertyNames, when it constrains keys of a mostly-fixed object. */
  propertyNames?: StringNode | EnumNode;
  constraints: ObjectConstraints;
  /** Named types merged in via allOf, for "extends X" display. */
  composedFrom: TypeId[];
}

/** Object with no fixed properties, used as a dictionary: Record<K, V>. */
export interface MapNode extends NodeBase {
  kind: "map";
  /** From propertyNames / a single patternProperties pattern, if any. */
  keys?: StringNode | EnumNode;
  values: Node;
  constraints: ObjectConstraints;
}

export interface ArrayNode extends NodeBase {
  kind: "array";
  items: Node;
  constraints: ArrayConstraints;
}

/** prefixItems (2020-12) or items: [...] (draft-07 / AsyncAPI 2.x). */
export interface TupleNode extends NodeBase {
  kind: "tuple";
  prefixItems: Node[];
  /** From `items` alongside prefixItems (or additionalItems in draft-07). */
  rest: { kind: "forbidden" } | { kind: "any" } | { kind: "schema"; node: Node };
  constraints: ArrayConstraints;
}

export interface UnionVariant {
  label: string;
  /** How the label was derived, so renderers can style e.g. index labels differently. */
  labelSource: "title" | "ref" | "discriminator" | "const" | "index";
  /** Value of the discriminating property for this variant, if known. */
  discriminatorValue?: unknown;
  node: Node;
}

export interface UnionNode extends NodeBase {
  kind: "union";
  /** oneOf → "exactlyOne", anyOf → "atLeastOne". Many renderers can ignore this. */
  mode: "exactlyOne" | "atLeastOne";
  variants: UnionVariant[];
  discriminator?: {
    propertyName: string;
    /** True when inferred from a shared const-valued property, not declared. */
    inferred: boolean;
  };
}

/** Fallback for allOf members that could not be merged into one ObjectNode. */
export interface IntersectionNode extends NodeBase {
  kind: "intersection";
  members: Node[];
}

/** Reference to a named type in the registry. Breaks cycles; renderer picks inline vs link. */
export interface RefNode extends NodeBase {
  kind: "ref";
  target: TypeId;
}

/** `{}` or `true`. */
export interface AnyNode extends NodeBase {
  kind: "any";
}

/** `false`. */
export interface NeverNode extends NodeBase {
  kind: "never";
}

/**
 * Escape hatch for if/then/else, not, dependentSchemas, unevaluated*,
 * $dynamicRef, non-JSON-Schema AsyncAPI schemaFormats (e.g. Avro), etc.
 * Always paired with a Diagnostic.
 */
export interface UnsupportedNode extends NodeBase {
  kind: "unsupported";
  reason: string;
  /** The canonical (post-upcast) schema fragment, for a "raw schema" view. */
  raw: unknown;
  /** Best-effort lowering of the parts that WERE understood, if any. */
  partial?: Node;
}

export type Node =
  | StringNode
  | NumberNode
  | BooleanNode
  | NullNode
  | ConstNode
  | EnumNode
  | ObjectNode
  | MapNode
  | ArrayNode
  | TupleNode
  | UnionNode
  | IntersectionNode
  | RefNode
  | AnyNode
  | NeverNode
  | UnsupportedNode;

// ─────────────────────────────────────────────────────────────────────────────
// Registry & diagnostics
// ─────────────────────────────────────────────────────────────────────────────

export interface TypeDef {
  id: TypeId;
  /** Display name, e.g. "TranscriptionConfig" (last pointer segment, or title). */
  name: string;
  /**
   * URL-safe anchor, assigned once over the completed registry so collisions
   * between documents (two `Job`s) can be broken deterministically. Renderers
   * read this; they never derive anchors themselves.
   */
  slug: string;
  node: Node;
  /** Type-level docs. */
  docs: Docs;
  source: SourceLocation;
  /** Computed post-lowering, for "Referenced by" back-links. */
  referencedBy: TypeId[];
}

export interface Diagnostic {
  severity: "info" | "warning" | "error";
  /** Stable code for allow-listing in CI, e.g. "ALLOF_CONFLICT". See ./diagnostics.ts. */
  code: string;
  message: string;
  source: SourceLocation;
}

/** The project-wide named-type registry. Lives on `ApiIR.schemas`. */
export type TypeRegistry = Record<TypeId, TypeDef>;

// ─────────────────────────────────────────────────────────────────────────────
// View projection (readOnly / writeOnly)
// ─────────────────────────────────────────────────────────────────────────────

export type View = "request" | "response" | "neutral";

/*
 * `projectForView(node, view, ir)` returns a copy of `node` with properties
 * removed that don't apply to the view (readOnly dropped from "request",
 * writeOnly from "response"). Not yet implemented — see docs/PLAN.md, M1.
 */
