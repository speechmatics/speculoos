/**
 * Canonical JSON Schema → IR nodes.
 *
 * Opinionated and lossy, but never silently: anything without a sensible display
 * becomes an `UnsupportedNode` carrying the raw schema and a reason, paired with
 * a diagnostic. Dialect-blind by construction — see ./upcast.ts.
 */

import type {
  ArrayConstraints,
  Diagnostic,
  Docs,
  EnumMember,
  Node,
  NumberConstraints,
  ObjectConstraints,
  Property,
  SourceLocation,
  StringConstraints,
  TypeId,
  UnionVariant,
} from "@speculoos/core";
import { bool, isObject, num, str, types } from "./canonical.js";

export interface LowerContext {
  /**
   * Resolves a `$ref` seen at `from` to a registry TypeId, registering the
   * target if it has not been lowered yet. Undefined when it cannot be resolved.
   */
  typeIdFor(ref: string, from: SourceLocation): TypeId | undefined;
  report(diagnostic: Diagnostic): void;
}

/** Keywords we recognise but cannot draw. Each becomes a node plus a diagnostic. */
const UNSUPPORTED: Record<string, string> = {
  if: "if/then/else has no display form",
  not: "`not` has no display form",
  dependentSchemas: "dependentSchemas has no display form",
  unevaluatedProperties: "unevaluatedProperties has no display form",
  unevaluatedItems: "unevaluatedItems has no display form",
  $dynamicRef: "$dynamicRef cannot be resolved statically",
};

