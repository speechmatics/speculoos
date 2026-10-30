/**
 * What the renderer puts on the page.
 *
 * The interesting assertions are the structural ones — no dangling anchor, the
 * two layouts showing the same fields, the two AsyncAPI versions rendering the
 * same page. Those are the ones that would catch an IR that only looked right
 * because React happened to paper over it.
 */

import { type ApiIR, allOperations, apiEntries, entryExamples, type OperationEntry } from "@speculoos/core";
import { beforeAll, describe, expect, it } from "vitest";
import {
  renderApi,
  renderEndpoint,
  renderEndpointById,
  renderEntry,
  renderEntryExamples,
  renderNav,
  renderOperation,
  renderOperationById,
  renderSchema,
  renderType,
} from "../src/index.js";
import { anchorsIn, idsIn, pathsIn, restIR, wsIR } from "./ir.js";

let rest: ApiIR;
let ws: ApiIR;

beforeAll(async () => {
  rest = await restIR();
  ws = await wsIR("realtime-v3.yaml");
});

describe("anchors", () => {
  it("leaves no same-page link without a target", () => {
    // The whole point of rendering the type sections. A link with nothing
    // behind it is the failure mode a static renderer falls into first.
    const html = renderApi(rest);
    const ids = new Set(idsIn(html));
    const dangling = [...new Set(anchorsIn(html))].filter((a) => !ids.has(a));
    expect(dangling).toEqual([]);
  });

  it("leaves no dangling anchor for the AsyncAPI document either", () => {
    const html = renderApi(ws);
    const ids = new Set(idsIn(html));
    expect([...new Set(anchorsIn(html))].filter((a) => !ids.has(a))).toEqual([]);
  });

  it("takes anchors from the IR's slugs, never deriving them", () => {
    const html = renderApi(rest);
    const ids = new Set(idsIn(html));
    for (const { operation } of allOperations(rest)) expect(ids.has(operation.slug)).toBe(true);
    for (const def of Object.values(rest.schemas)) expect(ids.has(def.slug)).toBe(true);
  });

  it("namespaces ids with idPrefix without touching the IR's slugs", () => {
    const html = renderApi(rest, { idPrefix: "v2-" });
    expect(idsIn(html).every((id) => id.startsWith("v2-"))).toBe(true);
  });

  it("routes every link through href", () => {
    const html = renderApi(rest, { href: (t) => `/docs/${t.kind}` });
    expect(anchorsIn(html)).toEqual([]);
    expect(html).toContain('href="/docs/type"');
    expect(html).toContain('href="/docs/operation"');
  });

  it("drops a link whose href resolves to nothing, keeping the label", () => {
    const html = renderApi(rest, { href: () => undefined });
    expect(html).not.toContain("<a ");
    expect(html).toContain("Job");
  });
});

describe("escaping", () => {
  it("escapes spec text into element content", () => {
    const hostile: ApiIR = {
      ...rest,
      info: { ...rest.info, title: "</h2><script>alert(1)</script>" },
    };
    const html = renderApi(hostile);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes spec text into attributes", () => {
    const hostile: ApiIR = {
      ...rest,
      endpoints: rest.endpoints.map((e) => ({
        ...e,
        operations: e.operations.map((o) => ({ ...o, slug: '" onload="alert(1)' })),
      })),
    };
    const html = renderApi(hostile);
    expect(html).not.toContain('onload="alert(1)"');
    expect(html).toContain("&quot;");
  });
});

describe("markdown", () => {
  it("does not render markdown by default", () => {
    const withMd: ApiIR = {
      ...rest,
      info: { ...rest.info, description: "# Heading\n\n**bold**" },
    };
    const html = renderApi(withMd);
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("<strong>");
    expect(html).toContain("# Heading");
  });

  it("writes whatever renderMarkdown returns, verbatim", () => {
    const withMd: ApiIR = { ...rest, info: { ...rest.info, description: "hello" } };
    const html = renderApi(withMd, { renderMarkdown: (md) => `<p data-md>${md}</p>` });
    expect(html).toContain("<p data-md>hello</p>");
  });
});

