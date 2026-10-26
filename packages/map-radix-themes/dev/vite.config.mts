/**
 * The map's dev server: every fixture, through real Radix Themes, live.
 *
 *   pnpm --filter @speculoos/map-radix-themes dev
 *   SPECULOOS_SPEC=path/to/spec.yaml pnpm --filter @speculoos/map-radix-themes dev
 *
 * Not shipped. The loader reads the filesystem, so IRs are built here, in Node,
 * and handed to the page as a virtual module. Editing a fixture reloads it.
 */

import { readFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { load } from "@speculoos/loader";
import { buildOpenApi } from "@speculoos/openapi";
import { buildAsyncApi } from "@speculoos/asyncapi";
import { specDir } from "@speculoos/fixtures";

const here = dirname(fileURLToPath(import.meta.url));

/** Same list as preview/build.mjs. */
const FIXTURES = [
  { name: "batch", file: "batch.yaml", title: "Batch (OpenAPI 3.1)" },
  { name: "realtime-v2", file: "realtime-v2.yaml", title: "Realtime (AsyncAPI 2.6)" },
  { name: "realtime-v3", file: "realtime-v3.yaml", title: "Realtime (AsyncAPI 3.0)" },
  { name: "reply-v3", file: "reply-v3.yaml", title: "Request/reply (AsyncAPI 3.0)" },
  { name: "avro-v3", file: "avro-v3.yaml", title: "Avro payloads (AsyncAPI 3.0)" },
];

function specs(): { name: string; file: string; title: string; root: string }[] {
  const custom = process.env["SPECULOOS_SPEC"];
  if (custom === undefined || custom === "") return FIXTURES.map((f) => ({ ...f, root: specDir }));
  const full = resolve(process.env["INIT_CWD"] ?? process.cwd(), custom);
  const name = basename(full, extname(full));
  return [{ name, file: basename(full), title: name, root: dirname(full) }];
}

const ID = "virtual:speculoos-specs";

function speculoosSpecs(): Plugin {
  return {
    name: "speculoos-specs",
    resolveId: (id) => (id === ID ? `\0${ID}` : undefined),
    async load(id) {
      if (id !== `\0${ID}`) return undefined;
      const out = [];
      for (const spec of specs()) {
        const path = resolve(spec.root, spec.file);
        this.addWatchFile(path);
        const text = await readFile(path, "utf8");
        const project = await load({ root: spec.root, documents: [{ name: spec.name, path: spec.file }] });
        const ir = /^\s*asyncapi\s*:/m.test(text) ? buildAsyncApi({ project }) : buildOpenApi({ project });
        out.push({ name: spec.name, title: spec.title, ir });
      }
      return `export default ${JSON.stringify(out)};`;
    },
  };
}

export default defineConfig({
  root: here,
  plugins: [react(), speculoosSpecs()],
  server: { port: 8138 },
});
