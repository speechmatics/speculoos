/**
 * @speculoos/loader — a project of documents in, one resolver out.
 *
 * Build-time and Node-only. Bundles rather than dereferences: `$ref` nodes are
 * preserved and resolved on demand, so identity stays anchored to where a schema
 * is defined and recursive schemas terminate.
 */

export { load, type DocumentInput, type ProjectInput, type LoadedDocument, type LoadedProject } from "./load.js";
export { detectDialect, type DialectInfo } from "./dialect.js";
export { at, joinPointer, escapeSegment, unescapeSegment } from "./pointer.js";
