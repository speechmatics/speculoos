/**
 * Sets every package's version, and the root's: the packages move in lockstep.
 *
 *   pnpm set-version 0.1.0-alpha.1
 *
 * Dependencies between packages are `workspace:` ranges, which pnpm rewrites
 * to the version being published, so they need no change here.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version ?? "")) {
  console.error("usage: pnpm set-version <semver>, e.g. 0.1.0-alpha.1");
  process.exit(1);
}

const files = [
  join(root, "package.json"),
  ...readdirSync(join(root, "packages")).map((dir) => join(root, "packages", dir, "package.json")),
];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const next = text.replace(/^( {2}"version": )"[^"]*"/m, `$1"${version}"`);
  if (next === text && !text.includes(`"version": "${version}"`)) throw new Error(`no version field in ${file}`);
  writeFileSync(file, next);
}
console.log(`${files.length} package.json files at ${version}.`);
