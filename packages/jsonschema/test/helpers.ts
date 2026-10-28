import type { Diagnostic, Node, SourceLocation, TypeRegistry } from "@speculoos/core";
import { buildSchemas, type Dialect } from "../src/index.js";

/** Resolves pointers within one in-memory document. */
export function harness(document: unknown, dialect: Dialect = "json-schema") {
  const resolver = {
    resolve(ref: string, from: SourceLocation): SourceLocation | undefined {
      if (!ref.startsWith("#")) return undefined;
      const pointer = ref.slice(1);
      return at(document, pointer) === undefined ? undefined : { document: from.document, pointer };
    },
    at(loc: SourceLocation): unknown {
      return at(document, loc.pointer);
    },
  };

  const built = buildSchemas({ resolver, dialect });
  return {
    ...built,
    lower(schema: unknown, pointer = "#"): Node {
      return built.lowerInline(schema, { document: "d", pointer });
    },
  };
}

/** Lowers one schema and returns the node plus any diagnostics raised. */
export function lowerOne(
  schema: unknown,
  dialect: Dialect = "json-schema",
  document: unknown = {},
): { node: Node; diagnostics: Diagnostic[]; schemas: TypeRegistry } {
  const h = harness(document, dialect);
  const node = h.lower(schema);
  const { schemas, diagnostics } = h.finish();
  return { node, diagnostics, schemas };
}

function at(doc: unknown, pointer: string): unknown {
  if (pointer === "" || pointer === "/") return doc;
  let current: unknown = doc;
  for (const raw of pointer.split("/").slice(1)) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
    if (current === undefined) return undefined;
  }
  return current;
}
