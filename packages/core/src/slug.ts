/**
 * Anchor slugs.
 *
 * Slugs cannot be computed per type in isolation: two documents in one project
 * may both define `Job`, so collisions have to be broken against the whole
 * registry. Adapters therefore run a single slugger over the completed registry
 * in a fixed order, and store the result on `TypeDef.slug` / `Operation.slug`.
 * Renderers read that field and never derive anchors themselves.
 */

/** Lowercase, ASCII, hyphen-separated. Deterministic and idempotent. */
export function slugify(input: string): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "x" : slug;
}

/**
 * Returns a function that slugifies names and breaks collisions with a numeric
 * suffix, in call order. Call order must itself be deterministic — registry
 * insertion order — or the output is not reproducible.
 */
export function createSlugger(): (name: string) => string {
  const seen = new Map<string, number>();
  return (name) => {
    const base = slugify(name);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}-${n + 1}`;
  };
}
