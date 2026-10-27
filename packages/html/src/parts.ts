/**
 * The small pieces every other module is built from.
 *
 * These are the HTML counterparts of `@speculoos/react`'s component map, with
 * one difference that is the whole point of the package: there, the markup is
 * the caller's and Speculoos supplies only the content; here, the markup is
 * Speculoos's and the caller gets class names. A static-site renderer has to
 * emit *something*, so the contract moves from "your components" to "these
 * class names, and nothing else".
 */

import type { ApiIR, Docs, HrefTarget } from "@speculoos/core";
import { h, join, raw, text, type Html } from "./escape.js";
import type { Resolved } from "./options.js";

export interface Ctx {
  ir: ApiIR;
  o: Resolved;
}

/**
 * Inline siblings, separated by a space.
 *
 * Adjacent inline elements with no whitespace between them render flush
 * against each other — `limitintegerdefault: 20` — in anything that is not
 * applying this package's CSS: a reader mode, a text browser, a copy-paste, a
 * feed. The stylesheet in preview/ hides it behind a flex gap, which is
 * exactly why it went unnoticed until the page was read as text. A renderer
 * that owns its markup owes legibility without the stylesheet.
 */
export function inline(...parts: (Html | undefined | false)[]): Html {
  return join(parts, " ");
}

export type SectionKind =
  | "api"
  | "tag"
  | "endpoint"
  | "operation"
  | "parameters"
  | "request"
  | "response"
  | "messages"
  | "message"
  | "headers"
  | "reply"
  | "callbacks"
  | "links"
  | "security"
  | "servers"
  | "examples"
  | "handshake"
  | "types"
  | "type";

export type BadgeTone =
  | "method"
  | "status"
  | "constraint"
  | "direction"
  | "required"
  | "deprecated"
  | "mediaType"
  | "protocol"
  | "securityScheme"
  | "note";

export interface SectionOptions {
  kind: SectionKind;
  /** Anchor. Always an IR slug — this package never derives one. */
  id?: string | undefined;
  title: Html;
  subtitle?: Html | undefined;
  level: number;
  deprecated?: boolean | undefined;
}

export function section(c: Ctx, s: SectionOptions, ...children: (Html | undefined | false)[]): Html {
  const body = join(children);
  const tag = c.o.heading(s.level);
  return h(
    "section",
    {
      class: c.o.cls("section", s.kind, s.deprecated === true && "deprecated"),
      ...(s.id !== undefined ? { id: c.o.anchor(s.id) } : {}),
      // `data-level` so CSS can target depth without hard-coding h2/h3. The
      // heading tag already says it, but not in a form a selector can use.
      "data-level": s.level,
      ...(s.deprecated === true ? { "data-deprecated": true } : {}),
    },
    h(
      tag,
      { class: c.o.cls("heading") },
      inline(
        h("span", { class: c.o.cls("heading-title") }, s.title),
        // The modifier class says "deprecated" to a stylesheet and to nobody
        // else. A reader needs to be told in words.
        s.deprecated === true ? badge(c, "deprecated", text("deprecated")) : undefined,
        s.subtitle !== undefined && s.subtitle !== ""
          ? h("span", { class: c.o.cls("heading-subtitle") }, s.subtitle)
          : undefined,
      ),
    ),
    body === "" ? undefined : h("div", { class: c.o.cls("section-body") }, body),
  );
}

export function code(c: Ctx, value: string): Html {
  return h("code", { class: c.o.cls("code") }, text(value));
}

export function codeBlock(c: Ctx, value: string, language?: string): Html {
  return h(
    "pre",
    { class: c.o.cls("codeblock"), ...(language !== undefined ? { "data-language": language } : {}) },
    h(
      "code",
      { ...(language !== undefined ? { class: `language-${language}` } : {}) },
      text(value),
    ),
  );
}

/**
 * `value` is the raw value behind the badge — "get", "200", "client-sends" — as
 * `data-value`. The modifier says a badge is a method; this says which, so a
 * stylesheet can colour GET and DELETE differently without a class per method.
 */
export function badge(c: Ctx, tone: BadgeTone, content: Html, value?: string): Html {
  return h("span", { class: c.o.cls("badge", tone), "data-value": value }, content);
}

/** An anchor when the target resolves, the bare content when it does not. */
export function link(c: Ctx, target: HrefTarget, content: Html): Html {
  const href = c.o.href(target);
  if (href === undefined) return content;
  return h(
    "a",
    {
      class: c.o.cls("link", target.kind),
      href,
      // External links leave the site; say so in the markup rather than making
      // every consumer re-derive it from the URL.
      ...(target.kind === "external" ? { rel: "noopener noreferrer" } : {}),
    },
    content,
  );
}

/**
 * Raw CommonMark through the caller's renderer. With no renderer configured the
 * source text is escaped and shown as-is — see `HtmlOptions.renderMarkdown`.
 */
export function markdown(c: Ctx, source: string): Html {
  return h("div", { class: c.o.cls("markdown") }, raw(c.o.renderMarkdown(source)));
}

/** Description plus the external-docs link, which is all `Docs` renders as prose. */
export function docsBody(c: Ctx, docs: Docs): Html {
  const external = docs.externalDocs;
  return join([
    docs.description !== undefined ? markdown(c, docs.description) : undefined,
    external !== undefined
      ? h(
          "p",
          { class: c.o.cls("external-docs") },
          link(c, { kind: "external", url: external.url }, text(external.description ?? external.url)),
        )
      : undefined,
  ]);
}

export function empty(c: Ctx, message: string): Html {
  return h("p", { class: c.o.cls("empty") }, text(message));
}

export interface GroupItem {
  id: string;
  label: Html;
  body: Html;
}

/**
 * The static stand-in for `@speculoos/react`'s `Tabs`.
 *
 * HTML has no tabs without script, and inventing some would be site generation.
 * What it has is a labelled list of regions, which is what tabs are *for*: every
 * item is present, readable without JavaScript and findable by in-page search.
 * The class names are there so a site can turn it into tabs, an accordion or
 * nothing at all.
 */
export function group(
  c: Ctx,
  kind: "mediaType" | "status" | "example" | "examples",
  items: GroupItem[],
  level: number,
): Html {
  if (items.length === 0) return "";
  const tag = c.o.heading(level);
  return h(
    "div",
    { class: c.o.cls("group", kind), "data-count": items.length },
    ...items.map((item) =>
      h(
        "section",
        { class: c.o.cls("group-item"), id: c.o.anchor(item.id) },
        h(tag, { class: c.o.cls("group-label") }, item.label),
        h("div", { class: c.o.cls("group-body") }, item.body),
      ),
    ),
  );
}

/** JSON for display. Falls back to String() for anything that will not encode. */
export function format(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}
