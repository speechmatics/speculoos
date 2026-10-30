import { buildAsyncApi } from "@speculoos/asyncapi";
import { type ApiIR, apiEntries, entryExamples, type TypeDef } from "@speculoos/core";
import { specDir } from "@speculoos/fixtures";
import { load } from "@speculoos/loader";
import { buildOpenApi } from "@speculoos/openapi";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Components,
  Endpoint,
  Entry,
  EntryExamples,
  EntryList,
  Operation,
  OperationList,
  SchemaTable,
  type SpeculoosOptions,
  SpeculoosProvider,
  TypeSections,
} from "../src/index.js";
import { boxy, terse } from "./fake.js";

let rest: ApiIR;
let ws: ApiIR;

beforeAll(async () => {
  const batch = await load({ root: specDir, documents: [{ name: "batch", path: "batch.yaml" }] });
  rest = buildOpenApi({ project: batch });
  const realtime = await load({
    root: specDir,
    documents: [{ name: "rt", path: "realtime-v3.yaml" }],
  });
  ws = buildAsyncApi({ project: realtime });
});

function render(ui: ReactNode, ir: ApiIR, components: Components = boxy, options?: SpeculoosOptions): string {
  return renderToStaticMarkup(
    <SpeculoosProvider ir={ir} components={components} {...(options ? { options } : {})}>
      {ui}
    </SpeculoosProvider>,
  );
}

/** Every tag name that appears in a rendered string. */
const tagsIn = (html: string): string[] => [
  ...new Set([...html.matchAll(/<\/?([a-zA-Z][\w-]*)/g)].map((m) => m[1] as string)),
];

describe("the package contributes no markup of its own", () => {
  it("emits only elements the component map produced", () => {
    const html = render(
      <>
        <OperationList />
        <Operation id="createJob" />
        <TypeSections />
      </>,
      rest,
    );
    expect(html.length).toBeGreaterThan(1000);
    expect(tagsIn(html).filter((t) => !t.startsWith("x-"))).toEqual([]);
  });

  it("emits no class or style attributes", () => {
    const html = render(<Operation id="createJob" />, rest);
    expect(html).not.toMatch(/\sclass=/);
    expect(html).not.toMatch(/\sstyle=/);
  });

  it("hands markdown over raw, and does not render or sanitise it", () => {
    const tainted: ApiIR = {
      ...rest,
      schemas: {
        ...rest.schemas,
        ["batch#/components/schemas/JobStatus"]: {
          ...(rest.schemas["batch#/components/schemas/JobStatus"] as TypeDef),
          docs: { description: "**bold** <script>alert(1)</script>" },
        },
      },
    };
    const html = render(<TypeSections />, tainted);
    // Escaped by React, not by us, and still bearing its original markup.
    expect(html).toContain("<x-md>**bold** &lt;script&gt;alert(1)&lt;/script&gt;</x-md>");
    expect(html).not.toContain("<strong>");
  });
});

describe("the same IR drives unrelated component maps", () => {
  it("renders the same fields through two libraries with nothing in common", () => {
    const a = render(<Operation id="createJob" />, rest, boxy);
    const b = render(<Operation id="createJob" />, rest, terse);
    expect(tagsIn(a).every((t) => t.startsWith("x-"))).toBe(true);
    expect(tagsIn(b).every((t) => t.startsWith("y-"))).toBe(true);
    for (const name of ["config", "status", "secret", "tags"]) {
      expect(a).toContain(`>${name}<`);
      expect(b).toContain(`>${name}<`);
    }
  });
});

