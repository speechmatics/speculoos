/**
 * OpenAPI 3.0 / 3.1 → `ApiIR`.
 *
 * Path Items become `Endpoint`s and operations become `RequestResponseOperation`s.
 * Schemas go through @speculoos/jsonschema, which owns every decision about how
 * a schema is displayed; this file is only concerned with the document around
 * them — addresses, parameters, responses, servers, security and tags.
 */

import {
  type AdapterContext,
  deref as derefRef,
  docsOf,
  extensionsOf,
  optional,
  protocolOf,
  type Resolved,
  securityFromMaps,
} from "@speculoos/adapter-kit";
import type {
  ApiInfo,
  ApiIR,
  Diagnostic,
  Endpoint,
  Example,
  HttpMethod,
  Link,
  MediaVariant,
  Node,
  Operation,
  Parameter,
  Property,
  RestResponse,
  SecurityScheme,
  Server,
  SourceLocation,
  TagDef,
} from "@speculoos/core";
import { createSlugger, projectForView } from "@speculoos/core";
import { buildSchemas, isObject, str } from "@speculoos/jsonschema";
import type { LoadedProject } from "@speculoos/loader";
import { at, joinPointer } from "@speculoos/loader";

const METHODS: HttpMethod[] = ["get", "put", "post", "delete", "patch", "head", "options", "trace"];

export interface BuildOptions {
  project: LoadedProject;
  /** Which loaded document is the OpenAPI document. Defaults to the first entry. */
  document?: string;
}

export function buildOpenApi({ project, document }: BuildOptions): ApiIR {
  const entry = document === undefined ? project.entry[0] : project.document(document);
  if (entry === undefined) throw new Error("No OpenAPI document to build from");

  const dialect = entry.dialect?.dialect ?? "openapi-3.1";
  if (dialect !== "openapi-3.0" && dialect !== "openapi-3.1") {
    throw new Error(`Document "${entry.name}" is not an OpenAPI document`);
  }

  const doc = isObject(entry.data) ? entry.data : {};
  const diagnostics: Diagnostic[] = [...project.diagnostics];
  const schemas = buildSchemas({ resolver: project, dialect });
  const slug = createSlugger();

  const ctx: Ctx = {
    doc,
    name: entry.name,
    document: entry.name,
    project,
    lower: (schema, loc) => schemas.lowerInline(schema, loc),
    report: (d) => diagnostics.push(d),
    slug,
  };

  // Register every declared schema up front, so `components/schemas` entries
  // appear in the registry even when nothing in the document refs them.
  const declared = at(doc, "/components/schemas");
  if (isObject(declared)) {
    for (const key of Object.keys(declared)) {
      schemas.registry.declare({
        document: entry.name,
        pointer: joinPointer("/components/schemas", key),
      });
    }
  }

  const endpoints = [...buildPaths(ctx, "/paths", false), ...buildPaths(ctx, "/webhooks", true)];

  const finished = schemas.finish();

  return {
    irVersion: 1,
    info: buildInfo(doc),
    servers: buildServers(ctx, doc["servers"], "/servers"),
    securitySchemes: buildSecuritySchemes(ctx),
    tags: buildTags(ctx),
    endpoints,
    security: securityFromMaps(doc["security"]),
    schemas: finished.schemas,
    diagnostics: [...diagnostics, ...finished.diagnostics],
    provenance: {
      dialect: "openapi",
      dialectVersion: entry.dialect?.version ?? "3.1.0",
      documents: project.documents.map((d) => d.name).sort(),
    },
  };
}

interface Ctx extends AdapterContext {
  doc: Record<string, unknown>;
  name: string;
  project: LoadedProject;
  lower: (schema: unknown, loc: SourceLocation) => Node;
  slug: (name: string) => string;
}

const loc = (ctx: Ctx, pointer: string): SourceLocation => ({ document: ctx.name, pointer });

/**
 * Follows a structural `$ref`, returning where the value really lives — which
 * may be a different document, so callers use `source` rather than a pointer
 * they built themselves.
 */
