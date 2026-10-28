# Releasing

Every package except `@speculoos/fixtures` is published, all at one version:
they move in lockstep. Until 1.0, releases are prereleases published under the
npm `alpha` dist-tag (each package's `publishConfig`).

`irVersion`, the IR's own version, is separate: it changes only when the IR
does, and only additively within `1`.

Releases are published by GitHub Actions, never from a laptop:
[`.github/workflows/release.yml`](../.github/workflows/release.yml) runs on
every push to `main` and publishes whatever version is not on npm yet, with npm
**trusted publishing** — an OIDC token from the workflow instead of a stored npm
token, and a provenance statement on every version, which npm generates when the
repository is public.

## Releasing a version

1. On a branch, set the version and add it to `CHANGELOG.md`:

   ```sh
   pnpm set-version 0.1.0-alpha.1
   ```

   This sets the root's and every package's version. Dependencies between the
   packages are `workspace:` ranges, which become the published version when
   they are packed, so nothing else changes.

2. Check it as the workflow will:

   ```sh
   pnpm release:dry-run
   ```

   That builds, runs `pnpm release:check`, and walks through the publish
   without publishing.

3. Merge to `main`. The workflow builds, checks again and publishes, dependencies
   first. If it fails halfway, run it again (Actions → Release → Run workflow):
   it skips versions already on npm.

4. Check what landed, and tag the release:

   ```sh
   npm view @speculoos/core dist-tags
   git tag v0.1.0-alpha.1 && git push --tags
   ```

## Setting up trusted publishing (once)

npm will only trust a workflow on a package that already exists, and a trusted
publisher cannot make a package's first publish. So each package gets a
placeholder first, from a maintainer's own session; the workflow publishes
every real version, the first alpha included.

You need: membership of the `speculoos` npm organisation with permission to
publish, two-factor authentication on your npm account, npm 11.15 or later
(`npm install -g npm@^11.15.0`, for `npm trust`), and `npm login`.

1. Push this repository to `github.com/speechmatics/speculoos`. The first
   Release run fails at its publish step: npm has nothing to trust yet, so
   nothing is published. That is expected. A public repository gets provenance;
   a private one still publishes, without it.

2. Run the bootstrap:

   ```sh
   node scripts/npm-bootstrap.mjs --dry-run   # what it will do
   node scripts/npm-bootstrap.mjs
   ```

   For each package not on npm, it publishes `0.0.0` as a placeholder and
   deprecates it ("Install @speculoos/…@alpha"), then trusts `release.yml` in
   `speechmatics/speculoos` to publish it. npm asks for a second factor; the
   first time, choose to skip it for five minutes, and the rest go through.

3. **Within two days**, run the Release workflow again (Actions → Release →
   Run workflow): it publishes `0.1.0-alpha.0`. A trust configuration that has
   not published within two days of being created expires, and has to be
   revoked and made again (`npm trust list`, `npm trust revoke`, then the
   bootstrap).

4. Once the workflow has published, check the trusted publisher on each
   package's settings page on npmjs.com, and remove any npm tokens that are no
   longer needed.

The placeholders stay as `latest` until a release is promoted, so a plain
`npm install @speculoos/core` gets the deprecated placeholder and its message
saying to install `@alpha`.

## What `pnpm release:check` checks

CI runs it on every push, and the release workflow before publishing.

- Every package is at the root's version, with the metadata a registry page
  needs (MIT, repository, engines, publishConfig) and its own README and LICENSE.
- publint finds nothing, suggestions included.
- The tarballs, packed exactly as they would be published, install together into
  a fresh project, where every entry point typechecks and loads from both an ES
  module and a CommonJS one, and the CLI runs.

## Promoting

When a release should be what a plain `npm install` gets, move `latest` to it,
package by package, from a logged-in session:

```sh
npm dist-tag add @speculoos/core@0.1.0 latest
```

and drop `tag: "alpha"` from the packages' `publishConfig` for the releases
after it.
