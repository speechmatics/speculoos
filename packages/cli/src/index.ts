/**
 * @speculoos/cli — build, lint and inspect API specs as Speculoos IR.
 *
 * The library entry; the executable is ./cli.ts.
 */

export { type PassFlags, parseRenames, passesFor } from "./passes.js";
export { type InspectOptions, renderInspect, renderLint, summarise } from "./report.js";
export { type RunOptions, type RunResult, run } from "./run.js";
