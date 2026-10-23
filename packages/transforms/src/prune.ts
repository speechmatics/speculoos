import type { ApiIR, TypeDef, TypeRegistry } from "@speculoos/core";
import { named, type Transform } from "./apply.js";
import { reachableTypes, recomputeReferencedBy } from "./reach.js";

/**
 * Drops registry entries no endpoint can reach.
 *
 * Not in the original plan, and added because `filterByTag` without it is
 * misleading rather than merely wasteful: filter the GitHub description down
 * to one tag and you keep three operations and all 996 schemas, so a renderer
 * that emits a section per type emits 993 pages nothing links to. Pruning is a
 * separate pass because reachability is not always what you want — a published
 * schema registry is a legitimate reason to keep unreferenced types.
 */
export const pruneUnreachableTypes = (): Transform =>
  named("pruneUnreachableTypes", (ir: ApiIR): ApiIR => {
    const reachable = reachableTypes(ir);
    const schemas: TypeRegistry = {};
    for (const [id, def] of Object.entries(ir.schemas)) {
      if (reachable.has(id)) schemas[id] = def as TypeDef;
    }
    if (Object.keys(schemas).length === Object.keys(ir.schemas).length) return ir;
    return { ...ir, schemas: recomputeReferencedBy(schemas) };
  });
