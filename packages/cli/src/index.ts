/**
 * @speculoos/cli — build, lint and inspect API specs as Speculoos IR.
 *
 * The library entry is `run`, which the executable (./cli.ts) is built on: the
 * build, with its diagnostics, as data rather than a process exit.
 */

export { type RunOptions, type RunResult, run } from "./run.js";
