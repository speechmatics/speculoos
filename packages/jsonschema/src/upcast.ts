/**
 * Dialect → canonical JSON Schema.
 *
 * Mechanical and lossless. All dialect knowledge in the pipeline lives here, so
 * that `lower` never branches on where a schema came from. If you find yourself
 * wanting a dialect check during lowering, the upcast is incomplete.
 */

import {
  DATA_KEYWORDS,
  SCHEMA_ARRAY_KEYWORDS,
  SCHEMA_KEYWORDS,
  SCHEMA_MAP_KEYWORDS,
  isObject,
  type Schema,
} from "./canonical.js";

export type Dialect = "openapi-3.0" | "openapi-3.1" | "asyncapi-2" | "asyncapi-3" | "json-schema";

/** Recursively converts a schema of `dialect` into canonical form. Pure. */
export function upcast(schema: unknown, dialect: Dialect): Schema {
  if (typeof schema === "boolean") return schema;
  if (!isObject(schema)) return {};

  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(schema)) {
    if (DATA_KEYWORDS.has(key)) {
      out[key] = value; // never recurse: this is instance data, not schema
      continue;
    }
    if ((SCHEMA_KEYWORDS as readonly string[]).includes(key)) {
      // draft-07 tuple form: `items: [...]` is an array of schemas, not one schema.
      out[key] = Array.isArray(value) ? value.map((v) => upcast(v, dialect)) : upcast(value, dialect);
      continue;
    }
    if ((SCHEMA_ARRAY_KEYWORDS as readonly string[]).includes(key)) {
      out[key] = Array.isArray(value) ? value.map((v) => upcast(v, dialect)) : value;
      continue;
    }
    if ((SCHEMA_MAP_KEYWORDS as readonly string[]).includes(key)) {
      out[key] = isObject(value)
        ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, upcast(v, dialect)]))
        : value;
      continue;
    }
    out[key] = value;
  }

  normaliseDefs(out);
  normaliseTuple(out);
  normaliseExamples(out);
  normaliseExclusiveBounds(out);
  normaliseNullable(out);
  normaliseDiscriminator(out);
  normaliseDependencies(out);

  return out;
}

/** draft-07 `definitions` → 2020-12 `$defs`. */
function normaliseDefs(s: Record<string, unknown>): void {
  if (s["definitions"] === undefined) return;
  if (s["$defs"] === undefined) s["$defs"] = s["definitions"];
  delete s["definitions"];
}

/**
 * draft-07 tuple form → 2020-12.
 *   items: [A, B]        → prefixItems: [A, B]
 *   additionalItems: C   → items: C
 */
function normaliseTuple(s: Record<string, unknown>): void {
  if (Array.isArray(s["items"])) {
    if (s["prefixItems"] === undefined) s["prefixItems"] = s["items"];
    delete s["items"];
  }
  if (s["additionalItems"] !== undefined) {
    if (s["items"] === undefined) s["items"] = s["additionalItems"];
    delete s["additionalItems"];
  }
}

/** OAS 3.0 `example` (singular) → `examples` (list). */
function normaliseExamples(s: Record<string, unknown>): void {
  if (s["example"] === undefined) return;
  if (s["examples"] === undefined) s["examples"] = [s["example"]];
  delete s["example"];
}

/** draft-04 / OAS 3.0 boolean exclusive bounds → 2020-12 numeric form. */
function normaliseExclusiveBounds(s: Record<string, unknown>): void {
  for (const [bound, exclusive] of [
    ["minimum", "exclusiveMinimum"],
    ["maximum", "exclusiveMaximum"],
  ] as const) {
    if (typeof s[exclusive] !== "boolean") continue;
    if (s[exclusive] === true && typeof s[bound] === "number") {
      s[exclusive] = s[bound];
      delete s[bound];
    } else {
      delete s[exclusive];
    }
  }
}

/** OAS 3.0 `nullable: true` → `type: [X, "null"]`. */
function normaliseNullable(s: Record<string, unknown>): void {
  const nullable = s["nullable"];
  if (typeof nullable !== "boolean") return;
  delete s["nullable"];
  if (nullable !== true) return;

  const t = s["type"];
  if (typeof t === "string") {
    s["type"] = t === "null" ? t : [t, "null"];
  } else if (Array.isArray(t)) {
    if (!t.includes("null")) s["type"] = [...t, "null"];
  } else {
    // `nullable` with no `type` constrains nothing on its own, but the author
    // meant "null is allowed here", so record it where lowering will see it.
    s["type"] = ["null"];
    s["$speculoosNullableAny"] = true;
  }
}

/** AsyncAPI's string discriminator → OpenAPI's object form. */
function normaliseDiscriminator(s: Record<string, unknown>): void {
  if (typeof s["discriminator"] === "string") {
    s["discriminator"] = { propertyName: s["discriminator"] };
  }
}

/** draft-07 `dependencies` → `dependentRequired` / `dependentSchemas`. */
function normaliseDependencies(s: Record<string, unknown>): void {
  const deps = s["dependencies"];
  if (!isObject(deps)) return;
  delete s["dependencies"];

  const required: Record<string, unknown> = {};
  const schemas: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(deps)) {
    if (Array.isArray(value)) required[key] = value;
    else schemas[key] = value;
  }
  if (Object.keys(required).length > 0 && s["dependentRequired"] === undefined) {
    s["dependentRequired"] = required;
  }
  if (Object.keys(schemas).length > 0 && s["dependentSchemas"] === undefined) {
    s["dependentSchemas"] = schemas;
  }
}
