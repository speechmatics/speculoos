/**
 * Canonical JSON Schema: roughly 2020-12, the one dialect the lowering code
 * ever sees.
 *
 * Deliberately typed loosely. This is other people's data in transit between two
 * of our own functions; giving it a precise TypeScript shape would be a lie, and
 * every access would need narrowing anyway.
 */

export type Schema = Record<string, unknown> | boolean;

/** Keywords whose value is a single subschema. */
export const SCHEMA_KEYWORDS = [
  "items",
  "additionalItems",
  "contains",
  "additionalProperties",
  "propertyNames",
  "not",
  "if",
  "then",
  "else",
  "unevaluatedItems",
  "unevaluatedProperties",
] as const;

/** Keywords whose value is an array of subschemas. */
export const SCHEMA_ARRAY_KEYWORDS = ["allOf", "anyOf", "oneOf", "prefixItems"] as const;

/** Keywords whose value is an object mapping names to subschemas. */
export const SCHEMA_MAP_KEYWORDS = [
  "properties",
  "patternProperties",
  "$defs",
  "definitions",
  "dependentSchemas",
] as const;

/**
 * Keywords holding arbitrary instance data, never schemas. Recursing into these
 * would rewrite a user's example payload as if it were a schema — a `nullable`
 * key inside an example is just a field name.
 */
export const DATA_KEYWORDS = new Set([
  "default",
  "const",
  "enum",
  "examples",
  "example",
]);

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isSchema(value: unknown): value is Schema {
  return typeof value === "boolean" || isObject(value);
}

/** Reads a numeric keyword, ignoring values of the wrong type. */
export function num(schema: Record<string, unknown>, key: string): number | undefined {
  const v = schema[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export function str(schema: Record<string, unknown>, key: string): string | undefined {
  const v = schema[key];
  return typeof v === "string" ? v : undefined;
}

export function bool(schema: Record<string, unknown>, key: string): boolean | undefined {
  const v = schema[key];
  return typeof v === "boolean" ? v : undefined;
}

/** The `type` keyword, always as a list. */
export function types(schema: Record<string, unknown>): string[] {
  const t = schema["type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
  return [];
}
