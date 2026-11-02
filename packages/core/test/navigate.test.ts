import { describe, expect, it } from "vitest";
import {
  allOperations,
  apiEntries,
  createSlugger,
  endpointHandshake,
  endpointUrl,
  entryExamples,
  entrySlug,
  groupByTag,
  groupMediaVariants,
  securityUsage,
  slugify,
  toRows,
  walk,
} from "../src/index.js";
import { ir, jobRef, schemas } from "./fixture.js";

describe("apiEntries", () => {
  it("makes each REST operation an entry, and each channel one entry holding its operations", () => {
    const entries = apiEntries(ir);
    for (const endpoint of ir.endpoints) {
      const mine = entries.filter((e) => e.endpoint === endpoint);
      if (endpoint.operations.length === 0) expect(mine).toEqual([]);
      else if (endpoint.addressKind === "channel") expect(mine.map((e) => e.kind)).toEqual(["channel"]);
      else
        expect(mine.map((e) => e.kind === "operation" && e.operation.id)).toEqual(endpoint.operations.map((o) => o.id));
    }
    expect(entries.some((e) => e.kind === "channel")).toBe(true);
    expect(entries.some((e) => e.kind === "operation")).toBe(true);
  });

  it("anchors an entry at its operation's slug, or its channel's", () => {
    for (const entry of apiEntries(ir)) {
      expect(entrySlug(entry)).toBe(entry.kind === "operation" ? entry.operation.slug : entry.endpoint.slug);
    }
  });
});

describe("groupByTag", () => {
  it("preserves declared tag order and buckets untagged operations last", () => {
    const groups = groupByTag(ir);
    expect(groups.map((g) => g.tag.name)).toEqual(["Jobs", "Realtime", "Other"]);
    expect(groups[2]?.entries.map((e) => e.operation.id)).toEqual(["listJobs"]);
  });

  it("pairs each operation with its endpoint, because an operation has no address", () => {
    const [jobs] = groupByTag(ir);
    const entry = jobs?.entries[0];
    expect(entry?.endpoint.address).toBe("/v2/jobs");
    expect(entry?.operation.kind).toBe("request-response");
  });

  it("spans REST and WebSocket operations in one nav tree", () => {
    const kinds = allOperations(ir).map((e) => e.operation.kind);
    expect(kinds).toEqual(["request-response", "request-response", "message"]);
  });
});

describe("walk", () => {
  it("visits every node without following refs", () => {
    const seen: string[] = [];
    walk(schemas["demo#/components/schemas/Job"]!.node, (_n, path) => seen.push(path.join("/")));
    expect(seen).toContain("config");
    expect(seen).toContain("metadata/[value]");
    // `tree` is a ref; walking into it would not terminate.
    expect(seen).not.toContain("tree/children");
  });

  it("terminates on the recursive type", () => {
    const seen: unknown[] = [];
    walk(schemas["demo#/components/schemas/TreeNode"]!.node, (n) => seen.push(n));
    expect(seen.length).toBeGreaterThan(0);
  });
});

describe("slugs", () => {
  it("produces URL-safe anchors from type names", () => {
    expect(slugify("TranscriptionConfig")).toBe("transcription-config");
    expect(slugify("GET /v2/jobs/{id}")).toBe("get-v2-jobs-id");
    expect(slugify("...")).toBe("x");
  });

  it("breaks collisions deterministically, which per-type slugging cannot", () => {
    const slug = createSlugger();
    expect(["Job", "Job", "job"].map(slug)).toEqual(["job", "job-2", "job-3"]);
  });
});

describe("the IR round-trips as JSON", () => {
  it("survives serialisation unchanged", () => {
    expect(JSON.parse(JSON.stringify(ir))).toEqual(ir);
  });

  it("is referentially stable — two builds of one tree match", () => {
    expect(toRows(jobRef, ir, { expandRefs: "always" })).toEqual(toRows(jobRef, ir, { expandRefs: "always" }));
  });
});

