/**
 * @speculoos/html — a framework-free HTML renderer for the Speculoos IR.
 *
 * Strings in, strings out. No DOM, no React, no bundler, no runtime. Meant for
 * Hugo, Jekyll, Eleventy, Astro and anything else that builds a page by
 * concatenating markup.
 *
 * Two rules it keeps:
 *
 *  1. **It ships no CSS.** It emits documented class names (see ./classes.ts)
 *     and nothing else. Styling is yours.
 *  2. **It does not render or sanitise markdown.** Descriptions are raw
 *     CommonMark from an untrusted document. Pass `renderMarkdown`; whatever it
 *     returns is written into the page verbatim.
 *
 * Everything else — escaping, anchors, cycle detection, depth budgets — is
 * handled, and the anchors come from the IR's own slugs rather than being
 * derived here, so they match `@speculoos/react`'s.
 */

/** Re-exported so a consumer can write an `href` function without importing core. */
export type { Href, HrefTarget } from "@speculoos/core";
export { type RenderApiOptions, renderApi } from "./api.js";
export { CLASSES, classNames, INTEROP_CLASSES } from "./classes.js";
export type { Html } from "./escape.js";
export { text as escapeHtml } from "./escape.js";
export { renderSchema, type SchemaOptions } from "./fields.js";
export { type NavOptions, renderNav, renderType, renderTypes, type TypeOptions } from "./navigation.js";
export {
  type RenderEndpointOptions,
  type RenderOperationOptions,
  renderEndpoint,
  renderEndpointById,
  renderEntry,
  renderEntryExamples,
  renderOperation,
  renderOperationById,
} from "./operation.js";
export { type HtmlOptions, type Resolved, resolve } from "./options.js";
export type { BadgeTone, Ctx, SectionKind } from "./parts.js";
