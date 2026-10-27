import { describe, expect, it } from "vitest";
import { allOperations, apiEntries, createSlugger, endpointUrl, entrySlug, groupByTag, slugify, toRows, walk } from "../src/index.js";
import { ir, jobRef, schemas } from "./fixture.js";

describe("apiEntries", () => {
  it("makes each REST operation an entry, and each channel one entry holding its operations", () => {
    const entries = apiEntries(ir);
    for (const endpoint of ir.endpoints) {
      const mine = entries.filter((e) => e.endpoint === endpoint);
      if (endpoint.operations.length === 0) expect(mine).toEqual([]);
      else if (endpoint.addressKind === "channel") expect(mine.map((e) => e.kind)).toEqual(["channel"]);
      else expect(mine.map((e) => e.kind === "operation" && e.operation.id)).toEqual(endpoint.operations.map((o) => o.id));
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
    expect(toRows(jobRef, ir, { expandRefs: "always" })).toEqual(
      toRows(jobRef, ir, { expandRefs: "always" }),
    );
  });
});

describe("endpointUrl", () => {
  const server = (id: string, url: string) => ({
    id, url, protocol: "wss", docs: {}, variables: [], security: [], source: { document: "d", pointer: "#" },
  });

  it("joins the one applicable server's URL and the address", () => {
    const one = { servers: [server("eu", "wss://eu.example.com/v2")] };
    expect(endpointUrl({ address: "/", servers: [] }, one)).toBe("wss://eu.example.com/v2/");
    expect(endpointUrl({ address: "/jobs", servers: [] }, { servers: [server("a", "https://x.com/")] })).toBe("https://x.com/jobs");
    expect(endpointUrl({ address: "ws", servers: [] }, one)).toBe("wss://eu.example.com/v2/ws");
  });

  it("narrows to the endpoint's own servers, and gives up on more than one", () => {
    const two = { servers: [server("eu", "wss://eu.example.com"), server("us", "wss://us.example.com")] };
    expect(endpointUrl({ address: "/", servers: ["us"] }, two)).toBe("wss://us.example.com/");
    expect(endpointUrl({ address: "/", servers: [] }, two)).toBeUndefined();
    expect(endpointUrl({ address: "/", servers: [] }, { servers: [] })).toBeUndefined();
  });
});
