/**
 * Simplification passes over the IR.
 *
 * Each pass is a pure `Node → Node` with a single responsibility, applied
 * bottom-up so a pass always sees already-simplified children. Order is
 * load-bearing: folding nullability first means the const-union rule does not
 * have to special-case a `null` branch, and unwrapping single variants last
 * means the earlier passes can reduce a union to one variant and have it
 * disappear.
 */

import type { Node, UnionVariant } from "@speculoos/core";

/** The passes, in the order they must run. */
export const PASSES = [
  foldNullableUnion,
  constUnionToEnum,
  detectMap,
  inferDiscriminator,
  unwrapSingleVariant,
] as const;

/** Applies every pass bottom-up. */
export function simplify(node: Node): Node {
  const withChildren = mapChildren(node, simplify);
  return PASSES.reduce<Node>((n, pass) => pass(n), withChildren);
}

/**
 * `anyOf: [X, { type: "null" }]` is how a huge number of specs spell "nullable",
 * and rendering it as a two-variant union reads badly. Fold the null branch away
 * and set the flag instead.
 */
export function foldNullableUnion(node: Node): Node {
  if (node.kind !== "union") return node;
  const nulls = node.variants.filter((v) => v.node.kind === "null");
  if (nulls.length === 0) return node;

  const rest = node.variants.filter((v) => v.node.kind !== "null");
  if (rest.length === 0) return node;
  if (rest.length === 1) {
    const only = rest[0]!.node;
    return { ...only, nullable: true, docs: { ...only.docs, ...node.docs } };
  }
  return { ...node, variants: rest, nullable: true };
}

/**
 * `oneOf` where every branch is a documented `const` is how specs write an enum
 * when they want per-value descriptions. It is an enum; render it as one.
 */
export function constUnionToEnum(node: Node): Node {
  if (node.kind !== "union") return node;
  if (node.variants.length === 0) return node;
  if (!node.variants.every((v) => v.node.kind === "const")) return node;

  const members = node.variants.map((v) => {
    const constNode = v.node as Extract<Node, { kind: "const" }>;
    const docs = constNode.docs;
    return {
      value: constNode.value,
      ...(Object.keys(docs).length > 0 && { docs }),
    };
  });

  const kinds = new Set(members.map((m) => typeof m.value));
  const baseType =
    kinds.size === 1
      ? ({ string: "string", boolean: "boolean", number: "number" } as const)[[...kinds][0] as string]
      : undefined;

  return {
    kind: "enum",
    source: node.source,
    docs: node.docs,
    nullable: node.nullable,
    ...(baseType !== undefined && {
      baseType:
        baseType === "number" && members.every((m) => Number.isInteger(m.value)) ? ("integer" as const) : baseType,
    }),
    members,
  };
}

/**
 * An object with no declared properties and a schema for `additionalProperties`
 * is a dictionary. `Record<string, X>` reads far better than an empty property
 * table with a footnote.
 */
export function detectMap(node: Node): Node {
  if (node.kind !== "object") return node;
  if (node.properties.length > 0) return node;
  if (node.composedFrom.length > 0) return node;

  if (node.additional.kind === "schema" && node.patternProperties.length === 0) {
    return {
      kind: "map",
      source: node.source,
      docs: node.docs,
      nullable: node.nullable,
      ...(node.propertyNames !== undefined && { keys: node.propertyNames }),
      values: node.additional.node,
      constraints: node.constraints,
    };
  }

  // A single patternProperties entry and nothing else is the same idea.
  if (node.patternProperties.length === 1 && node.additional.kind !== "schema") {
    const only = node.patternProperties[0]!;
    return {
      kind: "map",
      source: node.source,
      docs: node.docs,
      nullable: node.nullable,
      keys: {
        kind: "string",
        source: node.source,
        docs: {},
        nullable: false,
        constraints: { pattern: only.pattern },
      },
      values: only.node,
      constraints: node.constraints,
    };
  }

  return node;
}

/**
 * No declared discriminator, but every variant is an object with a `const` on
 * the same property: that is a discriminated union, and readers deserve the
 * "pick a message type" affordance without the spec having to be changed.
 */
export function inferDiscriminator(node: Node): Node {
  if (node.kind !== "union") return node;
  if (node.discriminator !== undefined) return node;
  if (node.variants.length < 2) return node;

  const candidates = constPropertiesOf(node.variants[0]!);
  if (candidates.size === 0) return node;

  for (const name of candidates.keys()) {
    const values = node.variants.map((v) => constPropertiesOf(v).get(name));
    if (values.some((value) => value === undefined)) continue;
    if (new Set(values.map((v) => JSON.stringify(v))).size !== values.length) continue;

    return {
      ...node,
      discriminator: { propertyName: name, inferred: true },
      variants: node.variants.map((v, i) => ({ ...v, discriminatorValue: values[i] })),
    };
  }

  return node;
}

function constPropertiesOf(variant: UnionVariant): Map<string, unknown> {
  const out = new Map<string, unknown>();
  if (variant.node.kind !== "object") return out;
  for (const p of variant.node.properties) {
    if (p.node.kind === "const") out.set(p.name, p.node.value);
  }
  return out;
}

/** A union of one is just that one thing. */
export function unwrapSingleVariant(node: Node): Node {
  if (node.kind !== "union") return node;
  if (node.variants.length !== 1) return node;
  const only = node.variants[0]!.node;
  return {
    ...only,
    nullable: only.nullable || node.nullable,
    docs: { ...only.docs, ...node.docs },
  };
}

/** Applies `fn` to every direct child schema position, rebuilding the node. */
export function mapChildren(node: Node, fn: (child: Node) => Node): Node {
  switch (node.kind) {
    case "object":
      return {
        ...node,
        properties: node.properties.map((p) => ({ ...p, node: fn(p.node) })),
        additional:
          node.additional.kind === "schema" ? { kind: "schema", node: fn(node.additional.node) } : node.additional,
        patternProperties: node.patternProperties.map((pp) => ({ ...pp, node: fn(pp.node) })),
      };
    case "map":
      return { ...node, values: fn(node.values) };
    case "array":
      return {
        ...node,
        items: fn(node.items),
        constraints: node.constraints.contains
          ? {
              ...node.constraints,
              contains: { ...node.constraints.contains, node: fn(node.constraints.contains.node) },
            }
          : node.constraints,
      };
    case "tuple":
      return {
        ...node,
        prefixItems: node.prefixItems.map(fn),
        rest: node.rest.kind === "schema" ? { kind: "schema", node: fn(node.rest.node) } : node.rest,
      };
    case "union":
      return { ...node, variants: node.variants.map((v) => ({ ...v, node: fn(v.node) })) };
    case "intersection":
      return { ...node, members: node.members.map(fn) };
    case "unsupported":
      return node.partial ? { ...node, partial: fn(node.partial) } : node;
    default:
      return node;
  }
}