export function lower(schema: unknown, loc: SourceLocation, ctx: LowerContext): Node {
  const base = { source: loc, docs: {}, nullable: false } as const;

  if (schema === true) return { kind: "any", ...base };
  if (schema === false) return { kind: "never", ...base };
  if (!isObject(schema)) {
    ctx.report(diag("error", "INVALID_SCHEMA", "Schema is neither an object nor a boolean", loc));
    return { kind: "unsupported", ...base, reason: "not a schema", raw: schema };
  }

  const docs = extractDocs(schema);
  const typeList = types(schema);
  // OAS 3.0 `nullable: true` with no `type` upcasts to `type: ["null"]` plus a
  // marker, because on its own it constrains nothing. It still means "and null
  // too" for whatever the other keywords describe — a union, usually — so it
  // has to reach `head` rather than only the null-only branch below.
  const nullableAny = schema["$speculoosNullableAny"] === true;
  const nullable = (typeList.includes("null") && typeList.length > 1) || nullableAny;
  const nullOnly = typeList.length === 1 && typeList[0] === "null";

  // A `$ref` with siblings: the siblings are usage-level docs for this position.
  const ref = str(schema, "$ref");
  if (ref !== undefined) {
    const target = ctx.typeIdFor(ref, loc);
    if (target === undefined) {
      ctx.report(diag("error", "UNRESOLVED_REF", `Cannot resolve $ref "${ref}"`, loc));
      return { kind: "unsupported", ...base, docs, reason: `unresolved $ref "${ref}"`, raw: schema };
    }
    return { kind: "ref", ...base, docs, nullable, target };
  }

  for (const [keyword, reason] of Object.entries(UNSUPPORTED)) {
    if (schema[keyword] === undefined) continue;
    ctx.report(diag("warning", code(keyword), reason, loc));
    const rest = { ...schema };
    delete rest[keyword];
    const partial = hasDisplayableContent(rest) ? lower(rest, loc, ctx) : undefined;
    return {
      kind: "unsupported",
      ...base,
      docs,
      nullable,
      reason,
      raw: schema,
      ...(partial !== undefined && { partial }),
    };
  }

  // `dependentRequired` has no node of its own, but it is worth a sentence.
  const notes = dependentRequiredNotes(schema);
  const allDocs: Docs = notes.length > 0 ? { ...docs, notes: [...(docs.notes ?? []), ...notes] } : docs;
  const head = { ...base, docs: allDocs, nullable } as const;

  if (schema["const"] !== undefined) {
    return { kind: "const", ...head, value: schema["const"] };
  }

  const enumValues = schema["enum"];
  if (Array.isArray(enumValues)) {
    const members: EnumMember[] = enumValues.map((value) => ({ value }));
    const baseType = inferEnumBase(enumValues, typeList);
    return {
      kind: "enum",
      ...head,
      ...(baseType !== undefined && { baseType }),
      members,
    };
  }

  if (Array.isArray(schema["allOf"])) return lowerAllOf(schema, head, loc, ctx);
  const union = lowerUnion(schema, head, loc, ctx);
  if (union !== undefined) return union;

  if (nullOnly) {
    // `nullable: true` with no type at all: everything is allowed, and null too.
    if (schema["$speculoosNullableAny"] === true) return { kind: "any", ...head, nullable: true };
    return { kind: "null", ...head, nullable: false };
  }

  const kind = typeList.find((t) => t !== "null") ?? inferType(schema);

  switch (kind) {
    case "object":
      return lowerObject(schema, head, loc, ctx);
    case "array":
      return lowerArray(schema, head, loc, ctx);
    case "string":
      return { kind: "string", ...head, constraints: stringConstraints(schema) };
    case "integer":
      return { kind: "number", ...head, integer: true, constraints: numberConstraints(schema) };
    case "number":
      return { kind: "number", ...head, integer: false, constraints: numberConstraints(schema) };
    case "boolean":
      return { kind: "boolean", ...head };
    default:
      return { kind: "any", ...head };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Composition
// ─────────────────────────────────────────────────────────────────────────────

type Head = { source: SourceLocation; docs: Docs; nullable: boolean };

function lowerUnion(
  schema: Record<string, unknown>,
  head: Head,
  loc: SourceLocation,
  ctx: LowerContext,
): Node | undefined {
  const keyword = Array.isArray(schema["oneOf"])
    ? "oneOf"
    : Array.isArray(schema["anyOf"])
      ? "anyOf"
      : undefined;
  if (keyword === undefined) return undefined;

  const branches = schema[keyword] as unknown[];
  const mapping = discriminatorMapping(schema);
  const variants: UnionVariant[] = branches.map((branch, i) => {
    const at = child(loc, `${keyword}/${i}`);
    const node = lower(branch, at, ctx);
    const { label, labelSource } = variantLabel(branch, node, mapping, i, ctx, at);
    const discriminatorValue = mappingValueFor(branch, mapping);
    return {
      label,
      labelSource,
      node,
      ...(discriminatorValue !== undefined && { discriminatorValue }),
    };
  });

  const declared = declaredDiscriminator(schema);
  const union: Node = {
    kind: "union",
    ...head,
    mode: keyword === "oneOf" ? "exactlyOne" : "atLeastOne",
    variants,
    ...(declared !== undefined && { discriminator: { propertyName: declared, inferred: false } }),
  };

  // Keywords sitting alongside oneOf/anyOf apply as well, exactly as they do
  // alongside allOf. Returning the union on its own discards them, which on the
  // GitHub description silently emptied fifteen request bodies: a schema that
  // declares five properties *and* an `anyOf` saying which of them are required
  // rendered as two empty branches.
  const rest = { ...schema };
  delete rest[keyword];
  delete rest["nullable"]; //        folded into `head` (and upcast away for OAS 3.0)
  delete rest["discriminator"]; //   describes the union, not a sibling constraint
  delete rest["dependentRequired"]; // already a note on `head.docs`
  if (!hasDisplayableContent(rest)) return union;

  // `{ properties: …, anyOf: [{ required: [a] }, { required: [b] }] }` is the
  // standard spelling of "at least one of a, b". Lowered literally it becomes
  // branches with nothing in them, so it folds into a note on the object the
  // branches are talking about.
  const note = requiredOnlyNote(branches, keyword);
  if (note !== undefined) {
    const local = lower(rest, loc, ctx);
    return withNote(local, note);
  }

  const local = lower(rest, loc, ctx);
  // A bare `type: object` next to a union agrees with its branches rather than
  // adding to them; intersecting with an empty object would be pure noise. So
  // does a bare `type: string` next to a oneOf of string consts — the
  // documented-enum idiom, which then folds into an enum like any other.
  if (addsNothing(local) || restatesConsts(local, variants)) return union;

  ctx.report(
    diag(
      "info",
      "UNION_WITH_SIBLINGS",
      `${keyword} sits alongside other keywords; both apply, so they are shown as an intersection`,
      loc,
    ),
  );
  return { kind: "intersection", ...head, members: [local, union] };
}

/**
 * The names each branch requires, when that is *all* a branch says. Undefined
 * as soon as one branch carries anything else, because then the branches are
 * real alternatives and deserve to be shown as such.
 */
function requiredOnlyNote(branches: unknown[], keyword: "oneOf" | "anyOf"): string | undefined {
  if (branches.length === 0) return undefined;
  const labels: string[] = [];
  for (const branch of branches) {
    if (!isObject(branch)) return undefined;
    const extra = Object.keys(branch).filter(
      (k) => k !== "required" && !k.startsWith("$") && !DOC_KEYWORDS.has(k),
    );
    if (extra.length > 0) return undefined;
    const required = branch["required"];
    if (!Array.isArray(required) || required.length === 0) return undefined;
    labels.push((required as string[]).map((n) => `\`${n}\``).join(" and "));
  }
  const lead = keyword === "oneOf" ? "Exactly one of" : "At least one of";
  return `${lead} these is required: ${labels.join(", ")}.`;
}

function withNote(node: Node, note: string): Node {
  return { ...node, docs: { ...node.docs, notes: [...(node.docs.notes ?? []), note] } };
}

/**
 * Is this a bare primitive type that every branch, being a const of that type,
 * already satisfies? `{ type: string, oneOf: [{ const: a }, { const: b }] }`.
 */
function restatesConsts(node: Node, variants: { node: Node }[]): boolean {
  const kind =
    node.kind === "string" || node.kind === "boolean" ? node.kind
    : node.kind === "number" ? "number"
    : undefined;
  if (kind === undefined || variants.length === 0) return false;
  if ("constraints" in node && Object.keys(node.constraints).length > 0) return false;
  return variants.every((v) => v.node.kind === "const" && typeof v.node.value === kind);
}

/** Does this node constrain anything its siblings do not already say? */
function addsNothing(node: Node): boolean {
  if (node.kind === "any") return true;
  if (node.kind !== "object") return false;
  return (
    node.properties.length === 0 &&
    node.patternProperties.length === 0 &&
    node.additional.kind === "any" &&
    node.propertyNames === undefined &&
    Object.keys(node.constraints).length === 0 &&
    node.composedFrom.length === 0
  );
}

/**
 * `allOf` of compatible objects merges into one object; refs become
 * `composedFrom`, so a renderer can say "extends X" instead of flattening away
 * a name the reader knows. Anything that cannot merge falls back to
 * `intersection` plus a diagnostic rather than a silent guess.
 */
function lowerAllOf(
  schema: Record<string, unknown>,
  head: Head,
  loc: SourceLocation,
  ctx: LowerContext,
): Node {
  const branches = schema["allOf"] as unknown[];
  const members = branches.map((b, i) => lower(b, child(loc, `allOf/${i}`), ctx));

  // Keywords sitting alongside allOf are themselves a member of the merge.
  const rest = { ...schema };
  delete rest["allOf"];
  if (hasDisplayableContent(rest)) members.push(lower(rest, loc, ctx));

  const composedFrom: TypeId[] = [];
  const objects: Extract<Node, { kind: "object" }>[] = [];
  let mergeable = true;

  for (const m of members) {
    if (m.kind === "ref") composedFrom.push(m.target);
    else if (m.kind === "object") objects.push(m);
    else if (m.kind === "any") continue;
    else mergeable = false;
  }

  if (!mergeable || (objects.length === 0 && composedFrom.length === 0)) {
    ctx.report(
      diag("info", "ALLOF_UNMERGED", "allOf members could not be merged into one object", loc),
    );
    return { kind: "intersection", ...head, members };
  }

  const properties: Property[] = [];
  const seen = new Map<string, number>();
  for (const o of objects) {
    for (const p of o.properties) {
      const at = seen.get(p.name);
      if (at === undefined) {
        seen.set(p.name, properties.length);
        properties.push(p);
        continue;
      }
      // `allOf` means every member applies at once, so two definitions of a
      // property are an intersection, not a disagreement. Specs in the wild
      // routinely restate a property to refine it, and picking one would throw
      // away the other's constraints.
      const merged = mergeProperties(properties[at]!, p);
      if (merged === undefined) {
        ctx.report(
          diag("warning", "ALLOF_CONFLICT", `allOf members give "${p.name}" incompatible types`, loc),
        );
        continue; // keep the first; the conflict is on the record
      }
      properties[at] = merged;
    }
  }

  const forbidden = objects.some((o) => o.additional.kind === "forbidden");
  return {
    kind: "object",
    ...head,
    docs: { ...mergeDocsList(objects.map((o) => o.docs)), ...head.docs },
    properties,
    additional: forbidden ? { kind: "forbidden" } : { kind: "any" },
    patternProperties: objects.flatMap((o) => o.patternProperties),
    constraints: Object.assign({}, ...objects.map((o) => o.constraints)) as ObjectConstraints,
    composedFrom,
  };
}

/**
 * Intersects two definitions of the same property. Undefined when the two
 * genuinely cannot both hold — different kinds — which is a modelling error
 * worth a diagnostic rather than a silent choice.
 */
function mergeProperties(a: Property, b: Property): Property | undefined {
  const node = mergeNodes(a.node, b.node);
  if (node === undefined) return undefined;
  return {
    name: a.name,
    node,
    // Required in either member means required in the whole.
    required: a.required || b.required,
    readOnly: a.readOnly || b.readOnly,
    writeOnly: a.writeOnly || b.writeOnly,
    deprecated: a.deprecated || b.deprecated,
    docs: { ...b.docs, ...a.docs },
  };
}

function mergeNodes(a: Node, b: Node): Node | undefined {
  if (a.kind !== b.kind) {
    // `any` constrains nothing, so it yields to anything more specific.
    if (a.kind === "any") return b;
    if (b.kind === "any") return a;
    return undefined;
  }

  const head = { docs: { ...b.docs, ...a.docs }, nullable: a.nullable && b.nullable };

  switch (a.kind) {
    case "string":
    case "number":
      return {
        ...a,
        ...head,
        // First defined wins per key, so the earlier member's `format: uri`
        // survives a later member that simply omits it.
        constraints: { ...(b as typeof a).constraints, ...a.constraints },
      };

    case "ref":
      return a.target === (b as typeof a).target ? { ...a, ...head } : undefined;

    case "enum": {
      const other = b as typeof a;
      const keep = new Set(other.members.map((m) => JSON.stringify(m.value)));
      const members = a.members.filter((m) => keep.has(JSON.stringify(m.value)));
      return members.length === 0 ? undefined : { ...a, ...head, members };
    }

    case "array": {
      const other = b as typeof a;
      const items = mergeNodes(a.items, other.items);
      return items === undefined
        ? undefined
        : { ...a, ...head, items, constraints: { ...other.constraints, ...a.constraints } };
    }

    case "object": {
      const other = b as typeof a;
      const properties = [...a.properties];
      const index = new Map(a.properties.map((p, i) => [p.name, i]));
      for (const p of other.properties) {
        const at = index.get(p.name);
        if (at === undefined) {
          index.set(p.name, properties.length);
          properties.push(p);
          continue;
        }
        const merged = mergeProperties(properties[at]!, p);
        if (merged === undefined) return undefined;
        properties[at] = merged;
      }
      return {
        ...a,
        ...head,
        properties,
        additional:
          a.additional.kind === "forbidden" || other.additional.kind === "forbidden"
            ? { kind: "forbidden" }
            : a.additional,
        composedFrom: [...new Set([...a.composedFrom, ...other.composedFrom])],
        constraints: { ...other.constraints, ...a.constraints },
      };
    }

    default:
      return { ...a, ...head };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Structural kinds
// ─────────────────────────────────────────────────────────────────────────────

function lowerObject(
  schema: Record<string, unknown>,
  head: Head,
  loc: SourceLocation,
  ctx: LowerContext,
): Node {
  const props = isObject(schema["properties"]) ? schema["properties"] : {};
  const requiredList = Array.isArray(schema["required"])
    ? schema["required"].filter((r): r is string => typeof r === "string")
    : [];
  const required = new Set(requiredList);

  // Source key order is preserved and never sorted: it is information.
  const properties: Property[] = Object.entries(props).map(([name, sub]) => {
    const at = child(loc, `properties/${escapePointer(name)}`);
    const node = lower(sub, at, ctx);
    const flags = isObject(sub) ? sub : {};
    return {
      name,
      node,
      required: required.has(name),
      readOnly: bool(flags, "readOnly") ?? false,
      writeOnly: bool(flags, "writeOnly") ?? false,
      deprecated: bool(flags, "deprecated") ?? false,
      docs: isObject(sub) && sub["$ref"] !== undefined ? extractDocs(sub) : {},
    };
  });

  const ap = schema["additionalProperties"];
  const additional: Extract<Node, { kind: "object" }>["additional"] =
    ap === false
      ? { kind: "forbidden" }
      : ap === undefined || ap === true
        ? { kind: "any" }
        : { kind: "schema", node: lower(ap, child(loc, "additionalProperties"), ctx) };

  const patternProperties = isObject(schema["patternProperties"])
    ? Object.entries(schema["patternProperties"]).map(([pattern, sub]) => ({
        pattern,
        node: lower(sub, child(loc, `patternProperties/${escapePointer(pattern)}`), ctx),
      }))
    : [];

  const propertyNames = schema["propertyNames"];
  const names =
    propertyNames === undefined
      ? undefined
      : lower(propertyNames, child(loc, "propertyNames"), ctx);

  const constraints: ObjectConstraints = {};
  const minP = num(schema, "minProperties");
  const maxP = num(schema, "maxProperties");
  if (minP !== undefined) constraints.minProperties = minP;
  if (maxP !== undefined) constraints.maxProperties = maxP;

  return {
    kind: "object",
    ...head,
    properties,
    additional,
    patternProperties,
    ...(names !== undefined && (names.kind === "string" || names.kind === "enum")
      ? { propertyNames: names }
      : {}),
    constraints,
    composedFrom: [],
  };
}

function lowerArray(
  schema: Record<string, unknown>,
  head: Head,
  loc: SourceLocation,
  ctx: LowerContext,
): Node {
  const constraints: ArrayConstraints = {};
  const minItems = num(schema, "minItems");
  const maxItems = num(schema, "maxItems");
  if (minItems !== undefined) constraints.minItems = minItems;
  if (maxItems !== undefined) constraints.maxItems = maxItems;
  if (bool(schema, "uniqueItems") === true) constraints.uniqueItems = true;
  if (schema["contains"] !== undefined) {
    const minContains = num(schema, "minContains");
    const maxContains = num(schema, "maxContains");
    constraints.contains = {
      node: lower(schema["contains"], child(loc, "contains"), ctx),
      ...(minContains !== undefined && { min: minContains }),
      ...(maxContains !== undefined && { max: maxContains }),
    };
  }

  if (Array.isArray(schema["prefixItems"])) {
    const prefixItems = schema["prefixItems"].map((s, i) =>
      lower(s, child(loc, `prefixItems/${i}`), ctx),
    );
    const items = schema["items"];
    const rest: Extract<Node, { kind: "tuple" }>["rest"] =
      items === false
        ? { kind: "forbidden" }
        : items === undefined || items === true
          ? { kind: "any" }
          : { kind: "schema", node: lower(items, child(loc, "items"), ctx) };
    return { kind: "tuple", ...head, prefixItems, rest, constraints };
  }

  const items =
    schema["items"] === undefined
      ? ({ kind: "any", source: child(loc, "items"), docs: {}, nullable: false } as Node)
      : lower(schema["items"], child(loc, "items"), ctx);

  return { kind: "array", ...head, items, constraints };
}

// ─────────────────────────────────────────────────────────────────────────────
// Leaves
// ─────────────────────────────────────────────────────────────────────────────

function stringConstraints(schema: Record<string, unknown>): StringConstraints {
  const c: StringConstraints = {};
  const min = num(schema, "minLength");
  const max = num(schema, "maxLength");
  const pattern = str(schema, "pattern");
  const format = str(schema, "format");
  const mediaType = str(schema, "contentMediaType");
  const encoding = str(schema, "contentEncoding");
  if (min !== undefined) c.minLength = min;
  if (max !== undefined) c.maxLength = max;
  if (pattern !== undefined) c.pattern = pattern;
  if (format !== undefined) c.format = format;
  if (mediaType !== undefined) c.contentMediaType = mediaType;
  if (encoding !== undefined) c.contentEncoding = encoding;
  return c;
}

function numberConstraints(schema: Record<string, unknown>): NumberConstraints {
  const c: NumberConstraints = {};
  const min = num(schema, "minimum");
  const exMin = num(schema, "exclusiveMinimum");
  const max = num(schema, "maximum");
  const exMax = num(schema, "exclusiveMaximum");
  const multipleOf = num(schema, "multipleOf");
  const format = str(schema, "format");
  if (exMin !== undefined) c.minimum = { value: exMin, exclusive: true };
  else if (min !== undefined) c.minimum = { value: min, exclusive: false };
  if (exMax !== undefined) c.maximum = { value: exMax, exclusive: true };
  else if (max !== undefined) c.maximum = { value: max, exclusive: false };
  if (multipleOf !== undefined) c.multipleOf = multipleOf;
  if (format !== undefined) c.format = format;
  return c;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const DOC_KEYWORDS = new Set([
  "title",
  "description",
  "deprecated",
  "default",
  "examples",
  "externalDocs",
]);

export function extractDocs(schema: Record<string, unknown>): Docs {
  const docs: Docs = {};
  const title = str(schema, "title");
  const description = str(schema, "description");
  if (title !== undefined) docs.title = title;
  if (description !== undefined) docs.description = description;
  if (bool(schema, "deprecated") === true) docs.deprecated = true;
  if ("default" in schema) docs.default = schema["default"];
  if (Array.isArray(schema["examples"])) docs.examples = schema["examples"];

  const ext = schema["externalDocs"];
  if (isObject(ext) && typeof ext["url"] === "string") {
    const description = str(ext, "description");
    docs.externalDocs = { url: ext["url"], ...(description !== undefined && { description }) };
  }

  const extensions: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key.startsWith("x-")) extensions[key] = value;
  }
  if (Object.keys(extensions).length > 0) docs.extensions = extensions;

  return docs;
}

function dependentRequiredNotes(schema: Record<string, unknown>): string[] {
  const dr = schema["dependentRequired"];
  if (!isObject(dr)) return [];
  return Object.entries(dr)
    .filter(([, v]) => Array.isArray(v) && v.length > 0)
    .map(([key, v]) => `If \`${key}\` is present, ${(v as string[]).map((n) => `\`${n}\``).join(", ")} ${(v as string[]).length === 1 ? "is" : "are"} required.`);
}

/** Does this schema say anything a reader would see, beyond bookkeeping? */
function hasDisplayableContent(schema: Record<string, unknown>): boolean {
  return Object.keys(schema).some(
    (k) => !k.startsWith("$") && !DOC_KEYWORDS.has(k) && k !== "$speculoosNullableAny",
  );
}

function inferType(schema: Record<string, unknown>): string | undefined {
  if (schema["properties"] !== undefined || schema["required"] !== undefined) return "object";
  if (schema["additionalProperties"] !== undefined) return "object";
  if (schema["patternProperties"] !== undefined) return "object";
  if (schema["items"] !== undefined || schema["prefixItems"] !== undefined) return "array";
  return undefined;
}

function inferEnumBase(
  values: unknown[],
  typeList: string[],
): "string" | "number" | "integer" | "boolean" | undefined {
  const declared = typeList.find((t) => t !== "null");
  if (declared === "string" || declared === "number" || declared === "integer" || declared === "boolean") {
    return declared;
  }
  const kinds = new Set(values.filter((v) => v !== null).map((v) => typeof v));
  if (kinds.size !== 1) return undefined;
  const [only] = [...kinds];
  if (only === "string") return "string";
  if (only === "boolean") return "boolean";
  if (only === "number") return values.every((v) => Number.isInteger(v)) ? "integer" : "number";
  return undefined;
}

function declaredDiscriminator(schema: Record<string, unknown>): string | undefined {
  const d = schema["discriminator"];
  return isObject(d) ? str(d, "propertyName") : undefined;
}

/** OpenAPI discriminator mapping, inverted: ref string → mapping key. */
function discriminatorMapping(schema: Record<string, unknown>): Map<string, string> {
  const out = new Map<string, string>();
  const d = schema["discriminator"];
  if (!isObject(d) || !isObject(d["mapping"])) return out;
  for (const [value, ref] of Object.entries(d["mapping"])) {
    if (typeof ref === "string") out.set(ref, value);
  }
  return out;
}

function mappingValueFor(branch: unknown, mapping: Map<string, string>): unknown {
  if (!isObject(branch)) return undefined;
  const ref = str(branch, "$ref");
  return ref === undefined ? undefined : mapping.get(ref);
}

/**
 * Variant labels, tried in order: the mapping key, the branch's title, its ref
 * name, a `const` on one of its properties, then "Option N". `labelSource` is
 * recorded so renderers can style a fallback index differently from a real name.
 */
function variantLabel(
  branch: unknown,
  node: Node,
  mapping: Map<string, string>,
  index: number,
  ctx: LowerContext,
  loc: SourceLocation,
): { label: string; labelSource: UnionVariant["labelSource"] } {
  if (isObject(branch)) {
    const mapped = mappingValueFor(branch, mapping);
    if (typeof mapped === "string") return { label: mapped, labelSource: "discriminator" };

    const title = str(branch, "title");
    if (title !== undefined) return { label: title, labelSource: "title" };

    const ref = str(branch, "$ref");
    if (ref !== undefined) {
      const id = ctx.typeIdFor(ref, loc);
      if (id !== undefined) return { label: refName(id), labelSource: "ref" };
    }
  }

  if (node.kind === "const") return { label: String(node.value), labelSource: "const" };
  if (node.kind === "object") {
    const marker = node.properties.find((p) => p.node.kind === "const");
    if (marker?.node.kind === "const") {
      return { label: String(marker.node.value), labelSource: "const" };
    }
  }

  return { label: `Option ${index + 1}`, labelSource: "index" };
}

function refName(id: TypeId): string {
  const segments = id.split(/[#/]/).filter(Boolean);
  return segments[segments.length - 1] ?? id;
}

function mergeDocsList(list: Docs[]): Docs {
  const out: Docs = {};
  for (const d of list) {
    for (const [key, value] of Object.entries(d)) {
      if (value !== undefined && out[key as keyof Docs] === undefined) {
        Object.assign(out, { [key]: value });
      }
    }
  }
  return out;
}

export function child(loc: SourceLocation, segment: string): SourceLocation {
  return { document: loc.document, pointer: `${loc.pointer}/${segment}` };
}

export function escapePointer(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

function code(keyword: string): string {
  return keyword.replace(/^\$/, "").replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();
}

function diag(
  severity: Diagnostic["severity"],
  code: string,
  message: string,
  source: SourceLocation,
): Diagnostic {
  return { severity, code, message, source };
}
