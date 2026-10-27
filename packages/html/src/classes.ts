/**
 * The class-name contract.
 *
 * This package emits markup, which means it emits hooks to style that markup
 * with — and a hook nobody documented is not a contract, it is an accident
 * waiting to be renamed. So the catalogue is data, and a test asserts that
 * every class the renderer actually emits appears here. Adding one without
 * documenting it fails the build.
 *
 * What this is *not* is a stylesheet. Speculoos ships no CSS and never will;
 * these are names for your CSS to target. The names are written unprefixed —
 * `HtmlOptions.classPrefix` (default `spec`) is prepended to each, so the
 * emitted form is `spec-field`, and a modifier is `spec-field--required`.
 */

/** Block names, with the modifiers each may carry. */
export const CLASSES: Record<string, readonly string[]> = {
  /** The `renderApi` wrapper. Carries `data-ir-version` and `data-dialect`. */
  api: [],
  /** `renderApi`'s document header. */
  info: [],
  title: [],
  version: [],
  summary: [],

  /**
   * Every region. The modifier is the region kind, so one rule can style an
   * operation differently from a response without the markup changing.
   */
  section: [
    "api",
    "tag",
    "endpoint",
    "operation",
    "parameters",
    "request",
    "response",
    "messages",
    "message",
    "headers",
    "reply",
    "callbacks",
    "links",
    "security",
    "servers",
    "examples",
    "types",
    "type",
    "deprecated",
  ],
  /** Carries `data-level`, so a selector can target depth without h2/h3. */
  "section-body": [],
  heading: [],
  "heading-title": [],
  /** Identifying marks that are not the title: a method badge, a path, a status. */
  "heading-subtitle": [],

  /** Raw CommonMark, through the caller's `renderMarkdown`. */
  markdown: [],
  /** A short literal: a type name, a default value, a path template. */
  code: [],
  codeblock: [],
  /**
   * The modifier is the badge's tone. Styling hint only; the text is the
   * content. Carries `data-value` with the raw value behind it — `get`, `200`,
   * `client-sends`, `wss` — so `[data-value="delete"]` can be red without a class
   * per method.
   */
  badge: [
    "method",
    "status",
    "constraint",
    "direction",
    "required",
    "deprecated",
    "mediaType",
    "protocol",
    "securityScheme",
    "note",
  ],
  /** The modifier is the link target's kind. */
  link: ["type", "operation", "endpoint", "tag", "external"],
  empty: [],
  "external-docs": [],
  protocols: [],

  /** A field table. The modifier says which of the three it is. */
  schema: ["fields", "parameters", "headers"],
  /** Carries `data-layout`: "tree" when children nest, "rows" when flattened. */
  fields: [],
  /**
   * One field. Carries `data-key`, `data-path`, `data-depth`, and `data-in` for
   * a parameter. The modifier repeats `required`, `deprecated` and the
   * parameter location for selectors that cannot use attributes.
   */
  field: ["required", "deprecated", "path", "query", "header", "cookie"],
  "field-head": [],
  "field-name": [],
  "field-type": [],
  "field-docs": [],
  /** "one of" / "all of", when the children are a union's branches. */
  "field-variants": [],
  "field-children": [],
  /** `allOf` ancestors, as links. Shown above the table when the root row is dropped. */
  extends: [],
  "extends-item": [],
  chips: [],
  /** The modifier is the chip kind, repeated in `data-chip`. */
  chip: [
    "extends",
    "unsupported",
    "deprecated",
    "readOnly",
    "writeOnly",
    "default",
    "enum",
    "pattern",
    "range",
    "length",
    "items",
    "multipleOf",
    "uniqueItems",
    "additionalProperties",
    "contentMediaType",
    "note",
  ],

  /**
   * The static stand-in for tabs: a labelled list of regions. Carries
   * `data-count`. Turn it into tabs or an accordion with these names.
   */
  group: ["mediaType", "status", "example", "examples"],
  "group-item": [],
  "group-label": [],
  "group-body": [],

  /** The modifier says what the list is of. */
  list: ["entries", "operations", "servers", "security", "tags", "callbacks", "links", "deprecated"],
  "list-item": ["deprecated"],
  "server-variables": [],
  "server-variable": [],

  nav: [],
  "nav-title": [],
  "referenced-by": [],
  "referenced-by-label": [],
} as const;

/**
 * Class names this package emits *without* the prefix, because they are other
 * people's conventions and prefixing them would break the tools that read them.
 *
 * `language-json` on a `<code>` inside a `<pre>` is what Prism, highlight.js
 * and Shiki all look for. Renaming it to `spec-language-json` would be tidier
 * and would mean no example payload on any page ever gets highlighted.
 */
export const INTEROP_CLASSES: readonly string[] = ["language-json"];

/** Every emitted class name, prefixed, as a flat sorted list. */
export function classNames(prefix = "spec"): string[] {
  const out: string[] = [];
  for (const [block, modifiers] of Object.entries(CLASSES)) {
    out.push(`${prefix}-${block}`);
    for (const modifier of modifiers) out.push(`${prefix}-${block}--${modifier}`);
  }
  return [...out, ...INTEROP_CLASSES].sort();
}
