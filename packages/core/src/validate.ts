/**
 * Runtime validation of an `ApiIR`, against a JSON Schema generated from the
 * TypeScript types in this package.
 *
 * Exposed as the `@speculoos/core/validate` subpath so the default export keeps
 * its promise of zero runtime dependencies. `ajv` is an *optional* peer: install
 * it only if you want `validateApiIR`. The schema itself is plain data and is
 * exported unconditionally, so you can validate with any tool you like — or
 * hand it to a consumer that has no JavaScript at all.
 */

import type { ErrorObject } from "ajv";
import AjvModule from "ajv";
import schema from "../schema/apiir.schema.json" with { type: "json" };

/** JSON Schema (2020-12 compatible) describing a complete `ApiIR` document. */
const apiIRSchema: Record<string, unknown> = schema as Record<string, unknown>;

export interface ValidationResult {
  valid: boolean;
  errors: ErrorObject[];
}

// ajv v8 is CJS; the shape of its default export differs between module systems.
const Ajv = ((AjvModule as unknown as { default?: typeof AjvModule }).default ?? AjvModule) as typeof AjvModule;

let compiled: ReturnType<InstanceType<typeof Ajv>["compile"]> | undefined;

function validator(): NonNullable<typeof compiled> {
  compiled ??= new Ajv({ strict: false, allErrors: true }).compile(apiIRSchema);
  return compiled;
}

/** Validates without throwing. Errors are Ajv error objects, with JSON pointers. */
export function validateApiIR(value: unknown): ValidationResult {
  const validate = validator();
  const valid = validate(value) as boolean;
  return { valid, errors: validate.errors ?? [] };
}

/**
 * Validates and returns the value typed, or throws with the first few errors.
 * Adapters should call this before writing IR out, and transforms after running.
 */
export function parseApiIR(value: unknown): import("./document.js").ApiIR {
  const { valid, errors } = validateApiIR(value);
  if (!valid) {
    const summary = errors
      .slice(0, 5)
      .map((e) => `  ${e.instancePath || "/"} ${e.message ?? "is invalid"}`)
      .join("\n");
    throw new Error(`Invalid ApiIR (${errors.length} error${errors.length === 1 ? "" : "s"}):\n${summary}`);
  }
  return value as import("./document.js").ApiIR;
}
