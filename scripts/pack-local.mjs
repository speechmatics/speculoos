/**
 * Builds every publishable package and packs it into `.packs/`, for installing
 * into another project as if it came from a registry.
 *
 *   pnpm pack:local
 *
 * Then, in the consuming project, depend on the tarballs:
 *
 *   "@speculoos/react": "file:../speculoos/.packs/speculoos-react.tgz"
 *
 * Tarballs, not `npm link`: a symlinked package resolves `react` from this
 * repository's node_modules, so a consumer on another React version ends up
 * with two copies of React and hooks that throw. A tarball is also exactly what
 * a consumer would get from a registry, so it catches packaging mistakes —
 * `files`, `exports`, a `workspace:*` that was never rewritten — before a
 * publish does.
 *
 * Names drop the version (`speculoos-react.tgz`) so the consumer's
 * package.json never changes between packs; reinstall to pick up a new one.
 */

import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, ".packs");

const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, stdio: ["ignore", "pipe", "inherit"] }).toString();

console.log("building…");
run("pnpm", ["-r", "build"]);

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const packages = [];
for (const dir of await readdir(join(root, "packages"))) {
  const manifest = JSON.parse(await readFile(join(root, "packages", dir, "package.json"), "utf8"));
  if (manifest.private) continue;
  run("pnpm", ["pack", "--pack-destination", out], join(root, "packages", dir));
  const stem = manifest.name.replace(/^@/, "").replace("/", "-");
  await rename(join(out, `${stem}-${manifest.version}.tgz`), join(out, `${stem}.tgz`));
  packages.push([manifest.name, `${stem}.tgz`]);
}

console.log(`\npacked ${packages.length} packages into .packs/ — as dependencies:\n`);
for (const [name, file] of packages) console.log(`    "${name}": "file:<path-to-speculoos>/.packs/${file}",`);
