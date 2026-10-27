/**
 * Testing a map, which is not testing the renderer.
 *
 * `@speculoos/react`'s tests prove it emits no markup. A map is supposed to
 * emit markup, so what is worth asserting here is that it renders every
 * fixture without throwing or warning, that its rows never nest, and that it
 * uses the heading levels it was given.
 *
 * Note what the warning check cannot see: server rendering reports missing
 * keys and unknown props, but does not validate DOM nesting — that only
 * happens in react-dom's client. A `<tr>` inside a `<tr>` renders silently
 * here, which is why it has an explicit structural test of its own.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Theme } from "@radix-ui/themes";
import { specDir } from "@speculoos/fixtures";
import { load } from "@speculoos/loader";
import { buildOpenApi } from "@speculoos/openapi";
import { buildAsyncApi } from "@speculoos/asyncapi";
import { allOperations, apiEntries, type ApiIR } from "@speculoos/core";
import {
  Endpoint,
  EntryExamples,
  EntryList,
  Operation,
  OperationList,
  SchemaTable,
  SpeculoosProvider,
  TypeSections,
  type Components,
  type MarkdownProps,
  type SpeculoosOptions,
} from "@speculoos/react";
import { DEFAULT_COLORS, radixThemes } from "../src/index.js";

/** A stand-in that shows the source, as the fake maps do. Not a sanitiser. */
const Markdown = ({ children }: MarkdownProps) => <div data-md="">{children}</div>;

const FIXTURES = [
  ["batch.yaml", "openapi"],
  ["realtime-v2.yaml", "asyncapi"],
  ["realtime-v3.yaml", "asyncapi"],
  ["reply-v3.yaml", "asyncapi"],
  ["avro-v3.yaml", "asyncapi"],
] as const;

const irs = new Map<string, ApiIR>();

beforeAll(async () => {
  for (const [file, dialect] of FIXTURES) {
    const project = await load({ root: specDir, documents: [{ name: "x", path: file }] });
    irs.set(file, dialect === "openapi" ? buildOpenApi({ project }) : buildAsyncApi({ project }));
  }
});

function ir(file: string): ApiIR {
  const found = irs.get(file);
  if (found === undefined) throw new Error(`no fixture ${file}`);
  return found;
}

function render(ui: ReactNode, api: ApiIR, components: Components, options?: SpeculoosOptions): string {
  return renderToStaticMarkup(
    <Theme>
      <SpeculoosProvider ir={api} components={components} {...(options ? { options } : {})}>
        {ui}
      </SpeculoosProvider>
    </Theme>,
  );
}

const everything = (api: ApiIR) => (
  <>
    <EntryList />
    {api.endpoints.map((endpoint) => (
      <Endpoint key={endpoint.id} endpoint={endpoint} />
    ))}
    <OperationList />
    {allOperations(api).map(({ endpoint, operation }) => (
      <Operation key={`${endpoint.id}:${operation.id}`} endpoint={endpoint} operation={operation} />
    ))}
    <TypeSections />
  </>
);

