/**
 * Document-level IR: everything above the schema layer.
 *
 * `ApiIR` is the root of the emitted artifact. Speculoos runs at build time and
 * writes IR to disk, so something has to *be* the file — this is it. It is also
 * where navigation lives: tags and their order, servers, and the security scheme
 * definitions that operations reference by name.
 *
 * Design rules (in addition to those in ./schema.ts)
 *  1. An OpenAPI Path Item and an AsyncAPI Channel are the same idea — an address
 *     with parameters carrying a set of operations — so both lower to `Endpoint`.
 *  2. Operation *shapes* are not unified. REST is request/response; a channel is a
 *     long-lived connection carrying many messages in both directions. `Operation`
 *     is a discriminated union and renderers switch on `kind`.
 *  3. Nothing here holds raw schema. Everything schema-shaped is a `Node`.
 *  4. Descriptions are CommonMark strings, never pre-rendered and never sanitised.
 *     Specs are untrusted input; sanitising is the renderer's job.
 */

import type {
  Diagnostic,
  Docs,
  Node,
  Property,
  SourceLocation,
  TypeId,
  TypeRegistry,
  View,
} from "./schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Document metadata
// ─────────────────────────────────────────────────────────────────────────────

export interface Contact {
  name?: string;
  url?: string;
  email?: string;
}

export interface License {
  name: string;
  /** SPDX identifier (OAS 3.1 / AsyncAPI 3.x). */
  identifier?: string;
  url?: string;
}

export interface ApiInfo {
  title: string;
  /** API version as declared by the document, e.g. "2.0.1". Not the IR version. */
  version: string;
  /** CommonMark. */
  description?: string;
  summary?: string;
  termsOfService?: string;
  contact?: Contact;
  license?: License;
  externalDocs?: { url: string; description?: string };
  extensions?: Record<string, unknown>;
}

export interface ServerVariable {
  name: string;
  default: string;
  enum?: string[];
  description?: string;
}

export interface Server {
  /** Key in the source document; referenced from `Endpoint.servers`. */
  id: string;
  /**
   * OAS `url`, or AsyncAPI `host` + `pathname` joined. Templated segments are
   * left intact so renderers can highlight them, e.g. "https://{region}.example.com".
   */
  url: string;
  /** "https" | "wss" | "kafka" | … Taken from AsyncAPI `protocol`, or the OAS url scheme. */
  protocol: string;
  protocolVersion?: string;
  docs: Docs;
  variables: ServerVariable[];
  /** Security requirements that apply to every operation on this server. */
  security: SecurityRequirement[][];
  bindings?: Bindings;
  source: SourceLocation;
}

/**
 * Protocol-specific extras (AsyncAPI bindings), keyed by protocol name and passed
 * through verbatim. Deliberately untyped: the set is open-ended, every renderer
 * wants a different subset, and guessing a shape would be worse than not trying.
 */
export type Bindings = Record<string, unknown>;

export interface TagDef {
  name: string;
  docs: Docs;
  /** Source order is preserved; this is the navigation order. */
  source: SourceLocation;
}

// ─────────────────────────────────────────────────────────────────────────────
// Security
// ─────────────────────────────────────────────────────────────────────────────

export interface OAuthFlow {
  type: "implicit" | "password" | "clientCredentials" | "authorizationCode";
  authorizationUrl?: string;
  tokenUrl?: string;
  refreshUrl?: string;
  /** Scope name → description. Source order preserved. */
  scopes: { name: string; description?: string }[];
}

interface SecuritySchemeBase {
  /** Key in `ApiIR.securitySchemes`, which is what a `SecurityRequirement` names. */
  id: string;
  docs: Docs;
  source: SourceLocation;
}

export interface ApiKeyScheme extends SecuritySchemeBase {
  kind: "apiKey";
  name: string;
  in: "header" | "query" | "cookie";
}

export interface HttpScheme extends SecuritySchemeBase {
  kind: "http";
  /** "basic", "bearer", "digest"… lowercased. */
  scheme: string;
  /** e.g. "JWT". Display only. */
  bearerFormat?: string;
}

export interface OAuth2Scheme extends SecuritySchemeBase {
  kind: "oauth2";
  flows: OAuthFlow[];
}

