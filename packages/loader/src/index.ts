/**
 * @speculoos/loader — a project of documents in, one resolver out.
 *
 * Build-time and Node-only. Bundles rather than dereferences: `$ref` nodes are
 * preserved and resolved on demand, so identity stays anchored to where a schema
 * is defined and recursive schemas terminate.
 */

export { type DialectInfo, detectDialect } from "./dialect.js";
export { type DocumentInput, type LoadedDocument, type LoadedProject, load, type ProjectInput } from "./load.js";
export { at, escapeSegment, joinPointer, unescapeSegment } from "./pointer.js";
