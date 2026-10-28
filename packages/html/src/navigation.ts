/**
 * Navigation and type sections.
 *
 * A static page has to put every link target somewhere: `renderSchema` emits a
 * link at each `$ref`, and nothing resolves those at runtime. `renderTypes` is
 * what the links point at, and leaving it out is how a page ends up full of
 * dead anchors.
 */

import { allOperations, apiEntries, groupByTag } from "@speculoos/core";
import type { ApiEntry, ApiIR, OperationEntry, TypeDef } from "@speculoos/core";
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
   * "entry": one link per REST operation and one per channel — the API
   * reference's entries, see `apiEntries` in core. "tag": operations under the
   * document's declared tags. "none": one flat list of operations. Default
   * "entry".
   */
  groupBy?: "entry" | "tag" | "none";
  level?: number;
}

/**
 * The index. By entry by default, matching `renderApi`: `POST /projects` and
 * `WSS /v2/{language}` are the units a reader looks for and the ones a site
 * gives a page. "tag" keeps the document's declared grouping, for documents
 * that use it.
 */
export function renderNav(ir: ApiIR, options: NavOptions = {}): Html {
  const c: Ctx = { ir, o: resolve(options) };
  const level = options.level ?? c.o.headingLevel;
  const groupBy = options.groupBy ?? "entry";

  if (groupBy === "entry") {
    return h("nav", { class: c.o.cls("nav") }, entryList(c, apiEntries(ir)));
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
 * An entry's label. A REST operation leads with its method and then its
 * summary, falling back to its path; a channel leads with its protocol, where a
 * method would stand, and then its title, falling back to its address. Mirrors
 * `@speculoos/react`'s `EntryLabel`.
 */
function apiEntryLabel(c: Ctx, entry: ApiEntry): Html {
  if (entry.kind === "operation") {
    const { endpoint, operation } = entry;
    return inline(
      operation.kind === "request-response"
        ? badge(c, "method", text(operation.method.toUpperCase()), operation.method)
        : badge(c, "direction", text(DIRECTION_LABEL[operation.direction]), operation.direction),
      operation.kind === "request-response" && operation.isWebhook ? badge(c, "note", text("webhook")) : undefined,
      operation.docs.title !== undefined
        ? h("span", { class: c.o.cls("nav-title") }, text(operation.docs.title))
        : code(c, endpoint.address),
    );
  }
  const { endpoint } = entry;
  return inline(
    ...endpoint.protocols.map((protocol) => badge(c, "protocol", text(protocol.toUpperCase()), protocol)),
    endpoint.docs.title !== undefined
      ? h("span", { class: c.o.cls("nav-title") }, text(endpoint.docs.title))
      : code(c, endpoint.address),
  );
}

function entryList(c: Ctx, entries: ApiEntry[]): Html {
  return h(
    "ul",
    { class: c.o.cls("list", "entries") },
    ...entries.map((entry) => {
      const deprecated = entry.kind === "operation" && entry.operation.deprecated;
      return h(
        "li",
        { class: c.o.cls("list-item", deprecated && "deprecated"), ...(deprecated ? { "data-deprecated": true } : {}) },
        link(
          c,
          entry.kind === "operation"
            ? { kind: "operation", id: entry.operation.id, operation: entry.operation, endpoint: entry.endpoint }
            : { kind: "endpoint", id: entry.endpoint.id, endpoint: entry.endpoint },
          apiEntryLabel(c, entry),
        ),
      );
    }),
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
  const referencedBy = def.referencedBy.map((id) => c.ir.schemas[id]).filter((d): d is TypeDef => d !== undefined);

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
            ...referencedBy.map((other) => link(c, { kind: "type", id: other.id, def: other }, code(c, other.name))),
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
