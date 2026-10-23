/**
 * Where a link points.
 *
 * This started out inside `@speculoos/react` on the assumption that link
 * targeting was a React concern. The HTML renderer proved otherwise: both
 * renderers face the same question at a `$ref` — "does this type have a page of
 * its own, and what is its URL?" — and the answer belongs to the *site*, not to
 * either renderer. A site with a page per operation should be able to write one
 * `href` function and hand it to both.
 *
 * So it lives here, and both renderers take the same callback.
 */

import type { Endpoint, Operation, TagDef } from "./document.js";
import type { TypeDef, TypeId } from "./schema.js";
import { slugify } from "./slug.js";

export type HrefTarget =
  // `def` is optional *and* explicitly nullable: a `$ref` can point at a type
  // that is not in the registry, and `toTree` models that rather than dropping
  // it, so a link target legitimately arrives with nothing behind it.
  | { kind: "type"; id: TypeId; def?: TypeDef | undefined }
  | { kind: "operation"; id: string; operation: Operation; endpoint: Endpoint }
  | { kind: "tag"; name: string; def?: TagDef | undefined }
  | { kind: "external"; url: string };

/** Resolves a target to a URL, or to nothing when there is no page to point at. */
export type Href = (target: HrefTarget) => string | undefined;

/**
 * Same-page anchors, from the IR's own slugs. Right for a single page and wrong
 * for everything else — a site with a page per operation replaces this and
 * nothing else.
 */
export function defaultHref(target: HrefTarget): string | undefined {
  switch (target.kind) {
    case "type":
      return target.def ? `#${target.def.slug}` : undefined;
    case "operation":
      return `#${target.operation.slug}`;
    case "tag":
      return `#${slugify(target.name)}`;
    case "external":
      return target.url;
  }
}
