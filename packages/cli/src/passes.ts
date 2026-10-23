/**
 * Turning command-line flags into a transform pipeline.
 *
 * The order is fixed rather than taken from the order the flags appear in,
 * because the useful order is not obvious and getting it wrong is quiet:
 * prune before filter and you prune against the unfiltered document, rename
 * after prune and you rename things that are already gone. One documented
 * order that always works beats a flexible one that usually does.
 */

import {
  filterByTag,
  hideInternal,
  pruneUnreachableTypes,
  redactExamples,
  renameTypes,
  sortTags,
  type Transform,
} from "@speculoos/transforms";

export interface PassFlags {
  /** `--hide-internal` or `--hide-internal x-private`. */
  hideInternal?: string | true;
  /** `--tag Jobs,Admin`. */
  tag?: string;
  /** `--keep-untagged`, only meaningful alongside `--tag`. */
  keepUntagged?: boolean;
  /** `--sort-tags Admin,Jobs`. */
  sortTags?: string;
  /** `--rename Job=Transcription,BaseConfig=Common`. */
  rename?: string;
  /** `--redact-examples`. */
  redactExamples?: boolean;
  /** `--prune`. */
  prune?: boolean;
}

const list = (value: string): string[] =>
  value.split(",").map((s) => s.trim()).filter((s) => s.length > 0);

export function parseRenames(value: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of list(value)) {
    const at = pair.indexOf("=");
    if (at === -1) throw new Error(`--rename expects Old=New, got "${pair}".`);
    const from = pair.slice(0, at).trim();
    const to = pair.slice(at + 1).trim();
    if (from === "" || to === "") throw new Error(`--rename expects Old=New, got "${pair}".`);
    out[from] = to;
  }
  return out;
}

/** The pipeline these flags describe, in the documented order. */
export function passesFor(flags: PassFlags): Transform[] {
  const passes: Transform[] = [];

  if (flags.hideInternal !== undefined) {
    passes.push(
      flags.hideInternal === true ? hideInternal() : hideInternal(flags.hideInternal),
    );
  }
  if (flags.tag !== undefined) {
    passes.push(
      filterByTag(list(flags.tag), flags.keepUntagged === true ? { keepUntagged: true } : {}),
    );
  }
  if (flags.sortTags !== undefined) passes.push(sortTags(list(flags.sortTags)));
  if (flags.rename !== undefined) passes.push(renameTypes(parseRenames(flags.rename)));
  if (flags.redactExamples === true) passes.push(redactExamples());
  // Last: it must see what actually survived everything above.
  if (flags.prune === true) passes.push(pruneUnreachableTypes());

  return passes;
}
