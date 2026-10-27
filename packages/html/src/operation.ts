/**
 * One operation, whichever dialect it came from — and one endpoint, a path or
 * channel with every operation on it.
 *
 * The two operation shapes stay distinct all the way to the page: a
 * request/response operation has a method, a body and statuses; a message
 * operation has a direction and a set of messages. Folding them together would
 * mean a lowest common denominator that reads like neither.
 *
 * This mirrors `@speculoos/react`'s `<Operation>` section for section. Where
 * the two differ, the difference is markup, never content — that is the claim
 * the second renderer exists to test.
 */

import { DIRECTION_LABEL, DIRECTION_VERB, parametersNode, propertiesNode } from "@speculoos/core";
import type {
  ApiEntry,
  ApiIR,
  EntryExample,
  Endpoint,
  Example,
  MediaVariant,
  MessageOperation,
  Operation,
  OperationEntry,
  Parameter,
  RestResponse,
  SecurityRequirements,
  WsMessage,
} from "@speculoos/core";
import { allOperations, endpointHandshake, endpointUrl, entryExamples, replyAddress, securityUsage } from "@speculoos/core";
import { h, join, text, type Html } from "./escape.js";
import { schemaTable } from "./fields.js";
import { resolve, type HtmlOptions } from "./options.js";
import {
  badge,
  code,
  codeBlock,
  docsBody,
  empty,
  format,
  group,
  inline,
  link,
  markdown,
  section,
  type Ctx,
  type GroupItem,
} from "./parts.js";

/**
 * `in: "path"` covers both an OAS path parameter and an AsyncAPI channel
 * address parameter — the IR unifies them because they occupy the same position
 * in a reader's mental model. "Path parameters" over a WebSocket channel still
 * reads wrong, so the heading follows the address rather than the IR field.
 */
const PARAM_GROUPS: { in: Parameter["in"]; title: string; channelTitle?: string }[] = [
  { in: "path", title: "Path parameters", channelTitle: "Address parameters" },
  { in: "query", title: "Query parameters" },
  { in: "header", title: "Header parameters" },
  { in: "cookie", title: "Cookie parameters" },
];

function examples(c: Ctx, list: Example[], idPrefix: string, level: number): Html {
  if (!c.o.inlineExamples) return "";
  const items: GroupItem[] = list.map((ex, i) => ({
    id: `${idPrefix}-example-${i}`,
    label: text(ex.name ?? ex.summary ?? `Example ${i + 1}`),
    body: join([
      ex.description !== undefined ? markdown(c, ex.description) : undefined,
      ex.externalValue !== undefined
        ? link(c, { kind: "external", url: ex.externalValue }, text(ex.externalValue))
        : codeBlock(c, format(ex.value), "json"),
    ]),
  }));
  return group(c, "example", items, level);
}

function content(c: Ctx, variants: MediaVariant[], idPrefix: string, level: number): Html {
  const items: GroupItem[] = variants.map((variant) => ({
    id: `${idPrefix}-${variant.mediaType}`,
    label: badge(c, "mediaType", text(variant.mediaType), variant.mediaType),
    body: join([
      schemaTable(c, variant.node, { view: variant.view }),
      examples(c, variant.examples, `${idPrefix}-${variant.mediaType}`, level + 1),
    ]),
  }));
  return group(c, "mediaType", items, level);
}

function security(c: Ctx, requirements: SecurityRequirements, level: number): Html {
  if (requirements.length === 0) return "";
  return section(
    c,
    { kind: "security", title: text("Security"), level },
    h(
      "ul",
      { class: c.o.cls("list", "security") },
      ...requirements.map((alternative) =>
        h(
          "li",
          { class: c.o.cls("list-item") },
          alternative.length === 0
            ? badge(c, "securityScheme", text("optional"))
            : inline(
                ...alternative.map((req) => {
                  // The parenthetical says what kind of credential this is.
                  // When the scheme is named after its own kind — `bearer:
                  // {scheme: bearer}`, the common case — repeating it reads
                  // like a bug, so it is left off.
                  const scheme = c.ir.securitySchemes[req.scheme];
                  const kind =
                    scheme === undefined
                      ? undefined
                      : scheme.kind === "http"
                        ? scheme.scheme
                        : scheme.kind;
                  const label =
                    kind === undefined || kind.toLowerCase() === req.scheme.toLowerCase()
                      ? req.scheme
                      : `${req.scheme} (${kind})`;
                  return badge(
                    c,
                    "securityScheme",
                    text(req.scopes.length === 0 ? label : `${label}: ${req.scopes.join(", ")}`),
                    req.scheme,
                  );
                }),
              ),
        ),
      ),
    ),
  );
}

