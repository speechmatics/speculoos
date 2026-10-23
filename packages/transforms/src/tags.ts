import type { ApiIR, TagDef } from "@speculoos/core";
import { named, type Transform } from "./apply.js";

export interface SortTagsOptions {
  /** What to do with tags not named in `order`. Default "after". */
  unlisted?: "after" | "before" | "drop";
}

/** Reorders `ir.tags`, which is the navigation order. Operations are untouched. */
export const sortTags = (order: readonly string[], opts: SortTagsOptions = {}): Transform => {
  const unlisted = opts.unlisted ?? "after";
  return named(`sortTags(${order.join(", ")})`, (ir: ApiIR): ApiIR => ({
    ...ir,
    tags: reorder(ir.tags, order, unlisted),
  }));
};

/** Exported because `filterByTag` wants exactly this and should not reimplement it. */
export function reorder(
  tags: readonly TagDef[],
  order: readonly string[],
  unlisted: "after" | "before" | "drop",
): TagDef[] {
  const rank = new Map(order.map((name, i) => [name, i]));
  const kept = unlisted === "drop" ? tags.filter((t) => rank.has(t.name)) : [...tags];
  // Stable sort: unlisted tags keep their declared order among themselves.
  const miss = unlisted === "before" ? -1 : order.length;
  return kept.sort((a, b) => (rank.get(a.name) ?? miss) - (rank.get(b.name) ?? miss));
}
