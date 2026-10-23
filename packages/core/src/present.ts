/**
 * The presentation layer: IR nodes in, resolved display nodes out.
 *
 * The component map decides what markup is produced. This decides what is handed
 * to it. They are orthogonal — a renderer still recurses through `children` — but
 * `children` arrives already resolved, so no renderer has to implement a depth
 * budget or cycle detection. Get that wrong once and a self-referential schema
 * takes down the build.
 *
 * `toTree` is the nested shape; `toRows` is the same nodes flattened pre-order for
 * design systems whose Table takes a row array and cannot nest <tr> inside <tr>.
 */

import type { Docs, Node, Property, TypeId, TypeRegistry, View } from "./schema.js";
import { formatValue, typeLabel, type LabelOptions } from "./label.js";
import { appliesToView } from "./view.js";

// ─────────────────────────────────────────────────────────────────────────────
// Chips
// ─────────────────────────────────────────────────────────────────────────────

export type ChipKind =
  | "extends"
  | "unsupported"
  | "deprecated"
  | "readOnly"
  | "writeOnly"
  | "default"
  | "enum"
  | "pattern"
  | "range"
  | "length"
  | "items"
  | "multipleOf"
  | "uniqueItems"
  | "additionalProperties"
  | "contentMediaType"
  | "note";

/**
 * A constraint worth showing as a badge. Deliberately excludes `required` and
 * `nullable`, which are first-class fields on `FieldNode`, and `format`, which
 * is already carried in `typeLabel` — a chip for either would duplicate output.
 */