/**
 * Which parameters an operation section shows. Standing alone, it shows the
 * endpoint's as well as its own — endpoint ones first, since they are shared by
 * every operation there and a reader has probably met them already. Under an
 * endpoint section, which has shown the shared ones once, only its own.
 */
function operationParameters(endpoint: Endpoint, operation: Operation, nested: boolean): Parameter[] {
  const own = operation.kind === "request-response" ? operation.parameters : [];
  return nested ? own : [...endpoint.parameters, ...own];
}

function parameters(
  c: Ctx,
  endpoint: Endpoint,
  all: Parameter[],
  source: Operation["source"],
  level: number,
): Html {
  if (all.length === 0) return "";
  return join(
    PARAM_GROUPS.map(({ in: location, title, channelTitle }) => {
      const members = all.filter((p) => p.in === location);
      if (members.length === 0) return "";
      const heading =
        endpoint.addressKind === "channel" && channelTitle !== undefined ? channelTitle : title;
      return section(
        c,
        { kind: "parameters", title: text(heading), level },
        schemaTable(c, parametersNode(members, source), {
          kind: "parameters",
          expandRefs: "always",
          location,
        }),
      );
    }),
  );
}

function responses(c: Ctx, list: RestResponse[], level: number, idPrefix: string): Html {
  if (list.length === 0) return "";
  const items: GroupItem[] = list.map((response) => ({
    id: `${idPrefix}-${response.status}`,
    label: badge(c, "status", text(response.status), response.status),
    body: join([
      docsBody(c, response.docs),
      response.headers.length > 0
        ? section(
            c,
            { kind: "response", title: text("Headers"), level: level + 2 },
            schemaTable(c, propertiesNode(response.headers, { document: "", pointer: "#" }), {
              kind: "headers",
              expandRefs: "always",
            }),
          )
        : undefined,
      content(c, response.content, `${idPrefix}-${response.status}`, level + 2),
    ]),
  }));
  return section(
    c,
    { kind: "response", title: text("Responses"), level },
    group(c, "status", items, level + 1),
  );
}

/**
 * One message, as a section of its own: a channel's messages are its
 * vocabulary, and a reader — or the page's own prose — links to each.
 */
function wsMessage(c: Ctx, message: WsMessage, level: number): Html {
  return section(
    c,
    {
      kind: "message",
      ...(message.slug !== undefined ? { id: message.slug } : {}),
      title: text(message.title ?? message.name),
      level,
    },
    // AsyncAPI's `summary` is often where a message's real prose lives —
    // paragraphs, admonitions — so it is markdown, not a title.
    message.summary !== undefined ? markdown(c, message.summary) : undefined,
    docsBody(c, message.docs),
    // No badge for `discriminatorValue`: it is the const field the payload
    // table already shows, and it usually repeats the title too.
    message.contentType !== undefined
      ? badge(c, "mediaType", text(message.contentType), message.contentType)
      : undefined,
    schemaTable(c, message.payload),
    message.headers !== undefined
      ? section(
          c,
          { kind: "headers", title: text("Headers"), level: level + 1 },
          schemaTable(c, message.headers, { kind: "headers" }),
        )
      : undefined,
    group(
      c,
      "example",
      (c.o.inlineExamples ? message.examples : []).map((ex, i) => ({
        id: `${message.id}-example-${i}`,
        label: text(ex.name ?? ex.summary ?? `Example ${i + 1}`),
        body: codeBlock(c, format(ex.payload), "json"),
      })),
      level + 1,
    ),
  );
}

/**
 * An operation's messages sit straight under it: its heading — "Send",
 * "Receive" — already says what they are. A reply's are headed, because the
 * reply is a second set, and may arrive somewhere else.
 */
function messages(c: Ctx, list: WsMessage[], level: number): Html {
  return join(list.map((message) => wsMessage(c, message, level)));
}

function reply(c: Ctx, r: NonNullable<MessageOperation["reply"]>, level: number): Html {
  if (r.messages.length === 0) return "";
  return section(c, { kind: "reply", title: text(replyTitle(r, c.ir)), level }, messages(c, r.messages, level + 1));
}