describe("SchemaTable", () => {
  const jobId = "batch#/components/schemas/Job";

  it("drops a nameless object root and keeps the properties", () => {
    const html = render(<SchemaTable typeId={jobId} />, rest);
    expect(html).not.toMatch(/data-depth="0"/);
    expect(html).toContain(">id<");
  });

  it("links a $ref to the type's own section instead of inlining it", () => {
    const html = render(<SchemaTable typeId={jobId} />, rest);
    expect(html).toContain('data-href="#job-status"');
    expect(html).not.toContain(">running<"); // JobStatus's members stay in its own section
  });

  it("renders allOf ancestors as links rather than bare chips", () => {
    const html = render(<SchemaTable typeId="batch#/components/schemas/TranscriptionConfig" />, rest);
    expect(html).toContain("extends");
    expect(html).toContain('data-href="#base-config"');
    // The plain "extends BaseConfig" chip must not appear alongside the link.
    expect(html).not.toContain('<x-badge data-tone="constraint">extends');
  });

  it("says a field is nullable once, in its type", () => {
    const source = { document: "d", pointer: "#" };
    const node = {
      kind: "object" as const,
      source,
      docs: {},
      nullable: false,
      additional: { kind: "any" as const },
      patternProperties: [],
      constraints: {},
      composedFrom: [],
      properties: [
        {
          name: "name",
          required: false,
          readOnly: false,
          writeOnly: false,
          deprecated: false,
          docs: {},
          node: { kind: "string" as const, source, docs: {}, nullable: true, constraints: {} },
        },
      ],
    };
    const html = render(<SchemaTable node={node} />, rest);
    expect(html).toContain("string | null");
    expect(html).not.toContain("nullable");
  });

  it("asks every row to show its nested rows open when expanded", () => {
    const html = render(<SchemaTable typeId={jobId} expandRefs="always" expanded />, rest);
    expect(html).toContain("<x-children>");
    expect(html.match(/<x-row /g)?.length).toBe(html.match(/<x-row [^>]*data-expanded/g)?.length);
    expect(render(<SchemaTable typeId={jobId} expandRefs="always" />, rest)).not.toContain("data-expanded");
  });

  it("terminates on a self-referential type when told to expand everything", () => {
    const html = render(<SchemaTable typeId={jobId} expandRefs="always" />, rest);
    expect(html).toContain("recursive");
  });

  it("flattens to depth-carrying rows when the layout says so", () => {
    const nested = render(<SchemaTable typeId={jobId} expandRefs="always" />, rest);
    const flat = render(<SchemaTable typeId={jobId} expandRefs="always" />, rest, boxy, {
      layout: "rows",
    });
    expect(nested).toContain("<x-children>");
    expect(flat).not.toContain("<x-children>");
    expect(flat).toMatch(/data-depth="2"/);
  });

  it("shows an unresolved reference on the page, not only in diagnostics", () => {
    const broken: ApiIR = { ...rest, schemas: { ...rest.schemas } };
    delete broken.schemas["batch#/components/schemas/JobStatus"];
    const html = render(<SchemaTable typeId="batch#/components/schemas/Job" />, broken);
    expect(html).toContain("unresolved reference");
  });

  it("falls back to Empty for a type that is not there", () => {
    const html = render(<SchemaTable typeId="nope" empty="nothing here" />, rest);
    expect(html).toBe("<x-empty>nothing here</x-empty>");
  });
});

describe("request and response views", () => {
  it("hides readOnly fields from a request body behind a $ref", () => {
    const html = render(<Operation id="createJob" />, rest);
    const request = html.slice(html.indexOf('data-kind="request"'), html.indexOf('data-kind="response"'));
    expect(request).toContain(">secret<");
    expect(request).not.toContain(">id<");
  });

  it("hides writeOnly fields from a response behind a $ref", () => {
    const html = render(<Operation id="createJob" />, rest);
    const response = html.slice(html.indexOf('data-kind="response"'));
    expect(response).toContain(">id<");
    expect(response).not.toContain(">secret<");
  });
});