let errors: unknown[][];
beforeEach(() => {
  errors = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("renders every fixture", () => {
  for (const layout of ["tree", "rows"] as const) {
    for (const [file] of FIXTURES) {
      it(`${file}, layout: ${layout} — without a React warning`, () => {
        const html = render(everything(ir(file)), ir(file), radixThemes({ markdown: Markdown }), { layout });
        expect(html.length).toBeGreaterThan(0);
        // Missing keys and unknown props are reported through console.error
        // and never throw. (Nesting is not — see the next test.)
        expect(errors.map((args) => String(args[0]))).toEqual([]);
      });
    }
  }
});

describe("field rows in tree layout", () => {
  it("returns nested rows as siblings, never a field list inside a field list", () => {
    const html = render(everything(ir("batch.yaml")), ir("batch.yaml"), radixThemes({ markdown: Markdown }), {
      layout: "tree",
      expandRefs: "always",
    });
    // Nested rows are indented siblings. A <dl> opened inside another would
    // mean the map nested them — and indented them twice.
    let open = 0;
    for (const [tag] of html.matchAll(/<\/?dl\b/g)) {
      open += tag === "<dl" ? 1 : -1;
      expect(open).toBeLessThanOrEqual(1);
    }
    expect(open).toBe(0);
    expect(html).toMatch(/padding-left:var\(--space-[1-9]\)/); // and something was indented
  });

  it("shows the same rows in both layouts", () => {
    const keys = (layout: "tree" | "rows") =>
      [
        ...render(everything(ir("batch.yaml")), ir("batch.yaml"), radixThemes({ markdown: Markdown }), {
          layout,
        }).matchAll(/data-key="([^"]*)"/g),
      ].map((m) => m[1]);
    expect(keys("tree")).toEqual(keys("rows"));
  });
});

describe("messages", () => {
  const messageOp = () => {
    const api = ir("realtime-v3.yaml");
    const withTwo = allOperations(api).find(
      (e) => e.operation.kind === "message" && e.operation.messages.length > 1,
    );
    if (withTwo === undefined) throw new Error("the realtime fixture has an operation with two messages");
    return render(<Operation id={withTwo.operation.id} />, api, radixThemes({ markdown: Markdown }));
  };

  it("gives each message a card of its own, headed one level down and anchored", () => {
    const html = messageOp();
    expect(html).toMatch(/<section data-kind="message" id="start-recognition" class="[^"]*rt-Card[^"]*"><div[^>]*><h3 [^>]*>Start recognition<\/h3>/);
    expect(html).not.toContain('role="tablist" aria-orientation="horizontal" data-kind="message"');
  });

  it("no longer says 'or' between them: they are a vocabulary, not alternatives", () => {
    const text = messageOp().replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(text).not.toMatch(/ or /);
  });

  it("still tabs media types, statuses and examples", () => {
    const html = render(<Operation id="createJob" />, ir("batch.yaml"), radixThemes({ markdown: Markdown }));
    expect(html).toContain('role="tablist"');
  });
});

describe("headings", () => {
  const headings = (html: string) => [...html.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));

  it("uses the level it is given, not a hard-coded one", () => {
    const map = radixThemes({ markdown: Markdown });
    expect(headings(render(<Operation id="listJobs" />, ir("batch.yaml"), map, { headingLevel: 2 }))[0]).toBe(2);
    expect(headings(render(<Operation id="listJobs" />, ir("batch.yaml"), map, { headingLevel: 4 }))[0]).toBe(4);
  });

  it("descends inside an operation", () => {
    const levels = headings(render(<Operation id="listJobs" />, ir("batch.yaml"), radixThemes({ markdown: Markdown })));
    expect(levels[0]).toBe(2);
    expect(levels.slice(1).every((l) => l > 2)).toBe(true);
  });

  it("clamps at h6", () => {
    const html = render(<Operation id="listJobs" />, ir("batch.yaml"), radixThemes({ markdown: Markdown }), {
      headingLevel: 6,
    });
    expect(headings(html).every((l) => l <= 6)).toBe(true);
  });
});

describe("badges", () => {
  it("colours a method by which method it is", () => {
    const html = render(<Operation id="listJobs" />, ir("batch.yaml"), radixThemes({ markdown: Markdown }));
    expect(html).toMatch(new RegExp(`data-accent-color="${DEFAULT_COLORS.method.get}"[^>]*>GET<`));
  });

  it("takes colour overrides entry by entry", () => {
    const map = radixThemes({ markdown: Markdown, colors: { method: { get: "teal" } } });
    const html = render(<Operation id="listJobs" />, ir("batch.yaml"), map);
    expect(html).toMatch(/data-accent-color="teal"[^>]*>GET</);
    // An override replaces one entry, not the table.
    expect(html).toMatch(new RegExp(`data-accent-color="${DEFAULT_COLORS.status["2xx"]}"[^>]*>200<`));
  });
});