export interface Chip {
  kind: ChipKind;
  /** Pre-formatted and ready to display. */
  label: string;
  /** The underlying value, for renderers that want to format it themselves. */
  value?: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Field nodes
// ─────────────────────────────────────────────────────────────────────────────

export type FieldChildren =
  | { kind: "none" }
  | { kind: "inline"; nodes: FieldNode[] }
  /** Union or intersection branches. `label` is e.g. "one of" / "all of". */
  | { kind: "variants"; label: string; nodes: FieldNode[] }
  /** Expansion stopped; the renderer links to the target's own section. */
  | { kind: "link"; target: TypeId; reason: "named" | "depth" | "unresolved" }
  /** The target is already an ancestor. Expanding would not terminate. */
  | { kind: "cycle"; target: TypeId };

export interface FieldNode {
  /** Unique within one tree. Usable as a React key and as an anchor fragment. */
  key: string;
  /** Display path, e.g. ["config", "transcription", "[]", "language"]. */
  path: string[];
  depth: number;
  /** Absent on the root, and on array element nodes. */
  name?: string;
  /** The underlying IR node, always available as an escape hatch. */
  node: Node;
  typeLabel: string;
  /** Set when this field's type is a registry entry — the link target. */
  typeRef?: TypeId;
  /**
   * Named types merged in via `allOf`. Present so a renderer can say "extends
   * TranscriptionConfig" and link to it; whether to also inline the inherited
   * properties is the renderer's call, which is the whole reason the IR keeps
   * the name instead of flattening it away.
   */
  composedFrom?: TypeId[];
  required: boolean;
  nullable: boolean;
  chips: Chip[];
  /** Already resolved: property docs win over the ref target's docs. */
  docs: Docs;
  children: FieldChildren;
}

export interface PresentContext {
  schemas: TypeRegistry;
}

export interface ViewOptions {
  /** Drops readOnly properties from "request", writeOnly from "response". Default "neutral". */
  view?: View;
  /**
   * What to do at a `$ref`:
   *   "never"  — always link. Named types have their own section, so this keeps
   *              tables shallow and is the default.
   *   "depth"  — expand while `depth < maxDepth`, then link.
   *   "always" — expand until a cycle is hit.
   *
   * Anonymous structure always expands fully, whatever this says: there is no
   * section to link to, so truncating it would make that content unreachable.
   */
  expandRefs?: "never" | "depth" | "always";
  /** Only consulted when `expandRefs` is "depth". Default 2. */
  maxDepth?: number;
  label?: LabelOptions;
}

const DEFAULTS = { view: "neutral", expandRefs: "never", maxDepth: 2 } as const;

interface Ctx extends PresentContext {
  opts: Required<Omit<ViewOptions, "label">> & { label: LabelOptions };
  keys: Set<string>;
}

/** Builds the nested display tree for a node. */
export function toTree(node: Node, ctx: PresentContext, opts: ViewOptions = {}): FieldNode {
  const c: Ctx = {
    schemas: ctx.schemas,
    opts: { ...DEFAULTS, label: {}, ...opts },
    keys: new Set(),
  };
  return buildField(c, { node, path: [], depth: 0, required: false, ancestors: new Set() });
}

/** Pre-order flatten of `toTree`. Same `FieldNode` objects, one array. */
export function toRows(node: Node, ctx: PresentContext, opts: ViewOptions = {}): FieldNode[] {
  return flatten(toTree(node, ctx, opts));
}

/** Pre-order flatten of an existing tree, including the root. */
export function flatten(root: FieldNode): FieldNode[] {
  const out: FieldNode[] = [];
  const visit = (f: FieldNode): void => {
    out.push(f);
    if (f.children.kind === "inline" || f.children.kind === "variants") {
      for (const child of f.children.nodes) visit(child);
    }
  };
  visit(root);
  return out;
}

export interface FieldList {
  /** The rows to render, nested or flat according to `layout`. */
  fields: FieldNode[];
  /**
   * `allOf` ancestors that were carried by a dropped root row. A renderer must
   * show these *above* the table; dropping the root row would otherwise take
   * the entire "extends BaseConfig" link with it, which is most base/extension
   * pairs in a real spec.
   */
  composedFrom: TypeId[];
  /** Whether the root row was dropped. */
  rootDropped: boolean;
}

/**
 * Turns a tree into the rows a field table should actually show.
 *
 * An unnamed object root is a row reading "(no name): object", which tells a
 * reader nothing, so it is dropped. Anything else — a scalar body, a link to a
 * named type, a union — is the only row there is, so it stays.
 *
 * This lives in core rather than in a renderer because it is a decision about
 * *what to show*, not about markup, and both renderers need exactly the same
 * answer. It did once live in the React package, where the lifting of
 * `composedFrom` off a dropped root was missed and a composed type lost its
 * "extends" link. One copy, one fix.
 */
export function toFieldList(root: FieldNode, layout: "tree" | "rows" = "tree"): FieldList {
  const rootDropped = root.name === undefined && root.children.kind === "inline";
  const fields =
    layout === "tree"
      ? rootDropped && root.children.kind === "inline"
        ? root.children.nodes
        : [root]
      : rootDropped
        ? flatten(root).slice(1)
        : flatten(root);
  return {
    fields,
    composedFrom: rootDropped ? (root.composedFrom ?? []) : [],
    rootDropped,
  };
}

/**
 * Every TypeId reachable as a link or cycle target. A static renderer must emit
 * a section for each of these, or the links it renders will dangle.
 */
export function collectLinks(root: FieldNode): TypeId[] {
  const out = new Set<TypeId>();
  for (const f of flatten(root)) {
    if (f.children.kind === "link" || f.children.kind === "cycle") out.add(f.children.target);
    for (const id of f.composedFrom ?? []) out.add(id);
  }
  return [...out];
}

// ─────────────────────────────────────────────────────────────────────────────
// Construction
// ─────────────────────────────────────────────────────────────────────────────

interface FieldInput {
  node: Node;
  path: string[];
  depth: number;
  required: boolean;
  ancestors: ReadonlySet<TypeId>;
  name?: string;
  /** Usage-level docs from the Property, which outrank the ref target's docs. */
  usageDocs?: Docs;
  extraChips?: Chip[];
}

function buildField(c: Ctx, input: FieldInput): FieldNode {
  const { node, path, depth, required, ancestors } = input;
  const expansion = expand(c, node, depth, ancestors, path);

  const target =
    expansion.typeRef === undefined ? undefined : c.schemas[expansion.typeRef];
  const chipOpts: ChipOptions = { maxInlineEnum: c.opts.label.maxVariants ?? 3 };

  const composedFrom = composedTypes(c, target?.node ?? node);
  const extendsChips: Chip[] = composedFrom.map((id) => ({
    kind: "extends",
    label: `extends ${c.schemas[id]?.name ?? id}`,
    value: id,
  }));

  return {
    key: uniqueKey(c, path),
    path,
    depth,
    ...(input.name !== undefined && { name: input.name }),
    node,
    typeLabel: typeLabel(node, c, c.opts.label),
    ...(expansion.typeRef !== undefined && { typeRef: expansion.typeRef }),
    required,
    nullable: node.nullable,
    ...(composedFrom.length > 0 && { composedFrom }),
    chips: dedupe([
      ...(input.extraChips ?? []),
      ...extendsChips,
      ...chipsFor(node, chipOpts),
      ...(target ? chipsFor(target.node, chipOpts) : []),
    ]),
    docs: mergeDocs(input.usageDocs, node.docs, target?.docs, target?.node.docs),
    children: expansion.children,
  };
}

/**
 * Docs precedence: the property's own description describes *this use* of a type;
 * the ref target's describes the type itself. Most renderers get this backwards.
 */
/**
 * Precedence, most specific first:
 *   `usage`      the property's own docs — describes *this use* of the type
 *   `own`        `$ref` sibling docs on the node itself
 *   `typeDocs`   the registry entry's docs — describes the type
 *   `typeNode`   the target node's docs — where a named scalar's `default`,
 *                `examples` and `title` actually live after lowering
 *
 * Most renderers collapse the first two into the last and get this backwards.
 */
function mergeDocs(
  usage: Docs | undefined,
  own: Docs,
  typeDocs?: Docs,
  typeNode?: Docs,
): Docs {
  const sources = [usage, own, typeDocs, typeNode].filter((d): d is Docs => d !== undefined);
  const pick = (key: keyof Docs): unknown =>
    sources.find((d) => d[key] !== undefined)?.[key];

  const merged: Docs = {};
  for (const key of ["title", "description", "default", "externalDocs", "examples"] as const) {
    const value = pick(key);
    if (value !== undefined) Object.assign(merged, { [key]: value });
  }
  if (sources.some((d) => d.deprecated)) merged.deprecated = true;

  const notes = sources.flatMap((d) => d.notes ?? []);
  if (notes.length > 0) merged.notes = notes;

  const extensions = sources.reduceRight<Record<string, unknown>>(
    (acc, d) => ({ ...acc, ...d.extensions }),
    {},
  );
  if (Object.keys(extensions).length > 0) merged.extensions = extensions;

  return merged;
}

/** Named types merged in via allOf, looking through arrays and a ref. */
function composedTypes(c: Ctx, node: Node): TypeId[] {
  let eff = node;
  while (eff.kind === "array") eff = eff.items;
  if (eff.kind === "ref") {
    const target = c.schemas[eff.target];
    if (target === undefined) return [];
    eff = target.node;
  }
  return eff.kind === "object" ? eff.composedFrom : [];
}

/** A ref node and its target can both carry a default; show it once. */
function dedupe(chips: Chip[]): Chip[] {
  const seen = new Set<string>();
  return chips.filter((c) => {
    const key = `${c.kind}\u0000${c.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueKey(c: Ctx, path: string[]): string {
  const base = path.length === 0 ? "$" : path.join("/");
  if (!c.keys.has(base)) {
    c.keys.add(base);
    return base;
  }
  let n = 2;
  while (c.keys.has(`${base}#${n}`)) n++;
  const key = `${base}#${n}`;
  c.keys.add(key);
  return key;
}

interface Expansion {
  children: FieldChildren;
  typeRef?: TypeId;
}

const NONE: Expansion = { children: { kind: "none" } };

function expand(
  c: Ctx,
  node: Node,
  depth: number,
  ancestors: ReadonlySet<TypeId>,
  /** The owning field's path. Children hang off it. */
  basePath: string[],
): Expansion {
  // Arrays are transparent: a reader thinks of `items: Foo` as "a list of Foo",
  // and wants Foo's fields, not a wrapper level. Nested arrays unwrap too.
  let eff = node;
  const suffix = [...basePath];
  while (eff.kind === "array") {
    suffix.push("[]");
    eff = eff.items;
  }

  if (eff.kind === "ref") {
    const target = c.schemas[eff.target];
    if (target === undefined) {
      return { children: { kind: "link", target: eff.target, reason: "unresolved" } };
    }
    if (ancestors.has(eff.target)) {
      return { children: { kind: "cycle", target: eff.target }, typeRef: eff.target };
    }
    const { expandRefs, maxDepth } = c.opts;
    // The root is what the caller asked to see, so it always expands; the
    // policy governs descendants. Otherwise `toTree(ref(Job))` renders a link
    // to itself, and a `$ref`-valued request body shows nothing at all.
    const isRoot = depth === 0 && basePath.length === 0;
    if (!isRoot && expandRefs === "never") {
      return { children: { kind: "link", target: eff.target, reason: "named" }, typeRef: eff.target };
    }
    if (!isRoot && expandRefs === "depth" && depth >= maxDepth) {
      return { children: { kind: "link", target: eff.target, reason: "depth" }, typeRef: eff.target };
    }
    const inner = expand(c, target.node, depth, new Set([...ancestors, eff.target]), suffix);
    return { ...inner, typeRef: eff.target };
  }

  const at = (seg: string): string[] => [...suffix, seg];

  switch (eff.kind) {
    case "object": {
      const props = eff.properties.filter((p) => appliesToView(p, c.opts.view));
      if (props.length === 0 && eff.additional.kind !== "schema") return NONE;
      const nodes = props.map((p) => propertyField(c, p, depth, ancestors, at(p.name)));
      if (eff.additional.kind === "schema") {
        nodes.push(
          buildField(c, {
            node: eff.additional.node,
            path: at("[key: string]"),
            depth: depth + 1,
            required: false,
            ancestors,
            name: "[key: string]",
          }),
        );
      }
      return { children: { kind: "inline", nodes } };
    }

    case "map": {
      const keyLabel = eff.keys
        ? `[key: ${typeLabel(eff.keys, c, c.opts.label)}]`
        : "[key: string]";
      return {
        children: {
          kind: "inline",
          nodes: [
            buildField(c, {
              node: eff.values,
              path: at(keyLabel),
              depth: depth + 1,
              required: false,
              ancestors,
              name: keyLabel,
            }),
          ],
        },
      };
    }

    case "tuple": {
      const nodes = eff.prefixItems.map((n, i) =>
        buildField(c, {
          node: n,
          path: at(String(i)),
          depth: depth + 1,
          required: true,
          ancestors,
          name: String(i),
        }),
      );
      return { children: { kind: "inline", nodes } };
    }

    case "union": {
      const nodes = eff.variants.map((v, i) =>
        buildField(c, {
          node: v.node,
          path: at(v.label || `option-${i + 1}`),
          depth: depth + 1,
          required: false,
          ancestors,
          name: v.label,
          ...(v.discriminatorValue !== undefined && {
            extraChips: [
              {
                kind: "note" as const,
                label: `${eff.discriminator?.propertyName ?? "type"}: ${formatValue(v.discriminatorValue)}`,
                value: v.discriminatorValue,
              },
            ],
          }),
        }),
      );
      return {
        children: {
          kind: "variants",
          label: eff.mode === "exactlyOne" ? "one of" : "any of",
          nodes,
        },
      };
    }

    case "intersection": {
      const nodes = eff.members.map((n, i) =>
        buildField(c, {
          node: n,
          path: at(`member-${i + 1}`),
          depth: depth + 1,
          required: true,
          ancestors,
        }),
      );
      return { children: { kind: "variants", label: "all of", nodes } };
    }

    case "unsupported":
      return eff.partial ? expand(c, eff.partial, depth, ancestors, suffix) : NONE;

    default:
      return NONE;
  }
}

function propertyField(
  c: Ctx,
  p: Property,
  depth: number,
  ancestors: ReadonlySet<TypeId>,
  path: string[],
): FieldNode {
  const extraChips: Chip[] = [];
  if (p.deprecated) extraChips.push({ kind: "deprecated", label: "deprecated" });
  if (p.readOnly) extraChips.push({ kind: "readOnly", label: "read-only" });
  if (p.writeOnly) extraChips.push({ kind: "writeOnly", label: "write-only" });

  return buildField(c, {
    node: p.node,
    path,
    depth: depth + 1,
    required: p.required,
    ancestors,
    name: p.name,
    usageDocs: p.docs,
    extraChips,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Chips
// ─────────────────────────────────────────────────────────────────────────────

const MAX_ENUM_CHIP_VALUES = 8;

export interface ChipOptions {
  /**
   * Enums at or below this size are already spelled out by `typeLabel`, so no
   * chip is emitted for them. Keep it in step with `LabelOptions.maxVariants`
   * or the same values appear twice in a row. Default 3.
   */
  maxInlineEnum?: number;
}

/** Constraint badges for a node, in a stable display order. */
export function chipsFor(node: Node, opts: ChipOptions = {}): Chip[] {
  const maxInlineEnum = opts.maxInlineEnum ?? 3;
  const chips: Chip[] = [];
  const push = (kind: ChipKind, label: string, value?: unknown): void => {
    chips.push(value === undefined ? { kind, label } : { kind, label, value });
  };

  if (node.docs.deprecated) push("deprecated", "deprecated");
  if (node.docs.default !== undefined) {
    push("default", `default: ${formatValue(node.docs.default)}`, node.docs.default);
  }

  switch (node.kind) {
    case "string": {
      const { minLength, maxLength, pattern, contentMediaType } = node.constraints;
      const length = describeLength(minLength, maxLength, "characters");
      if (length !== undefined) push("length", length);
      if (pattern !== undefined) push("pattern", `matches /${pattern}/`, pattern);
      if (contentMediaType !== undefined) push("contentMediaType", contentMediaType);
      break;
    }

    case "number": {
      const range = describeRange(node.constraints.minimum, node.constraints.maximum);
      if (range !== undefined) push("range", range);
      if (node.constraints.multipleOf !== undefined) {
        push("multipleOf", `multiple of ${node.constraints.multipleOf}`, node.constraints.multipleOf);
      }
      break;
    }

    case "enum": {
      if (node.members.length <= maxInlineEnum) break; // already in the type label
      if (node.members.length > MAX_ENUM_CHIP_VALUES) {
        push("enum", `${node.members.length} values`, node.members.length);
      } else {
        for (const m of node.members) push("enum", formatValue(m.value), m.value);
      }
      break;
    }

    case "array": {
      const items = describeLength(
        node.constraints.minItems,
        node.constraints.maxItems,
        "items",
      );
      if (items !== undefined) push("items", items);
      if (node.constraints.uniqueItems) push("uniqueItems", "unique items");
      break;
    }

    case "object": {
      if (node.additional.kind === "forbidden") {
        push("additionalProperties", "no additional properties");
      }
      break;
    }

    // Lossy, but never silently: the reason reaches the page, not just the
    // diagnostics report, so a reader knows why a field looks empty.
    case "unsupported": {
      push("unsupported", node.reason, node.raw);
      break;
    }

    default:
      break;
  }

  for (const note of node.docs.notes ?? []) push("note", note);
  return chips;
}

function describeLength(
  min: number | undefined,
  max: number | undefined,
  unit: string,
): string | undefined {
  if (min !== undefined && max !== undefined) {
    return min === max ? `exactly ${min} ${unit}` : `${min}–${max} ${unit}`;
  }
  if (min !== undefined) return `≥ ${min} ${unit}`;
  if (max !== undefined) return `≤ ${max} ${unit}`;
  return undefined;
}

function describeRange(
  min: { value: number; exclusive: boolean } | undefined,
  max: { value: number; exclusive: boolean } | undefined,
): string | undefined {
  const lo = min === undefined ? undefined : `${min.exclusive ? ">" : "≥"} ${min.value}`;
  const hi = max === undefined ? undefined : `${max.exclusive ? "<" : "≤"} ${max.value}`;
  if (lo !== undefined && hi !== undefined) return `${lo}, ${hi}`;
  return lo ?? hi;
}
