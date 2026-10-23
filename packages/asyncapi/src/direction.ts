/**
 * Direction normalisation — the single most important thing this adapter does.
 *
 * AsyncAPI 2.x names operations from the point of view of the *application* the
 * document describes, which is famously the inverse of what a reader expects:
 *
 *   publish    others publish *to* the application  → the application receives
 *   subscribe  others subscribe, the application publishes → the application sends
 *
 * 3.0 replaced both with an explicit `action`, and the official migration maps
 * 2.x `publish` → 3.x `receive` and 2.x `subscribe` → 3.x `send`.
 *
 * Speculoos normalises all four spellings to the **API consumer's** point of
 * view, so a page does not depend on which AsyncAPI version a spec happens to
 * be written in:
 *
 *   publish / receive   the application receives it  → "client-sends"
 *   subscribe / send    the application sends it     → "server-sends"
 *
 * Get this backwards and every arrow in the rendered docs points the wrong way,
 * which is why it has its own module and its own tests.
 */

import type { Direction } from "@speculoos/core";

/** AsyncAPI 2.x channel operation keys. */
export const V2_OPERATIONS = ["publish", "subscribe"] as const;
export type V2Operation = (typeof V2_OPERATIONS)[number];

/** AsyncAPI 3.x `action` values. */
export type V3Action = "send" | "receive";

export function directionFromV2(operation: V2Operation): Direction {
  return operation === "publish" ? "client-sends" : "server-sends";
}

export function directionFromV3(action: string): Direction | undefined {
  if (action === "receive") return "client-sends";
  if (action === "send") return "server-sends";
  return undefined;
}