describe("Operation", () => {
  it("gives media types carrying the same thing one tab, labelled with both", () => {
    const aliased: ApiIR = {
      ...rest,
      endpoints: rest.endpoints.map((e) => ({
        ...e,
        operations: e.operations.map((o) =>
          o.kind !== "request-response"
            ? o
            : {
                ...o,
                responses: o.responses.map((r) => ({
                  ...r,
                  content: r.content.flatMap((v) =>
                    v.mediaType === "application/json" ? [v, { ...v, mediaType: "application/vnd.x+json" }] : [v],
                  ),
                })),
              },
        ),
      })),
    };
    const html = render(<Operation id="listJobs" />, aliased);
    expect(html).toContain(
      '<x-label><x-badge data-tone="mediaType">application/json</x-badge> <x-badge data-tone="mediaType">application/vnd.x+json</x-badge></x-label>',
    );
  });

  it("presents authentication as the handshake does: each way in, how to send it, what it is", () => {
    const html = render(<Operation id="listJobs" />, rest);
    expect(html).toContain('<x-section data-kind="security" data-level="3"><x-title>Authentication</x-title>');
    expect(html).not.toContain("<x-title>Security</x-title>");
  });

  it("renders the method, the full URL and the operation's own slug as an anchor", () => {
    const html = render(<Operation id="listJobs" />, rest);
    expect(html).toContain('<x-badge data-tone="method">GET</x-badge>');
    expect(html).toContain("<x-code>https://asr.api.example.com/v2/jobs</x-code>");
    expect(html).toContain('id="list-jobs"');
  });

  it("groups parameters by where they go, merging the endpoint's own", () => {
    const html = render(<Operation id="listJobs" />, rest);
    expect(html).toContain("Query parameters");
    expect(html).toContain("Header parameters");
    expect(html).toContain(">limit<");
    expect(html).toContain(">X-Request-Id<"); // declared on the endpoint, not the operation
  });

  it("tabs over media types and keeps each variant's own view", () => {
    const html = render(<Operation id="createJob" />, rest);
    expect(html).toContain('data-id="createJob-request-application/json"');
    expect(html).toContain('data-id="createJob-request-multipart/form-data"');
  });

  it("tabs over response statuses and renders their headers", () => {
    const html = render(<Operation id="listJobs" />, rest);
    expect(html).toContain('<x-badge data-tone="status">200</x-badge>');
    expect(html).toContain(">X-Total-Count<");
  });

  it("shows the document's security when the operation declares none", () => {
    const html = render(<Operation id="listJobs" />, rest);
    // Not "bearer (bearer)": a scheme named after its own kind reads like a bug.
    expect(html).toContain('<x-badge data-tone="securityScheme">bearer</x-badge>');
  });

  it("names the credential kind when it differs from the scheme's name", () => {
    const withOauth: ApiIR = {
      ...rest,
      security: [[{ scheme: "oauth", scopes: ["jobs:read"] }]],
    };
    expect(render(<Operation id="listJobs" />, withOauth)).toContain("oauth (oauth2): jobs:read");
  });

  it("marks a deprecated operation", () => {
    expect(render(<Operation id="getJob" />, rest)).toContain("<x-deprecated>deprecated</x-deprecated>");
  });

  it("renders links to other operations", () => {
    const html = render(<Operation id="createJob" />, rest);
    expect(html).toContain("GetJob");
    expect(html).toContain('data-href="#get-job"');
  });

  it("shows a webhook by name, because it has no path", () => {
    const html = render(<Operation id="jobFinished" />, rest);
    expect(html).toContain("<x-code>jobFinished</x-code>");
  });

  it("falls back to Empty for an unknown id", () => {
    expect(render(<Operation id="nope" />, rest)).toContain("<x-empty>No operation nope</x-empty>");
  });

  it("tells a badge which value it shows, so a map need not parse its text", () => {
    // `tone: "method"` cannot say GET from DELETE. A map colouring by method
    // would otherwise be reading `children` as a string.
    const valued: Components = {
      ...boxy,
      Badge: ({ tone, value, children }) => (
        <x-badge data-tone={tone} {...(value !== undefined ? { "data-value": value } : {})}>
          {children}
        </x-badge>
      ),
    };
    const html = render(<Operation id="listJobs" />, rest, valued);
    expect(html).toContain('<x-badge data-tone="method" data-value="get">GET</x-badge>');
    expect(html).toContain('<x-badge data-tone="status" data-value="200">200</x-badge>');
    expect(html).toContain('<x-badge data-tone="securityScheme" data-value="bearer">bearer</x-badge>');

    const first = ws.endpoints.flatMap((e) => e.operations)[0]!;
    expect(render(<Operation id={first.id} />, ws, valued)).toMatch(
      /<x-badge data-tone="direction" data-value="(client-sends|server-sends)">/,
    );
  });
});

