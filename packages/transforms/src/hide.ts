/**
 * Removing things from the document.
 *
 * The result has to look like a document that was written this way, not like
 * one with holes in it: an endpoint whose every operation was hidden is no
 * longer an address you can talk to, and a tag no surviving operation carries
 * is a navigation entry leading nowhere. Both go.
 */

import type { ApiIR, Endpoint, Operation, TagDef } from "@speculoos/core";
import type { Diagnostic, TypeDef, TypeId } from "@speculoos/core";
import { named, type Transform } from "./apply.js";
import { reachableTypes, recomputeReferencedBy } from "./reach.js";
import { reorder } from "./tags.js";

export type HideSubject =
  | { kind: "endpoint"; endpoint: Endpoint }
  | { kind: "operation"; endpoint: Endpoint; operation: Operation }
  | { kind: "tag"; tag: TagDef }
  | { kind: "type"; type: TypeDef };

/** Return true to remove the subject. */
export type HidePredicate = (subject: HideSubject) => boolean;

function hideInEndpoint(endpoint: Endpoint, hide: HidePredicate): Endpoint | undefined {
  if (hide({ kind: "endpoint", endpoint })) return undefined;

  const operations = endpoint.operations
    .filter((operation) => !hide({ kind: "operation", endpoint, operation }))
    .map((operation) =>
      operation.kind === "request-response"
        ? {
            ...operation,
            callbacks: operation.callbacks
              .map((cb) => hideInEndpoint(cb, hide))
              .filter((cb): cb is Endpoint => cb !== undefined),
          }
        : operation,
    );

  return operations.length === 0 ? undefined : { ...endpoint, operations };
}

/** Tags declared on the document that no surviving operation carries. */
function usedTags(endpoints: Endpoint[]): Set<string> {
  const used = new Set<string>();
  for (const e of endpoints) for (const o of e.operations) for (const t of o.tags) used.add(t);
  return used;
}

/**
 * Drops every endpoint, operation, tag and named type the predicate selects.
 *
 * The usual predicate is an extension flag:
 *
 *     hideWhere((s) => s.kind === "operation" && s.operation.docs.extensions?.["x-internal"] === true)
 *
 * Hiding a type that something still references is allowed — `toTree` already
 * models an unresolvable ref as `{ kind: "link", reason: "unresolved" }` — but
 * it adds a `HIDDEN_TYPE_REFERENCED` diagnostic, because it is far more often a
 * mistake than an intent.
 */
export const hideWhere = (hide: HidePredicate): Transform =>
  named("hideWhere", (ir: ApiIR): ApiIR => {
    const endpoints = ir.endpoints
      .map((endpoint) => hideInEndpoint(endpoint, hide))
      .filter((e): e is Endpoint => e !== undefined);

    const hiddenTypes = new Set<TypeId>();
    const schemas: Record<TypeId, TypeDef> = {};
    for (const [id, type] of Object.entries(ir.schemas)) {
      if (hide({ kind: "type", type })) hiddenTypes.add(id);
      else schemas[id] = type;
    }

    const diagnostics: Diagnostic[] = [...ir.diagnostics];
    if (hiddenTypes.size > 0) {
      const stillReferenced = reachableTypes({ endpoints, schemas });
      for (const id of hiddenTypes) {
        if (!stillReferenced.has(id)) continue;
        const type = ir.schemas[id] as TypeDef;
        diagnostics.push({
          severity: "warning",
          code: "HIDDEN_TYPE_REFERENCED",
          message: `Type ${type.name} was hidden but is still referenced; renderers will show a broken link.`,
          source: type.source,
        });
      }
    }

    // A tag that *became* unused is an artefact of this pass and goes; one that
    // was already unused was declared that way on purpose and stays.
    const before = usedTags(ir.endpoints);
    const after = usedTags(endpoints);
    const tags = ir.tags.filter(
      (tag) => !hide({ kind: "tag", tag }) && (after.has(tag.name) || !before.has(tag.name)),
    );

    return {
      ...ir,
      endpoints,
      tags,
      schemas: hiddenTypes.size > 0 ? recomputeReferencedBy(schemas) : schemas,
      diagnostics,
    };
  });

/**
 * `hideWhere` for the common case: a truthy extension on the thing itself.
 * Checks operations, endpoints, tags and types alike, so one flag works
 * wherever a spec author chose to put it.
 */
export const hideInternal = (key = "x-internal"): Transform =>
  named(`hideInternal(${key})`, (ir) =>
    hideWhere((s) => {
      const docs =
        s.kind === "endpoint" ? s.endpoint.docs
        : s.kind === "operation" ? s.operation.docs
        : s.kind === "tag" ? s.tag.docs
        : s.type.docs;
      return Boolean(docs.extensions?.[key]);
    })(ir),
  );

export interface FilterByTagOptions {
  /** Keep operations carrying none of `ir.tags`. Default false. */
  keepUntagged?: boolean;
}

/**
 * Keeps only operations carrying at least one of `tags`, and reorders
 * `ir.tags` to match the order given — a filtered document is nearly always
 * about to become one page, and its navigation should read in the order the
 * caller asked for.
 *
 * Unwanted tags are dropped outright, including ones that already carried no
 * operations. That differs from `hideWhere`, which keeps a tag that was already
 * unused on the grounds that it was declared that way on purpose; here the
 * caller has named the tags they want, and leaving the others in the navigation
 * would contradict them.
 */
export const filterByTag = (tags: readonly string[], opts: FilterByTagOptions = {}): Transform => {
  const wanted = new Set(tags);
  return named(`filterByTag(${[...wanted].join(", ")})`, (ir: ApiIR): ApiIR => {
    const declared = new Set(ir.tags.map((t) => t.name));
    const keep = (op: Operation): boolean =>
      op.tags.some((t) => wanted.has(t)) ||
      (opts.keepUntagged === true && !op.tags.some((t) => declared.has(t)));

    const hidden = hideWhere((s) =>
      s.kind === "operation" ? !keep(s.operation)
      : s.kind === "tag" ? !wanted.has(s.tag.name)
      : false,
    )(ir);
    return { ...hidden, tags: reorder(hidden.tags, [...wanted], "after") };
  });
};
