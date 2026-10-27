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
import { allOperations, replyAddress } from "@speculoos/core";
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

function wsMessage(c: Ctx, message: WsMessage, level: number): Html {
  return join([
    // AsyncAPI's `summary` is often where a message's real prose lives —
    // paragraphs, admonitions — so it is markdown, not a title.
    message.summary !== undefined ? markdown(c, message.summary) : undefined,
    docsBody(c, message.docs),
    inline(
      message.contentType !== undefined
        ? badge(c, "mediaType", text(message.contentType), message.contentType)
        : undefined,
      message.discriminatorValue !== undefined
        ? badge(c, "constraint", text(format(message.discriminatorValue)))
        : undefined,
    ),
    schemaTable(c, message.payload),
    message.headers !== undefined
      ? section(
          c,
          { kind: "message", title: text("Headers"), level: level + 1 },
          schemaTable(c, message.headers, { kind: "headers" }),
        )
      : undefined,
    group(
      c,
      "example",
      message.examples.map((ex, i) => ({
        id: `${message.id}-example-${i}`,
        label: text(ex.name ?? ex.summary ?? `Example ${i + 1}`),
        body: codeBlock(c, format(ex.payload), "json"),
      })),
      level + 1,
    ),
  ]);
}

function messages(
  c: Ctx,
  list: WsMessage[],
  level: number,
  title: string,
  kind: "messages" | "reply",
): Html {
  if (list.length === 0) return "";
  return section(
    c,
    { kind, title: text(title), level },
    group(
      c,
      "message",
      list.map((message) => ({
        id: message.id,
        label: text(message.title ?? message.name),
        body: wsMessage(c, message, level + 1),
      })),
      level + 1,
    ),
  );
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
  return {
    title: text(DIRECTION_VERB[operation.direction]),
    subtitle: inline(mark, operation.docs.title !== undefined ? text(operation.docs.title) : undefined),
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
          messages(c, operation.messages, level + 1, "Messages", "messages"),
          operation.reply !== undefined
            ? messages(
                c,
                operation.reply.messages,
                level + 1,
                replyTitle(operation.reply, c.ir),
                "reply",
              )
            : undefined,
        ]),
  );
}

export interface RenderEndpointOptions extends HtmlOptions {
  /** Heading level for the endpoint's own section. Defaults to `headingLevel`. */
  level?: number;
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
  return endpointSection(c, endpoint, options.level ?? c.o.headingLevel);
}

/** Looks an endpoint up by id: the path, the channel id, or "webhook:name". */
export function renderEndpointById(id: string, ir: ApiIR, options: RenderEndpointOptions = {}): Html {
  const c: Ctx = { ir, o: resolve(options) };
  const endpoint = ir.endpoints.find((e) => e.id === id);
  if (endpoint === undefined) return empty(c, `No endpoint ${id}`);
  return endpointSection(c, endpoint, options.level ?? c.o.headingLevel);
}

export function endpointSection(c: Ctx, endpoint: Endpoint, level: number): Html {
  // Headed like a REST operation: the title when there is one, with the
  // protocol beside the address where a method would sit — "WSS /v2/{language}".
  const webhook = endpoint.operations.some((o) => o.kind === "request-response" && o.isWebhook);
  const title = endpoint.docs.title;
  return section(
    c,
    {
      kind: "endpoint",
      id: endpoint.slug,
      title: title !== undefined ? text(title) : code(c, endpoint.address),
      subtitle: inline(
        webhook ? badge(c, "note", text("webhook")) : undefined,
        ...endpoint.protocols.map((protocol) => badge(c, "protocol", text(protocol.toUpperCase()), protocol)),
        title !== undefined ? code(c, endpoint.address) : undefined,
      ),
      level,
    },
    docsBody(c, endpoint.docs),
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
  return entrySection(c, entry, options.level ?? c.o.headingLevel);
}

export function entrySection(c: Ctx, entry: ApiEntry, level: number): Html {
  return entry.kind === "operation" ? operationSection(c, entry, level) : endpointSection(c, entry.endpoint, level);
}
