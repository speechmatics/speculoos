/**
 * Redaction.
 *
 * Spec examples are written by hand and routinely contain real account ids,
 * customer names and the occasional live key. A docs site that republishes a
 * partner's spec wants them gone.
 *
 * This is a structural pass over the whole document rather than a walk of the
 * places the IR puts examples. That is the point: an enumerated walk that
 * misses one site leaks exactly the thing you asked to remove. Examples live on
 * `Docs`, on `MediaVariant` and on `WsMessage`, and `Docs` hangs off almost
 * every node, property, parameter, response and type — plus two pass-through
 * bags (`Docs.extensions` and `bindings`) whose contents are by definition
 * unknown. So anything named `examples` goes, wherever it is.
 */

import type { ApiIR } from "@speculoos/core";
import { named, type Transform } from "./apply.js";

function strip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strip);
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = k === "examples" && Array.isArray(v) ? [] : strip(v);
  }
  return out;
}

/**
 * Empties every `examples` array in the document. `default` and `const` are
 * left alone: those are part of the contract, not illustrations of it.
 */
export const redactExamples = (): Transform => named("redactExamples", (ir: ApiIR): ApiIR => strip(ir) as ApiIR);
