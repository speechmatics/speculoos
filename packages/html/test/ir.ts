/**
 * The IRs every test in this package renders.
 *
 * Built once and shared: parsing the fixtures per test file is slower than the
 * rendering being tested.
 */
import { specDir } from "@speculoos/fixtures";
import { load } from "@speculoos/loader";
import { buildOpenApi } from "@speculoos/openapi";
import { buildAsyncApi } from "@speculoos/asyncapi";
import type { ApiIR } from "@speculoos/core";

export async function restIR(): Promise<ApiIR> {
  const project = await load({ root: specDir, documents: [{ name: "batch", path: "batch.yaml" }] });
  return buildOpenApi({ project });
}

export async function wsIR(file: "realtime-v2.yaml" | "realtime-v3.yaml" | "reply-v3.yaml"): Promise<ApiIR> {
  const project = await load({ root: specDir, documents: [{ name: "rt", path: file }] });
  return buildAsyncApi({ project });
}

/** Every class attribute in a fragment, flattened and deduplicated. */
export function classesIn(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/ class="([^"]*)"/g)) {
    for (const name of (m[1] ?? "").split(/\s+/)) if (name !== "") out.add(name);
  }
  return [...out].sort();
}

/** Every element name in a fragment. */
export function tagsIn(html: string): string[] {
  return [...new Set([...html.matchAll(/<([a-z][a-z0-9-]*)/gi)].map((m) => (m[1] ?? "").toLowerCase()))].sort();
}

/** Every `id="…"` in a fragment. */
export function idsIn(html: string): string[] {
  return [...html.matchAll(/ id="([^"]*)"/g)].map((m) => m[1] ?? "");
}

/** Every same-page `href="#…"` fragment in a fragment. */
export function anchorsIn(html: string): string[] {
  return [...html.matchAll(/ href="#([^"]*)"/g)].map((m) => m[1] ?? "");
}

/** Every `data-path` value, which identifies a field row. */
export function pathsIn(html: string): string[] {
  return [...html.matchAll(/ data-path="([^"]*)"/g)].map((m) => m[1] ?? "");
}
