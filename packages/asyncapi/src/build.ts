/**
 * AsyncAPI 2.x / 3.x → `ApiIR`.
 *
 * Channels become `Endpoint`s with `addressKind: "channel"`, exactly as OpenAPI
 * Path Items become `Endpoint`s with `addressKind: "path"`. Operations become
 * `MessageOperation`s.
 *
 * Keeping operations distinct from channels is what makes 3.x `reply`
 * representable at all; folding messages into the channel would lose it. 2.x has
 * no operations object, so `publish`/`subscribe` are synthesised into one
 * operation each under their channel's endpoint, and both versions come out the
 * same shape — see ./direction.ts for the part that matters most.
 */

import type {
  ApiIR,
  ApiInfo,
  Bindings,
  Diagnostic,
  Endpoint,
  MessageOperation,
  Node,
  Parameter,
  SecurityRequirements,
  SecurityScheme,
  Server,
  SourceLocation,
  TagDef,
  WsMessage,
} from "@speculoos/core";
import { createSlugger } from "@speculoos/core";
import { buildSchemas, isObject, str } from "@speculoos/jsonschema";
import {
  anyNode,
  deref as derefRef,
  diagnostic,
  docsOf,
  extensionsOf,
  optional,
  refName,
  securityFromMaps,
  type AdapterContext,
  type Resolved,
} from "@speculoos/adapter-kit";
import type { LoadedProject } from "@speculoos/loader";
import { at, joinPointer } from "@speculoos/loader";
import { V2_OPERATIONS, directionFromV2, directionFromV3 } from "./direction.js";
import { payloadSchema, unsupportedNode } from "./schema-format.js";

export interface BuildOptions {
  project: LoadedProject;
  /** Which loaded document is the AsyncAPI document. Defaults to the first entry. */
  document?: string;
}

export function buildAsyncApi({ project, document }: BuildOptions): ApiIR {
  const entry = document === undefined ? project.entry[0] : project.document(document);
  if (entry === undefined) throw new Error("No AsyncAPI document to build from");

  const dialect = entry.dialect?.dialect ?? "asyncapi-3";
  if (dialect !== "asyncapi-2" && dialect !== "asyncapi-3") {
    throw new Error(`Document "${entry.name}" is not an AsyncAPI document`);
  }

  const doc = isObject(entry.data) ? entry.data : {};
  const diagnostics: Diagnostic[] = [...project.diagnostics];
  const schemas = buildSchemas({ resolver: project, dialect });

  const ctx: Ctx = {
    doc,
    document: entry.name,
    v3: dialect === "asyncapi-3",
    project,
    lower: (schema, loc) => schemas.lowerInline(schema, loc),
    peek: (id) => schemas.registry.peek(id)?.node,
    report: (d) => diagnostics.push(d),
    slug: createSlugger(),
  };

  const declared = at(doc, "/components/schemas");
  if (isObject(declared)) {
    for (const key of Object.keys(declared)) {
      schemas.registry.declare({
        document: entry.name,
        pointer: joinPointer("/components/schemas", key),
      });
    }
  }

  const endpoints = slugMessages(ctx, ctx.v3 ? buildV3Endpoints(ctx) : buildV2Endpoints(ctx));
  const finished = schemas.finish();

  return {
    irVersion: 1,
    info: buildInfo(doc),
    servers: buildServers(ctx),
    securitySchemes: buildSecuritySchemes(ctx),
    tags: buildTags(ctx),
    endpoints,
    security: [],
    schemas: finished.schemas,
    diagnostics: [...diagnostics, ...finished.diagnostics],
    provenance: {
      dialect: "asyncapi",
      dialectVersion: entry.dialect?.version ?? (ctx.v3 ? "3.0.0" : "2.6.0"),
      documents: project.documents.map((d) => d.name).sort(),
    },
  };
}

interface Ctx extends AdapterContext {
  doc: Record<string, unknown>;
  v3: boolean;
  project: LoadedProject;
  lower: (schema: unknown, loc: SourceLocation) => Node;
  /** Looks through a `$ref` to the node it points at, mid-build. */
  peek: (id: string) => Node | undefined;
  slug: (name: string) => string;
}

const loc = (ctx: Ctx, pointer: string): SourceLocation => ({ document: ctx.document, pointer });

function deref(ctx: Ctx, value: unknown, pointer: string): Resolved {
  return derefRef(ctx, value, loc(ctx, pointer));
}

