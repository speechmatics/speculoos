/**
 * Navigation and type sections.
 *
 * A static page has to put every link target somewhere: `renderSchema` emits a
 * link at each `$ref`, and nothing resolves those at runtime. `renderTypes` is
 * what the links point at, and leaving it out is how a page ends up full of
 * dead anchors.
 */

import { allOperations, groupByTag } from "@speculoos/core";
import type { ApiIR, OperationEntry, TypeDef } from "@speculoos/core";
import { h, text, type Html } from "./escape.js";
import { schemaTable } from "./fields.js";
import { resolve, type HtmlOptions } from "./options.js";
import { badge, code, docsBody, inline, link, section, type Ctx } from "./parts.js";
import { DIRECTION_LABEL } from "@speculoos/core";

/** The label a navigation entry shows: method and path, or direction and address. */
function entryLabel(c: Ctx, entry: OperationEntry): Html {
  const { endpoint, operation } = entry;
  const mark =
    operation.kind === "request-response"
      ? badge(c, "method", text(operation.method.toUpperCase()))
      : badge(c, "direction", text(DIRECTION_LABEL[operation.direction]));
  return inline(
    mark,
    h("span", { class: c.o.cls("nav-title") }, text(operation.docs.title ?? operation.id)),
    code(c, endpoint.address),
  );
}

export interface NavOptions extends HtmlOptions {
  /** Group the list under tag headings. Default true. */
  byTag?: boolean;
  level?: number;
}

/**
 * The operation index. Grouped by tag by default, because `ir.tags` is the
 * document's own declared navigation order and ignoring it loses information
 * the spec author put there deliberately.
 */
export function renderNav(ir: ApiIR, options: NavOptions = {}): Html {
  const c: Ctx = { ir, o: resolve(options) };
  const level = options.level ?? c.o.headingLevel;

  if (options.byTag === false) {
    return h("nav", { class: c.o.cls("nav") }, operationList(c, allOperations(ir)));
  }
  return h(
    "nav",
    { class: c.o.cls("nav") },
    ...groupByTag(ir, c.o.untaggedLabel).map((g) =>
      section(
        c,
        { kind: "tag", id: undefined, title: text(g.tag.name), level },
        docsBody(c, g.tag.docs),
        operationList(c, g.entries),
      ),
    ),
  );
}

function operationList(c: Ctx, entries: OperationEntry[]): Html {
  return h(
    "ul",
    { class: c.o.cls("list", "operations") },
    ...entries.map((entry) =>
      h(
        "li",
        {
          class: c.o.cls("list-item", entry.operation.deprecated && "deprecated"),
          ...(entry.operation.deprecated ? { "data-deprecated": true } : {}),
        },
        link(
          c,
          {
            kind: "operation",
            id: entry.operation.id,
            operation: entry.operation,
            endpoint: entry.endpoint,
          },
          entryLabel(c, entry),
        ),
      ),
    ),
  );
}

export interface TypeOptions extends HtmlOptions {
  level?: number;
}

/** One named type, as the section its `$ref` links point at. */
export function renderType(def: TypeDef, ir: ApiIR, options: TypeOptions = {}): Html {
  const c: Ctx = { ir, o: resolve(options) };
  return typeSection(c, def, options.level ?? c.o.headingLevel);
}

function typeSection(c: Ctx, def: TypeDef, level: number): Html {
  // "Referenced by" is the reason a reader can navigate *up* out of a type,
  // which is otherwise a dead end on a long page.
  const referencedBy = def.referencedBy
    .map((id) => c.ir.schemas[id])
    .filter((d): d is TypeDef => d !== undefined);

  return section(
    c,
    {
      kind: "type",
      id: def.slug,
      title: text(def.name),
      level,
      deprecated: def.docs.deprecated === true,
    },
    docsBody(c, def.docs),
    schemaTable(c, def.node, { expandRefs: "never" }),
    referencedBy.length > 0
      ? h(
          "p",
          { class: c.o.cls("referenced-by") },
          h("span", { class: c.o.cls("referenced-by-label") }, text("Referenced by")),
          inline(
            ...referencedBy.map((other) =>
              link(c, { kind: "type", id: other.id, def: other }, code(c, other.name)),
            ),
          ),
        )
      : undefined,
  );
}

/** Every named type, in registry order, under one heading. */
export function renderTypes(ir: ApiIR, options: TypeOptions & { title?: string } = {}): Html {
  const c: Ctx = { ir, o: resolve(options) };
  const level = options.level ?? c.o.headingLevel;
  const defs = Object.values(ir.schemas);
  if (defs.length === 0) return "";
  return section(
    c,
    { kind: "types", title: text(options.title ?? "Types"), level },
    ...defs.map((def) => typeSection(c, def, level + 1)),
  );
}
