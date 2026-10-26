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

export { renderApi, type RenderApiOptions } from "./api.js";
export {
  renderEndpoint,
  renderEndpointById,
  renderOperation,
  renderOperationById,
  type RenderEndpointOptions,
  type RenderOperationOptions,
} from "./operation.js";
export { renderNav, renderType, renderTypes, type NavOptions, type TypeOptions } from "./navigation.js";
export { renderSchema, type SchemaOptions } from "./fields.js";
export { CLASSES, INTEROP_CLASSES, classNames } from "./classes.js";
export { resolve, type HtmlOptions, type Resolved } from "./options.js";
export { text as escapeHtml } from "./escape.js";
export type { Html } from "./escape.js";
export type { BadgeTone, Ctx, SectionKind } from "./parts.js";

/** Re-exported so a consumer can write an `href` function without importing core. */
export type { HrefTarget, Href } from "@speculoos/core";
