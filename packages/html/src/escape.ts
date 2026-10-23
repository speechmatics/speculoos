/**
 * String building.
 *
 * Everything this package emits goes through `h` or `text`. Nothing anywhere
 * else in the package concatenates a `<` by hand, which is the only way to be
 * sure a spec cannot inject markup: a `title` of `</h2><script>` is ordinary
 * input here, not an edge case.
 *
 * The one deliberate hole is `raw`, which is what a caller's `renderMarkdown`
 * returns. Sanitising that is the caller's job, and the API says so loudly.
 */

/** Markup that has already been escaped, or that the caller vouched for. */
export type Html = string;

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapes text for use in element content or an attribute value. */
export function text(value: string): Html {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/**
 * Marks a string as already-safe markup. The only legitimate callers are this
 * package's own builders and a caller-supplied markdown renderer.
 */
export function raw(markup: string): Html {
  return markup;
}

export type Attrs = Record<string, string | number | boolean | undefined>;

/**
 * Void elements, which must not be given a closing tag. Only the ones this
 * package could plausibly emit; an unknown tag is treated as normal.
 */
const VOID = new Set(["br", "hr", "img", "input", "link", "meta", "source", "wbr"]);

function attrs(a: Attrs): string {
  let out = "";
  for (const [key, value] of Object.entries(a)) {
    if (value === undefined || value === false) continue;
    // A boolean attribute is written bare: `required`, not `required="true"`.
    out += value === true ? ` ${key}` : ` ${key}="${text(String(value))}"`;
  }
  return out;
}

/**
 * One element. `children` are already-escaped markup; `undefined` and `false`
 * are dropped so call sites can write `cond && h(...)` without a ternary.
 */
export function h(
  tag: string,
  a: Attrs = {},
  ...children: (Html | undefined | false | null)[]
): Html {
  const open = `<${tag}${attrs(a)}>`;
  if (VOID.has(tag)) return open;
  return `${open}${join(children)}</${tag}>`;
}

/** Concatenates children, dropping the empty ones. */
export function join(parts: (Html | undefined | false | null)[], separator = ""): Html {
  return parts.filter((p): p is Html => typeof p === "string" && p !== "").join(separator);
}
