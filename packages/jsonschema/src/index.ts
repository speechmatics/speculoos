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

export { type BuildSchemasOptions, type BuildSchemasResult, buildSchemas } from "./build.js";
export {
  bool,
  DATA_KEYWORDS,
  isObject,
  isSchema,
  num,
  SCHEMA_ARRAY_KEYWORDS,
  SCHEMA_KEYWORDS,
  SCHEMA_MAP_KEYWORDS,
  type Schema,
  str,
  types,
} from "./canonical.js";
export { child, escapePointer, extractDocs, type LowerContext, lower } from "./lower.js";
export { type Lowerer, Registry, type Resolver, typeIdOf, typeNameOf } from "./registry.js";
export {
  constUnionToEnum,
  detectMap,
  foldNullableUnion,
  inferDiscriminator,
  mapChildren,
  PASSES,
  simplify,
  unwrapSingleVariant,
} from "./simplify.js";
export { type Dialect, upcast } from "./upcast.js";
