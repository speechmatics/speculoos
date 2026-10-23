/**
 * @speculoos/transforms — IR in, IR out.
 *
 * This is where "fits my docs site" gets resolved. Without it the only way to
 * hide an internal endpoint or reorder the navigation is to fork the adapter,
 * and a forked adapter stops tracking the dialect it parses.
 *
 * Every pass is pure and returns a new document; none mutates its input.
 */

export {
  applyTransforms,
  TransformError,
  named,
  type ApplyOptions,
  type Transform,
} from "./apply.js";
export {
  hideWhere,
  hideInternal,
  filterByTag,
  type FilterByTagOptions,
  type HidePredicate,
  type HideSubject,
} from "./hide.js";
export { sortTags, type SortTagsOptions } from "./tags.js";
export { renameTypes, type RenameMap } from "./rename.js";
export { redactExamples } from "./examples.js";
export { pruneUnreachableTypes } from "./prune.js";
export { reachableTypes, recomputeReferencedBy, endpointNodes, typesIn } from "./reach.js";
