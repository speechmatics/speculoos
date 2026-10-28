/**
 * The shared spec corpus.
 *
 * These documents are read by the adapter packages that parse them, by the CLI,
 * by `transforms` and by the renderers. Keeping one copy means a fix to a spec
 * is seen by every package that consumes it, and it stops test files reaching
 * sideways into each other's directories.
 *
 * Deliberately dependency-free: the moment this package imported an adapter in
 * order to hand out ready-made IR, the workspace would have a dependency cycle
 * and `pnpm -r build` would have nothing safe to order. It hands out paths;
 * each consumer builds IR with the adapter it already depends on.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Directory holding every spec. Pass as `root` to `load`. */
export const specDir: string = resolve(dirname(fileURLToPath(import.meta.url)), "../specs");

export type SpecName = "batch.yaml" | "realtime-v2.yaml" | "realtime-v3.yaml" | "reply-v3.yaml" | "avro-v3.yaml";

export const specPath = (name: SpecName): string => resolve(specDir, name);
