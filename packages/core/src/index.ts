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

export {
  DIAGNOSTIC_CODE_NAMES,
  DIAGNOSTIC_CODES,
  type DiagnosticCode,
  type DiagnosticSeverity,
  describeDiagnostic,
  UNSUPPORTED_KEYWORD_CODES,
} from "./diagnostics.js";
export type * from "./document.js";

export {
  DIRECTION_LABEL,
  DIRECTION_VERB,
  formatValue,
  type LabelContext,
  type LabelOptions,
  typeLabel,
} from "./label.js";
export { defaultHref, type Href, type HrefTarget } from "./link.js";
export {
  type ApiEntry,
  allOperations,
  apiEntries,
  type EntryExample,
  endpointHandshake,
  endpointUrl,
  entryExamples,
  entrySlug,
  groupByTag,
  groupMediaVariants,
  type Handshake,
  listedEndpoints,
  type OperationEntry,
  replyAddress,
  resolveRef,
  securityLabel,
  securityUsage,
  type TagGroup,
  walk,
} from "./navigate.js";
export {
  type Chip,
  type ChipKind,
  type ChipOptions,
  chipsFor,
  collectLinks,
  type FieldChildren,
  type FieldList,
  type FieldNode,
  flatten,
  type PresentContext,
  toFieldList,
  toRows,
  toTree,
  type ViewOptions,
} from "./present.js";
export type * from "./schema.js";
export { createSlugger, slugify } from "./slug.js";
export { parametersNode, propertiesNode } from "./synth.js";
export { projectForView } from "./view.js";
