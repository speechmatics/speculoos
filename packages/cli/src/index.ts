/**
 * @speculoos/cli — build, lint and inspect API specs as Speculoos IR.
 *
 * The library entry; the executable is ./cli.ts.
 */

export { run, type RunOptions, type RunResult } from "./run.js";
export { renderInspect, renderLint, summarise, type InspectOptions } from "./report.js";
export { passesFor, parseRenames, type PassFlags } from "./passes.js";
