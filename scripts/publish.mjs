/**
 * Publishes every package whose version is not on npm yet. Run by
 * .github/workflows/release.yml with npm trusted publishing (OIDC): no token,
 * and — from a public repository — a provenance statement on every version,
 * which npm generates without being asked. See docs/RELEASING.md.
 *
 *   node scripts/publish.mjs [--dry-run]
 *
 * pnpm packs each package, which rewrites `workspace:` ranges to real
 * versions; the npm CLI publishes the tarball, because trusted publishing
 * needs npm >= 11.5.1 and pnpm's own support for it is not settled.
 *
 * Packages go out dependencies first, so nobody installing mid-release meets a
 * package whose dependency is not there yet. A version already on npm is
 * skipped, so a failed release can be run again and picks up where it stopped.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dryRun = process.argv.includes("--dry-run");
const run = (cmd, args, cwd = root) =>
  execFileSync(cmd, args, { cwd, stdio: ["ignore", "pipe", "inherit"] })
    .toString()
    .trim();

const packages = readdirSync(join(root, "packages"))
  .map((dir) => ({
    dir: join(root, "packages", dir),
    pkg: JSON.parse(readFileSync(join(root, "packages", dir, "package.json"), "utf8")),
  }))
  .filter(({ pkg }) => pkg.private !== true);

// Dependencies first.
const byName = new Map(packages.map((p) => [p.pkg.name, p]));
const ordered = [];
const visit = (p, seen = new Set()) => {
  if (ordered.includes(p)) return;
  if (seen.has(p)) throw new Error(`dependency cycle through ${p.pkg.name}`);
  seen.add(p);
  for (const name of Object.keys({ ...p.pkg.dependencies, ...p.pkg.peerDependencies })) {
    const dep = byName.get(name);
    if (dep !== undefined) visit(dep, seen);
  }
  ordered.push(p);
};
for (const p of packages) visit(p);

function published(name, version) {
  try {
    const found = execFileSync("npm", ["view", `${name}@${version}`, "version"], { cwd: root, stdio: "pipe" });
    return found.toString().trim() === version;
  } catch {
    return false; // E404: the package, or this version of it, is not on npm.
  }
}

const out = mkdtempSync(join(tmpdir(), "speculoos-publish-"));
let count = 0;
try {
  for (const { dir, pkg } of ordered) {
    if (published(pkg.name, pkg.version)) {
      console.log(`${pkg.name}@${pkg.version}: already published`);
      continue;
    }
    const tarball = run("pnpm", ["pack", "--pack-destination", out], dir).split("\n").at(-1);
    const tag = pkg.publishConfig?.tag ?? "latest";
    const args = ["publish", tarball, "--access", "public", "--tag", tag];
    if (dryRun) args.push("--dry-run");
    run("npm", args);
    console.log(`${pkg.name}@${pkg.version}: published under ${tag}${dryRun ? " (dry run)" : ""}`);
    count++;
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}
console.log(count === 0 ? "Nothing to publish." : `${count} package(s) ${dryRun ? "would be " : ""}published.`);