describe("message operations", () => {
  it("renders the normalised direction, not the dialect's own wording", () => {
    const html = render(<OperationList />, ws);
    expect(html).toContain("client → server");
    expect(html).not.toMatch(/publish|subscribe/);
  });

  it("calls a channel's parameters address parameters, not path parameters", () => {
    const first = ws.endpoints.flatMap((e) => e.operations)[0]!;
    const html = render(<Operation id={first.id} />, ws);
    expect(html).toContain("Address parameters");
    expect(html).not.toContain("Path parameters");
  });

  it("renders a message's summary as markdown, because that is often where its prose is", () => {
    const html = render(<Endpoint id="/v2/{language}" />, ws);
    expect(html).toContain("<x-md>Begin a session.</x-md>");
  });

  it("hands a message's section its message, for maps that read the spec's own extensions", () => {
    const seen: string[] = [];
    const spy: Components = {
      ...boxy,
      Section: (props) => {
        if (props.kind === "message") seen.push(props.message?.name ?? "none");
        const Section = boxy.Section;
        return <Section {...props} />;
      },
    };
    render(<Endpoint id="/v2/{language}" />, ws, spy);
    expect(seen).toContain("StartRecognition");
    expect(seen).not.toContain("none");
  });

  it("gives each message a section of its own, anchored, straight under its operation", () => {
    const first = ws.endpoints.flatMap((e) => e.operations)[0]!;
    const html = render(<Operation id={first.id} level={2} />, ws);
    expect(html).toContain(
      '<x-section data-kind="message" data-level="3" id="start-recognition"><x-title>Start recognition</x-title>',
    );
    expect(html).not.toContain('data-kind="messages"');
    expect(html).not.toContain('<x-tabs data-kind="message">');
  });

  it("does not badge the discriminating const, which the payload already shows", () => {
    const html = render(<Endpoint id="/v2/{language}" />, ws);
    expect(html).not.toContain('<x-badge data-tone="constraint">&quot;StartRecognition&quot;</x-badge>');
    expect(html).toContain("<x-code>&quot;StartRecognition&quot;</x-code>");
  });

  it("renders both AsyncAPI versions of one API identically", async () => {
    const v2 = buildAsyncApi({
      project: await load({ root: specDir, documents: [{ name: "rt", path: "realtime-v2.yaml" }] }),
    });
    const page = (ir: ApiIR) =>
      render(
        <>
          <OperationList />
          <TypeSections />
        </>,
        ir,
      );
    expect(page(v2)).toBe(page(ws));
  });
});

describe("OperationList", () => {
  it("groups under the document's tags in declared order", () => {
    const html = render(<OperationList />, rest);
    expect(html.indexOf("<x-title>Jobs</x-title>")).toBeLessThan(html.indexOf("<x-title>Other</x-title>"));
    expect(html).toContain('data-href="#create-job"');
  });

  it("separates a label's method, path and title with spaces, not only with layout", () => {
    // The label sits inside a Link, which is inline: no map can gap its parts.
    const text = render(<OperationList />, rest).replace(/<[^>]+>/g, "");
    expect(text).toContain("GET /jobs List jobs");
    expect(text).toContain("POST webhook jobFinished");
  });

  it("renames the untagged bucket when asked", () => {
    const html = render(<OperationList />, rest, boxy, { untaggedLabel: "Webhooks" });
    expect(html).toContain("<x-title>Webhooks</x-title>");
  });
});

