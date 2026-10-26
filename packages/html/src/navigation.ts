/**
 * Navigation and type sections.
 *
 * A static page has to put every link target somewhere: `renderSchema` emits a
 * link at each `$ref`, and nothing resolves those at runtime. `renderTypes` is
 * what the links point at, and leaving it out is how a page ends up full of
 * dead anchors.
 */

import { allOperations, groupByTag, listedEndpoints } from "@speculoos/core";
import type { ApiIR, Endpoint, Operation, OperationEntry, TypeDef } from "@speculoos/core";
import { h, text, type Html } from "./escape.js";
import { schemaTable } from "./fields.js";
import { resolve, type HtmlOptions } from "./options.js";
import { badge, code, docsBody, inline, link, section, type Ctx } from "./parts.js";
import { DIRECTION_LABEL, DIRECTION_VERB } from "@speculoos/core";

/** The label a navigation entry shows: method and path, or direction and address. */
function entryLabel(c: Ctx, entry: OperationEntry): Html {
  const { endpoint, operation } = entry;
  const mark =
    operation.kind === "request-response"
      ? badge(c, "method", text(operation.method.toUpperCase()), operation.method)
      : badge(c, "direction", text(DIRECTION_LABEL[operation.direction]), operation.direction);
  return inline(
    mark,
    h("span", { class: c.o.cls("nav-title") }, text(operation.docs.title ?? operation.id)),
    code(c, endpoint.address),
  );
}

export interface NavOptions extends HtmlOptions {
  /**
   * "endpoint": each path or channel, linking to itself, with its operations
   * beneath. "tag": operations under the document's declared tags. "none": one
   * flat list of operations. Default "endpoint".
   */
  groupBy?: "endpoint" | "tag" | "none";
  level?: number;
}

/**
 * The index. Grouped by endpoint by default, matching `renderApi`: a path or
 * channel is the unit a reader looks for and the one a site most often gives a
 * page. "tag" keeps the document's declared order, for documents that use it.
 */
export function renderNav(ir: ApiIR, options: NavOptions = {}): Html {
  const c: Ctx = { ir, o: resolve(options) };
  const level = options.level ?? c.o.headingLevel;
  const groupBy = options.groupBy ?? "endpoint";

  if (groupBy === "endpoint") {
    return h("nav", { class: c.o.cls("nav") }, endpointList(c, listedEndpoints(ir)));
  }
  if (groupBy === "none") {
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

/**
 * An operation's label under its endpoint: the mark and the title, without the
 * address the endpoint already shows. Mirrors `@speculoos/react`'s
 * `NestedOperationLabel`.
 */
function nestedLabel(c: Ctx, operation: Operation): Html {
  if (operation.kind === "request-response") {
    return inline(
      badge(c, "method", text(operation.method.toUpperCase()), operation.method),
      operation.isWebhook ? badge(c, "note", text("webhook")) : undefined,
      operation.docs.title !== undefined
        ? h("span", { class: c.o.cls("nav-title") }, text(operation.docs.title))
        : undefined,
    );
  }
  return inline(
    badge(c, "direction", text(DIRECTION_LABEL[operation.direction]), operation.direction),
    h("span", { class: c.o.cls("nav-title") }, text(operation.docs.title ?? DIRECTION_VERB[operation.direction])),
  );
}

function endpointList(c: Ctx, endpoints: Endpoint[]): Html {
  return h(
    "ul",
    { class: c.o.cls("list", "endpoints") },
    ...endpoints.map((endpoint) =>
      h(
        "li",
        { class: c.o.cls("list-item") },
        link(c, { kind: "endpoint", id: endpoint.id, endpoint }, code(c, endpoint.address)),
        endpoint.operations.length > 0
          ? h(
              "ul",
              { class: c.o.cls("list", "operations") },
              ...endpoint.operations.map((operation) =>
                h(
                  "li",
                  {
                    class: c.o.cls("list-item", operation.deprecated && "deprecated"),
                    ...(operation.deprecated ? { "data-deprecated": true } : {}),
                  },
                  link(c, { kind: "operation", id: operation.id, operation, endpoint }, nestedLabel(c, operation)),
                ),
              ),
            )
          : undefined,
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