function links(c: Ctx, operation: Operation, level: number): Html {
  if (operation.kind !== "request-response" || operation.links.length === 0) return "";
  const entries = allOperations(c.ir);
  return section(
    c,
    { kind: "links", title: text("Links"), level },
    h(
      "ul",
      { class: c.o.cls("list", "links") },
      ...operation.links.map((l) => {
        const target: OperationEntry | undefined =
          l.operationId === undefined
            ? undefined
            : entries.find((e) => e.operation.id === l.operationId);
        const label =
          target === undefined
            ? code(c, l.name)
            : link(
                c,
                {
                  kind: "operation",
                  id: target.operation.id,
                  operation: target.operation,
                  endpoint: target.endpoint,
                },
                text(l.name),
              );
        return h(
          "li",
          { class: c.o.cls("list-item") },
          inline(label, ...l.parameters.map((p) => code(c, `${p.name} = ${format(p.expression)}`))),
          docsBody(c, l.docs),
        );
      }),
    ),
  );
}

/**
 * The heading and the marks beside it.
 *
 * Standing alone, an operation is headed by its title, with the method or
 * direction and the address beside it. Under an endpoint section, the address
 * is the endpoint's heading, so it is not repeated: a REST operation is headed
 * by its title (or its method), and a message operation by what the reader
 * does — "Send", "Receive" — because that is what tells a channel's operations
 * apart. Mirrors `@speculoos/react`'s `useHeading`.
 */
function heading(c: Ctx, endpoint: Endpoint, operation: Operation, nested: boolean): { title: Html; subtitle: Html } {
  const mark =
    operation.kind === "request-response"
      ? inline(
          badge(c, "method", text(operation.method.toUpperCase()), operation.method),
          // `endpoint.id` namespaces a webhook as "webhook:name" so it cannot
          // collide with a path. That is identity, not a label, so the page gets
          // the address and a badge saying which it is.
          operation.isWebhook ? badge(c, "note", text("webhook")) : undefined,
        )
      : badge(c, "direction", text(DIRECTION_LABEL[operation.direction]), operation.direction);
  if (!nested) {
    return { title: text(operation.docs.title ?? operation.id), subtitle: inline(mark, code(c, endpoint.address)) };
  }
  if (operation.kind === "request-response") {
    return { title: text(operation.docs.title ?? operation.method.toUpperCase()), subtitle: mark };
  }
  // The direction is part of what the heading says — "Send ↑" — so it sits in the title.
  return {
    title: inline(text(DIRECTION_VERB[operation.direction]), mark),
    subtitle: operation.docs.title !== undefined ? text(operation.docs.title) : "",
  };
}

/** "Reply on /pong", or "Reply" when it arrives on the operation's own channel. */
function replyTitle(reply: NonNullable<MessageOperation["reply"]>, ir: ApiIR): string {
  const where = replyAddress(reply, ir);
  return where === undefined ? "Reply" : `Reply on ${where}`;
}

function protocols(c: Ctx, endpoint: Endpoint): Html {
  return endpoint.protocols.length > 0
    ? h(
        "p",
        { class: c.o.cls("protocols") },
        inline(...endpoint.protocols.map((protocol) => badge(c, "protocol", text(protocol), protocol))),
      )
    : "";
}

export interface RenderOperationOptions extends HtmlOptions {
  /** Heading level for this operation's own section. Defaults to `headingLevel`. */
  level?: number;
}

/** One operation, with everything hanging off it. */
export function renderOperation(
  entry: OperationEntry,
  ir: ApiIR,
  options: RenderOperationOptions = {},
): Html {
  const c: Ctx = { ir, o: resolve(options) };
  return operationSection(c, entry, options.level ?? c.o.headingLevel);
}

/** Looks an operation up by id, for callers who have the id and not the pair. */
export function renderOperationById(
  id: string,
  ir: ApiIR,
  options: RenderOperationOptions = {},
): Html {
  const c: Ctx = { ir, o: resolve(options) };
  const entry = allOperations(ir).find((e) => e.operation.id === id);
  if (entry === undefined) return empty(c, `No operation ${id}`);
  return operationSection(c, entry, options.level ?? c.o.headingLevel);
}

/**
 * The internal form, so nested callbacks reuse one resolved context. `nested`
 * is set under an endpoint section, which has already shown the address,
 * protocols and shared parameters.
 */
