/**
 * readOnly / writeOnly projection.
 *
 * A property marked `readOnly` is meaningless in a request body; `writeOnly` is
 * meaningless in a response. The IR stores one representation and callers ask
 * for the view they need.
 *
 * Note that this deliberately does *not* follow `$ref`s. A ref points at a shared
 * registry entry, and projecting it would mean rewriting the registry into three
 * view-specific copies. Instead `toTree` applies the same predicate as it expands
 * refs, so the filter still reaches through them where it matters — at display time.
 *
 * That is why `MediaVariant` carries a `view`: an adapter projects what it can and
 * records what the rest of the pipeline needs to finish the job.
 */

import type { Node, View } from "./schema.js";

/** True when a property should be shown in the given view. */
export function appliesToView(flags: { readOnly: boolean; writeOnly: boolean }, view: View): boolean {
  switch (view) {
    case "request":
      return !flags.readOnly;
    case "response":
      return !flags.writeOnly;
    case "neutral":
      return true;
  }
}

/**
 * Returns a copy of `node` with properties removed that don't apply to `view`.
 * Pure; does not mutate. Stops at `ref` nodes — see the note above.
 */
export function projectForView(node: Node, view: View): Node {
  if (view === "neutral") return node;

  switch (node.kind) {
    case "object":
      return {
        ...node,
        properties: node.properties
          .filter((p) => appliesToView(p, view))
          .map((p) => ({ ...p, node: projectForView(p.node, view) })),
        additional:
          node.additional.kind === "schema"
            ? { kind: "schema", node: projectForView(node.additional.node, view) }
            : node.additional,
        patternProperties: node.patternProperties.map((pp) => ({
          ...pp,
          node: projectForView(pp.node, view),
        })),
      };

    case "map":
      return { ...node, values: projectForView(node.values, view) };

    case "array":
      return {
        ...node,
        items: projectForView(node.items, view),
        constraints: node.constraints.contains
          ? {
              ...node.constraints,
              contains: {
                ...node.constraints.contains,
                node: projectForView(node.constraints.contains.node, view),
              },
            }
          : node.constraints,
      };

    case "tuple":
      return {
        ...node,
        prefixItems: node.prefixItems.map((n) => projectForView(n, view)),
        rest: node.rest.kind === "schema" ? { kind: "schema", node: projectForView(node.rest.node, view) } : node.rest,
      };

    case "union":
      return {
        ...node,
        variants: node.variants.map((v) => ({ ...v, node: projectForView(v.node, view) })),
      };

    case "intersection":
      return { ...node, members: node.members.map((n) => projectForView(n, view)) };

    case "unsupported":
      return node.partial ? { ...node, partial: projectForView(node.partial, view) } : node;

    default:
      return node;
  }
}