function bindingsOf(raw: Record<string, unknown>): { bindings?: Bindings } {
  const bindings = raw["bindings"];
  return isObject(bindings) ? { bindings } : {};
}

// ─────────────────────────────────────────────────────────────────────────────
// Document metadata
// ─────────────────────────────────────────────────────────────────────────────

function buildInfo(doc: Record<string, unknown>): ApiInfo {
  const info = isObject(doc["info"]) ? doc["info"] : {};
  const contact = isObject(info["contact"]) ? info["contact"] : undefined;
  const license = isObject(info["license"]) ? info["license"] : undefined;
  const external = isObject(info["externalDocs"])
    ? info["externalDocs"]
    : isObject(doc["externalDocs"])
      ? doc["externalDocs"]
      : undefined;

  return {
    title: str(info, "title") ?? "API",
    version: str(info, "version") ?? "0.0.0",
    ...optional("description", str(info, "description")),
    ...optional("summary", str(info, "summary")),
    ...optional("termsOfService", str(info, "termsOfService")),
    ...(contact !== undefined && {
      contact: {
        ...optional("name", str(contact, "name")),
        ...optional("url", str(contact, "url")),
        ...optional("email", str(contact, "email")),
      },
    }),
    ...(license !== undefined && {
      license: {
        name: str(license, "name") ?? "",
        ...optional("url", str(license, "url")),
      },
    }),
    ...(external !== undefined &&
      str(external, "url") !== undefined && {
        externalDocs: {
          url: str(external, "url")!,
          ...optional("description", str(external, "description")),
        },
      }),
    ...extensionsOf(info),
  };
}

/**
 * 2.x servers carry a whole `url`; 3.x splits it into `host` + `pathname`.
 * Both land on one `Server.url` so renderers do not branch on version.
 */
function buildServers(ctx: Ctx): Server[] {
  const servers = ctx.doc["servers"];
  if (!isObject(servers)) return [];

  return Object.entries(servers).flatMap(([id, raw]) => {
    const resolved = deref(ctx, raw, joinPointer("/servers", id));
    if (!isObject(resolved.value)) return [];
    const server = resolved.value;

    const protocol = str(server, "protocol") ?? "ws";
    const url = ctx.v3
      ? `${protocol}://${str(server, "host") ?? ""}${str(server, "pathname") ?? ""}`
      : (str(server, "url") ?? "");

    const variables = isObject(server["variables"]) ? server["variables"] : {};

    return [
      {
        id,
        url,
        protocol,
        ...optional("protocolVersion", str(server, "protocolVersion")),
        docs: docsOf(server),
        variables: Object.entries(variables).flatMap(([name, v]) => {
          if (!isObject(v)) return [];
          const enumValues = Array.isArray(v["enum"])
            ? v["enum"].filter((x): x is string => typeof x === "string")
            : undefined;
          return [
            {
              name,
              default: str(v, "default") ?? "",
              ...(enumValues !== undefined && { enum: enumValues }),
              ...optional("description", str(v, "description")),
            },
          ];
        }),
        security: ctx.v3 ? securityFromSchemeList(server["security"]) : securityFromMaps(server["security"]),
        ...bindingsOf(server),
        source: loc(ctx, joinPointer("/servers", id)),
      },
    ];
  });
}

function buildTags(ctx: Ctx): TagDef[] {
  // 2.x puts tags at the root; 3.x moves them under `info`.
  const info = isObject(ctx.doc["info"]) ? ctx.doc["info"] : {};
  const root = Array.isArray(ctx.doc["tags"]) ? ctx.doc["tags"] : undefined;
  const nested = Array.isArray(info["tags"]) ? info["tags"] : undefined;
  const tags = root ?? nested ?? [];
  const pointer = root !== undefined ? "/tags" : "/info/tags";

  return tags.flatMap((tag, i) => {
    if (!isObject(tag)) return [];
    const name = str(tag, "name");
    return name === undefined ? [] : [{ name, docs: docsOf(tag), source: loc(ctx, `${pointer}/${i}`) }];
  });
}

/**
 * AsyncAPI has a wider set of scheme types than OpenAPI (userPassword, X509,
 * scramSha256, gssapi…). The ones that map onto an OpenAPI shape do; the rest
 * keep their declared type under `kind: "other"` so a renderer can at least
 * label them honestly.
 */