describe("layout", () => {
  it("shows the same fields whether nested or flat", () => {
    // `toTree` and `toRows` disagreeing would mean one layout silently hides
    // fields, which is the kind of bug nobody notices until a reader does.
    const tree = pathsIn(renderApi(rest, { layout: "tree" }));
    const rows = pathsIn(renderApi(rest, { layout: "rows" }));
    expect(new Set(rows)).toEqual(new Set(tree));
  });

  it("nests children only in tree layout", () => {
    expect(renderApi(rest, { layout: "tree" })).toContain("spec-field-children");
    expect(renderApi(rest, { layout: "rows" })).not.toContain("spec-field-children");
  });

  it("carries depth on every field in rows layout", () => {
    const html = renderApi(rest, { layout: "rows" });
    expect(html).toMatch(/data-depth="[1-9]/);
  });
});

describe("operations", () => {
  it("renders one operation standalone", () => {
    const entry = allOperations(rest)[0]!;
    const html = renderOperation(entry, rest);
    expect(html).toContain("spec-section--operation");
    expect(html).toContain(`id="${entry.operation.slug}"`);
  });

  it("finds an operation by id", () => {
    const entry = allOperations(rest)[0]!;
    expect(renderOperationById(entry.operation.id, rest)).toBe(renderOperation(entry, rest));
  });

  it("says so when the id is unknown", () => {
    expect(renderOperationById("nope", rest)).toContain("No operation nope");
  });

  it("shows a webhook's address and a badge, not its namespaced id", () => {
    // `Endpoint.id` namespaces webhooks as "webhook:name" so they cannot
    // collide with a path. That is identity, not a label.
    const hook = allOperations(rest).find((e) => e.operation.kind === "request-response" && e.operation.isWebhook);
    expect(hook, "the batch fixture declares a webhook").toBeDefined();
    const html = renderOperation(hook!, rest);
    expect(html).not.toContain("webhook:");
    expect(html).toContain(hook!.endpoint.address);
    expect(html).toContain("spec-badge--note");
  });

  it("says which method a method badge is, not only that it is one", () => {
    const html = renderOperationById("listJobs", rest);
    expect(html).toContain('<span class="spec-badge spec-badge--method" data-value="get">GET</span>');
    expect(html).toContain('class="spec-badge spec-badge--status" data-value="200"');
    const first = allOperations(ws)[0]!;
    expect(renderOperation(first, ws)).toMatch(/spec-badge--direction" data-value="(client-sends|server-sends)"/);
  });

  it("starts headings at the requested level and counts down", () => {
    const entry = allOperations(rest)[0]!;
    const html = renderOperation(entry, rest, { level: 3 });
    expect(html).toContain("<h3");
    expect(html).not.toContain("<h2");
  });

  it("clamps heading levels at h6 rather than emitting h7", () => {
    const html = renderApi(rest, { headingLevel: 5 });
    expect(html).not.toMatch(/<h[7-9]/);
    expect(html).toContain("<h6");
  });
});

describe("types", () => {
  it("lifts an allOf ancestor above the table when the root row is dropped", () => {
    // The regression that cost a composed type its "extends BaseConfig" link in
    // the React renderer. Checked here too because the lifting now lives in
    // core and both renderers depend on it.
    const composed = Object.values(rest.schemas).find(
      (d) => d.node.kind === "object" && d.node.composedFrom.length > 0,
    );
    expect(composed, "the batch fixture composes a type with allOf").toBeDefined();
    const html = renderType(composed!, rest);
    expect(html).toContain("spec-extends");
    expect(html.indexOf("spec-extends")).toBeLessThan(html.indexOf("spec-fields"));
  });

  it("renders a schema on its own", () => {
    const def = Object.values(rest.schemas)[0]!;
    expect(renderSchema(def.node, rest)).toContain("spec-schema");
  });

  it("links a type back to the types that reference it", () => {
    const referenced = Object.values(rest.schemas).find((d) => d.referencedBy.length > 0);
    expect(referenced).toBeDefined();
    expect(renderType(referenced!, rest)).toContain("spec-referenced-by");
  });

  it("omits the type sections when asked, and then has dangling links", () => {
    // Stated as a test because it is the one way to misuse this API: the option
    // exists for sites that render types on their own page.
    const html = renderApi(rest, { includeTypes: false });
    expect(html).not.toContain("spec-section--types");
    const ids = new Set(idsIn(html));
    expect(anchorsIn(html).some((a) => !ids.has(a))).toBe(true);
  });
});

describe("endpoints", () => {
  const count = (html: string, needle: string) => html.split(needle).length - 1;
  const asText = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  it("heads a channel with its address and shows what it shares once", () => {
    const html = renderEndpointById("/v2/{language}", ws);
    expect(html).toMatch(/^<section class="spec-section spec-section--endpoint" id="v2-language"/);
    // The channel's own description, which no page showed before.
    expect(html).toContain("The transcription socket.");
    expect(count(html, "Address parameters")).toBe(1);
    expect(count(html, 'data-value="wss"')).toBe(1);
  });

  it("renders a message's summary as markdown", () => {
    expect(renderEndpointById("/v2/{language}", ws)).toContain('<div class="spec-markdown">Begin a session.</div>');
  });

  it("gives each message an anchored section straight under its operation, without a discriminator badge", () => {
    const html = renderEndpointById("/v2/{language}", ws);
    expect(html).toContain(
      '<section class="spec-section spec-section--message" id="start-recognition" data-level="4">',
    );
    expect(html).not.toContain("spec-section--messages");
    expect(html).not.toContain("spec-group--message");
    expect(html).not.toContain('spec-badge--constraint">&quot;StartRecognition&quot;');
  });

  it("heads a channel with the full URL when one server applies", () => {
    expect(renderEndpointById("/v2/{language}", ws)).toContain(">wss://eu2.rt.example.com/v2/v2/{language}</code>");
  });

  it("heads a channel's operations by what the reader does", () => {
    const text = asText(renderEndpointById("/v2/{language}", ws));
    expect(text).toContain("Send client → server Messages the client sends.");
    expect(text).toContain("Receive server → client Messages the server sends.");
  });

  it("does not repeat a path's address or shared parameters in each operation", () => {
    const html = renderEndpointById("/jobs", rest);
    expect(count(html, ">/jobs</code>")).toBe(1);
    expect(count(html, `data-key="X-Request-Id"`)).toBe(1);
  });

  it("renders each operation once, REST ones standing alone and channel ones inside their channel", () => {
    const html = renderApi(rest);
    for (const { operation } of allOperations(rest)) expect(count(html, `id="${operation.slug}"`)).toBe(1);
    expect(html).not.toContain("spec-section--tag");
  });

  it("still groups by tag when asked", () => {
    expect(renderApi(rest, { groupBy: "tag" })).toContain("spec-section--tag");
  });

  it("links the nav to each REST operation, and to each channel once", () => {
    const restNav = renderNav(rest);
    expect(restNav).toContain('href="#list-jobs"');
    expect(restNav).not.toContain('href="#jobs"');
    const wsNav = renderNav(ws);
    expect(wsNav).toContain('class="spec-link spec-link--endpoint" href="#v2-language"');
    expect(asText(wsNav).trim()).toBe("WSS /v2/{language}");
  });

  it("renders an entry as its page body", () => {
    const [first] = apiEntries(rest);
    expect(renderEntry(first!, rest)).toBe(renderOperation(first as OperationEntry, rest));
    const channel = apiEntries(ws)[0]!;
    expect(renderEntry(channel, ws)).toBe(renderEndpoint(channel.endpoint, ws));
  });

  it("leaves a reply-only address out of the page and the nav, but renders it by id", async () => {
    const reply = await wsIR("reply-v3.yaml");
    // `pong` exists only for `ping`'s reply to land on, and the reply is shown
    // inside `ping`. A section of its own would say "No operations".
    expect(renderApi(reply)).not.toContain('id="pong"');
    expect(renderApi(reply)).toContain("Reply on /pong");
    expect(renderNav(reply)).not.toContain("/pong</code></a>");
    expect(renderEndpointById("pong", reply)).toContain("No operations");
  });

  it("finds an endpoint by id, and says so when it cannot", () => {
    const endpoint = rest.endpoints[0]!;
    expect(renderEndpointById(endpoint.id, rest)).toBe(renderEndpoint(endpoint, rest));
    expect(renderEndpointById("nope", rest)).toContain("No endpoint nope");
  });
});

describe("navigation", () => {
  it("groups by tag in the document's own order", () => {
    const html = renderNav(rest, { groupBy: "tag" });
    const order = rest.tags.map((t) => html.indexOf(t.name)).filter((i) => i >= 0);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("lists every operation when told not to group", () => {
    const html = renderNav(rest, { groupBy: "none" });
    expect((html.match(/<li /g) ?? []).length).toBe(allOperations(rest).length);
  });
});

describe("legible without CSS", () => {
  /** The page as a reader mode or a text browser would see it. */
  const asText = (html: string): string =>
    html
      .replace(/<[^>]+>/g, "")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ");

  it("separates a field's name, type and constraints", () => {
    // Adjacent inline elements with no whitespace render flush together:
    // `limitintegerdefault: 20`. The stylesheet hides it behind a flex gap,
    // which is why this is asserted against the text and not the markup.
    const text = asText(renderApi(rest));
    expect(text).toContain("limit integer");
    expect(text).not.toContain("limitinteger");
  });

  it("separates a server's url from its protocol", () => {
    const text = asText(renderApi(rest));
    expect(text).not.toMatch(/example\.com\/v2https/);
  });

  it("separates an operation's method from its address", () => {
    const text = asText(renderOperationById("listJobs", rest));
    expect(text).toMatch(/GET https:\/\/asr\.api\.example\.com\/v2\/jobs/);
  });

  it("separates a nav entry's method from its title", () => {
    expect(asText(renderNav(rest))).toContain("GET List jobs");
  });

  it("separates a heading's title from its subtitle", () => {
    const text = asText(renderApi(rest));
    expect(text).toContain("List jobs GET");
    expect(text).not.toContain("List jobsGET");
  });

  it("says 'deprecated' in words, not only in a class", () => {
    const deprecated = allOperations(rest).find((e) => e.operation.deprecated);
    expect(deprecated, "the batch fixture deprecates an operation").toBeDefined();
    const html = renderOperation(deprecated!, rest);
    expect(html).toContain("spec-section--deprecated");
    // The class is for the stylesheet. The word is for the reader.
    expect(asText(html)).toContain("deprecated");
  });
});

describe("determinism", () => {
  it("renders byte-identically across runs", () => {
    expect(renderApi(rest)).toBe(renderApi(rest));
  });
});

describe("renderEntryExamples", () => {
  const asText = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
  const channel = () => apiEntries(ws).find((e) => e.kind === "channel")!;

  it("gathers an entry's examples into one section, each labelled by what it is of", () => {
    const html = renderEntryExamples(channel(), ws);
    expect(html).toContain('<section class="spec-section spec-section--examples" data-level="2">');
    expect(html).toContain('<div class="spec-group spec-group--examples" data-count="1">');
    expect(html).toContain('id="start-recognition-example-0"');
    expect(asText(html)).toContain("Send Start recognition · minimal");
  });

  it("shows the examples it is given, in the order given", () => {
    const one = entryExamples(channel())[0]!;
    const all = [one, { ...one, id: "second" }];
    const html = renderEntryExamples(channel(), ws, { examples: [...all].reverse() });
    const ids = [...html.matchAll(/class="spec-group-item" id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual([...all].reverse().map((e) => e.id));
  });

  it("is empty for an entry with no examples", () => {
    expect(renderEntryExamples({ ...channel(), endpoint: { ...channel().endpoint, operations: [] } }, ws)).toBe("");
  });

  it("leaves examples out from under their payloads when inlineExamples is off", () => {
    expect(renderEntry(channel(), ws)).toContain("spec-group--example");
    expect(renderEntry(channel(), ws, { inlineExamples: false })).not.toContain("spec-group--example");
  });
});

describe("handshake", () => {
  it("opens a WebSocket channel with its upgrade request and how to authenticate", () => {
    const html = renderEndpointById("/v2/{language}", ws);
    expect(html).toContain("spec-section spec-section--handshake");
    expect(html).toContain('id="v2-language-handshake"');
    expect(html).toContain(">wss://eu2.rt.example.com/v2/v2/{language}</code>");
    expect(html).toContain(">Authorization: Bearer &lt;token&gt;</code>");
    expect(html.slice(html.indexOf("spec-section--handshake"), html.indexOf("Authentication"))).toContain(
      "Production endpoint.",
    );
    expect(html.indexOf("spec-section--handshake")).toBeLessThan(html.indexOf("spec-section--operation"));
  });

  it("is not shown for a REST path", () => {
    expect(renderEndpointById("/jobs", rest)).not.toContain("spec-section--handshake");
  });
});

describe("handshakeExtras", () => {
  it("ends a channel's Handshake section with the page's own HTML", () => {
    const channel = apiEntries(ws).find((e) => e.kind === "channel")!;
    const html = renderEntry(channel, ws, { handshakeExtras: "<aside>retry advice</aside>" });
    const handshake = html.slice(html.indexOf("spec-section--handshake"), html.indexOf("spec-section--operation"));
    expect(handshake).toContain("<aside>retry advice</aside>");
  });

  it("is ignored where there is no handshake", () => {
    const op = apiEntries(rest).find((e) => e.kind === "operation")!;
    expect(renderEntry(op, rest, { handshakeExtras: "<aside>x</aside>" })).not.toContain("<aside>");
  });
});
