/**
 * The preview harness.
 *
 * Not a package and not shipped: Speculoos does not generate sites, and the
 * moment this lived in `packages/` it would be one. It exists so a human can
 * look at the output, which is how both of M4's rendering defects were found.
 *
 * It is also the honest test of the class-name contract in `@speculoos/html`:
 * `preview.css` styles the output using *only* the documented class names. If
 * a page cannot be made to look like documentation without reaching for a tag
 * selector or a new class, the contract is wrong and this is where that shows.
 *
 *   node preview/build.mjs              # fixtures → preview/out
 *   node preview/build.mjs path/to.yaml # any spec
 *   node preview/build.mjs --serve      # build, then serve on :8137
 */

import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import MarkdownIt from "markdown-it";
import { load } from "@speculoos/loader";
import { buildOpenApi } from "@speculoos/openapi";
import { buildAsyncApi } from "@speculoos/asyncapi";
import { renderApi, renderNav } from "@speculoos/html";
import { specDir } from "@speculoos/fixtures";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "out");

/**
 * How a consumer is meant to wire markdown: a renderer they chose, with HTML
 * disabled. Speculoos hands over raw CommonMark from an untrusted document and
 * does not sanitise it — `html: false` is what makes that safe here.
 */
const md = new MarkdownIt({ html: false, linkify: true });
const renderMarkdown = (source) => md.render(source);

const PAGES = [
  { name: "batch", file: "batch.yaml", dialect: "openapi", title: "Batch (OpenAPI 3.1)" },
  { name: "realtime-v2", file: "realtime-v2.yaml", dialect: "asyncapi", title: "Realtime (AsyncAPI 2.6)" },
  { name: "realtime-v3", file: "realtime-v3.yaml", dialect: "asyncapi", title: "Realtime (AsyncAPI 3.0)" },
  { name: "reply-v3", file: "reply-v3.yaml", dialect: "asyncapi", title: "Request/reply (AsyncAPI 3.0)" },
  { name: "avro-v3", file: "avro-v3.yaml", dialect: "asyncapi", title: "Avro payloads (AsyncAPI 3.0)" },
];

async function irFor({ root, file, name, dialect }) {
  const project = await load({ root, documents: [{ name, path: file }] });
  return dialect === "openapi" ? buildOpenApi({ project }) : buildAsyncApi({ project });
}

/** Guesses the dialect so an arbitrary spec path can be previewed. */
async function detect(path) {
  const text = await readFile(path, "utf8");
  return /^\s*asyncapi\s*:/m.test(text) ? "asyncapi" : "openapi";
}

function page({ title, nav, body, index }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — Speculoos preview</title>
<link rel="stylesheet" href="preview.css">
</head>
<body>
<aside class="preview-sidebar">
  <p class="preview-brand">Speculoos preview</p>
  <ul class="preview-index">${index}</ul>
  ${nav}
</aside>
<main class="preview-main">
${body}
</main>
</body>
</html>
`;
}

async function main() {
  const args = process.argv.slice(2);
  const serve = args.includes("--serve");
  const paths = args.filter((a) => !a.startsWith("--"));

  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "preview.css"), await readFile(join(here, "preview.css")));

  const specs =
    paths.length > 0
      ? await Promise.all(
          paths.map(async (p) => {
            const full = resolve(p);
            const name = basename(full, extname(full));
            return { name, file: basename(full), root: dirname(full), title: name, dialect: await detect(full) };
          }),
        )
      : PAGES.map((p) => ({ ...p, root: specDir }));

  const index = specs
    .map((s) => `<li><a href="${s.name}.html">${s.title}</a></li>`)
    .join("");

  for (const spec of specs) {
    const started = Date.now();
    const ir = await irFor(spec);
    const body = renderApi(ir, { renderMarkdown });
    const nav = renderNav(ir, { renderMarkdown, headingLevel: 3 });
    await writeFile(join(outDir, `${spec.name}.html`), page({ title: spec.title, nav, body, index }));

    const errors = ir.diagnostics.filter((d) => d.severity === "error").length;
    const warnings = ir.diagnostics.filter((d) => d.severity === "warning").length;
    console.log(
      `${spec.name.padEnd(14)} ${String(body.length).padStart(8)} bytes  ` +
        `${String(Date.now() - started).padStart(4)} ms  ` +
        `${ir.endpoints.length} endpoints, ${Object.keys(ir.schemas).length} types` +
        (errors + warnings > 0 ? `  (${errors} errors, ${warnings} warnings)` : ""),
    );
  }

  await writeFile(
    join(outDir, "index.html"),
    page({ title: "Index", nav: "", body: `<ul class="preview-index">${index}</ul>`, index }),
  );
  console.log(`\nwrote ${outDir}`);

  if (serve) {
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".svg": "image/svg+xml",
    };
    createServer((req, res) => {
      // Read the file *before* writing any header. Writing the 200 first and
      // then discovering the file is missing leaves no way to send a 404 — the
      // headers are already out — so the handler throws, the rejection is
      // unhandled, and the whole server exits. A browser asking for
      // /favicon.ico on the very first page load is enough to do it, after
      // which every link looks broken.
      const handle = async () => {
        const name = decodeURIComponent((req.url ?? "/").split("?")[0]);
        const file = resolve(outDir, name === "/" ? "index.html" : name.replace(/^\/+/, ""));
        // Nothing outside out/ is servable. This is a dev server, but it is
        // still a server. `resolve` collapses `..` before the check, so the
        // comparison is against a real path rather than a hopeful one.
        if (file !== outDir && !file.startsWith(outDir + sep)) {
          res.writeHead(403, { "content-type": "text/plain" }).end("forbidden\n");
          return;
        }
        const body = await readFile(file).catch(() => undefined);
        if (body === undefined) {
          res.writeHead(404, { "content-type": "text/plain" }).end(`not found: ${name}\n`);
          return;
        }
        res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
        res.end(body);
      };
      // One bad request must not take the server down with it.
      handle().catch((error) => {
        console.error(`${req.method} ${req.url}: ${error.message}`);
        if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" });
        res.end("error\n");
      });
    }).listen(8137, () => console.log("http://localhost:8137"));
  }
}

await main();
