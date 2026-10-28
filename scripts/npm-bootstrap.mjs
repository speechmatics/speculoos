/**
 * One-time setup of npm trusted publishing, run by a maintainer, locally, before
 * the first release. See docs/RELEASING.md.
 *
 *   node scripts/npm-bootstrap.mjs [--dry-run]
 *
 * npm only lets a trusted publisher be configured on a package that already
 * exists, and trusted publishing cannot make a package's first publish. So,
 * for each package not on npm yet, this:
 *
 * 1. publishes a placeholder, 0.0.0, from your logged-in session, and waits
 *    until the registry serves it, which can take minutes;
 * 2. deprecates it, and the 0.0.0-stage npm publishes alongside, pointing at
 *    the `alpha` tag;
 * 3. trusts .github/workflows/release.yml in the repository to publish it
 *    (`npm trust github`).
 *
 * Each step checks first, so it can be run again after any failure.
 *
 * Every real version, the first alpha included, is then published by the
 * workflow, with provenance. A new trust configuration expires unless the
 * workflow publishes with it within 2 days, so run the workflow soon after.
 *
 * Needs npm >= 11.15 (for `npm trust`), `npm login`, and 2FA on the account.
 * npm will ask for a second factor; on the first, choose to skip it for the
 * next 5 minutes, and the rest go through without asking.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY = "speechmatics/speculoos";
const WORKFLOW = "release.yml";

const root = fileURLToPath(new URL("..", import.meta.url));
const dryRun = process.argv.includes("--dry-run");
const quiet = (cmd, args) => execFileSync(cmd, args, { stdio: "pipe" }).toString().trim();
// Interactive: npm may open a browser or ask for a one-time password.
const loud = (cmd, args, cwd) => {
  console.log(`  $ ${cmd} ${args.join(" ")}`);
  if (!dryRun) execFileSync(cmd, args, { cwd, stdio: "inherit" });
};

const [major, minor] = quiet("npm", ["--version"]).split(".").map(Number);
if (major < 11 || (major === 11 && minor < 15)) {
  console.error("npm >= 11.15 is needed for npm trust: npm install -g npm@^11.15.0");
  process.exit(1);
}
if (!dryRun) {
  try {
    console.log(`Logged in to npm as ${quiet("npm", ["whoami"])}.`);
  } catch {
    console.error("Not logged in: npm login, then run this again.");
    process.exit(1);
  }
}

const PLACEHOLDER = "0.0.0";
const sleep = (ms) => new Promise((wait) => setTimeout(wait, ms));

/**
 * The package as the registry has it, read past every cache: right after a
 * publish the registry can go on answering 404 for minutes, and `npm view`
 * caches that too. Undefined while it does.
 */
async function packument(name) {
  const url = `https://registry.npmjs.org/${name.replace("/", "%2f")}?t=${Date.now()}`;
  const response = await fetch(url, { headers: { "cache-control": "no-cache" } });
  return response.ok ? response.json() : undefined;
}

/** Polls until the registry serves `version`: up to 15 minutes. */
async function waitFor(name, version) {
  for (let i = 0; i < 60; i++) {
    if ((await packument(name))?.versions?.[version] !== undefined) return true;
    if (i === 0) console.log(`  waiting for the registry to serve ${version}…`);
    await sleep(15_000);
  }
  return false;
}

function placeholder(pkg) {
  const dir = mkdtempSync(join(tmpdir(), "speculoos-placeholder-"));
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify(
      {
        name: pkg.name,
        version: PLACEHOLDER,
        description: `Placeholder. Install ${pkg.name}@alpha.`,
        license: "MIT",
        repository: pkg.repository,
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(dir, "README.md"),
    `# ${pkg.name}\n\nA placeholder, published so that releases can use npm trusted publishing.\nInstall \`${pkg.name}@alpha\`.\n`,
  );
  return dir;
}

const packages = readdirSync(join(root, "packages"))
  .map((dir) => JSON.parse(readFileSync(join(root, "packages", dir, "package.json"), "utf8")))
  .filter((pkg) => pkg.private !== true);

// Each step checks before it acts, so this can be run again from wherever it
// stopped: nothing is published twice, deprecated twice or trusted twice.
for (const pkg of packages) {
  console.log(`\n${pkg.name}`);

  // 1. A placeholder, unless the registry already has one.
  if ((await packument(pkg.name))?.versions?.[PLACEHOLDER] !== undefined) {
    console.log(`  ${PLACEHOLDER} already on npm`);
  } else {
    const dir = placeholder(pkg);
    try {
      loud("npm", ["publish", "--access", "public"], dir);
    } catch {
      // A 409 means it is there already and the registry has not said so yet;
      // anything else, waiting for it below fails and says so.
      console.log("  npm publish failed; checking whether the registry has it anyway");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    if (!dryRun && !(await waitFor(pkg.name, PLACEHOLDER))) {
      console.error(
        `  ${pkg.name}@${PLACEHOLDER} is still not on the registry after 15 minutes. Run this again later.`,
      );
      process.exit(1);
    }
  }

  // 2. Deprecate every placeholder version: ours, and the 0.0.0-stage npm
  //    publishes itself the first time a package is published.
  const published = (await packument(pkg.name))?.versions;
  // In a dry run nothing was published: show the deprecation it would make.
  const versions = Object.entries(published ?? (dryRun ? { [PLACEHOLDER]: {} } : {}));
  const placeholders = versions.filter(([v, meta]) => v.startsWith(PLACEHOLDER) && meta.deprecated === undefined);
  for (const [version] of placeholders) {
    loud("npm", ["deprecate", `${pkg.name}@${version}`, `Placeholder. Install ${pkg.name}@alpha.`]);
  }
  if (placeholders.length === 0 && versions.length > 0) console.log("  placeholders already deprecated");

  // 3. Trust the release workflow, unless a trusted publisher is configured.
  let trusted = "";
  try {
    trusted = dryRun ? "" : quiet("npm", ["trust", "list", pkg.name, "--json"]);
  } catch {
    // None configured, or the listing failed: try to create one below.
  }
  if (trusted.includes(REPOSITORY)) {
    console.log(`  already trusts ${REPOSITORY}`);
  } else if (trusted.trim() !== "" && trusted.trim() !== "[]" && trusted.trim() !== "{}") {
    console.error(`  has a different trusted publisher; replace it by hand (npm trust list / revoke):\n${trusted}`);
  } else {
    loud("npm", ["trust", "github", pkg.name, "--repo", REPOSITORY, "--file", WORKFLOW, "--allow-publish", "--yes"]);
    // npm asks for a pause between trust calls, to stay clear of rate limits.
    if (!dryRun) await sleep(2000);
  }
}

console.log(
  `\nDone. Within 2 days, run ${WORKFLOW} (Actions → Release → Run workflow) so it publishes and validates the trust configurations.`,
);