describe("links", () => {
  it("routes internal links through linkAs and leaves external ones alone", () => {
    const RouterLink = ({ href, children }: { href: string; children: ReactNode }) => (
      <a href={href} data-router="">
        {children}
      </a>
    );
    const html = render(everything(ir("batch.yaml")), ir("batch.yaml"), radixThemes({ markdown: Markdown, linkAs: RouterLink }));
    expect(html).toMatch(/<a[^>]*data-router=""[^>]*href="#|<a[^>]*href="#[^"]*"[^>]*data-router=""/);
    expect(html).not.toMatch(/<a[^>]*href="https?:[^"]*"[^>]*data-router/);
  });
});

describe("replacement", () => {
  it("is a spread, with no API for it", () => {
    const Badge = ({ children }: { children: ReactNode }) => <mark>{children}</mark>;
    const html = render(<Operation id="listJobs" />, ir("batch.yaml"), { ...radixThemes({ markdown: Markdown }), Badge });
    expect(html).toContain("<mark>GET</mark>");
  });
});

describe("field rows", () => {
  const createJob = (options = {}) =>
    render(<Operation id="createJob" />, ir("batch.yaml"), radixThemes({ markdown: Markdown }), options);

  // Each row's label only: the request body's own "required" stays a badge, in its heading.
  const labelsOf = (html: string) => html.split("rt-DataListLabel").slice(1).map((c) => c.slice(0, c.indexOf("</dt>")));

  it("marks optional fields by default, in text on the name's line, and leaves required ones quiet", () => {
    const labels = labelsOf(createJob());
    expect(labels.some((l) => /<span[^>]*rt-Text[^>]*>optional<\/span>/.test(l))).toBe(true);
    expect(labels.some((l) => />required</.test(l))).toBe(false);
  });

  it("marks required fields instead with presence: required, never as a badge", () => {
    const html = render(<Operation id="createJob" />, ir("batch.yaml"), radixThemes({ markdown: Markdown, presence: "required" }));
    const labels = labelsOf(html);
    expect(labels.some((l) => /<span[^>]*rt-Text[^>]*>required<\/span>/.test(l))).toBe(true);
    expect(labels.some((l) => /rt-Badge[^>]*>required</.test(l))).toBe(false);
    expect(labels.some((l) => />optional</.test(l))).toBe(false);
  });

  it("collapses nested rows behind a toggle that says how many there are", () => {
    const html = createJob({ expandRefs: "always" });
    expect(html).toMatch(/aria-expanded="false"[^>]*><span aria-hidden="true">▸<\/span>Show \d+ (properties|property|options?)<\/button>/);
    expect(html).toMatch(/<div id="[^"]+" style="display:none">/);
  });

  it("offers no toggle when nothing is nested", () => {
    expect(render(<Operation id="listJobs" />, ir("batch.yaml"), radixThemes({ markdown: Markdown }), { layout: "rows" })).not.toContain("aria-expanded");
  });
});

describe("messageExtras", () => {
  it("renders inside each message's card, given the IR message", () => {
    const Extras = ({ message }: { message: { name: string } }) => <aside data-extra={message.name} />;
    const html = render(
      <Endpoint id="/v2/{language}" />,
      ir("realtime-v3.yaml"),
      radixThemes({ markdown: Markdown, messageExtras: Extras }),
    );
    expect(html).toMatch(/rt-Card[^]*?<aside data-extra="StartRecognition"><\/aside>/);
  });
});

describe("direction badges", () => {
  it("carry an arrow — up for what the reader sends, down for what they receive", () => {
    const html = render(<Endpoint id="/v2/{language}" />, ir("realtime-v3.yaml"), radixThemes({ markdown: Markdown }));
    // The arrow is all that shows: the label is for screen readers, and the tooltip.
    expect(html).toMatch(/data-radius="full"[^>]*><span aria-hidden="true">↑<\/span><span[^>]*>client → server<\/span>/);
    expect(html).toMatch(/data-radius="full"[^>]*><span aria-hidden="true">↓<\/span><span[^>]*>server → client<\/span>/);
  });
});

describe("snapshots", () => {
  it("one REST path", () => {
    expect(render(<Endpoint id="/jobs" />, ir("batch.yaml"), radixThemes({ markdown: Markdown }))).toMatchSnapshot();
  });

  it("one channel", () => {
    expect(
      render(<Endpoint id="/v2/{language}" />, ir("realtime-v3.yaml"), radixThemes({ markdown: Markdown })),
    ).toMatchSnapshot();
  });
});

describe("fieldLayout", () => {
  const labels = (html: string) => html.split("rt-DataListLabel").slice(1).map((c) => c.slice(0, c.indexOf("</dt>")));
  const job = (fieldLayout?: "columns" | "vertical" | "stacked") =>
    render(<Operation id="createJob" />, ir("batch.yaml"), radixThemes({ markdown: Markdown, ...(fieldLayout ? { fieldLayout } : {}) }));

  it("is stacked by default", () => {
    expect(job()).toBe(job("stacked"));
  });

  it("columns sits side by side from sm", () => {
    expect(job("columns")).toContain("rt-r-orientation-vertical sm:rt-r-orientation-horizontal");
  });

  it("vertical always stacks, the type still under the name", () => {
    const html = job("vertical");
    expect(html).not.toContain("sm:rt-r-orientation-horizontal");
    // The name's line holds the name only; the type is in the value below.
    expect(labels(html).every((l) => (l.match(/rt-Code/g) ?? []).length <= 1)).toBe(true);
  });

  it("stacked puts the type on the name's line, with a rule between fields", () => {
    const html = job("stacked");
    expect(html).not.toContain("sm:rt-r-orientation-horizontal");
    expect(labels(html).some((l) => (l.match(/rt-Code/g) ?? []).length >= 2)).toBe(true);
    expect(html).toContain("border-top:1px solid var(--gray-a4)");
  });
});

describe("rows with no name", () => {
  it("are headed by their type, not a dash: an enum's documented values read as a list", () => {
    const source = { document: "d", pointer: "#" };
    const status = {
      kind: "enum" as const, source, docs: {}, nullable: false, baseType: "string" as const,
      members: [{ value: "ok", docs: { description: "Fine." } }, { value: "busy", docs: { description: "Later." } }],
    };
    const node = {
      kind: "object" as const, source, docs: {}, nullable: false, additional: { kind: "any" as const },
      patternProperties: [], constraints: {}, composedFrom: [],
      properties: [{ name: "status", node: status, required: false, readOnly: false, writeOnly: false, deprecated: false, docs: {} }],
    };
    const html = render(<SchemaTable node={node} />, ir("batch.yaml"), radixThemes({ markdown: Markdown }));
    const labels = html.split("rt-DataListLabel").slice(1).map((c) => c.slice(0, c.indexOf("</dt>")));
    expect(labels.some((l) => l.includes("—"))).toBe(false);
    expect(labels.some((l) => l.includes("&quot;ok&quot;"))).toBe(true);
  });
});

describe("gathered examples", () => {
  it("lists each example as a row that opens in place, not as tabs", () => {
    const api = ir("realtime-v3.yaml");
    const channel = apiEntries(api).find((e) => e.kind === "channel")!;
    const html = render(<EntryExamples entry={channel} />, api, radixThemes({ markdown: Markdown }));
    expect(html).toMatch(/data-kind="examples"/);
    expect(html).not.toContain('role="tablist"');
    expect(html).toMatch(/<button type="button" aria-expanded="false" aria-controls="start-recognition-example-0-body"/);
    expect(html).toMatch(/<div id="start-recognition-example-0-body" hidden=""/);
  });
});

describe("handshake", () => {
  it("is a card, like a message: the connection as one unit before the first message", () => {
    const html = render(<Endpoint id="/v2/{language}" />, ir("realtime-v3.yaml"), radixThemes({ markdown: Markdown }));
    expect(html).toMatch(/<section data-kind="handshake" class="[^"]*rt-Card[^"]*">/);
  });
});

describe("headings inside cards", () => {
  it("keep the card's title the largest: the handshake's sections step down", () => {
    const html = render(<Endpoint id="/v2/{language}" />, ir("realtime-v3.yaml"), radixThemes({ markdown: Markdown }));
    // The card ends where the channel's own Address parameters begin.
    const start = html.indexOf('data-kind="handshake"');
    const card = html.slice(start, html.indexOf('data-kind="parameters"', start));
    const sizes = [...card.matchAll(/rt-Heading rt-r-size-(\d)/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(1);
    expect(sizes[0]).toBe(5); // Handshake
    expect(sizes.slice(1).every((s) => s < 5)).toBe(true); // Authentication, …
  });
});

describe("security alternatives", () => {
  it("stack like field rows: a rule above each, the scheme and its usage inline, the description below", () => {
    const html = render(<Endpoint id="/v2/{language}" />, ir("realtime-v3.yaml"), radixThemes({ markdown: Markdown }));
    const from = html.indexOf('data-kind="security"', html.indexOf("Authentication"));
    const list = html.slice(from, html.indexOf("</ul>", from));
    expect(list).toMatch(/<li style="border-top:1px solid var\(--gray-a4\)"[^>]*><span[^>]*rt-Badge[^>]*>bearer<\/span> <code[^>]*>Authorization: Bearer &lt;token&gt;<\/code><div data-md="">A JWT.<\/div><\/li>/);
  });
});