export interface OpenIdConnectScheme extends SecuritySchemeBase {
  kind: "openIdConnect";
  openIdConnectUrl: string;
}

/**
 * AsyncAPI-only schemes (userPassword, scramSha256, gssapi, plain, X509, …) and
 * anything else we recognise but have no structured fields for. `type` keeps the
 * source spelling so a renderer can at least label it.
 */
export interface OtherSecurityScheme extends SecuritySchemeBase {
  kind: "other";
  type: string;
}

export type SecurityScheme =
  | ApiKeyScheme
  | HttpScheme
  | OAuth2Scheme
  | OpenIdConnectScheme
  | OtherSecurityScheme;

export interface SecurityRequirement {
  /** Key into `ApiIR.securitySchemes`. */
  scheme: string;
  /** Empty for non-oauth2 schemes. */
  scopes: string[];
}

/**
 * Outer array is OR (any one alternative suffices), inner is AND (all of them
 * required together). An empty outer array means no security; an empty inner
 * array means security is optional.
 */
export type SecurityRequirements = SecurityRequirement[][];

// ─────────────────────────────────────────────────────────────────────────────
// Shared operation parts
// ─────────────────────────────────────────────────────────────────────────────

export interface Example {
  name?: string;
  summary?: string;
  description?: string;
  /**
   * Optional: an OAS Example carries either `value` or `externalValue`, and a
   * literal `undefined` would not survive a JSON round-trip anyway.
   */
  value?: unknown;
  /** Set instead of `value` when the source gave a URL rather than a literal. */
  externalValue?: string;
}

export interface MediaVariant {
  /** e.g. "application/json", "multipart/form-data". */
  mediaType: string;
  node: Node;
  /**
   * Which view this content is. The adapter has already applied
   * `projectForView` to the inline structure of `node`, but it cannot reach
   * through a `$ref` — a registry entry is shared by every view, and rewriting
   * it would mean three copies of every type. So the view travels with the
   * content, and renderers pass it on:
   *
   *     toTree(variant.node, ir, { view: variant.view })
   *
   * Without this a `$ref`-valued request body shows its readOnly fields.
   */
  view: View;
  examples: Example[];
}

export interface Parameter {
  name: string;
  /**
   * "path" covers both OAS path parameters and AsyncAPI channel address
   * parameters, which occupy the same position in a reader's mental model.
   */
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
  node: Node;
  docs: Docs;
  /** OAS serialisation hints, kept for display only. */
  style?: string;
  explode?: boolean;
  source: SourceLocation;
}

export interface RestResponse {
  /** "200", "4XX", "default". */
  status: string;
  docs: Docs;
  /** Response headers, modelled as properties because that is how they read. */
  headers: Property[];
  content: MediaVariant[];
}

/** OAS Link Object: a hint that one operation's output feeds another's input. */
export interface Link {
  name: string;
  /** Id of the target operation, when it could be resolved. */
  operationId?: string;
  /** OAS `operationRef`, kept when `operationId` could not be resolved. */
  operationRef?: string;
  docs: Docs;
  /** Parameter name → runtime expression, e.g. "$response.body#/id". Display only. */
  parameters: { name: string; expression: unknown }[];
  requestBody?: unknown;
  server?: string;
}

/**
 * Normalised from AsyncAPI 2.x publish/subscribe (application perspective,
 * famously inverted for readers) and 3.x send/receive, into the API
 * consumer's perspective.
 */
export type Direction = "client-sends" | "server-sends";