function deref(ctx: Ctx, value: unknown, pointer: string): Resolved {
  return derefRef(ctx, value, loc(ctx, pointer));
}

function buildInfo(doc: Record<string, unknown>): ApiInfo {
  const info = isObject(doc["info"]) ? doc["info"] : {};
  const contact = isObject(info["contact"]) ? info["contact"] : undefined;
  const license = isObject(info["license"]) ? info["license"] : undefined;
  const external = isObject(doc["externalDocs"]) ? doc["externalDocs"] : undefined;

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
        ...optional("identifier", str(license, "identifier")),
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

function buildServers(ctx: Ctx, value: unknown, pointer: string): Server[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, i) => {
    if (!isObject(entry)) return [];
    const url = str(entry, "url") ?? "/";
    const variables = isObject(entry["variables"]) ? entry["variables"] : {};
    return [
      {
        id: str(entry, "x-speculoos-id") ?? `server-${i + 1}`,
        url,
        protocol: protocolOf(url),
        docs: docsOf(entry),
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
        security: [],
        source: loc(ctx, `${pointer}/${i}`),
      },
    ];
  });
}

function buildTags(ctx: Ctx): TagDef[] {
  const tags = ctx.doc["tags"];
  if (!Array.isArray(tags)) return [];
  return tags.flatMap((tag, i) => {
    if (!isObject(tag)) return [];
    const name = str(tag, "name");
    return name === undefined ? [] : [{ name, docs: docsOf(tag), source: loc(ctx, `/tags/${i}`) }];
  });
}

