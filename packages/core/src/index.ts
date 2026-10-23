/**
 * @speculoos/core — the Speculoos intermediate representation.
 *
 *   ./schema.ts     `Node` and friends — the display-oriented lowering of the JSON
 *                   Schema found in OpenAPI and AsyncAPI documents.
 *   ./document.ts   `ApiIR` and friends — endpoints, operations, servers, security.
 *                   The root of the emitted artifact.
 *   ./present.ts    `toTree` / `toRows` — IR nodes in, resolved display nodes out.
 *   ./label.ts      `typeLabel` — the string in the "Type" column.
 *   ./view.ts       `projectForView` — readOnly / writeOnly filtering.
 *   ./navigate.ts   `groupByTag`, `walk`, `resolveRef`.
 *   ./link.ts       `HrefTarget` — where a link points; shared by every renderer.
 *   ./synth.ts      `parametersNode` — parameters and headers, read as properties.
 *   ./slug.ts       `slugify`, `createSlugger` — anchors, assigned project-wide.
 *   ./diagnostics.ts the diagnostic code catalogue — a public contract, as data.
 *
 * No runtime dependencies and no Node built-ins. See docs/PLAN.md.
 */

export type * from "./schema.js";
export type * from "./document.js";

export {
  typeLabel,
  formatValue,
  DIRECTION_LABEL,
  type LabelContext,
  type LabelOptions,
} from "./label.js";
export { projectForView, appliesToView } from "./view.js";
export { slugify, createSlugger } from "./slug.js";
export { defaultHref, type Href, type HrefTarget } from "./link.js";
export { parametersNode, parameterProperty, propertiesNode } from "./synth.js";
export {
  DIAGNOSTIC_CODES,
  DIAGNOSTIC_CODE_NAMES,
  UNSUPPORTED_KEYWORD_CODES,
  describeDiagnostic,
  type DiagnosticCode,
  type DiagnosticSeverity,
} from "./diagnostics.js";
export {
  allOperations,
  groupByTag,
  resolveRef,
  walk,
  type OperationEntry,
  type TagGroup,
} from "./navigate.js";
export {
  toTree,
  toRows,
  flatten,
  collectLinks,
  toFieldList,
  chipsFor,
  type Chip,
  type ChipKind,
  type ChipOptions,
  type FieldChildren,
  type FieldList,
  type FieldNode,
  type PresentContext,
  type ViewOptions,
} from "./present.js";