export interface WsMessage {
  id: TypeId;
  /**
   * URL-safe anchor, assigned after every endpoint and operation slug so it
   * never displaces one. Optional only because it arrived after `irVersion: 1`
   * froze; adapters always set it. A message on two operations has two.
   */
  slug?: string;
  name: string;
  title?: string;
  summary?: string;
  docs: Docs;
  payload: Node;
  headers?: Node;
  contentType?: string;
  /** e.g. the const value of the message's discriminating field ("AddTranscript"). */
  discriminatorValue?: unknown;
  examples: { name?: string; summary?: string; payload: unknown; headers?: unknown }[];
  bindings?: Bindings;
  source: SourceLocation;
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoints & operations
// ─────────────────────────────────────────────────────────────────────────────

export type HttpMethod =
  | "get"
  | "put"
  | "post"
  | "delete"
  | "patch"
  | "head"
  | "options"
  | "trace";

interface OperationBase {
  /** operationId / AsyncAPI operation key, or derived from the address. Unique project-wide. */
  id: string;
  /** URL-safe anchor, assigned over the completed document like `TypeDef.slug`. */
  slug: string;
  docs: Docs;
  /** Names into `ApiIR.tags`. Order preserved. */
  tags: string[];
  deprecated: boolean;
  /** Empty means "inherit the document-level default". */
  security: SecurityRequirements;
  bindings?: Bindings;
  source: SourceLocation;
}

/** An OpenAPI operation, including OAS 3.1 webhooks. */
export interface RequestResponseOperation extends OperationBase {
  kind: "request-response";
  method: HttpMethod;
  /**
   * Operation-level parameters only. Parameters shared by every operation at this
   * address stay on the `Endpoint`; whether to merge the two lists for display is
   * the renderer's call, because the two are shown differently by different sites.
   */
  parameters: Parameter[];
  /** Nodes already projected with View "request". */
  requestBody?: { required: boolean; docs: Docs; content: MediaVariant[] };
  /** Nodes already projected with View "response". */
  responses: RestResponse[];
  /**
   * OAS callbacks: an out-of-band request the server makes back to the caller.
   * Structurally just more endpoints, so they are modelled as such.
   */
  callbacks: Endpoint[];
  links: Link[];
  /** True for OAS 3.1 `webhooks` entries, which have no path of their own. */
  isWebhook: boolean;
}

/**
 * An AsyncAPI 3.x operation, or one half of a 2.x publish/subscribe pair.
 *
 * Keeping operations distinct from channels is what makes 3.x `reply`
 * representable; folding messages into the channel would lose it.
 */
export interface MessageOperation extends OperationBase {
  kind: "message";
  /** Always the API consumer's point of view, whatever the source dialect said. */
  direction: Direction;
  messages: WsMessage[];
  /** AsyncAPI 3.x request/reply. */
  reply?: {
    /** Where the reply arrives, when it differs from the operation's own channel. */
    address?: string;
    channel?: string;
    messages: WsMessage[];
  };
}

export type Operation = RequestResponseOperation | MessageOperation;

/**
 * An address you can talk to: an OpenAPI Path Item or an AsyncAPI Channel.
 *
 * Unifying the two gives one navigation model, one grouping function and one
 * anchor scheme across a docs site that has both a REST and a WebSocket API.
 */
export interface Endpoint {
  /** Source key. For AsyncAPI 3.x this is the channel id, which may differ from `address`. */
  id: string;
  slug: string;
  /** "/v2/jobs/{id}" (OAS path) or "/v2" (AsyncAPI 3.x address / 2.x channel key). */
  address: string;
  addressKind: "path" | "channel";
  /** ["https"] for REST, ["wss"] for a WebSocket channel. From the resolved servers. */
  protocols: string[];
  docs: Docs;
  /** Shared by every operation here: OAS path-level params, AsyncAPI channel params. */
  parameters: Parameter[];
  /** Ids into `ApiIR.servers`. Empty means every server. */
  servers: string[];
  operations: Operation[];
  bindings?: Bindings;
  source: SourceLocation;
}

// ─────────────────────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────────────────────

export interface Provenance {
  dialect: "openapi" | "asyncapi" | "jsonschema";
  /** As declared by the source document, e.g. "3.1.0". */
  dialectVersion: string;
  /**
   * Logical document names, matching `SourceLocation.document`. Caller-supplied
   * and stable: these end up in every `TypeId` and therefore in every URL, so
   * they must never be derived from absolute filesystem paths.
   */
  documents: string[];
}

export interface ApiIR {
  irVersion: 1;
  info: ApiInfo;
  servers: Server[];
  securitySchemes: Record<string, SecurityScheme>;
  /** Source order preserved. This is the navigation. */
  tags: TagDef[];
  endpoints: Endpoint[];
  /** Document-level default, applied to operations whose own `security` is empty. */
  security: SecurityRequirements;
  /** Project-wide, so documents sharing a schema share one entry. */
  schemas: TypeRegistry;
  diagnostics: Diagnostic[];
  provenance: Provenance;
}
