/**
 * @speculoos/asyncapi — AsyncAPI 2.x / 3.x → `ApiIR`.
 *
 * Both versions produce the same IR. The one thing that matters most is
 * direction normalisation; see ./direction.ts.
 */

export { buildAsyncApi, type BuildOptions } from "./build.js";
export {
  directionFromV2,
  directionFromV3,
  V2_OPERATIONS,
  type V2Operation,
  type V3Action,
} from "./direction.js";
export { isJsonSchemaFormat, payloadSchema, type PayloadSchema } from "./schema-format.js";
