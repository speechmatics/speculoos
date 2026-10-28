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
  type ApplyOptions,
  applyTransforms,
  named,
  type Transform,
  TransformError,
} from "./apply.js";
export { redactExamples } from "./examples.js";
export {
  type FilterByTagOptions,
  filterByTag,
  type HidePredicate,
  type HideSubject,
  hideInternal,
  hideWhere,
} from "./hide.js";
export { pruneUnreachableTypes } from "./prune.js";
export { endpointNodes, reachableTypes, recomputeReferencedBy, typesIn } from "./reach.js";
export { type RenameMap, renameTypes } from "./rename.js";
export { type SortTagsOptions, sortTags } from "./tags.js";
