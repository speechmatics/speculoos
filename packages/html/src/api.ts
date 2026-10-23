/**
 * The whole document, as one fragment.
 *
 * A *fragment*, not a page: no `<html>`, no `<head>`, no stylesheet, no
 * navigation chrome. Speculoos does not generate sites, and the moment this
 * returned a complete document it would start having opinions about page title,
 * asset paths and where the CSS lives — all of which belong to whatever is
 * already building the site.
 *
 * Paste the result into a template. `renderNav` and `renderTypes` are separate
 * so a site that wants a sidebar and a page per operation can call the pieces.
 */

import { groupByTag } from "@speculoos/core";
import type { ApiIR, Server } from "@speculoos/core";
import { h, join, text, type Html } from "./escape.js";
import { resolve, type HtmlOptions } from "./options.js";
import { badge, code, docsBody, inline, markdown, section, type Ctx } from "./parts.js";
import { operationSection } from "./operation.js";
import { renderTypes } from "./navigation.js";

function servers(c: Ctx, list: Server[], level: number): Html {
  if (list.length === 0) return "";
  return section(
    c,
    { kind: "servers", title: text("Servers"), level },
    h(
      "ul",
      { class: c.o.cls("list", "servers") },
      ...list.map((server) =>
        h(
          "li",
          { class: c.o.cls("list-item"), "data-protocol": server.protocol },
          // Templated segments are left intact in the IR precisely so they can
          // be shown; the variable table below says what goes in them.
          inline(code(c, server.url), badge(c, "protocol", text(server.protocol))),
          docsBody(c, server.docs),
          server.variables.length > 0
            ? h(
                "ul",
                { class: c.o.cls("server-variables") },
                ...server.variables.map((v) =>
                  h(
                    "li",
                    { class: c.o.cls("server-variable") },
                    code(c, v.name),
                    text(` default ${v.default}`),
                    v.enum !== undefined && v.enum.length > 0
                      ? text(` — one of ${v.enum.join(", ")}`)
                      : undefined,
                    v.description !== undefined ? markdown(c, v.description) : undefined,
                  ),
                ),
              )
            : undefined,
        ),
      ),
    ),
  );
}

export interface RenderApiOptions extends HtmlOptions {
  /** Include the named-type sections. Default true — without them, links dangle. */
  includeTypes?: boolean;
  /** Include the document title, description and servers. Default true. */
  includeInfo?: boolean;
}

/** Every operation, grouped by tag, plus the type sections its links point at. */
export function renderApi(ir: ApiIR, options: RenderApiOptions = {}): Html {
  const c: Ctx = { ir, o: resolve(options) };
  const level = c.o.headingLevel;

  const info =
    options.includeInfo === false
      ? ""
      : join([
          h(
            "header",
            { class: c.o.cls("info") },
            h(c.o.heading(level), { class: c.o.cls("title") }, text(ir.info.title)),
            h("p", { class: c.o.cls("version") }, text(`Version ${ir.info.version}`)),
            ir.info.summary !== undefined
              ? h("p", { class: c.o.cls("summary") }, text(ir.info.summary))
              : undefined,
            ir.info.description !== undefined ? markdown(c, ir.info.description) : undefined,
          ),
          servers(c, ir.servers, level + 1),
        ]);

  const groups = groupByTag(ir, c.o.untaggedLabel).map((g) =>
    section(
      c,
      { kind: "tag", title: text(g.tag.name), level: level + 1 },
      docsBody(c, g.tag.docs),
      ...g.entries.map((entry) => operationSection(c, entry, level + 2)),
    ),
  );

  return h(
    "div",
    { class: c.o.cls("api"), "data-ir-version": ir.irVersion, "data-dialect": ir.provenance.dialect },
    info,
    ...groups,
    options.includeTypes === false ? "" : renderTypes(ir, { ...options, level: level + 1 }),
  );
}
