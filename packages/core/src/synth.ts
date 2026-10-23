/**
 * Synthetic nodes.
 *
 * A parameter list and a set of response headers are both "a name, a schema, a
 * required flag and some docs, repeated" — which is an `ObjectNode`. Wrapping
 * them in one hands the whole presentation layer to them for free: docs
 * precedence through a `$ref`, chips, nested expansion, cycle detection. The
 * alternative is a second row-building path that drifts from the first.
 *
 * These began in `@speculoos/react`. The HTML renderer needed them verbatim,
 * which is what they are doing here instead.
 */

import type { Parameter } from "./document.js";
import type { ObjectNode, Property, SourceLocation } from "./schema.js";

export function propertiesNode(properties: Property[], source: SourceLocation): ObjectNode {
  return {
    kind: "object",
    source,
    docs: {},
    nullable: false,
    properties,
    additional: { kind: "any" },
    patternProperties: [],
    constraints: {},
    composedFrom: [],
  };
}

/** A parameter read as a property: the same four fields under different names. */
export const parameterProperty = (p: Parameter): Property => ({
  name: p.name,
  node: p.node,
  required: p.required,
  readOnly: false,
  writeOnly: false,
  deprecated: p.docs.deprecated === true,
  docs: p.docs,
});

export function parametersNode(params: Parameter[], source: SourceLocation): ObjectNode {
  return propertiesNode(params.map(parameterProperty), source);
}