export function operationSection(c: Ctx, entry: OperationEntry, level: number, nested = false): Html {
  const { endpoint, operation } = entry;
  const { title, subtitle } = heading(c, endpoint, operation, nested);

  // An operation with no security of its own inherits the document default.
  // Showing the inherited one is the point: "which key do I send" must be
  // answerable from the operation a reader is looking at.
  const requirements = operation.security.length > 0 ? operation.security : c.ir.security;

  return section(
    c,
    {
      kind: "operation",
      id: operation.slug,
      title,
      subtitle,
      level,
      deprecated: operation.deprecated,
    },
    docsBody(c, operation.docs),
    nested ? undefined : protocols(c, endpoint),
    security(c, requirements, level + 1),
    parameters(c, endpoint, operationParameters(endpoint, operation, nested), operation.source, level + 1),
    operation.kind === "request-response"
      ? join([
          operation.requestBody !== undefined
            ? section(
                c,
                {
                  kind: "request",
                  title: text("Request body"),
                  level: level + 1,
                  subtitle: operation.requestBody.required
                    ? badge(c, "required", text("required"))
                    : undefined,
                },
                docsBody(c, operation.requestBody.docs),
                content(c, operation.requestBody.content, `${operation.slug}-request`, level + 2),
              )
            : undefined,
          responses(c, operation.responses, level + 1, operation.slug),
          operation.callbacks.length > 0
            ? section(
                c,
                { kind: "callbacks", title: text("Callbacks"), level: level + 1 },
                ...operation.callbacks.flatMap((callback) =>
                  callback.operations.map((callbackOp) =>
                    operationSection(c, { endpoint: callback, operation: callbackOp }, level + 2),
                  ),
                ),
              )
            : undefined,
          links(c, operation, level + 1),
        ])
      : join([
          messages(c, operation.messages, level + 1),
          operation.reply !== undefined ? reply(c, operation.reply, level + 1) : undefined,
        ]),
  );
}

export interface RenderEndpointOptions extends HtmlOptions {
  /** Heading level for the endpoint's own section. Defaults to `headingLevel`. */
  level?: number;
  /**
   * The page's own HTML for the end of a channel's Handshake section — what a
   * spec has no place for: the responses a failed upgrade gets, retry advice.
   * Written verbatim, so it must be yours, not the spec's. Ignored where there
   * is no handshake.
   */
  handshakeExtras?: Html;
}

/**
 * A path or channel, with every operation on it.
 *
 * The address is the heading, and what every operation there shares — the
 * protocol, the endpoint's own description, its parameters — is shown once,
 * above them. This is the unit a site most often gives a page of its own: one
 * REST path, or one WebSocket channel with its send and receive. Iterate
 * `listedEndpoints(ir)` (from core) to make one each.
 */
export function renderEndpoint(endpoint: Endpoint, ir: ApiIR, options: RenderEndpointOptions = {}): Html {
  const c: Ctx = { ir, o: resolve(options) };
  return endpointSection(c, endpoint, options.level ?? c.o.headingLevel, options.handshakeExtras);
}

/** Looks an endpoint up by id: the path, the channel id, or "webhook:name". */
export function renderEndpointById(id: string, ir: ApiIR, options: RenderEndpointOptions = {}): Html {
  const c: Ctx = { ir, o: resolve(options) };
  const endpoint = ir.endpoints.find((e) => e.id === id);
  if (endpoint === undefined) return empty(c, `No endpoint ${id}`);
  return endpointSection(c, endpoint, options.level ?? c.o.headingLevel, options.handshakeExtras);
}

/**
 * How a client opens a WebSocket channel, before any message: the upgrade
 * request and the credentials it takes. What the upgrade answers is the
 * page's to add, through `handshakeExtras`. Empty for a REST path or a
 * non-WebSocket channel.
 */
function handshake(c: Ctx, endpoint: Endpoint, level: number, extras?: Html): Html {
  const hs = endpointHandshake(endpoint, c.ir);
  if (hs === undefined) return "";
  const item = (...parts: (Html | undefined)[]) => h("li", { class: c.o.cls("list-item") }, inline(...parts));
  return section(
    c,
    { kind: "handshake", title: text("Handshake"), level },
    h(
      "ul",
      { class: c.o.cls("list", "handshake") },
      item(badge(c, "method", text(hs.method), hs.method.toLowerCase()), code(c, hs.url)),
    ),
    hs.docs !== undefined ? docsBody(c, hs.docs) : undefined,
    authentication(c, hs.security, level + 1),
    extras,
  );
}

/**
 * Each way to authenticate, with how to send it and what the spec says about
 * it — where a reader learns what to put in the request, unlike an
 * operation's `Security` badges.
 */
function authentication(c: Ctx, requirements: SecurityRequirements, level: number): Html {
  if (requirements.length === 0) return "";
  return section(
    c,
    { kind: "security", title: text("Authentication"), level },
    requirements.length > 1 ? markdown(c, "Any one of:") : undefined,
    h(
      "ul",
      { class: c.o.cls("list", "security") },
      ...requirements.map((alternative) =>
        h(
          "li",
          { class: c.o.cls("list-item") },
          alternative.length === 0
            ? badge(c, "securityScheme", text("none"))
            : join(
                alternative.map((req) => {
                  const scheme = c.ir.securitySchemes[req.scheme];
                  const usage = scheme === undefined ? undefined : securityUsage(scheme);
                  return join([
                    inline(
                      badge(c, "securityScheme", text(req.scheme), req.scheme),
                      usage !== undefined ? code(c, usage) : undefined,
                    ),
                    scheme !== undefined ? docsBody(c, scheme.docs) : undefined,
                  ]);
                }),
              ),
        ),
      ),
    ),
  );
}

