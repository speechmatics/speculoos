/** Identifying which dialect a document is written in, from the document itself. */

import type { Dialect } from "@speculoos/jsonschema";

export interface DialectInfo {
  dialect: Dialect;
  /** As declared, e.g. "3.1.0". */
  version: string;
  family: "openapi" | "asyncapi";
}

/**
 * OpenAPI declares `openapi: "3.1.0"`, AsyncAPI declares `asyncapi: "3.0.0"`.
 * Swagger 2.0 (`swagger: "2.0"`) is deliberately unsupported — external
 * converters exist, and supporting it would roughly double the upcast surface.
 */
export function detectDialect(data: unknown): DialectInfo | { error: string } {
  if (data === null || typeof data !== "object") {
    return { error: "Document is not an object" };
  }
  const doc = data as Record<string, unknown>;

  if (typeof doc["swagger"] === "string") {
    return {
      error: `Swagger ${doc["swagger"]} is not supported. Convert to OpenAPI 3.x first.`,
    };
  }

  const openapi = doc["openapi"];
  if (typeof openapi === "string") {
    if (openapi.startsWith("3.0")) return { dialect: "openapi-3.0", version: openapi, family: "openapi" };
    if (openapi.startsWith("3.1") || openapi.startsWith("3.2")) {
      return { dialect: "openapi-3.1", version: openapi, family: "openapi" };
    }
    return { error: `Unsupported OpenAPI version "${openapi}"` };
  }

  const asyncapi = doc["asyncapi"];
  if (typeof asyncapi === "string") {
    if (asyncapi.startsWith("2.")) return { dialect: "asyncapi-2", version: asyncapi, family: "asyncapi" };
    if (asyncapi.startsWith("3.")) return { dialect: "asyncapi-3", version: asyncapi, family: "asyncapi" };
    return { error: `Unsupported AsyncAPI version "${asyncapi}"` };
  }

  return { error: "Document declares neither `openapi` nor `asyncapi`" };
}
