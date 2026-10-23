/**
 * Which named types an endpoint graph can actually reach.
 *
 * `core/walk` deliberately stops at a `$ref` — following one would not
 * terminate. Reachability is the other half: start from the nodes an endpoint
 * owns, collect the refs, then chase those through the registry until the set
 * stops growing.
 */

import { walk } from "@speculoos/core";
import type { ApiIR, Endpoint, Node, TypeId, TypeRegistry } from "@speculoos/core";

/** Every `Node` an endpoint owns directly, including through its callbacks. */
export function endpointNodes(endpoint: Endpoint): Node[] {
  const out: Node[] = [];
  for (const p of endpoint.parameters) out.push(p.node);

  for (const op of endpoint.operations) {
    if (op.kind === "request-response") {
      for (const p of op.parameters) out.push(p.node);
      for (const v of op.requestBody?.content ?? []) out.push(v.node);
      for (const r of op.responses) {
        for (const h of r.headers) out.push(h.node);
        for (const v of r.content) out.push(v.node);
      }
      for (const cb of op.callbacks) out.push(...endpointNodes(cb));
    } else {
      for (const m of [...op.messages, ...(op.reply?.messages ?? [])]) {
        out.push(m.payload);
        if (m.headers) out.push(m.headers);
      }
    }
  }
  return out;
}

/** Ref targets and `allOf` ancestors named anywhere under `node`. */
export function typesIn(node: Node): TypeId[] {
  const out: TypeId[] = [];
  walk(node, (n) => {
    if (n.kind === "ref") out.push(n.target);
    if (n.kind === "object") out.push(...n.composedFrom);
  });
  return out;
}

/**
 * The transitive closure of types reachable from `ir.endpoints`.
 *
 * Anything outside it is a registry entry nothing links to: still valid IR, but
 * a renderer that emits a section per type would emit pages no navigation
 * reaches. That is what `pruneUnreachableTypes` is for.
 */
export function reachableTypes(ir: Pick<ApiIR, "endpoints" | "schemas">): Set<TypeId> {
  const seen = new Set<TypeId>();
  const queue: TypeId[] = [];

  const add = (ids: TypeId[]): void => {
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      queue.push(id);
    }
  };

  for (const endpoint of ir.endpoints) {
    for (const node of endpointNodes(endpoint)) add(typesIn(node));
  }

  while (queue.length > 0) {
    const id = queue.pop() as TypeId;
    const def = ir.schemas[id];
    if (def) add(typesIn(def.node));
  }

  return seen;
}

/**
 * Recomputes `TypeDef.referencedBy` over a registry. Any pass that removes an
 * operation or a type has to do this, or the back-links point at things that
 * are no longer in the document.
 */
export function recomputeReferencedBy(schemas: TypeRegistry): TypeRegistry {
  const incoming = new Map<TypeId, Set<TypeId>>();
  for (const id of Object.keys(schemas)) incoming.set(id, new Set());

  for (const [id, def] of Object.entries(schemas)) {
    for (const target of typesIn(def.node)) {
      if (target !== id) incoming.get(target)?.add(id);
    }
  }

  const out: TypeRegistry = {};
  for (const [id, def] of Object.entries(schemas)) {
    out[id] = { ...def, referencedBy: [...(incoming.get(id) ?? [])].sort() };
  }
  return out;
}
