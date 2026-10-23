/**
 * @speculoos/jsonschema — upcast dialects to canonical JSON Schema, then lower
 * to the Speculoos IR.
 *
 * Two stages, each simple on its own:
 *
 *   upcast    per-dialect, mechanical, lossless. All dialect knowledge lives here.
 *   lower     canonical → IR. Opinionated and lossy, but never silently, and it
 *             never branches on which dialect the schema came from.
 *
 * Then `simplify` runs the display passes over the result.
 */

export { upcast, type Dialect } from "./upcast.js";
export { lower, extractDocs, child, escapePointer, type LowerContext } from "./lower.js";
export {
  simplify,
  PASSES,
  foldNullableUnion,
  constUnionToEnum,
  detectMap,
  inferDiscriminator,
  unwrapSingleVariant,
  mapChildren,
} from "./simplify.js";
export { Registry, typeIdOf, typeNameOf, type Resolver, type Lowerer } from "./registry.js";
export {
  isObject,
  isSchema,
  types,
  num,
  str,
  bool,
  SCHEMA_KEYWORDS,
  SCHEMA_ARRAY_KEYWORDS,
  SCHEMA_MAP_KEYWORDS,
  DATA_KEYWORDS,
  type Schema,
} from "./canonical.js";
export { buildSchemas, type BuildSchemasOptions, type BuildSchemasResult } from "./build.js";
