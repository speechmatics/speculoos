# Releasing

Every package except `@speculoos/fixtures` is published, all at one version:
they move in lockstep. Until 1.0, releases are prereleases published under the
npm `alpha` dist-tag (each package's `publishConfig`), so `npm install
@speculoos/core` without a tag finds nothing until a release is promoted.

`irVersion`, the IR's own version, is separate: it changes only when the IR
does, and only additively within `1`.

## Once

- An npm organisation named `speculoos`, with you as a member who can publish.
  The `@speculoos/` scope is the organisation's; nobody else can publish to it.
- `npm login`, and two-factor authentication for publishing.

## Each release

1. On an up-to-date `main` with a clean working tree:

   ```sh
   pnpm set-version 0.1.0-alpha.1
   ```

   This sets the root's and every package's version. Dependencies between the
   packages are `workspace:` ranges, which pnpm rewrites to the published
   version, so nothing else changes.

2. Add the release to `CHANGELOG.md`, then commit and tag:

   ```sh
   git commit -am "Release 0.1.0-alpha.1"
   git tag v0.1.0-alpha.1
   ```

3. Publish:

   ```sh
   pnpm release
   ```

   That builds everything, runs `pnpm release:check`, and only then runs
   `pnpm -r publish`. pnpm skips private packages and refuses a dirty working
   tree or a branch other than `main`; don't override either.

4. Check what landed, then push:

   ```sh
   npm view @speculoos/core dist-tags
   git push && git push --tags
   ```

## What `pnpm release:check` checks

CI runs it on every push, so a release should never be the first time it fails.

- Every package is at the root's version, with the metadata a registry page
  needs (MIT, repository, engines, publishConfig) and its own README and LICENSE.
- publint finds nothing, suggestions included.
- The tarballs, packed exactly as they would be published, install together into
  a fresh project, where every entry point typechecks and loads from both an ES
  module and a CommonJS one, and the CLI runs.

## Promoting

When a release should be what a plain `npm install` gets, move `latest` to it,
package by package:

```sh
npm dist-tag add @speculoos/core@0.1.0 latest
```

and drop `tag: "alpha"` from the packages' `publishConfig` for the releases
after it.