function buildSecuritySchemes(ctx: Ctx): Record<string, SecurityScheme> {
  const schemes = at(ctx.doc, "/components/securitySchemes");
  if (!isObject(schemes)) return {};

  const out: Record<string, SecurityScheme> = {};
  for (const [id, raw] of Object.entries(schemes)) {
    const resolved = deref(ctx, raw, joinPointer("/components/securitySchemes", id));
    if (!isObject(resolved.value)) continue;
    const scheme = resolved.value;
    const source = resolved.source;
    const docs = docsOf(scheme);
    const type = str(scheme, "type");

    if (type === "httpApiKey") {
      const where = str(scheme, "in");
      out[id] = {
        kind: "apiKey",
        id,
        docs,
        source,
        name: str(scheme, "name") ?? id,
        in: where === "query" || where === "cookie" ? where : "header",
      };
    } else if (type === "http") {
      out[id] = {
        kind: "http",
        id,
        docs,
        source,
        scheme: (str(scheme, "scheme") ?? "bearer").toLowerCase(),
        ...optional("bearerFormat", str(scheme, "bearerFormat")),
      };
    } else if (type === "oauth2") {
      const flows = isObject(scheme["flows"]) ? scheme["flows"] : {};
      out[id] = {
        kind: "oauth2",
        id,
        docs,
        source,
        flows: Object.entries(flows).flatMap(([flowType, flow]) => {
          if (!isObject(flow)) return [];
          if (
            flowType !== "implicit" &&
            flowType !== "password" &&
            flowType !== "clientCredentials" &&
            flowType !== "authorizationCode"
          ) {
            return [];
          }
          const scopes = isObject(flow["scopes"]) ? flow["scopes"] : {};
          return [
            {
              type: flowType,
              ...optional("authorizationUrl", str(flow, "authorizationUrl")),
              ...optional("tokenUrl", str(flow, "tokenUrl")),
              ...optional("refreshUrl", str(flow, "refreshUrl")),
              scopes: Object.entries(scopes).map(([name, description]) => ({
                name,
                ...(typeof description === "string" && { description }),
              })),
            },
          ];
        }),
      };
    } else if (type === "openIdConnect") {
      out[id] = {
        kind: "openIdConnect",
        id,
        docs,
        source,
        openIdConnectUrl: str(scheme, "openIdConnectUrl") ?? "",
      };
    } else {
      out[id] = { kind: "other", id, docs, source, type: type ?? "unknown" };
    }
  }
  return out;
}

/**
 * 3.x security is a list of scheme objects or refs, not a map of name → scopes,
 * and the list is alternatives: "only one of the security scheme objects need
 * to be satisfied". So each scheme is an alternative of its own.
 */
function securityFromSchemeList(value: unknown): SecurityRequirements {
  if (!Array.isArray(value) || value.length === 0) return [];
  const alternatives = value.flatMap((entry) => {
    if (!isObject(entry)) return [];
    const ref = str(entry, "$ref");
    const scopes = Array.isArray(entry["scopes"])
      ? entry["scopes"].filter((s): s is string => typeof s === "string")
      : [];
    return [[{ scheme: ref === undefined ? (str(entry, "type") ?? "unknown") : refName(ref), scopes }]];
  });
  return alternatives;
}

// ─────────────────────────────────────────────────────────────────────────────
// Channels — AsyncAPI 2.x
// ─────────────────────────────────────────────────────────────────────────────

function buildV2Endpoints(ctx: Ctx): Endpoint[] {
  const channels = ctx.doc["channels"];
  if (!isObject(channels)) return [];

  return Object.entries(channels).flatMap(([address, raw]) => {
    const pointer = joinPointer("/channels", address);
    const resolved = deref(ctx, raw, pointer);
    if (!isObject(resolved.value)) return [];
    const channel = resolved.value;

    const operations: MessageOperation[] = V2_OPERATIONS.flatMap((key) => {
      const op = channel[key];
      if (!isObject(op)) return [];
      const opPointer = joinPointer(pointer, key);
      const id = str(op, "operationId") ?? `${key}-${address}`;

      return [
        {
          kind: "message",
          id,
          slug: ctx.slug(id),
          direction: directionFromV2(key),
          docs: docsOf(op),
          tags: tagNames(op),
          deprecated: op["deprecated"] === true,
          security: securityFromMaps(op["security"]),
          messages: buildV2Messages(ctx, op["message"], `${opPointer}/message`),
          ...bindingsOf(op),
          source: loc(ctx, opPointer),
        },
      ];
    });

    return [
      {
        id: address,
        slug: ctx.slug(address),
        // In 2.x the channel key *is* the address.
        address,
        addressKind: "channel",
        protocols: protocolsOf(ctx, channel["servers"]),
        docs: docsOf(channel),
        parameters: buildV2Parameters(ctx, channel["parameters"], `${pointer}/parameters`),
        servers: Array.isArray(channel["servers"])
          ? channel["servers"].filter((s): s is string => typeof s === "string")
          : [],
        operations,
        ...bindingsOf(channel),
        source: loc(ctx, pointer),
      },
    ];
  });
}