describe("options", () => {
  it("routes every link through a caller-supplied href", () => {
    const html = render(
      <>
        <OperationList />
        <SchemaTable typeId="batch#/components/schemas/Job" />
      </>,
      rest,
      boxy,
      {
        href: (target) =>
          target.kind === "operation"
            ? `/api/${target.id}`
            : target.kind === "type"
              ? `/types/${target.def?.slug ?? target.id}`
              : undefined,
      },
    );
    expect(html).toContain('data-href="/api/createJob"');
    expect(html).toContain('data-href="/types/job-status"');
    expect(html).not.toContain('data-href="#');
  });

  it("counts heading levels down from the one it was given", () => {
    const html = render(<Operation id="listJobs" level={3} />, rest);
    expect(html).toContain('data-kind="operation" data-level="3"');
    expect(html).toContain('data-kind="parameters" data-level="4"');
  });

  it("respects a maxDepth budget", () => {
    const shallow = render(<SchemaTable typeId="batch#/components/schemas/Job" />, rest, boxy, {
      expandRefs: "depth",
      maxDepth: 1,
    });
    expect(shallow).toContain('data-href="#transcription-config"');
  });
});

describe("Endpoint", () => {
  const count = (html: string, needle: string) => html.split(needle).length - 1;
  const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  it("heads a channel with its address and shows what it shares once", () => {
    const html = render(<Endpoint id="/v2/{language}" />, ws);
    expect(html).toContain(
      '<x-section data-kind="endpoint" data-level="2" id="v2-language"><x-title><x-code>/v2/{language}</x-code>',
    );
    // The channel's own description. Before <Endpoint> nothing rendered it.
    expect(html).toContain("<x-md>The transcription socket.</x-md>");
    expect(count(html, "Address parameters")).toBe(1);
    expect(count(html, ">WSS</x-badge>")).toBe(1);
  });

  it("heads a titled channel by its title, with protocol and URL beside like a method and path", () => {
    const titled: ApiIR = {
      ...ws,
      endpoints: ws.endpoints.map((e) => ({ ...e, docs: { ...e.docs, title: "Realtime" } })),
    };
    const html = render(<Endpoint id="/v2/{language}" />, titled);
    expect(html).toContain(
      '<x-title>Realtime</x-title><x-subtitle><x-badge data-tone="protocol">WSS</x-badge> <x-code>wss://eu2.rt.example.com/v2/v2/{language}</x-code></x-subtitle>',
    );
  });

  it("falls back to the address when more than one server applies", () => {
    const two: ApiIR = {
      ...ws,
      servers: [...ws.servers, { ...ws.servers[0]!, id: "other", url: "wss://us.example.com" }],
      endpoints: ws.endpoints.map((e) => ({ ...e, docs: { ...e.docs, title: "Realtime" } })),
    };
    expect(render(<Endpoint id="/v2/{language}" />, two)).toContain(
      '<x-badge data-tone="protocol">WSS</x-badge> <x-code>/v2/{language}</x-code></x-subtitle>',
    );
  });

  it("heads a channel's operations by what the reader does, with the title beside", () => {
    const t = text(render(<Endpoint id="/v2/{language}" />, ws));
    expect(t).toContain("Send client → server Messages the client sends.");
    expect(t).toContain("Receive server → client Messages the server sends.");
  });

  it("heads a path's operations by their titles, without repeating the path", () => {
    const html = render(<Endpoint id="/jobs" />, rest);
    expect(count(html, "<x-code>/jobs</x-code>")).toBe(1);
    expect(html).toContain('<x-title>List jobs</x-title><x-subtitle><x-badge data-tone="method">GET</x-badge>');
    // A path-level header parameter, shown once on the endpoint rather than in
    // each of its two operations.
    expect(count(html, ">X-Request-Id<")).toBe(1);
  });

  it("nests operation headings one level below the endpoint", () => {
    const html = render(<Endpoint id="/jobs" />, rest, boxy, { headingLevel: 3 });
    expect(html).toMatch(/data-kind="endpoint" data-level="3"/);
    expect(html).toMatch(/data-kind="operation" data-level="4" id="list-jobs"/);
  });

  it("covers every operation exactly once across every endpoint", () => {
    for (const ir of [rest, ws]) {
      const html = render(
        ir.endpoints.map((e) => <Endpoint key={e.id} endpoint={e} />),
        ir,
      );
      for (const e of ir.endpoints) for (const o of e.operations) expect(count(html, `id="${o.slug}"`)).toBe(1);
    }
  });

  it("leaves a standalone Operation as it was, address and shared parameters included", () => {
    const html = render(<Operation id="listJobs" />, rest);
    expect(html).toContain("<x-code>https://asr.api.example.com/v2/jobs</x-code>");
    expect(html).toContain(">X-Request-Id<");
  });

  it("falls back to Empty for an unknown id", () => {
    expect(render(<Endpoint id="nope" />, rest)).toContain("<x-empty>No endpoint nope</x-empty>");
  });
});

