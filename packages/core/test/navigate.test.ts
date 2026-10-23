import { describe, expect, it } from "vitest";
import { allOperations, createSlugger, groupByTag, slugify, toRows, walk } from "../src/index.js";
import { ir, jobRef, schemas } from "./fixture.js";

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