/** 2.x: `message` is either one message or `{ oneOf: [...] }`. */
function buildV2Messages(ctx: Ctx, value: unknown, pointer: string): WsMessage[] {
  if (!isObject(value)) return [];
  if (Array.isArray(value["oneOf"])) {
    return value["oneOf"].flatMap((m, i) => {
      const message = buildMessage(ctx, m, `${pointer}/oneOf/${i}`);
      return message === undefined ? [] : [message];
    });
  }
  const message = buildMessage(ctx, value, pointer);
  return message === undefined ? [] : [message];
}

/** 2.x parameters carry a `schema`; 3.x describe the value inline instead. */
function buildV2Parameters(ctx: Ctx, value: unknown, pointer: string): Parameter[] {
  if (!isObject(value)) return [];
  return Object.entries(value).flatMap(([name, raw]) => {
    const resolved = deref(ctx, raw, joinPointer(pointer, name));
    if (!isObject(resolved.value)) return [];
    const param = resolved.value;
    const schema = param["schema"];

    return [
      {
        name,
        // A channel address parameter sits in the address, like an OAS path param.
        in: "path" as const,
        required: true,
        node:
          schema === undefined
            ? anyNode(resolved.source)
            : ctx.lower(schema, { ...resolved.source, pointer: `${resolved.source.pointer}/schema` }),
        docs: docsOf(param),
        source: resolved.source,
      },
    ];
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Channels and operations — AsyncAPI 3.x
// ─────────────────────────────────────────────────────────────────────────────

function buildV3Endpoints(ctx: Ctx): Endpoint[] {
  const channels = isObject(ctx.doc["channels"]) ? ctx.doc["channels"] : {};
  const operations = isObject(ctx.doc["operations"]) ? ctx.doc["operations"] : {};

  // 3.x operations point at channels, so group them by the channel they name.
  const byChannel = new Map<string, MessageOperation[]>();
  for (const [id, raw] of Object.entries(operations)) {
    const pointer = joinPointer("/operations", id);
    const resolved = deref(ctx, raw, pointer);
    if (!isObject(resolved.value)) continue;
    const op = resolved.value;

    const action = str(op, "action");
    const direction = directionFromV3(action ?? "");
    if (direction === undefined) {
      ctx.report(
        diagnostic(
          "error",
          "UNKNOWN_ACTION",
          `Operation "${id}" has action "${action ?? "(missing)"}"; expected "send" or "receive"`,
          loc(ctx, pointer),
        ),
      );
      continue;
    }

    const channelKey = channelKeyOf(ctx, op["channel"]);
    if (channelKey === undefined) {
      ctx.report(
        diagnostic("error", "UNRESOLVED_CHANNEL", `Operation "${id}" names no resolvable channel`, loc(ctx, pointer)),
      );
      continue;
    }

    const operation: MessageOperation = {
      kind: "message",
      id,
      slug: ctx.slug(id),
      direction,
      docs: docsOf(op),
      tags: tagNames(op),
      deprecated: op["deprecated"] === true,
      security: securityFromSchemeList(op["security"]),
      messages: buildV3Messages(ctx, op["messages"], `${pointer}/messages`),
      ...buildReply(ctx, op["reply"], `${pointer}/reply`),
      ...bindingsOf(op),
      source: loc(ctx, pointer),
    };

    byChannel.set(channelKey, [...(byChannel.get(channelKey) ?? []), operation]);
  }

  return Object.entries(channels).flatMap(([id, raw]) => {
    const pointer = joinPointer("/channels", id);
    const resolved = deref(ctx, raw, pointer);
    if (!isObject(resolved.value)) return [];
    const channel = resolved.value;

    return [
      {
        id,
        slug: ctx.slug(id),
        // 3.x separates the channel's key from its address.
        address: str(channel, "address") ?? id,
        addressKind: "channel",
        protocols: protocolsOf(ctx, channel["servers"]),
        docs: docsOf(channel),
        parameters: buildV3Parameters(ctx, channel["parameters"], `${pointer}/parameters`),
        servers: serverIdsOf(channel["servers"]),
        operations: byChannel.get(id) ?? [],
        ...bindingsOf(channel),
        source: loc(ctx, pointer),
      },
    ];
  });
}

/** AsyncAPI 3.x request/reply — unrepresentable if operations fold into channels. */
function buildReply(ctx: Ctx, value: unknown, pointer: string): { reply?: NonNullable<MessageOperation["reply"]> } {
  const resolved = deref(ctx, value, pointer);
  if (!isObject(resolved.value)) return {};
  const reply = resolved.value;

  const address = isObject(reply["address"]) ? str(reply["address"], "location") : undefined;
  const channel = channelKeyOf(ctx, reply["channel"]);

  return {
    reply: {
      ...optional("address", address),
      ...optional("channel", channel),
      messages: buildV3Messages(ctx, reply["messages"], `${resolved.source.pointer}/messages`),
    },
  };
}

function buildV3Messages(ctx: Ctx, value: unknown, pointer: string): WsMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((m, i) => {
    const message = buildMessage(ctx, m, `${pointer}/${i}`);
    return message === undefined ? [] : [message];
  });
}

/** 3.x parameters describe the value inline (enum/default), with no schema. */
function buildV3Parameters(ctx: Ctx, value: unknown, pointer: string): Parameter[] {
  if (!isObject(value)) return [];
  return Object.entries(value).flatMap(([name, raw]) => {
    const resolved = deref(ctx, raw, joinPointer(pointer, name));
    if (!isObject(resolved.value)) return [];
    const param = resolved.value;

    const enumValues = Array.isArray(param["enum"])
      ? param["enum"].filter((v): v is string => typeof v === "string")
      : undefined;

    // Synthesised rather than lowered: there is no schema here to lower.
    const node: Node =
      enumValues !== undefined && enumValues.length > 0
        ? {
            kind: "enum",
            source: resolved.source,
            docs: paramDocs(param),
            nullable: false,
            baseType: "string",
            members: enumValues.map((value) => ({ value })),
          }
        : {
            kind: "string",
            source: resolved.source,
            docs: paramDocs(param),
            nullable: false,
            constraints: {},
          };

    return [
      {
        name,
        in: "path" as const,
        required: true,
        node,
        docs: docsOf(param),
        source: resolved.source,
      },
    ];
  });
}

/**
 * Docs for a *synthesised* parameter node. Only value-level facts belong here:
 * the description is usage-level and already sits on `Parameter.docs`, which is
 * where 2.x puts it too. Duplicating it would make the two versions produce
 * different IR for the same API.
 */
function paramDocs(param: Record<string, unknown>): ReturnType<typeof docsOf> {
  const examples = Array.isArray(param["examples"]) ? param["examples"] : undefined;
  return {
    ...("default" in param && { default: param["default"] }),
    ...(examples !== undefined && { examples }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Messages
// ─────────────────────────────────────────────────────────────────────────────

function buildMessage(ctx: Ctx, raw: unknown, pointer: string): WsMessage | undefined {
  const resolved = deref(ctx, raw, pointer);
  if (!isObject(resolved.value)) return undefined;
  const message = resolved.value;
  const source = resolved.source;

  const name = str(message, "name") ?? str(message, "title") ?? refName(source.pointer);
  const format = str(message, "schemaFormat");
  const payload = payloadSchema(message["payload"], format);

  let payloadNode: Node;
  if (payload.unsupported !== undefined) {
    ctx.report(diagnostic("warning", "SCHEMA_FORMAT_UNSUPPORTED", payload.unsupported, source));
    payloadNode = unsupportedNode(payload.unsupported, payload.raw, source);
  } else if (payload.schema === undefined) {
    payloadNode = anyNode(source);
  } else {
    payloadNode = ctx.lower(payload.schema, { ...source, pointer: `${source.pointer}/payload` });
  }

  const headers = message["headers"];

  return {
    id: `${source.document}#${source.pointer}`,
    name,
    ...optional("title", str(message, "title")),
    ...optional("summary", str(message, "summary")),
    docs: docsOf(message),
    payload: payloadNode,
    ...(headers !== undefined && {
      headers: ctx.lower(headers, { ...source, pointer: `${source.pointer}/headers` }),
    }),
    ...optional("contentType", str(message, "contentType")),
    ...discriminatorValueOf(ctx, payloadNode),
    examples: buildMessageExamples(message),
    ...bindingsOf(message),
    source,
  };
}

/**
 * Gives every message an anchor, once every endpoint and operation has one.
 *
 * Done last, over the finished endpoints, so a message can only ever take the
 * suffix in a collision: adding message anchors must not move an operation's,
 * which sites already link to. A message on two operations is two objects, and
 * gets two anchors — each place it is rendered needs its own.
 */
function slugMessages(ctx: Ctx, endpoints: Endpoint[]): Endpoint[] {
  const slug = (m: WsMessage): WsMessage => ({ ...m, slug: ctx.slug(m.name) });
  return endpoints.map((endpoint) => ({
    ...endpoint,
    operations: endpoint.operations.map((operation) =>
      operation.kind !== "message"
        ? operation
        : {
            ...operation,
            messages: operation.messages.map(slug),
            ...(operation.reply !== undefined && {
              reply: { ...operation.reply, messages: operation.reply.messages.map(slug) },
            }),
          },
    ),
  }));
}

/**
 * The const value of a message's discriminating field, when the payload is an
 * object with exactly one const property. That is the `message: "AddAudio"`
 * idiom, and it is what lets a renderer label a message without the spec
 * having to declare a mapping.
 *
 * Payloads are nearly always a `$ref` in practice, so this has to look through
 * one — checking only inline objects would mean it never fired on a real spec.
 */
function discriminatorValueOf(ctx: Ctx, payload: Node): { discriminatorValue?: unknown } {
  const resolved = payload.kind === "ref" ? ctx.peek(payload.target) : payload;
  if (resolved === undefined || resolved.kind !== "object") return {};
  const consts = resolved.properties.filter((p) => p.node.kind === "const");
  if (consts.length !== 1) return {};
  const only = consts[0]!.node;
  return only.kind === "const" ? { discriminatorValue: only.value } : {};
}

function buildMessageExamples(message: Record<string, unknown>): WsMessage["examples"] {
  const examples = message["examples"];
  if (!Array.isArray(examples)) return [];
  return examples.flatMap((example) => {
    if (!isObject(example)) return [];
    return [
      {
        ...optional("name", str(example, "name")),
        ...optional("summary", str(example, "summary")),
        payload: example["payload"],
        ...(example["headers"] !== undefined && { headers: example["headers"] }),
      },
    ];
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function tagNames(raw: Record<string, unknown>): string[] {
  const tags = raw["tags"];
  if (!Array.isArray(tags)) return [];
  return tags.flatMap((tag) => {
    if (typeof tag === "string") return [tag];
    if (isObject(tag)) {
      const name = str(tag, "name");
      return name === undefined ? [] : [name];
    }
    return [];
  });
}

/** The channel key an operation (or reply) points at. */
function channelKeyOf(ctx: Ctx, value: unknown): string | undefined {
  if (!isObject(value)) return undefined;
  const ref = str(value, "$ref");
  if (ref === undefined) return undefined;
  const target = ctx.project.resolve(ref, loc(ctx, "/operations"));
  if (target === undefined) return undefined;
  const match = /^\/channels\/([^/]+)$/.exec(target.pointer);
  return match?.[1] === undefined ? undefined : decodeURIComponent(match[1]).replace(/~1/g, "/").replace(/~0/g, "~");
}

function serverIdsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === "string") return [entry];
    if (isObject(entry)) {
      const ref = str(entry, "$ref");
      return ref === undefined ? [] : [refName(ref)];
    }
    return [];
  });
}

/** The protocols a channel is reachable over, from the servers it names. */
function protocolsOf(ctx: Ctx, value: unknown): string[] {
  const servers = isObject(ctx.doc["servers"]) ? ctx.doc["servers"] : {};
  const ids = serverIdsOf(value);
  const chosen = ids.length > 0 ? ids : Object.keys(servers);

  const protocols = chosen.flatMap((id) => {
    const server = servers[id];
    if (!isObject(server)) return [];
    const protocol = str(server, "protocol");
    return protocol === undefined ? [] : [protocol];
  });
  return [...new Set(protocols)];
}
