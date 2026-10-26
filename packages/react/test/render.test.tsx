import { beforeAll, describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { specDir } from "@speculoos/fixtures";
import { load } from "@speculoos/loader";
import { buildOpenApi } from "@speculoos/openapi";
import { buildAsyncApi } from "@speculoos/asyncapi";
import type { ApiIR, TypeDef } from "@speculoos/core";
import {
  Operation,
  OperationList,
  SchemaTable,
  SpeculoosProvider,
  TypeSections,
  type Components,
  type SpeculoosOptions,
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

function render(
  ui: ReactNode,
  ir: ApiIR,
  components: Components = boxy,
  options?: SpeculoosOptions,
): string {
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
    const html = render(
      <SchemaTable typeId="batch#/components/schemas/TranscriptionConfig" />,
      rest,
    );
    expect(html).toContain("extends");
    expect(html).toContain('data-href="#base-config"');
    // The plain "extends BaseConfig" chip must not appear alongside the link.
    expect(html).not.toContain("<x-badge data-tone=\"constraint\">extends");
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
  it("renders the method, the path and the operation's own slug as an anchor", () => {
    const html = render(<Operation id="listJobs" />, rest);
    expect(html).toContain('<x-badge data-tone="method">GET</x-badge>');
    expect(html).toContain("<x-code>/jobs</x-code>");
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

  it("tabs over the messages on a channel", () => {
    const first = ws.endpoints.flatMap((e) => e.operations)[0]!;
    const html = render(<Operation id={first.id} />, ws);
    expect(html).toContain('<x-tabs data-kind="message">');
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
    expect(html.indexOf("<x-title>Jobs</x-title>")).toBeLessThan(
      html.indexOf("<x-title>Other</x-title>"),
    );
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

describe("the provider", () => {
  it("says what is wrong when a component is used outside it", () => {
    expect(() => renderToStaticMarkup(<SchemaTable typeId="x" />)).toThrow(
      /inside a <SpeculoosProvider>/,
    );
  });
});