function buildSecuritySchemes(ctx: Ctx): Record<string, SecurityScheme> {
  const schemes = at(ctx.doc, "/components/securitySchemes");
  if (!isObject(schemes)) return {};

  const out: Record<string, SecurityScheme> = {};
  for (const [id, raw] of Object.entries(schemes)) {
    if (!isObject(raw)) continue;
    const source = loc(ctx, joinPointer("/components/securitySchemes", id));
    const docs = docsOf(raw);
    const type = str(raw, "type");

    if (type === "apiKey") {
      const where = str(raw, "in");
      out[id] = {
        kind: "apiKey",
        id,
        docs,
        source,
        name: str(raw, "name") ?? id,
        in: where === "query" || where === "cookie" ? where : "header",
      };
    } else if (type === "http") {
      out[id] = {
        kind: "http",
        id,
        docs,
        source,
        scheme: (str(raw, "scheme") ?? "bearer").toLowerCase(),
        ...optional("bearerFormat", str(raw, "bearerFormat")),
      };
    } else if (type === "oauth2") {
      const flows = isObject(raw["flows"]) ? raw["flows"] : {};
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
        openIdConnectUrl: str(raw, "openIdConnectUrl") ?? "",
      };
    } else {
      out[id] = { kind: "other", id, docs, source, type: type ?? "unknown" };
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoints
// ─────────────────────────────────────────────────────────────────────────────

function buildPaths(ctx: Ctx, root: string, isWebhook: boolean): Endpoint[] {
  const paths = at(ctx.doc, root);
  if (!isObject(paths)) return [];

  return Object.entries(paths).flatMap(([address, item]) => {
    const pointer = joinPointer(root, address);
    const resolved = deref(ctx, item, pointer);
    if (!isObject(resolved.value)) return [];
    return [buildEndpoint(ctx, address, resolved.value, resolved.source.pointer, isWebhook)];
  });
}

function buildEndpoint(
  ctx: Ctx,
  address: string,
  item: Record<string, unknown>,
  pointer: string,
  isWebhook: boolean,
): Endpoint {
  const shared = buildParameters(ctx, item["parameters"], `${pointer}/parameters`);
  const servers = buildServers(ctx, item["servers"], `${pointer}/servers`);

  const operations: Operation[] = METHODS.flatMap((method) => {
    const raw = item[method];
    if (!isObject(raw)) return [];
    return [buildOperation(ctx, method, address, raw, joinPointer(pointer, method), isWebhook)];
  });

  return {
    id: isWebhook ? `webhook:${address}` : address,
    slug: ctx.slug(isWebhook ? `webhook ${address}` : address),
    address,
    addressKind: "path",
    protocols: [...new Set(servers.map((s) => s.protocol))],
    docs: docsOf(item),
    parameters: shared,
    servers: servers.map((s) => s.id),
    operations,
    source: loc(ctx, pointer),
  };
}

function buildOperation(
  ctx: Ctx,
  method: HttpMethod,
  address: string,
  raw: Record<string, unknown>,
  pointer: string,
  isWebhook: boolean,
): Operation {
  const id = str(raw, "operationId") ?? `${method}-${address}`;
  const body = isObject(raw["requestBody"]) ? deref(ctx, raw["requestBody"], `${pointer}/requestBody`) : undefined;

  const callbacks = isObject(raw["callbacks"])
    ? Object.entries(raw["callbacks"]).flatMap(([name, cb]) => {
        const resolved = deref(ctx, cb, joinPointer(`${pointer}/callbacks`, name));
        if (!isObject(resolved.value)) return [];
        return Object.entries(resolved.value).flatMap(([expression, item]) => {
          const inner = deref(ctx, item, joinPointer(resolved.source.pointer, expression));
          if (!isObject(inner.value)) return [];
          return [buildEndpoint(ctx, expression, inner.value, inner.source.pointer, false)];
        });
      })
    : [];

  return {
    kind: "request-response",
    id,
    slug: ctx.slug(id),
    method,
    docs: docsOf(raw),
    tags: Array.isArray(raw["tags"]) ? raw["tags"].filter((t): t is string => typeof t === "string") : [],
    deprecated: raw["deprecated"] === true,
    security: securityFromMaps(raw["security"]),
    parameters: buildParameters(ctx, raw["parameters"], `${pointer}/parameters`),
    ...(body !== undefined &&
      isObject(body.value) && {
        requestBody: {
          required: body.value["required"] === true,
          docs: docsOf(body.value),
          content: buildContent(ctx, body.value["content"], `${body.source.pointer}/content`, "request"),
        },
      }),
    responses: buildResponses(ctx, raw["responses"], `${pointer}/responses`),
    callbacks,
    links: isObject(raw["responses"])
      ? Object.entries(raw["responses"]).flatMap(([status, entry]) => {
          const resolved = deref(ctx, entry, joinPointer(`${pointer}/responses`, status));
          return isObject(resolved.value)
            ? buildLinks(ctx, resolved.value["links"], `${resolved.source.pointer}/links`)
            : [];
        })
      : [],
    isWebhook,
    source: loc(ctx, pointer),
  };
}

function buildParameters(ctx: Ctx, value: unknown, pointer: string): Parameter[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, i) => {
    const resolved = deref(ctx, entry, `${pointer}/${i}`);
    if (!isObject(resolved.value)) return [];
    const raw = resolved.value;
    const name = str(raw, "name");
    if (name === undefined) return [];

    const where = str(raw, "in");
    const placement: Parameter["in"] =
      where === "query" || where === "header" || where === "cookie" || where === "path" ? where : "query";

    const schema = raw["schema"];
    const node =
      schema === undefined
        ? ({ kind: "any", source: loc(ctx, resolved.source.pointer), docs: {}, nullable: false } as Node)
        : ctx.lower(schema, loc(ctx, `${resolved.source.pointer}/schema`));

    return [
      {
        name,
        in: placement,
        // Path parameters are required by definition, whatever the spec says.
        required: placement === "path" ? true : raw["required"] === true,
        node,
        docs: docsOf(raw),
        ...optional("style", str(raw, "style")),
        ...(typeof raw["explode"] === "boolean" && { explode: raw["explode"] }),
        source: loc(ctx, resolved.source.pointer),
      },
    ];
  });
}

