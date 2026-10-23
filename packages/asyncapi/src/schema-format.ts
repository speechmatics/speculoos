/**
 * AsyncAPI message payloads may be written in a schema language that is not
 * JSON Schema — Avro, Protobuf, OpenAPI's dialect, RAML data types.
 *
 * We can only lower JSON-Schema-shaped payloads. Anything else becomes an
 * `UnsupportedNode` plus a diagnostic, which is the house rule: lossy, but
 * never silently. Crashing on an Avro payload would be the wrong answer; so
 * would pretending it lowered.
 */

import type { Node, SourceLocation } from "@speculoos/core";
import { isObject, str } from "@speculoos/jsonschema";

/** Media types whose payload we can treat as (something close to) JSON Schema. */
const JSON_SCHEMA_FORMATS = [
  "application/vnd.aai.asyncapi",
  "application/schema+json",
  "application/schema+yaml",
  "application/vnd.oai.openapi",
];

export function isJsonSchemaFormat(format: string | undefined): boolean {
  if (format === undefined || format.trim() === "") return true;
  const base = format.split(";")[0]!.trim().toLowerCase();
  return JSON_SCHEMA_FORMATS.some((f) => base === f || base.startsWith(`${f}+`));
}

export interface PayloadSchema {
  /** The schema to lower, when we understand the format. */
  schema?: unknown;
  /** Set when we do not: the reason, for the diagnostic and the node. */
  unsupported?: string;
  raw: unknown;
}

/**
 * Unwraps a payload. AsyncAPI 3.x allows a Multi Format Schema Object
 * (`{ schemaFormat, schema }`); 2.x puts `schemaFormat` on the message itself.
 */
export function payloadSchema(payload: unknown, messageFormat: string | undefined): PayloadSchema {
  if (isObject(payload) && "schemaFormat" in payload && "schema" in payload) {
    const format = str(payload, "schemaFormat");
    return isJsonSchemaFormat(format)
      ? { schema: payload["schema"], raw: payload }
      : { unsupported: `schemaFormat "${format}" is not JSON Schema`, raw: payload };
  }

  return isJsonSchemaFormat(messageFormat)
    ? { schema: payload, raw: payload }
    : { unsupported: `schemaFormat "${messageFormat}" is not JSON Schema`, raw: payload };
}

export function unsupportedNode(reason: string, raw: unknown, source: SourceLocation): Node {
  return { kind: "unsupported", source, docs: {}, nullable: false, reason, raw };
}
