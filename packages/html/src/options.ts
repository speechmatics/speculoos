/**
 * The decisions that are the site's rather than the spec's.
 *
 * `@speculoos/react` takes these through a provider; there is no provider here,
 * so they are a plain options object and every entry point accepts one. Both
 * renderers take the same `href` callback, from `@speculoos/core`.
 */

import { defaultHref, type Href } from "@speculoos/core";
import { text, type Html } from "./escape.js";

export interface HtmlOptions {
  /**
   * CommonMark → HTML. **Speculoos never renders or sanitises markdown.**
   *
   * Descriptions come from an untrusted document and reach this package as raw
   * CommonMark. Whatever this returns is written into the page verbatim, so it
   * must already be sanitised — `markdown-it` with `html: false`, or a renderer
   * of your choice piped through DOMPurify.
   *
   * Leave it unset and descriptions are escaped and emitted as their literal
   * source text. That is safe and obviously unfinished, which is the right
   * failure mode: you will see it immediately rather than ship it.
   */
  renderMarkdown?: (markdown: string) => string;
  /**
   * Where links point. Defaults to `#slug` from the IR's own slugs, which is
   * right for a single page and wrong for everything else.
   */
  href?: Href;
  /** Prefix on every class name. Default "spec". See `CLASSES` in ./classes.ts. */
  classPrefix?: string;
  /** Heading level of the outermost section, 1–6. Default 2. */
  headingLevel?: number;
  /** What to do at a `$ref`. Default "never" — named types have their own section. */
  expandRefs?: "never" | "depth" | "always";
  /** Only consulted when `expandRefs` is "depth". Default 2. */
  maxDepth?: number;
  /**
   * "tree" nests a field's children in a `<ul>` inside its own `<li>`; "rows"
   * emits one flat list carrying `data-depth`. Both are lists — see ./fields.ts
   * for why this is not a `<table>`. Default "tree".
   */
  layout?: "tree" | "rows";
  /** Bucket name for operations carrying no declared tag. Default "Other". */
  untaggedLabel?: string;
  /**
   * Prepended to every generated `id`, for pages that render more than one IR
   * and would otherwise collide. Anchors still come from the IR's own slugs.
   */
  idPrefix?: string;
}

export interface Resolved {
  renderMarkdown: (markdown: string) => string;
  href: Href;
  classPrefix: string;
  headingLevel: number;
  expandRefs: "never" | "depth" | "always";
  maxDepth: number;
  layout: "tree" | "rows";
  untaggedLabel: string;
  idPrefix: string;
  /** `cls("field", "required")` → "spec-field spec-field--required". */
  cls: (block: string, ...modifiers: (string | false | undefined)[]) => string;
  /** Anchor id, with `idPrefix` applied. */
  anchor: (slug: string) => string;
  /** Heading tag for a level, clamped to h1–h6. */
  heading: (level: number) => string;
}

/**
 * Unrendered markdown: escaped and emitted as-is. Not a markdown renderer and
 * not pretending to be one — see `renderMarkdown`.
 */
const escapeOnly = (markdown: string): Html => text(markdown);

export function resolve(options: HtmlOptions = {}): Resolved {
  const prefix = options.classPrefix ?? "spec";
  const idPrefix = options.idPrefix ?? "";
  return {
    renderMarkdown: options.renderMarkdown ?? escapeOnly,
    href: options.href ?? defaultHref,
    classPrefix: prefix,
    headingLevel: options.headingLevel ?? 2,
    expandRefs: options.expandRefs ?? "never",
    maxDepth: options.maxDepth ?? 2,
    layout: options.layout ?? "tree",
    untaggedLabel: options.untaggedLabel ?? "Other",
    idPrefix,
    cls: (block, ...modifiers) => {
      const base = `${prefix}-${block}`;
      const mods = modifiers.filter((m): m is string => typeof m === "string" && m !== "");
      return [base, ...mods.map((m) => `${base}--${m}`)].join(" ");
    },
    anchor: (slug) => `${idPrefix}${slug}`,
    heading: (level) => `h${Math.min(6, Math.max(1, Math.round(level)))}`,
  };
}
