/**
 * @speculoos/asyncapi — AsyncAPI 2.x / 3.x → `ApiIR`.
 *
 * Both versions produce the same IR. The one thing that matters most is
 * direction normalisation; see ./direction.ts.
 */

export { type BuildOptions, buildAsyncApi } from "./build.js";
