/**
 * Field tables, as lists.
 *
 * A `<table>` was the obvious choice and is the wrong one: a schema is a tree,
 * and `<tr>` cannot contain `<tr>`. The React binding works around that with a
 * `layout: "rows"` escape hatch for design systems whose Table cannot nest;
 * here there is no design system to accommodate, so the markup can just match
 * the data. A `<ul>` nests natively, is correct for assistive technology, and
 * lays out as a grid in about six lines of CSS — which is the caller's six
 * lines, not ours.
 *
 * `layout: "rows"` is still offered, emitting one flat list with `data-depth`,
 * because some sites genuinely want that and because rendering both is how we
 * check that `toRows` and `toTree` agree.
 */

import { toFieldList, toTree } from "@speculoos/core";
import type { ApiIR, Chip, FieldNode, Node, Parameter, TypeId, View } from "@speculoos/core";
import { h, join, text, type Html } from "./escape.js";
import { resolve, type HtmlOptions } from "./options.js";
import { badge, code, docsBody, empty, inline, link, type Ctx } from "./parts.js";

/**
 * Chips that come from the shape of the field rather than from a constraint:
 * nullability, recursion and an unresolved reference. The IR keeps these off
 * `chips` on purpose — `nullable` is a first-class field and `children` is a
 * resolution outcome — so it falls to the renderer to make them visible.
 */
function shapeChips(field: FieldNode): Chip[] {
  const out: Chip[] = [];
  if (field.nullable) out.push({ kind: "note", label: "nullable" });
  if (field.children.kind === "cycle") out.push({ kind: "note", label: "recursive" });
  if (field.children.kind === "link" && field.children.reason === "unresolved") {
    out.push({ kind: "note", label: "unresolved reference", value: field.children.target });
  }
  return out;
}

/** The type: a link when the type has a section of its own, else a literal. */
function typeCell(c: Ctx, field: FieldNode): Html {
  const label = code(c, field.typeLabel);
  const id = field.typeRef;
  if (id === undefined) return label;
  return link(c, { kind: "type", id, def: c.ir.schemas[id] }, label);
}

/** `allOf` ancestors, as links rather than the plain `extends X` chips. */
function composition(c: Ctx, ids: TypeId[]): Html {
  if (ids.length === 0) return "";
  return h(
    "p",
    { class: c.o.cls("extends") },
    inline(
      ...ids.map((id) => {
        const def = c.ir.schemas[id];
        const body = join([text("extends "), code(c, def?.name ?? id)]);
        return h("span", { class: c.o.cls("extends-item") }, link(c, { kind: "type", id, def }, body));
      }),
    ),
  );
}

function chipBadges(c: Ctx, chips: Chip[]): Html {
  if (chips.length === 0) return "";
  return h(
    "span",
    { class: c.o.cls("chips") },
    inline(
      ...chips.map((chip) =>
        h(
          "span",
          { class: c.o.cls("chip", chip.kind), "data-chip": chip.kind },
          badge(c, chip.kind === "note" ? "note" : "constraint", text(chip.label)),
        ),
      ),
    ),
  );
}

interface FieldOptions {
  /** Set on the top-level items of a parameter list. */
  location?: Parameter["in"] | undefined;
  nested: boolean;
}

function fieldItem(c: Ctx, field: FieldNode, opts: FieldOptions): Html {
  const composed = field.composedFrom ?? [];
  const chips = [...field.chips.filter((x) => x.kind !== "extends"), ...shapeChips(field)];
  const deprecated = field.docs.deprecated === true;
  const kids =
    opts.nested && (field.children.kind === "inline" || field.children.kind === "variants") ? field.children.nodes : [];
  const variantsLabel = field.children.kind === "variants" ? field.children.label : undefined;

  return h(
    "li",
    {
      class: c.o.cls("field", field.required && "required", deprecated && "deprecated", opts.location),
      // `key` is unique within one tree but not within one page, so it is data
      // rather than an id. Two operations may both have a `config/language`.
      "data-key": field.key,
      "data-path": field.path.join("."),
      "data-depth": field.depth,
      ...(opts.location !== undefined ? { "data-in": opts.location } : {}),
      ...(field.required ? { "data-required": true } : {}),
      ...(deprecated ? { "data-deprecated": true } : {}),
    },
    h(
      "div",
      { class: c.o.cls("field-head") },
      inline(
        field.name !== undefined ? h("span", { class: c.o.cls("field-name") }, code(c, field.name)) : undefined,
        h("span", { class: c.o.cls("field-type") }, typeCell(c, field)),
        field.required ? badge(c, "required", text("required")) : undefined,
        chipBadges(c, chips),
      ),
    ),
    composed.length > 0 ? composition(c, composed) : undefined,
    h("div", { class: c.o.cls("field-docs") }, docsBody(c, field.docs)),
    variantsLabel !== undefined ? h("p", { class: c.o.cls("field-variants") }, text(variantsLabel)) : undefined,
    kids.length > 0 ? h("div", { class: c.o.cls("field-children") }, fieldList(c, kids, { nested: true })) : undefined,
  );
}

function fieldList(c: Ctx, fields: FieldNode[], opts: FieldOptions): Html {
  return h(
    "ul",
    { class: c.o.cls("fields"), "data-layout": opts.nested ? "tree" : "rows" },
    ...fields.map((field) =>
      fieldItem(c, field, {
        nested: opts.nested,
        ...(field.depth === 0 && opts.location !== undefined ? { location: opts.location } : {}),
      }),
    ),
  );
}

export interface SchemaOptions {
  /** Which projection this content is. Always pass `variant.view` for body content. */
  view?: View | undefined;
  expandRefs?: "never" | "depth" | "always" | undefined;
  maxDepth?: number | undefined;
  kind?: "fields" | "parameters" | "headers";
  location?: Parameter["in"] | undefined;
  /** Shown when the node has no fields at all. */
  emptyMessage?: string | undefined;
}

/** A field table for one node. Internal: takes an already-resolved context. */
export function schemaTable(c: Ctx, node: Node, opts: SchemaOptions = {}): Html {
  const tree = toTree(node, c.ir, {
    view: opts.view ?? "neutral",
    expandRefs: opts.expandRefs ?? c.o.expandRefs,
    maxDepth: opts.maxDepth ?? c.o.maxDepth,
  });
  const { fields, composedFrom } = toFieldList(tree, c.o.layout);

  if (fields.length === 0 && composedFrom.length === 0) {
    return opts.emptyMessage === undefined ? "" : empty(c, opts.emptyMessage);
  }
  return h(
    "div",
    { class: c.o.cls("schema", opts.kind ?? "fields") },
    composition(c, composedFrom),
    fields.length > 0
      ? fieldList(c, fields, {
          nested: c.o.layout === "tree",
          ...(opts.location !== undefined ? { location: opts.location } : {}),
        })
      : undefined,
  );
}

/**
 * A field table for one node, as a standalone call.
 *
 * Useful on its own — a page that documents a single payload shape needs this
 * and nothing else — but note that the `$ref` links it emits point at type
 * sections, so a page using it should also render `renderTypes`.
 */
export function renderSchema(node: Node, ir: ApiIR, options: HtmlOptions & SchemaOptions = {}): Html {
  return schemaTable({ ir, o: resolve(options) }, node, options);
}
