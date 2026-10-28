/**
 * Whether the packages are ready to publish, checked the way a consumer would
 * meet them. Run in CI, and before every release (docs/RELEASING.md).
 *
 *   pnpm release:check
 *
 * 1. Every publishable package carries the root's version — the packages move
 *    in lockstep — and the metadata a registry page needs: MIT, a repository
 *    pointing at its own directory, engines, publishConfig, a README, and a
 *    LICENSE identical to the root's (npm only ships one from the package's
 *    own directory).
 * 2. publint finds nothing, warnings included: `exports`, `types` and `files`
 *    agree with what is in the tarball.
 * 3. The packed tarballs (`pnpm pack:local`) install together into a fresh
 *    project, and every entry point typechecks and loads from both an ES module
 *    and a CommonJS one — what "are the types wrong" would check, done for real
 *    against TypeScript's own resolver.
 *
 * Step 3 installs from the registry (TypeScript, React, Radix), so it needs
 * the network. `--skip-install` stops after step 2.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { publint } from "publint";
import { formatMessage } from "publint/utils";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skipInstall = process.argv.includes("--skip-install");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString();

const rootPkg = readJson(join(root, "package.json"));
const license = readFileSync(join(root, "LICENSE"), "utf8");
const problems = [];

const packages = readdirSync(join(root, "packages"))
  .map((dir) => ({
    dir,
    path: join(root, "packages", dir),
    pkg: readJson(join(root, "packages", dir, "package.json")),
  }))
  .filter(({ pkg }) => pkg.private !== true);

// 1. Versions and metadata.
for (const { dir, path, pkg } of packages) {
  const say = (msg) => problems.push(`${pkg.name}: ${msg}`);
  if (pkg.version !== rootPkg.version) say(`version ${pkg.version}, but the root is ${rootPkg.version}`);
  if (pkg.license !== "MIT") say(`license is ${pkg.license ?? "missing"}`);
  if (pkg.repository?.directory !== `packages/${dir}`) say("repository.directory does not point at the package");
  if (pkg.engines?.node === undefined) say("no engines.node");
  if (pkg.publishConfig?.access !== "public") say("publishConfig.access is not public");
  if (!existsSync(join(path, "README.md"))) say("no README.md");
  if (!existsSync(join(path, "LICENSE"))) say("no LICENSE");
  else if (readFileSync(join(path, "LICENSE"), "utf8") !== license) say("LICENSE differs from the root's");
  for (const [name, range] of Object.entries({ ...pkg.dependencies, ...pkg.peerDependencies })) {
    if (name.startsWith("@speculoos/") && !range.startsWith("workspace:")) {
      say(`${name} is ${range}, not a workspace: range, so it will not follow the lockstep version`);
    }
  }
}

// 2. publint, over each package as it would be packed.
for (const { path, pkg } of packages) {
  const { messages } = await publint({ pkgDir: path, level: "suggestion", strict: true });
  for (const message of messages) {
    problems.push(`${pkg.name}: publint ${message.type}: ${formatMessage(message, pkg)}`);
  }
}

if (problems.length > 0) fail();
console.log(`${packages.length} packages at ${rootPkg.version}: metadata and publint clean.`);
if (skipInstall) process.exit(0);

// 3. Install the tarballs into a fresh project, and import every entry point.
console.log("Packing and installing into a fresh project…");
run("node", [join(root, "scripts", "pack-local.mjs")], root);
const consumer = mkdtempSync(join(tmpdir(), "speculoos-consumer-"));
try {
  const tarballs = Object.fromEntries(
    packages.map(({ pkg }) => [
      pkg.name,
      `file:${join(root, ".packs", `${pkg.name.replace("@speculoos/", "speculoos-")}.tgz`)}`,
    ]),
  );
  // Peers and TypeScript, at the versions the packages are developed against.
  const dev = (name, version) => ({ [name]: version });
  const radix = readJson(join(root, "packages", "map-radix-themes", "package.json")).devDependencies;
  const peers = {
    ...dev("typescript", rootPkg.devDependencies.typescript),
    ...dev("react", radix.react),
    ...dev("react-dom", radix["react-dom"]),
    ...dev("@types/react", radix["@types/react"]),
    ...dev("@radix-ui/themes", radix["@radix-ui/themes"]),
    ...dev("@types/node", "^22.10.2"),
  };
  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify({ name: "consumer", private: true, dependencies: { ...tarballs, ...peers } }, null, 2),
  );

  // Every JavaScript entry point a package exports.
  const entries = packages.flatMap(({ pkg }) =>
    Object.entries(pkg.exports)
      .filter(([, target]) => typeof target === "object")
      .map(([subpath]) => (subpath === "." ? pkg.name : `${pkg.name}/${subpath.slice(2)}`)),
  );
  const imports = entries.map((entry, i) => `import * as m${i} from "${entry}";`).join("\n");
  const used = `export const all = [${entries.map((_, i) => `m${i}`).join(", ")}];\n`;
  writeFileSync(join(consumer, "esm.mts"), `${imports}\n${used}`);
  writeFileSync(join(consumer, "cjs.cts"), `${imports}\n${used}`);
  writeFileSync(
    join(consumer, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        module: "nodenext",
        moduleResolution: "nodenext",
        strict: true,
        noEmit: true,
        jsx: "react-jsx",
      },
      files: ["esm.mts", "cjs.cts"],
    }),
  );
  writeFileSync(
    join(consumer, "load.mjs"),
    `import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
for (const entry of ${JSON.stringify(entries)}) {
  const esm = await import(entry);
  const cjs = require(entry);
  const names = (m) => Object.keys(m).filter((k) => k !== "default" && k !== "module.exports").sort().join();
  if (names(esm) === "") throw new Error(entry + " exports nothing to ESM");
  if (names(esm) !== names(cjs)) throw new Error(entry + ": ESM and CommonJS export different names");
}
`,
  );

  try {
    run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], consumer);
  } catch (error) {
    problems.push(`the tarballs did not install together:\n${error.stderr}`);
    fail();
  }
  try {
    run(join(consumer, "node_modules", ".bin", "tsc"), ["-p", "."], consumer);
  } catch (error) {
    problems.push(`consumer typecheck failed:\n${error.stdout}`);
  }
  try {
    run("node", ["load.mjs"], consumer);
  } catch (error) {
    problems.push(`the packages did not load from ESM and CommonJS:\n${error.stderr}${error.stdout}`);
  }
  try {
    run(join(consumer, "node_modules", ".bin", "speculoos"), ["--help"], consumer);
  } catch (error) {
    problems.push(`the CLI did not run (exit ${error.status}):\n${error.stderr}${error.stdout}`);
  }
  if (problems.length > 0) fail();
  console.log(`${entries.length} entry points typecheck and load from ESM and CommonJS; the CLI runs.`);
} finally {
  rmSync(consumer, { recursive: true, force: true });
}

function fail() {
  console.error(`Not ready to release:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