describe("endpointUrl", () => {
  const server = (id: string, url: string) => ({
    id,
    url,
    protocol: "wss",
    docs: {},
    variables: [],
    security: [],
    source: { document: "d", pointer: "#" },
  });

  it("joins the one applicable server's URL and the address", () => {
    const one = { servers: [server("eu", "wss://eu.example.com/v2")] };
    expect(endpointUrl({ address: "/", servers: [], operations: [] }, one)).toBe("wss://eu.example.com/v2/");
    expect(
      endpointUrl({ address: "/jobs", servers: [], operations: [] }, { servers: [server("a", "https://x.com/")] }),
    ).toBe("https://x.com/jobs");
    expect(endpointUrl({ address: "ws", servers: [], operations: [] }, one)).toBe("wss://eu.example.com/v2/ws");
  });

  it("has no URL for a webhook, which the reader serves rather than calls", () => {
    const path = ir.endpoints.find((e) => e.operations.some((o) => o.kind === "request-response"))!;
    const hook = {
      ...path,
      address: "jobFinished",
      operations: path.operations.map((o) => (o.kind === "request-response" ? { ...o, isWebhook: true } : o)),
    };
    expect(endpointUrl(path, { servers: [server("a", "https://x.com")] })).toBe(`https://x.com${path.address}`);
    expect(endpointUrl(hook, { servers: [server("a", "https://x.com")] })).toBeUndefined();
  });

  it("narrows to the endpoint's own servers, and gives up on more than one", () => {
    const two = { servers: [server("eu", "wss://eu.example.com"), server("us", "wss://us.example.com")] };
    expect(endpointUrl({ address: "/", servers: ["us"], operations: [] }, two)).toBe("wss://us.example.com/");
    expect(endpointUrl({ address: "/", servers: [], operations: [] }, two)).toBeUndefined();
    expect(endpointUrl({ address: "/", servers: [], operations: [] }, { servers: [] })).toBeUndefined();
  });
});

describe("entryExamples", () => {
  it("gathers a channel's message examples in page order, replies after what they answer", () => {
    const channel = apiEntries(ir).find((e) => e.kind === "channel")!;
    const op = channel.endpoint.operations[0]!;
    if (op.kind !== "message") throw new Error("expected a message operation");
    const message = { ...op.messages[0]!, slug: "message", examples: [{ name: "hello", payload: { type: "hi" } }] };
    const withExamples = {
      ...channel,
      endpoint: {
        ...channel.endpoint,
        operations: [{ ...op, messages: [message], reply: { messages: [{ ...message, slug: "reply" }] } }],
      },
    };
    expect(
      entryExamples(withExamples).map((e) => [e.id, e.name, e.value, e.of.kind === "message" && e.of.reply]),
    ).toEqual([
      ["message-example-0", "hello", { type: "hi" }, false],
      ["reply-example-0", "hello", { type: "hi" }, true],
    ]);
  });

  it("gathers a REST operation's request examples, then its responses'", () => {
    const entry = apiEntries(ir).find(
      (e) => e.kind === "operation" && e.operation.kind === "request-response" && e.operation.requestBody,
    )!;
    if (entry.kind !== "operation" || entry.operation.kind !== "request-response") throw new Error("expected REST");
    const op = entry.operation;
    const ex = { name: "one", value: 1 };
    const withExamples = {
      ...entry,
      operation: {
        ...op,
        requestBody: { ...op.requestBody!, content: op.requestBody!.content.map((v) => ({ ...v, examples: [ex] })) },
        responses: op.responses.map((r) => ({ ...r, content: r.content.map((v) => ({ ...v, examples: [ex] })) })),
      },
    };
    const kinds = entryExamples(withExamples).map((e) => e.of.kind);
    expect(kinds[0]).toBe("request");
    expect(kinds.slice(1).every((k) => k === "response")).toBe(true);
    expect(new Set(entryExamples(withExamples).map((e) => e.id)).size).toBe(kinds.length);
  });
});