describe("EntryList", () => {
  const text = (html: string) =>
    html
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  it("lists each REST operation as its own entry, method then summary", () => {
    const html = render(<EntryList />, rest);
    expect(text(html)).toContain("GET List jobs POST Create a job");
    expect(html).toContain('data-href="#list-jobs"');
    expect(html).toContain('data-href="#create-job"');
  });

  it("falls back to the path when an operation has no summary", () => {
    expect(text(render(<EntryList />, rest))).toContain("GET /jobs/{id}");
  });

  it("lists a channel once, its protocol standing where a method would", () => {
    const html = render(<EntryList />, ws);
    expect(text(html)).toBe("WSS /v2/{language}");
    expect(html).toContain('<x-badge data-tone="protocol">WSS</x-badge>');
    expect(html).toContain('data-href="#v2-language"');
  });

  it("leaves out a reply-only channel, which the operation expecting the reply already names", async () => {
    const reply = buildAsyncApi({
      project: await load({ root: specDir, documents: [{ name: "rt", path: "reply-v3.yaml" }] }),
    });
    expect(render(<EntryList />, reply)).not.toContain("/pong");
    expect(render(<Endpoint id="ping" />, reply)).toContain("Reply on /pong");
    expect(render(<Endpoint id="pong" />, reply)).toContain("<x-empty>No operations</x-empty>");
  });
});

describe("Entry", () => {
  it("renders a REST entry as its operation, standing alone", () => {
    const entry = {
      kind: "operation" as const,
      endpoint: rest.endpoints[0]!,
      operation: rest.endpoints[0]!.operations[0]!,
    };
    expect(render(<Entry entry={entry} />, rest)).toBe(
      render(<Operation endpoint={entry.endpoint} operation={entry.operation} />, rest),
    );
  });

  it("renders a channel entry as the channel, with its send and receive", () => {
    const entry = { kind: "channel" as const, endpoint: ws.endpoints[0]! };
    const html = render(<Entry entry={entry} level={1} />, ws);
    expect(html).toBe(render(<Endpoint endpoint={entry.endpoint} level={1} />, ws));
    // The direction sits in the heading, beside the verb.
    expect(html).toContain('<x-title>Send <x-badge data-tone="direction">client → server</x-badge></x-title>');
    expect(html).toContain('<x-title>Receive <x-badge data-tone="direction">server → client</x-badge></x-title>');
  });
});

describe("the provider", () => {
  it("says what is wrong when a component is used outside it", () => {
    expect(() => renderToStaticMarkup(<SchemaTable typeId="x" />)).toThrow(/inside a <SpeculoosProvider>/);
  });
});

