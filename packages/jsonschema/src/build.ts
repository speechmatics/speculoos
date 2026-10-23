/**
 * The convenience entry point: resolver in, registry out.
 *
 * Adapters generally want this rather than the pieces — it wires upcast →
 * lower → simplify → registry with the ordering the pipeline depends on.
 */

import type { Diagnostic, Node, SourceLocation, TypeRegistry } from "@speculoos/core";
import { Registry, type Resolver } from "./registry.js";
import { lower } from "./lower.js";
import { simplify } from "./simplify.js";
import { upcast, type Dialect } from "./upcast.js";

export interface BuildSchemasOptions {
  resolver: Resolver;
  dialect: Dialect;
}

export interface BuildSchemasResult {
  registry: Registry;
  /** Lowers an inline (anonymous) schema, registering any named types it refs. */
  lowerInline: (schema: unknown, loc: SourceLocation) => Node;
  finish: () => { schemas: TypeRegistry; diagnostics: Diagnostic[] };
}

export function buildSchemas({ resolver, dialect }: BuildSchemasOptions): BuildSchemasResult {
  // Declared before `registry` so the lowering closure can refer to it; the
  // mutual recursion is real — lowering a type can register another type.
  let registry!: Registry;

  const run = (schema: unknown, loc: SourceLocation): Node =>
    simplify(
      lower(upcast(schema, dialect), loc, {
        typeIdFor: (ref, from) => registry.typeIdFor(ref, from),
        report: (d) => registry.report(d),
      }),
    );

  registry = new Registry(resolver, run);

  return {
    registry,
    lowerInline: run,
    finish: () => ({ schemas: registry.finish(), diagnostics: registry.diagnostics }),
  };
}