describe("endpointHandshake", () => {
  const channel = () => apiEntries(ir).find((e) => e.kind === "channel")!.endpoint;
  const server = {
    id: "eu",
    url: "wss://eu.example.com/v2",
    protocol: "wss",
    docs: {},
    variables: [],
    security: [[{ scheme: "bearer", scopes: [] }], [{ scheme: "jwt", scopes: [] }]],
    source: { document: "d", pointer: "#" },
  };

  it("describes a WebSocket channel's upgrade: GET, the URL, the servers' security", () => {
    const ch = { ...channel(), protocols: ["wss"], servers: [], address: "/" };
    const h = endpointHandshake(ch, { servers: [server] });
    expect(h).toEqual({
      // Anchored after its channel, so a page's prose can link to it.
      slug: `${ch.slug}-handshake`,
      method: "GET",
      url: "wss://eu.example.com/v2/",
      security: server.security,
    });
  });

  it("carries the server's description when exactly one server applies", () => {
    const described = { ...server, docs: { description: "Routes to the nearest region." } };
    const one = endpointHandshake({ ...channel(), protocols: ["wss"], servers: [] }, { servers: [described] });
    expect(one?.docs?.description).toBe("Routes to the nearest region.");
    const two = endpointHandshake(
      { ...channel(), protocols: ["wss"], servers: [] },
      { servers: [described, { ...described, id: "us" }] },
    );
    expect(two?.docs).toBeUndefined();
  });

  it("takes the method from the channel's ws binding", () => {
    const h = endpointHandshake(
      { ...channel(), protocols: ["wss"], servers: [], bindings: { ws: { method: "post" } } },
      { servers: [server] },
    );
    expect(h?.method).toBe("POST");
  });

  it("has nothing to say about a channel that is not a WebSocket, or a REST path", () => {
    expect(endpointHandshake({ ...channel(), protocols: ["kafka"] }, { servers: [server] })).toBeUndefined();
    const path = ir.endpoints.find((e) => e.addressKind === "path")!;
    expect(endpointHandshake(path, { servers: [server] })).toBeUndefined();
  });
});

describe("securityUsage", () => {
  const base = { id: "x", docs: {}, source: { document: "d", pointer: "#" } };
  it("spells how each kind of credential is sent", () => {
    expect(securityUsage({ ...base, kind: "http", scheme: "bearer" })).toBe("Authorization: Bearer <token>");
    expect(securityUsage({ ...base, kind: "apiKey", name: "jwt", in: "query" })).toBe("?jwt=<key>");
    expect(securityUsage({ ...base, kind: "apiKey", name: "X-Key", in: "header" })).toBe("X-Key: <key>");
    expect(securityUsage({ ...base, kind: "openIdConnect", openIdConnectUrl: "https://x" })).toBeUndefined();
  });
});

describe("groupMediaVariants", () => {
  const node = { kind: "any", source: { document: "d", pointer: "#" }, docs: {}, nullable: false } as const;
  const v = (mediaType: string, examples: { value: unknown }[] = []) => ({
    mediaType,
    node,
    view: "response" as const,
    examples,
  });

  it("groups media types with the same schema, keeping first-seen order", () => {
    const text = { ...node, kind: "string", constraints: {} } as const;
    const groups = groupMediaVariants([
      v("application/json"),
      { ...v("text/plain"), node: text },
      v("application/vnd.x+json"),
    ]);
    expect(groups.map((g) => g.mediaTypes)).toEqual([["application/json", "application/vnd.x+json"], ["text/plain"]]);
  });

  it("ignores where in the spec each schema came from", () => {
    const elsewhere = {
      ...v("application/vnd.x+json"),
      node: { ...node, source: { document: "d", pointer: "#/elsewhere" } },
    };
    expect(groupMediaVariants([v("application/json"), elsewhere]).map((g) => g.mediaTypes)).toEqual([
      ["application/json", "application/vnd.x+json"],
    ]);
  });

  it("gives a group the examples of all its media types, once each", () => {
    const [group] = groupMediaVariants([
      v("application/json", [{ value: 1 }]),
      v("application/vnd.x+json", [{ value: 1 }, { value: 2 }]),
    ]);
    expect(group?.variant.examples).toEqual([{ value: 1 }, { value: 2 }]);
  });
});
