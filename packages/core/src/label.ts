/**
 * Type labels: the short string a reader sees in the "Type" column.
 *
 * This is the most visible output the library produces, and the thing every
 * renderer would otherwise reimplement slightly differently. One pure function,
 * configurable, with defaults chosen to read well in a table.
 */

import type { Node, TypeRegistry } from "./schema.js";

export interface LabelContext {
  schemas: TypeRegistry;
}

export interface LabelOptions {
  /** Append " | null" to nullable nodes. Default true. */
  nullableSuffix?: boolean;
  /**
   * Beyond this many enum members or union variants the label collapses to
   * "enum" / an elided union, and the values move to a chip. Default 3.
   */
  maxVariants?: number;
  /** How deep to render nested anonymous structure before eliding to "…". Default 3. */
  maxDepth?: number;
}

const DEFAULTS = { nullableSuffix: true, maxVariants: 3, maxDepth: 3 } as const;

/** JSON-ish rendering of a literal: strings quoted, everything else stringified. */
export function formatValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === undefined) return "undefined";
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Last meaningful segment of a TypeId, used when a ref target is missing. */
function fallbackName(id: string): string {
  const segments = id.split(/[#/]/).filter(Boolean);
  return segments[segments.length - 1] ?? id;
}

export function typeLabel(node: Node, ctx: LabelContext, opts: LabelOptions = {}): string {
  const o = { ...DEFAULTS, ...opts };
  const base = render(node, ctx, o, 0);
  return node.nullable && o.nullableSuffix ? `${base} | null` : base;
}

function render(
  node: Node,
  ctx: LabelContext,
  o: Required<LabelOptions>,
  depth: number,
): string {
  if (depth > o.maxDepth) return "…";

  switch (node.kind) {
    case "string":
      return withFormat("string", node.constraints.format);

    case "number":
      return withFormat(node.integer ? "integer" : "number", node.constraints.format);

    case "boolean":
      return "boolean";

    case "null":
      return "null";

    case "const":
      return formatValue(node.value);

    case "enum":
      return node.members.length <= o.maxVariants
        ? node.members.map((m) => formatValue(m.value)).join(" | ")
        : "enum";

    case "object":
      return node.docs.title ?? "object";

    case "map": {
      const key = node.keys ? render(node.keys, ctx, o, depth + 1) : "string";
      return `Record<${key}, ${render(node.values, ctx, o, depth + 1)}>`;
    }

    case "array": {
      const item = render(node.items, ctx, o, depth + 1);
      return /^[A-Za-z0-9_$.]+$/.test(item) ? `${item}[]` : `Array<${item}>`;
    }

    case "tuple": {
      const items = node.prefixItems.map((n) => render(n, ctx, o, depth + 1));
      if (node.rest.kind === "schema") {
        items.push(`...${render(node.rest.node, ctx, o, depth + 1)}[]`);
      }
      return `[${items.join(", ")}]`;
    }

    case "union": {
      const labels = node.variants.map((v) =>
        v.labelSource === "index" ? render(v.node, ctx, o, depth + 1) : v.label,
      );
      return labels.length <= o.maxVariants
        ? labels.join(" | ")
        : `${labels.slice(0, o.maxVariants).join(" | ")} | …`;
    }

    case "intersection":
      return node.members.map((n) => render(n, ctx, o, depth + 1)).join(" & ");

    case "ref":
      return ctx.schemas[node.target]?.name ?? fallbackName(node.target);

    case "any":
      return "any";

    case "never":
      return "never";

    case "unsupported":
      return "unknown";
  }
}

function withFormat(base: string, format: string | undefined): string {
  return format === undefined ? base : `${base}<${format}>`;
}

/**
 * Direction, as a reader sees it.
 *
 * The IR normalises direction to the API consumer's point of view, so
 * "client-sends" is the client sending — the opposite of what AsyncAPI 2.x's
 * `publish` says, and the reason that normalisation exists at all. Both
 * renderers spell it the same way, so the spelling lives here.
 */
export const DIRECTION_LABEL = {
  "client-sends": "client → server",
  "server-sends": "server → client",
} as const;