function buildResponses(ctx: Ctx, value: unknown, pointer: string): RestResponse[] {
  if (!isObject(value)) return [];
  return Object.entries(value).flatMap(([status, entry]) => {
    const resolved = deref(ctx, entry, joinPointer(pointer, status));
    if (!isObject(resolved.value)) return [];
    const raw = resolved.value;

    const headers: Property[] = isObject(raw["headers"])
      ? Object.entries(raw["headers"]).flatMap(([name, header]) => {
          const h = deref(ctx, header, joinPointer(`${resolved.source.pointer}/headers`, name));
          if (!isObject(h.value)) return [];
          const schema = h.value["schema"];
          return [
            {
              name,
              node:
                schema === undefined
                  ? ({ kind: "any", source: loc(ctx, h.source.pointer), docs: {}, nullable: false } as Node)
                  : ctx.lower(schema, loc(ctx, `${h.source.pointer}/schema`)),
              required: h.value["required"] === true,
              readOnly: false,
              writeOnly: false,
              deprecated: h.value["deprecated"] === true,
              docs: docsOf(h.value),
            },
          ];
        })
      : [];

    return [
      {
        status,
        docs: docsOf(raw),
        headers,
        content: buildContent(ctx, raw["content"], `${resolved.source.pointer}/content`, "response"),
      },
    ];
  });
}

/** OAS Link Objects: a hint that one operation's output feeds another's input. */
function buildLinks(ctx: Ctx, value: unknown, pointer: string): Link[] {
  if (!isObject(value)) return [];
  return Object.entries(value).flatMap(([name, entry]) => {
    const resolved = deref(ctx, entry, joinPointer(pointer, name));
    if (!isObject(resolved.value)) return [];
    const raw = resolved.value;
    const parameters = isObject(raw["parameters"]) ? raw["parameters"] : {};
    return [
      {
        name,
        ...optional("operationId", str(raw, "operationId")),
        ...optional("operationRef", str(raw, "operationRef")),
        docs: docsOf(raw),
        parameters: Object.entries(parameters).map(([key, expression]) => ({
          name: key,
          expression,
        })),
        ...("requestBody" in raw && { requestBody: raw["requestBody"] }),
        ...optional("server", str(isObject(raw["server"]) ? raw["server"] : {}, "url")),
      },
    ];
  });
}

function buildContent(ctx: Ctx, value: unknown, pointer: string, view: "request" | "response"): MediaVariant[] {
  if (!isObject(value)) return [];
  return Object.entries(value).flatMap(([mediaType, entry]) => {
    if (!isObject(entry)) return [];
    const at = joinPointer(pointer, mediaType);
    const schema = entry["schema"];
    const node =
      schema === undefined
        ? ({ kind: "any", source: loc(ctx, at), docs: {}, nullable: false } as Node)
        : ctx.lower(schema, loc(ctx, `${at}/schema`));

    return [
      {
        mediaType,
        // Inline structure is projected here; `view` carries the rest of the
        // job to the renderer, which applies it as it expands refs.
        node: projectForView(node, view),
        view,
        examples: buildExamples(ctx, entry, at),
      },
    ];
  });
}

function buildExamples(ctx: Ctx, entry: Record<string, unknown>, pointer: string): Example[] {
  const out: Example[] = [];
  if (entry["example"] !== undefined) out.push({ value: entry["example"] });

  const examples = entry["examples"];
  if (isObject(examples)) {
    for (const [name, raw] of Object.entries(examples)) {
      const resolved = deref(ctx, raw, joinPointer(`${pointer}/examples`, name));
      if (!isObject(resolved.value)) continue;
      const external = str(resolved.value, "externalValue");
      out.push({
        name,
        ...optional("summary", str(resolved.value, "summary")),
        ...optional("description", str(resolved.value, "description")),
        ...(resolved.value["value"] !== undefined && { value: resolved.value["value"] }),
        ...(external !== undefined && { externalValue: external }),
      });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