export function endpointSection(c: Ctx, endpoint: Endpoint, level: number, handshakeExtras?: Html): Html {
  // Headed like a REST operation: the title when there is one, with the
  // protocol where a method would sit, then where to connect — the full URL
  // when one server applies, "WSS wss://eu.example.com/v2/", else the address.
  const webhook = endpoint.operations.some((o) => o.kind === "request-response" && o.isWebhook);
  const title = endpoint.docs.title;
  const url = endpointUrl(endpoint, c.ir);
  return section(
    c,
    {
      kind: "endpoint",
      id: endpoint.slug,
      title: title !== undefined ? text(title) : code(c, endpoint.address),
      subtitle: inline(
        webhook ? badge(c, "note", text("webhook")) : undefined,
        ...endpoint.protocols.map((protocol) => badge(c, "protocol", text(protocol.toUpperCase()), protocol)),
        url !== undefined ? code(c, url) : title !== undefined ? code(c, endpoint.address) : undefined,
      ),
      level,
    },
    docsBody(c, endpoint.docs),
    handshake(c, endpoint, level + 1, handshakeExtras),
    parameters(c, endpoint, endpoint.parameters, endpoint.source, level + 1),
    endpoint.operations.length === 0
      ? empty(c, "No operations")
      : join(endpoint.operations.map((operation) => operationSection(c, { endpoint, operation }, level + 1, true))),
  );
}

/**
 * One API reference entry, as its page body: a REST operation standing alone,
 * or a channel with its send and receive. What a site renders per page;
 * iterate `apiEntries(ir)` from core to make one each.
 */
export function renderEntry(entry: ApiEntry, ir: ApiIR, options: RenderEndpointOptions = {}): Html {
  const c: Ctx = { ir, o: resolve(options) };
  return entrySection(c, entry, options.level ?? c.o.headingLevel, options.handshakeExtras);
}

export function entrySection(c: Ctx, entry: ApiEntry, level: number, handshakeExtras?: Html): Html {
  return entry.kind === "operation"
    ? operationSection(c, entry, level)
    : endpointSection(c, entry.endpoint, level, handshakeExtras);
}

/**
 * Every example on an entry, in one place — for a panel beside the reference,
 * as Stripe and Deepgram lay theirs out. Pair it with `inlineExamples: false`
 * so they are not also shown under each payload. Empty when the entry has no
 * examples.
 */
export function renderEntryExamples(
  entry: ApiEntry,
  ir: ApiIR,
  options: RenderEndpointOptions & {
    title?: string;
    /** The examples to show, when not `entryExamples(entry)` as it stands — reordered, say. */
    examples?: EntryExample[];
  } = {},
): Html {
  const c: Ctx = { ir, o: resolve(options) };
  const level = options.level ?? c.o.headingLevel;
  const list = options.examples ?? entryExamples(entry);
  if (list.length === 0) return "";
  return section(
    c,
    { kind: "examples", title: text(options.title ?? "Examples"), level },
    group(
      c,
      "examples",
      list.map((ex) => ({
        id: ex.id,
        label: exampleLabel(c, ex),
        body: join([
          ex.summary !== undefined ? markdown(c, ex.summary) : undefined,
          ex.description !== undefined ? markdown(c, ex.description) : undefined,
          ex.externalValue !== undefined
            ? link(c, { kind: "external", url: ex.externalValue }, text(ex.externalValue))
            : codeBlock(c, format(ex.value), "json"),
        ]),
      })),
      level + 1,
    ),
  );
}

/**
 * "Send StartRecognition · minimal", "Request application/json", "200 Response".
 * The summary is a sentence, so it goes with the example, not in the label.
 */
function exampleLabel(c: Ctx, ex: EntryExample): Html {
  const own = ex.name;
  const of = ex.of;
  return inline(
    of.kind === "message"
      ? join([
          badge(c, "direction", text(DIRECTION_VERB[of.operation.direction]), of.operation.direction),
          text(` ${of.message.title ?? of.message.name}`),
        ])
      : of.kind === "request"
        ? join([text("Request "), badge(c, "mediaType", text(of.mediaType), of.mediaType)])
        : join([badge(c, "status", text(of.status), of.status), text(" Response")]),
    own !== undefined ? text(` · ${own}`) : undefined,
  );
}
