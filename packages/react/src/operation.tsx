/**
 * `<Operation>` — one operation, whichever dialect it came from — and
 * `<Endpoint>`, a path or channel with every operation on it.
 *
 * The two operation shapes stay distinct all the way to the page: a
 * request/response operation has a method, a body and statuses, and a message
 * operation has a direction and a set of messages. Folding them together would
 * have meant inventing a lowest common denominator that reads like neither.
 */

import { Fragment, useMemo, type ReactNode } from "react";
import { endpointHandshake, endpointUrl, entryExamples, replyAddress, securityUsage } from "@speculoos/core";
import type {
  ApiEntry,
  ApiIR,
  EntryExample,
  Endpoint as IREndpoint,
  Example,
  MediaVariant,
  MessageOperation,
  Operation as IROperation,
  Parameter,
  RestResponse,
  SecurityRequirements,
  WsMessage,
} from "@speculoos/core";
import { useComponents, useSpeculoos } from "./context.js";
import { useEndpoint, useOperation } from "./hooks.js";
import { DocsBody, SchemaTable } from "./fields.js";
import { parametersNode, propertiesNode } from "./synth.js";
import type { Tab } from "./components.js";
import { DIRECTION_LABEL, DIRECTION_VERB } from "./labels.js";

/**
 * `in: "path"` covers both an OAS path parameter and an AsyncAPI channel address
 * parameter — the IR unifies them because they occupy the same position in a
 * reader's mental model. "Path parameters" over a WebSocket channel still reads
 * wrong, though, so the heading follows the address rather than the IR field.
 */
const PARAM_GROUPS: { in: Parameter["in"]; title: string; channelTitle?: string }[] = [
  { in: "path", title: "Path parameters", channelTitle: "Address parameters" },
  { in: "query", title: "Query parameters" },
  { in: "header", title: "Header parameters" },
  { in: "cookie", title: "Cookie parameters" },
];

