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
 * 1. publishes a placeholder, 0.0.0, from your logged-in session, and
 *    deprecates it, pointing at the `alpha` tag;
 * 2. trusts .github/workflows/release.yml in the repository to publish it
 *    (`npm trust github`).
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

const exists = (name) => {
  try {
    quiet("npm", ["view", name, "name"]);
    return true;
  } catch {
    return false;
  }
};

const packages = readdirSync(join(root, "packages"))
  .map((dir) => JSON.parse(readFileSync(join(root, "packages", dir, "package.json"), "utf8")))
  .filter((pkg) => pkg.private !== true);

for (const pkg of packages) {
  console.log(`\n${pkg.name}`);
  if (exists(pkg.name)) {
    console.log("  already on npm: no placeholder");
  } else {
    const dir = mkdtempSync(join(tmpdir(), "speculoos-placeholder-"));
    try {
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify(
          {
            name: pkg.name,
            version: "0.0.0",
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
      loud("npm", ["publish", "--access", "public"], dir);
      loud("npm", ["deprecate", `${pkg.name}@0.0.0`, `Placeholder. Install ${pkg.name}@alpha.`]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  loud("npm", ["trust", "github", pkg.name, "--repo", REPOSITORY, "--file", WORKFLOW, "--allow-publish", "--yes"]);
  // npm asks for a pause between trust calls, to stay clear of rate limits.
  if (!dryRun) await new Promise((wait) => setTimeout(wait, 2000));
}

console.log(
  `\nDone. Within 2 days, run ${WORKFLOW} (Actions → Release → Run workflow) so it publishes and validates the trust configurations.`,
);
