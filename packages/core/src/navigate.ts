/**
 * Walking and grouping an `ApiIR`.
 *
 * `groupByTag` returning endpoint/operation *pairs* rather than bare operations
 * is deliberate: an `Operation` does not know its own address, and a renderer
 * needs `POST /v2/jobs`, not `POST`. Denormalising the address onto every
 * operation would mean two places to keep in sync, so the pair is the unit.
 */

import type { ApiIR, Endpoint, MessageOperation, Operation, TagDef } from "./document.js";
import type { Node, TypeDef, TypeId, TypeRegistry } from "./schema.js";

/** An operation together with the endpoint it hangs off. */
export interface OperationEntry {
  endpoint: Endpoint;
  operation: Operation;
}

export interface TagGroup {
  /** Synthesised for operations carrying no tag; `source` points at the document. */
  tag: TagDef;
  entries: OperationEntry[];
}

/**
 * The endpoints worth listing: those with at least one operation, in document
 * order.
 *
 * An endpoint with none has nothing a reader can do there. The usual case is
 * an AsyncAPI 3 reply address — `reply.channel` names a channel that exists
 * only for a reply to land on — and the reply is already shown, messages and
 * address, inside the operation that expects it. Listing it again would be a
 * section saying "No operations". It is left out of listings only: it is still
 * in `ir.endpoints`, and still renders when asked for by id.
 */
export function listedEndpoints(ir: Pick<ApiIR, "endpoints">): Endpoint[] {
  return ir.endpoints.filter((endpoint) => endpoint.operations.length > 0);
}

/**
 * Where a reply arrives, for a reader: the runtime address when the spec gives
 * one (`$message.header#/replyTo`), else the address of the channel it names.
 *
 * The second case matters because that channel is usually reply-only and so
 * left out of `listedEndpoints` — this heading is then the one place the page
 * says where the reply lands. Undefined when the reply arrives on the
 * operation's own channel.
 */
export function replyAddress(
  reply: NonNullable<MessageOperation["reply"]>,
  ir: Pick<ApiIR, "endpoints">,
): string | undefined {
  if (reply.address !== undefined) return reply.address;
  if (reply.channel === undefined) return undefined;
  return ir.endpoints.find((e) => e.id === reply.channel)?.address;
}

/** Every operation in the document, in endpoint then source order. */
export function allOperations(ir: Pick<ApiIR, "endpoints">): OperationEntry[] {
  return ir.endpoints.flatMap((endpoint) =>
    endpoint.operations.map((operation) => ({ endpoint, operation })),
  );
}

/**
 * Groups operations under `ir.tags`, preserving declared tag order, and appends
 * an untagged bucket when needed. Operations with several tags appear under each
 * — that is what tags mean, and deduplicating would hide operations.
 */
export function groupByTag(ir: Pick<ApiIR, "endpoints" | "tags">, untaggedLabel = "Other"): TagGroup[] {
  const entries = allOperations(ir);
  const groups: TagGroup[] = ir.tags.map((tag) => ({
    tag,
    entries: entries.filter((e) => e.operation.tags.includes(tag.name)),
  }));

  const known = new Set(ir.tags.map((t) => t.name));
  const untagged = entries.filter((e) => !e.operation.tags.some((t) => known.has(t)));
  if (untagged.length > 0) {
    groups.push({
      tag: { name: untaggedLabel, docs: {}, source: { document: "", pointer: "#" } },
      entries: untagged,
    });
  }

  return groups.filter((g) => g.entries.length > 0);
}

export function resolveRef(id: TypeId, schemas: TypeRegistry): TypeDef | undefined {
  return schemas[id];
}

/**
 * Depth-first walk of a node tree, in display order. Does not follow `$ref`s —
 * they are registry entries, and following them would not terminate. Walk the
 * registry separately if you need every node in the document.
 */
export function walk(
  node: Node,
  visit: (node: Node, path: string[]) => void,
  path: string[] = [],
): void {
  visit(node, path);
  const go = (child: Node, segment: string): void => walk(child, visit, [...path, segment]);

  switch (node.kind) {
    case "object":
      for (const p of node.properties) go(p.node, p.name);
      if (node.additional.kind === "schema") go(node.additional.node, "[additional]");
      for (const pp of node.patternProperties) go(pp.node, `/${pp.pattern}/`);
      break;
    case "map":
      go(node.values, "[value]");
      break;
    case "array":
      go(node.items, "[]");
      if (node.constraints.contains) go(node.constraints.contains.node, "[contains]");
      break;
    case "tuple":
      node.prefixItems.forEach((n, i) => go(n, String(i)));
      if (node.rest.kind === "schema") go(node.rest.node, "[rest]");
      break;
    case "union":
      node.variants.forEach((v, i) => go(v.node, v.label || `option-${i + 1}`));
      break;
    case "intersection":
      node.members.forEach((n, i) => go(n, `member-${i + 1}`));
      break;
    case "unsupported":
      if (node.partial) go(node.partial, "[partial]");
      break;
    default:
      break;
  }
}