describe("EntryExamples", () => {
  const channel = () => apiEntries(ws).find((e) => e.kind === "channel")!;

  it("gathers an entry's examples into one section, each labelled by what it is of", () => {
    const html = render(<EntryExamples entry={channel()} level={3} />, ws);
    expect(html).toContain(
      '<x-section data-kind="examples" data-level="3"><x-title>Examples</x-title><x-tabs data-kind="examples">',
    );
    expect(html).toContain(
      '<x-tab data-id="start-recognition-example-0"><x-label><x-badge data-tone="direction">Send</x-badge> Start recognition · minimal</x-label>',
    );
  });

  it("shows the examples it is given, in the order given", () => {
    const one = entryExamples(channel())[0]!;
    const all = [one, { ...one, id: "second" }];
    const html = render(<EntryExamples entry={channel()} examples={[...all].reverse()} />, ws);
    const ids = [...html.matchAll(/<x-tab data-id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual([...all].reverse().map((e) => e.id));
  });

  it("renders nothing for an entry with no examples", () => {
    const quiet = { ...channel(), endpoint: { ...channel().endpoint, operations: [] } };
    expect(render(<EntryExamples entry={quiet} />, ws)).toBe("");
  });

  it("leaves examples out from under their payloads when inlineExamples is off", () => {
    const inline = render(<Entry entry={channel()} />, ws);
    const gathered = render(<Entry entry={channel()} />, ws, boxy, { inlineExamples: false });
    expect(inline).toContain('<x-tabs data-kind="example">');
    expect(gathered).not.toContain('data-kind="example"');
  });
});

describe("Handshake", () => {
  it("opens a WebSocket channel with its upgrade request and how to authenticate", () => {
    const html = render(<Endpoint id="/v2/{language}" />, ws);
    // Anchored after its channel, so a page's prose can link to it.
    expect(html).toContain(
      '<x-section data-kind="handshake" data-level="3" id="v2-language-handshake"><x-title>Handshake</x-title>',
    );
    expect(html).toContain(
      '<x-badge data-tone="method">GET</x-badge> <x-code>wss://eu2.rt.example.com/v2/v2/{language}</x-code>',
    );
    expect(html).toContain('<x-section data-kind="security" data-level="4"><x-title>Authentication</x-title>');
    expect(html).toContain("<x-code>Authorization: Bearer &lt;token&gt;</x-code>");
    // The one server's description: where a spec says how to pick another.
    const handshake = html.slice(html.indexOf('data-kind="handshake"'), html.indexOf("Authentication"));
    expect(handshake).toContain("Production endpoint.");
  });

  it("comes before the channel's operations", () => {
    const html = render(<Endpoint id="/v2/{language}" />, ws);
    expect(html.indexOf('data-kind="handshake"')).toBeLessThan(html.indexOf('data-kind="operation"'));
  });

  it("is not shown for a REST path", () => {
    expect(render(<Endpoint id="/jobs" />, rest)).not.toContain('data-kind="handshake"');
  });
});

describe("handshakeExtras", () => {
  it("ends the Handshake section with the page's own content", () => {
    const channel = apiEntries(ws).find((e) => e.kind === "channel")!;
    const html = render(<Entry entry={channel} handshakeExtras={<aside>retry advice</aside>} />, ws);
    const handshake = html.slice(html.indexOf('data-kind="handshake"'), html.indexOf('data-kind="operation"'));
    expect(handshake).toContain("<aside>retry advice</aside>");
    expect(handshake.indexOf("Authentication")).toBeLessThan(handshake.indexOf("<aside>"));
  });

  it("is ignored where there is no handshake", () => {
    const op = apiEntries(rest).find((e) => e.kind === "operation")!;
    expect(render(<Entry entry={op} handshakeExtras={<aside>x</aside>} />, rest)).not.toContain("<aside>");
  });
});