/** JSON for display. Falls back to String() for anything that will not encode. */
function format(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function Examples({ examples, idPrefix }: { examples: Example[]; idPrefix: string }): ReactNode {
  const C = useComponents();
  const { options } = useSpeculoos();
  if (examples.length === 0 || !options.inlineExamples) return null;
  const tabs: Tab[] = examples.map((ex, i) => ({
    id: `${idPrefix}-example-${i}`,
    label: ex.name ?? ex.summary ?? `Example ${i + 1}`,
    content: (
      <>
        {ex.description !== undefined && <C.Markdown>{ex.description}</C.Markdown>}
        {ex.externalValue !== undefined ? (
          <C.Link
            href={ex.externalValue}
            target={{ kind: "external", url: ex.externalValue }}
          >
            {ex.externalValue}
          </C.Link>
        ) : (
          <C.CodeBlock language="json">{format(ex.value)}</C.CodeBlock>
        )}
      </>
    ),
  }));
  return <C.Tabs kind="example" tabs={tabs} />;
}

function Content({ content, idPrefix }: { content: MediaVariant[]; idPrefix: string }): ReactNode {
  const C = useComponents();
  if (content.length === 0) return null;
  const tabs: Tab[] = content.map((variant) => ({
    id: `${idPrefix}-${variant.mediaType}`,
    label: <C.Badge tone="mediaType" value={variant.mediaType}>{variant.mediaType}</C.Badge>,
    content: (
      <>
        <SchemaTable node={variant.node} view={variant.view} />
        <Examples examples={variant.examples} idPrefix={`${idPrefix}-${variant.mediaType}`} />
      </>
    ),
  }));
  return <C.Tabs kind="mediaType" tabs={tabs} />;
}

function Security({ security, level }: { security: SecurityRequirements; level: number }): ReactNode {
  const C = useComponents();
  const { ir } = useSpeculoos();
  if (security.length === 0) return null;
  return (
    <C.Section kind="security" title="Security" level={level}>
      <C.List kind="security">
        {security.map((alternative, i) => (
          <C.ListItem key={i}>
            {alternative.length === 0 ? (
              <C.Badge tone="securityScheme">optional</C.Badge>
            ) : (
              alternative.map((req) => {
                // The parenthetical says what kind of credential this is. When
                // the scheme is named after its own kind — `bearer: {scheme:
                // bearer}`, which is the common case — repeating it reads like a
                // bug, so it is left off.
                const scheme = ir.securitySchemes[req.scheme];
                const kind = scheme === undefined ? undefined
                  : scheme.kind === "http" ? scheme.scheme
                  : scheme.kind;
                const label =
                  kind === undefined || kind.toLowerCase() === req.scheme.toLowerCase()
                    ? req.scheme
                    : `${req.scheme} (${kind})`;
                return (
                  <C.Badge key={req.scheme} tone="securityScheme" value={req.scheme}>
                    {req.scopes.length === 0 ? label : `${label}: ${req.scopes.join(", ")}`}
                  </C.Badge>
                );
              })
            )}
          </C.ListItem>
        ))}
      </C.List>
    </C.Section>
  );
}

/**
 * Which parameters an operation section shows. Standing alone, it shows the
 * endpoint's as well as its own — endpoint ones first, since they are shared by
 * every operation there and a reader has probably met them already. Under an
 * `<Endpoint>`, which has shown the shared ones once, only its own.
 */
function operationParameters(endpoint: IREndpoint, operation: IROperation, nested: boolean): Parameter[] {
  const own = operation.kind === "request-response" ? operation.parameters : [];
  return nested ? own : [...endpoint.parameters, ...own];
}

function Parameters({
  endpoint,
  parameters: all,
  source,
  level,
}: {
  endpoint: IREndpoint;
  parameters: Parameter[];
  source: IROperation["source"];
  level: number;
}): ReactNode {
  const C = useComponents();
  if (all.length === 0) return null;
  return (
    <>
      {PARAM_GROUPS.map(({ in: location, title, channelTitle }) => {
        const group = all.filter((p) => p.in === location);
        if (group.length === 0) return null;
        const heading =
          endpoint.addressKind === "channel" && channelTitle !== undefined ? channelTitle : title;
        return (
          <C.Section key={location} kind="parameters" title={heading} level={level}>
            <SchemaTable
              node={parametersNode(group, source)}
              kind="parameters"
              expandRefs="always"
            />
          </C.Section>
        );
      })}
    </>
  );
}

function Responses({ responses, level, idPrefix }: {
  responses: RestResponse[];
  level: number;
  idPrefix: string;
}): ReactNode {
  const C = useComponents();
  if (responses.length === 0) return null;
  const tabs: Tab[] = responses.map((response) => ({
    id: `${idPrefix}-${response.status}`,
    label: <C.Badge tone="status" value={response.status}>{response.status}</C.Badge>,
    content: (
      <>
        <DocsBody docs={response.docs} />
        {response.headers.length > 0 && (
          <C.Section kind="response" title="Headers" level={level + 1}>
            <SchemaTable
              node={propertiesNode(response.headers, { document: "", pointer: "#" })}
              kind="headers"
              expandRefs="always"
            />
          </C.Section>
        )}
        <Content content={response.content} idPrefix={`${idPrefix}-${response.status}`} />
      </>
    ),
  }));
  return (
    <C.Section kind="response" title="Responses" level={level}>
      <C.Tabs kind="status" tabs={tabs} />
    </C.Section>
  );
}

/**
 * One message, as a section of its own: a channel's messages are its
 * vocabulary, and a reader — or the page's own prose — links to each.
 */
function Message({ message, level }: { message: WsMessage; level: number }): ReactNode {
  const C = useComponents();
  const { options } = useSpeculoos();
  return (
    <C.Section
      kind="message"
      {...(message.slug !== undefined ? { id: message.slug } : {})}
      title={message.title ?? message.name}
      level={level}
      message={message}
    >
      {/* AsyncAPI's `summary` is often where a message's real prose lives —
          paragraphs, admonitions — so it is markdown, not a title. */}
      {message.summary !== undefined && <C.Markdown>{message.summary}</C.Markdown>}
      <DocsBody docs={message.docs} />
      {/* No badge for `discriminatorValue`: it is the const field the payload
          table already shows, and it usually repeats the title too. */}
      {message.contentType !== undefined && (
        <C.Badge tone="mediaType" value={message.contentType}>{message.contentType}</C.Badge>
      )}
      <SchemaTable node={message.payload} />
      {message.headers !== undefined && (
        <C.Section kind="headers" title="Headers" level={level + 1}>
          <SchemaTable node={message.headers} kind="headers" />
        </C.Section>
      )}
      {message.examples.length > 0 && options.inlineExamples && (
        <C.Tabs
          kind="example"
          tabs={message.examples.map((ex, i) => ({
            id: `${message.id}-example-${i}`,
            label: ex.name ?? ex.summary ?? `Example ${i + 1}`,
            content: <C.CodeBlock language="json">{format(ex.payload)}</C.CodeBlock>,
          }))}
        />
      )}
    </C.Section>
  );
}

/**
 * An operation's messages sit straight under it: its heading — "Send",
 * "Receive" — already says what they are. A reply's are headed, because the
 * reply is a second set, and may arrive somewhere else.
 */
function Messages({ messages, level }: { messages: WsMessage[]; level: number }): ReactNode {
  return (
    <>
      {messages.map((message) => (
        <Message key={message.slug ?? message.id} message={message} level={level} />
      ))}
    </>
  );
}

function Reply({ reply, level }: { reply: NonNullable<MessageOperation["reply"]>; level: number }): ReactNode {
  const C = useComponents();
  const { ir } = useSpeculoos();
  if (reply.messages.length === 0) return null;
  return (
    <C.Section kind="reply" title={replyTitle(reply, ir)} level={level}>
      <Messages messages={reply.messages} level={level + 1} />
    </C.Section>
  );
}

export interface OperationProps {
  /** Operation id. Give this, or `operation` plus `endpoint`. */
  id?: string;
  operation?: IROperation;
  endpoint?: IREndpoint;
  /** Heading level for this operation's own section. Defaults to the provider's. */
  level?: number;
}

/** One operation, with everything hanging off it, including its endpoint's address and parameters. */
export function Operation(props: OperationProps): ReactNode {
  const C = useComponents();
  const { options } = useSpeculoos();
  const found = useOperation(props.id ?? "");
  const endpoint = props.endpoint ?? found?.endpoint;
  const operation = props.operation ?? found?.operation;

  if (endpoint === undefined || operation === undefined) {
    return <C.Empty>{`No operation ${props.id ?? ""}`}</C.Empty>;
  }
  return (
    <OperationSection
      endpoint={endpoint}
      operation={operation}
      level={props.level ?? options.headingLevel}
      nested={false}
    />
  );
}

/**
 * The heading and the marks beside it.
 *
 * Standing alone, an operation is headed by its title, with the method or
 * direction and the address beside it. Under an `<Endpoint>`, the address is
 * the endpoint's heading, so it is not repeated: a REST operation is headed by
 * its title (or its method), and a message operation by what the reader does —
 * "Send", "Receive" — because that is what tells a channel's operations apart.
 */
function useHeading(endpoint: IREndpoint, operation: IROperation, nested: boolean): { title: ReactNode; subtitle: ReactNode } {
  const C = useComponents();
  const mark =
    operation.kind === "request-response" ? (
      <>
        <C.Badge tone="method" value={operation.method}>{operation.method.toUpperCase()}</C.Badge>
        {/* `endpoint.id` namespaces a webhook as "webhook:name" so it cannot
            collide with a path. That is identity, not a label, so the page gets
            the address and a badge saying which it is. */}
        {operation.isWebhook && <> <C.Badge tone="note">webhook</C.Badge></>}
      </>
    ) : (
      <C.Badge tone="direction" value={operation.direction}>{DIRECTION_LABEL[operation.direction]}</C.Badge>
    );
  if (!nested) {
    return {
      title: operation.docs.title ?? operation.id,
      subtitle: (
        <>
          {mark} <C.Code>{endpoint.address}</C.Code>
        </>
      ),
    };
  }
  if (operation.kind === "request-response") {
    return { title: operation.docs.title ?? operation.method.toUpperCase(), subtitle: mark };
  }
  return {
    title: DIRECTION_VERB[operation.direction],
    subtitle: (
      <>
        {mark}
        {operation.docs.title !== undefined && <> {operation.docs.title}</>}
      </>
    ),
  };
}

function OperationSection({ endpoint, operation, level, nested }: {
  endpoint: IREndpoint;
  operation: IROperation;
  level: number;
  nested: boolean;
}): ReactNode {
  const C = useComponents();
  const { ir, options } = useSpeculoos();
  const { title, subtitle } = useHeading(endpoint, operation, nested);
  const parameters = useMemo(
    () => operationParameters(endpoint, operation, nested),
    [endpoint, operation, nested],
  );

  // An operation with no security of its own inherits the document default.
  // Showing the inherited one is the point: "which key do I send" must be
  // answerable from the operation a reader is looking at.
  const security = operation.security.length > 0 ? operation.security : ir.security;

  return (
    <C.Section
      kind="operation"
      id={operation.slug}
      title={title}
      subtitle={subtitle}
      level={level}
      deprecated={operation.deprecated}
    >
      <DocsBody docs={operation.docs} />
      {!nested && <Protocols endpoint={endpoint} />}
      <Security security={security} level={level + 1} />
      <Parameters endpoint={endpoint} parameters={parameters} source={operation.source} level={level + 1} />

      {operation.kind === "request-response" ? (
        <>
          {operation.requestBody !== undefined && (
            <C.Section
              kind="request"
              title="Request body"
              level={level + 1}
              subtitle={
                operation.requestBody.required ? (
                  <C.Badge tone="required">required</C.Badge>
                ) : undefined
              }
            >
              <DocsBody docs={operation.requestBody.docs} />
              <Content content={operation.requestBody.content} idPrefix={`${operation.id}-request`} />
            </C.Section>
          )}
          <Responses responses={operation.responses} level={level + 1} idPrefix={operation.id} />
          {operation.callbacks.length > 0 && (
            <C.Section kind="callbacks" title="Callbacks" level={level + 1}>
              {operation.callbacks.map((callback) =>
                callback.operations.map((callbackOp) => (
                  <Operation
                    key={callbackOp.id}
                    endpoint={callback}
                    operation={callbackOp}
                    level={level + 2}
                  />
                )),
              )}
            </C.Section>
          )}
          {operation.links.length > 0 && (
            <C.Section kind="links" title="Links" level={level + 1}>
              <C.List kind="links">
                {operation.links.map((link) => {
                  const target =
                    link.operationId === undefined
                      ? undefined
                      : ir.endpoints
                          .flatMap((e) => e.operations.map((o) => ({ endpoint: e, operation: o })))
                          .find((e) => e.operation.id === link.operationId);
                  const href =
                    target === undefined
                      ? undefined
                      : options.href({
                          kind: "operation",
                          id: target.operation.id,
                          operation: target.operation,
                          endpoint: target.endpoint,
                        });
                  return (
                    <C.ListItem key={link.name}>
                      {href !== undefined && target !== undefined ? (
                        <C.Link
                          href={href}
                          target={{
                            kind: "operation",
                            id: target.operation.id,
                            operation: target.operation,
                            endpoint: target.endpoint,
                          }}
                        >
                          {link.name}
                        </C.Link>
                      ) : (
                        <C.Code>{link.name}</C.Code>
                      )}
                      <DocsBody docs={link.docs} />
                      {link.parameters.map((p) => (
                        <C.Code key={p.name}>{`${p.name} = ${format(p.expression)}`}</C.Code>
                      ))}
                    </C.ListItem>
                  );
                })}
              </C.List>
            </C.Section>
          )}
        </>
      ) : (
        <>
          <Messages messages={operation.messages} level={level + 1} />
          {operation.reply !== undefined && <Reply reply={operation.reply} level={level + 1} />}
        </>
      )}
    </C.Section>
  );
}

/** "Reply on /pong", or "Reply" when it arrives on the operation's own channel. */
function replyTitle(reply: NonNullable<MessageOperation["reply"]>, ir: ApiIR): string {
  const where = replyAddress(reply, ir);
  return where === undefined ? "Reply" : `Reply on ${where}`;
}

function Protocols({ endpoint }: { endpoint: IREndpoint }): ReactNode {
  const C = useComponents();
  return (
    <>
      {endpoint.protocols.map((protocol) => (
        <C.Badge key={protocol} tone="protocol" value={protocol}>
          {protocol}
        </C.Badge>
      ))}
    </>
  );
}

/**
 * How a client opens a WebSocket channel, before any message: the upgrade
 * request and the credentials it takes. What the upgrade answers is the
 * page's to add, through `handshakeExtras`. Nothing for a REST path or a
 * non-WebSocket channel.
 */
function Handshake({ endpoint, level, extras }: { endpoint: IREndpoint; level: number; extras?: ReactNode }): ReactNode {
  const C = useComponents();
  const { ir } = useSpeculoos();
  const handshake = endpointHandshake(endpoint, ir);
  if (handshake === undefined) return null;
  return (
    <C.Section kind="handshake" title="Handshake" level={level}>
      <C.List kind="handshake">
        <C.ListItem>
          <C.Badge tone="method" value={handshake.method.toLowerCase()}>{handshake.method}</C.Badge>{" "}
          <C.Code>{handshake.url}</C.Code>
        </C.ListItem>
      </C.List>
      {handshake.docs !== undefined && <DocsBody docs={handshake.docs} />}
      <Authentication security={handshake.security} level={level + 1} />
      {extras}
    </C.Section>
  );
}

/**
 * Each way to authenticate, with how to send it and what the spec says about
 * it. Unlike an operation's `Security` badges, this is where a reader learns
 * what to put in the request — so the usage and the description are shown.
 */
function Authentication({ security, level }: { security: SecurityRequirements; level: number }): ReactNode {
  const C = useComponents();
  const { ir } = useSpeculoos();
  if (security.length === 0) return null;
  return (
    <C.Section kind="security" title="Authentication" level={level}>
      {security.length > 1 && <C.Markdown>Any one of:</C.Markdown>}
      <C.List kind="security">
        {security.map((alternative, i) => (
          <C.ListItem key={i}>
            {alternative.length === 0 ? (
              <C.Badge tone="securityScheme">none</C.Badge>
            ) : (
              alternative.map((req) => {
                const scheme = ir.securitySchemes[req.scheme];
                const usage = scheme === undefined ? undefined : securityUsage(scheme);
                return (
                  <Fragment key={req.scheme}>
                    <C.Badge tone="securityScheme" value={req.scheme}>{req.scheme}</C.Badge>
                    {usage !== undefined && <> <C.Code>{usage}</C.Code></>}
                    {scheme !== undefined && <DocsBody docs={scheme.docs} />}
                  </Fragment>
                );
              })
            )}
          </C.ListItem>
        ))}
      </C.List>
    </C.Section>
  );
}

export interface EndpointProps {
  /** Endpoint id — the path, the channel id, or "webhook:name". Give this or `endpoint`. */
  id?: string;
  endpoint?: IREndpoint;
  /** Heading level for the endpoint's own section. Defaults to the provider's. */
  level?: number;
  /**
   * The page's own content for the end of the Handshake section — what a spec
   * has no place for: the responses a failed upgrade gets, retry advice.
   * Ignored where there is no handshake.
   */
  handshakeExtras?: ReactNode;
}

/**
 * A path or channel, with every operation on it.
 *
 * The address is the heading, and what every operation there shares — the
 * protocol, the endpoint's own description, its parameters — is shown once,
 * above them, rather than repeated in each. This is the unit a site most often
 * gives a page of its own: one REST path, or one WebSocket channel with its
 * send and receive. Enumerate them with `useEndpoints()`.
 */
export function Endpoint(props: EndpointProps): ReactNode {
  const C = useComponents();
  const { ir, options } = useSpeculoos();
  const found = useEndpoint(props.id ?? "");
  const endpoint = props.endpoint ?? found;
  const level = props.level ?? options.headingLevel;

  if (endpoint === undefined) return <C.Empty>{`No endpoint ${props.id ?? ""}`}</C.Empty>;

  // Headed like a REST operation: the title when there is one, with the
  // protocol where a method would sit, then where to connect — the full URL
  // when one server applies, "WSS wss://eu.example.com/v2/", else the address.
  const webhook = endpoint.operations.some((o) => o.kind === "request-response" && o.isWebhook);
  const titled = endpoint.docs.title !== undefined;
  const url = endpointUrl(endpoint, ir);
  return (
    <C.Section
      kind="endpoint"
      id={endpoint.slug}
      title={endpoint.docs.title ?? <C.Code>{endpoint.address}</C.Code>}
      subtitle={
        <>
          {webhook && <><C.Badge tone="note">webhook</C.Badge> </>}
          {endpoint.protocols.map((protocol) => (
            <Fragment key={protocol}>
              <C.Badge tone="protocol" value={protocol}>{protocol.toUpperCase()}</C.Badge>{" "}
            </Fragment>
          ))}
          {url !== undefined ? <C.Code>{url}</C.Code> : titled && <C.Code>{endpoint.address}</C.Code>}
        </>
      }
      level={level}
    >
      <DocsBody docs={endpoint.docs} />
      <Handshake endpoint={endpoint} level={level + 1} extras={props.handshakeExtras} />
      <Parameters
        endpoint={endpoint}
        parameters={endpoint.parameters}
        source={endpoint.source}
        level={level + 1}
      />
      {endpoint.operations.length === 0 ? (
        <C.Empty>No operations</C.Empty>
      ) : (
        endpoint.operations.map((operation) => (
          <OperationSection
            key={operation.id}
            endpoint={endpoint}
            operation={operation}
            level={level + 1}
            nested
          />
        ))
      )}
    </C.Section>
  );
}

export interface EntryProps {
  /** From `useEntries()` or `apiEntries(ir)`. */
  entry: ApiEntry;
  /** Heading level for the entry's own section. Defaults to the provider's. */
  level?: number;
  /** For a channel: the page's own content for the end of its Handshake section. */
  handshakeExtras?: ReactNode;
}

/**
 * One API reference entry, as its page body: a REST operation standing alone,
 * or a channel with its send and receive. What a site renders per page.
 */
export function Entry({ entry, level, handshakeExtras }: EntryProps): ReactNode {
  const lvl = level !== undefined ? { level } : {};
  return entry.kind === "operation" ? (
    <Operation endpoint={entry.endpoint} operation={entry.operation} {...lvl} />
  ) : (
    <Endpoint endpoint={entry.endpoint} {...lvl} handshakeExtras={handshakeExtras} />
  );
}

export interface EntryExamplesProps {
  /** From `useEntries()` or `apiEntries(ir)`. */
  entry: ApiEntry;
  /** Heading level for the section. Defaults to the provider's. */
  level?: number;
  /** The section's heading. Default "Examples". */
  title?: string;
  /**
   * The examples to show, when not `entryExamples(entry)` as it stands — in
   * the order a real session runs, say, which a spec cannot express.
   */
  examples?: EntryExample[];
}

/**
 * Every example on an entry, in one place — for a panel beside the reference,
 * as Stripe and Deepgram lay theirs out. Pair it with `inlineExamples: false`
 * so they are not also shown under each payload. Renders nothing when the
 * entry has no examples.
 */
export function EntryExamples({ entry, level, title = "Examples", examples: given }: EntryExamplesProps): ReactNode {
  const C = useComponents();
  const { options } = useSpeculoos();
  const examples = useMemo(() => given ?? entryExamples(entry), [given, entry]);
  if (examples.length === 0) return null;
  return (
    <C.Section kind="examples" title={title} level={level ?? options.headingLevel}>
      <C.Tabs
        kind="examples"
        tabs={examples.map((example) => ({
          id: example.id,
          label: <ExampleLabel example={example} />,
          content: (
            <>
              {example.summary !== undefined && <C.Markdown>{example.summary}</C.Markdown>}
              {example.description !== undefined && <C.Markdown>{example.description}</C.Markdown>}
              {example.externalValue !== undefined ? (
                <C.Link href={example.externalValue} target={{ kind: "external", url: example.externalValue }}>
                  {example.externalValue}
                </C.Link>
              ) : (
                <C.CodeBlock language="json">{format(example.value)}</C.CodeBlock>
              )}
            </>
          ),
        }))}
      />
    </C.Section>
  );
}

/**
 * What an example is of, then its own name if it has one: "Send
 * StartRecognition · minimal", "Request application/json", "200 Response". The
 * summary is a sentence, so it goes with the example rather than in the label.
 */
function ExampleLabel({ example }: { example: EntryExample }): ReactNode {
  const C = useComponents();
  const own = example.name;
  const of = example.of;
  return (
    <>
      {of.kind === "message" ? (
        <>
          <C.Badge tone="direction" value={of.operation.direction}>{DIRECTION_VERB[of.operation.direction]}</C.Badge>{" "}
          {of.message.title ?? of.message.name}
        </>
      ) : of.kind === "request" ? (
        <>Request <C.Badge tone="mediaType" value={of.mediaType}>{of.mediaType}</C.Badge></>
      ) : (
        <><C.Badge tone="status" value={of.status}>{of.status}</C.Badge> Response</>
      )}
      {own !== undefined && <> · {own}</>}
    </>
  );
}
