/**
 * @speculoos/adapter-kit — the shared half of writing an adapter.
 *
 * Both first-party adapters, and any third-party one, need the same handful of
 * things: pulling `Docs` out of a spec object, following a structural `$ref`,
 * turning a security map into `SecurityRequirements`. None of it is
 * dialect-specific, and two copies would drift.
 *
 * What is *not* here is anything about schemas — that is @speculoos/jsonschema's
 * job, and the division is the point: this package is about the document around
 * the schemas.
 */

import type { Diagnostic, Docs, Node, SecurityRequirements, SourceLocation } from "@speculoos/core";
import { isObject, str } from "@speculoos/jsonschema";

/** The minimum an adapter needs from a loaded project. */
export interface RefResolver {
  resolve(ref: string, from: SourceLocation): SourceLocation | undefined;
  at(loc: SourceLocation): unknown;
}

export interface AdapterContext {
  /** Logical name of the document being adapted. */
  document: string;
  project: RefResolver;
  report(diagnostic: Diagnostic): void;
}

export function loc(ctx: AdapterContext, pointer: string): SourceLocation {
  return { document: ctx.document, pointer };
}

export function diagnostic(
  severity: Diagnostic["severity"],
  code: string,
  message: string,
  source: SourceLocation,
): Diagnostic {
  return { severity, code, message, source };
}

/** Adds `key` only when the value is present, for `exactOptionalPropertyTypes`. */
export function optional<K extends string, V>(key: K, value: V | undefined): Record<K, V> | object {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

export interface Resolved {
  value: unknown;
  /** Where the value actually lives — which may be another document. */
  source: SourceLocation;
}

/**
 * Follows a structural `$ref` — a path item, parameter, response, message.
 *
 * Schema refs are deliberately *not* followed this way: those become `RefNode`s
 * so the registry keeps the type's name. These have no display identity of their
 * own, so resolving them in place is right.
 */
export function deref(ctx: AdapterContext, value: unknown, source: SourceLocation, depth = 0): Resolved {
  if (!isObject(value) || typeof value["$ref"] !== "string") return { value, source };

  if (depth > 32) {
    ctx.report(diagnostic("error", "REF_CYCLE", `$ref cycle at ${source.pointer}`, source));
    return { value: undefined, source };
  }

  const target = ctx.project.resolve(value["$ref"], source);
  if (target === undefined) {
    ctx.report(diagnostic("error", "UNRESOLVED_REF", `Cannot resolve $ref "${value["$ref"]}"`, source));
    return { value: undefined, source };
  }

  return deref(ctx, ctx.project.at(target), target, depth + 1);
}

/** The last meaningful segment of a `$ref`, which is usually its name. */
export function refName(ref: string): string {
  const segments = ref.split(/[#/]/).filter(Boolean);
  return decodeURIComponent(segments[segments.length - 1] ?? ref)
    .replace(/~1/g, "/")
    .replace(/~0/g, "~");
}

const DOC_FIELDS = ["summary", "title", "description"] as const;

/**
 * `Docs` from a spec object. `summary` wins over `title` because specs that have
 * both use summary as the short line and title as a redundant label.
 *
 * Descriptions are CommonMark strings and stay that way: never pre-rendered,
 * never sanitised. Specs are untrusted input and sanitising is the renderer's job.
 */
export function docsOf(raw: unknown): Docs {
  if (!isObject(raw)) return {};
  const docs: Docs = {};

  const title = DOC_FIELDS.map((f) => str(raw, f)).find((v) => v !== undefined && v !== str(raw, "description"));
  const description = str(raw, "description");
  if (title !== undefined) docs.title = title;
  if (description !== undefined) docs.description = description;
  if (raw["deprecated"] === true) docs.deprecated = true;

  const external = raw["externalDocs"];
  if (isObject(external) && typeof external["url"] === "string") {
    docs.externalDocs = {
      url: external["url"],
      ...optional("description", str(external, "description")),
    };
  }

  return { ...docs, ...extensionsOf(raw) };
}

/** `x-*` keys, passed through untouched for custom renderers. */
export function extensionsOf(raw: unknown): { extensions?: Record<string, unknown> } {
  if (!isObject(raw)) return {};
  const extensions: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith("x-")) extensions[key] = value;
  }
  return Object.keys(extensions).length > 0 ? { extensions } : {};
}

/**
 * OpenAPI-shaped security: a list of alternatives, each a map of scheme name to
 * scopes. AsyncAPI 2.x servers use the same shape; AsyncAPI 3.x does not.
 */
export function securityFromMaps(value: unknown): SecurityRequirements {
  if (!Array.isArray(value)) return [];
  return value.flatMap((alternative) => {
    if (!isObject(alternative)) return [];
    return [
      Object.entries(alternative).map(([scheme, scopes]) => ({
        scheme,
        scopes: Array.isArray(scopes) ? scopes.filter((s): s is string => typeof s === "string") : [],
      })),
    ];
  });
}

/** The scheme of a URL. Templated URLs (`{host}/v2`) fall back to `fallback`. */
export function protocolOf(url: string, fallback = "https"): string {
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(url);
  return match?.[1]?.toLowerCase() ?? fallback;
}

/** An `any` node at a location, for positions a spec left unconstrained. */
export function anyNode(source: SourceLocation): Node {
  return { kind: "any", source, docs: {}, nullable: false };
}
