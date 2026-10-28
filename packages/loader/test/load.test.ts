import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { load } from "../src/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "specs");

describe("load — a project, not a document", () => {
  it("discovers documents reached through refs and names them by relative path", async () => {
    const project = await load({ root, documents: [{ name: "batch", path: "batch.yaml" }] });
    expect(project.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(project.documents.map((d) => d.name).sort()).toEqual(["batch", "common.yaml"]);
    expect(project.entry.map((d) => d.name)).toEqual(["batch"]);
  });

  it("gives two documents sharing a schema one canonical location for it", async () => {
    const project = await load({
      root,
      documents: [
        { name: "batch", path: "batch.yaml" },
        { name: "realtime", path: "realtime.yaml" },
      ],
    });

    const fromBatch = project.resolve("./common.yaml#/components/schemas/Language", {
      document: "batch",
      pointer: "/components/schemas/JobConfig/properties/language",
    });
    const fromRealtime = project.resolve("./common.yaml#/components/schemas/Language", {
      document: "realtime",
      pointer: "/components/schemas/StartRecognition/properties/language",
    });

    // Identity follows the definition, not the referrer — this is what stops a
    // shared type becoming two types with two anchors.
    expect(fromBatch).toEqual(fromRealtime);
    expect(fromBatch).toEqual({
      document: "common.yaml",
      pointer: "/components/schemas/Language",
    });
  });

  it("resolves same-document refs", async () => {
    const project = await load({ root, documents: [{ name: "batch", path: "batch.yaml" }] });
    expect(project.resolve("#/components/schemas/JobConfig", { document: "batch", pointer: "" })).toEqual({
      document: "batch",
      pointer: "/components/schemas/JobConfig",
    });
  });

  it("returns undefined for a ref whose target does not exist", async () => {
    const project = await load({ root, documents: [{ name: "batch", path: "batch.yaml" }] });
    expect(project.resolve("#/components/schemas/Nope", { document: "batch", pointer: "" })).toBeUndefined();
  });

  it("reads values at a canonical location", async () => {
    const project = await load({ root, documents: [{ name: "batch", path: "batch.yaml" }] });
    expect(project.at({ document: "common.yaml", pointer: "/components/schemas/Language" })).toMatchObject({
      type: "string",
      pattern: "^[a-z]{2}$",
    });
  });

  it("detects the dialect of each entry document", async () => {
    const project = await load({
      root,
      documents: [
        { name: "batch", path: "batch.yaml" },
        { name: "realtime", path: "realtime.yaml" },
      ],
    });
    expect(project.document("batch")?.dialect).toMatchObject({ dialect: "openapi-3.1" });
    expect(project.document("realtime")?.dialect).toMatchObject({ dialect: "asyncapi-3" });
  });
});

describe("load — determinism", () => {
  it("produces the same document names whatever the absolute checkout path", async () => {
    const a = await load({ root, documents: [{ name: "batch", path: "batch.yaml" }] });
    const b = await load({ root, documents: [{ name: "batch", path: resolve(root, "batch.yaml") }] });
    expect(a.documents.map((d) => d.name).sort()).toEqual(b.documents.map((d) => d.name).sort());
  });

  it("rejects a document name that looks like a path", async () => {
    const project = await load({ root, documents: [{ name: "specs/batch.yaml", path: "batch.yaml" }] });
    expect(project.diagnostics.map((d) => d.code)).toContain("BAD_DOCUMENT_NAME");
    expect(project.entry).toEqual([]);
  });
});

describe("load — failure modes", () => {
  it("reports a YAML syntax error with a position, not a stack trace", async () => {
    const project = await load({
      root,
      documents: [{ name: "bad", content: "openapi: '3.1.0'\npaths:\n  - [unclosed\n" }],
    });
    const parse = project.diagnostics.find((d) => d.code === "PARSE_ERROR");
    expect(parse?.message).toMatch(/line \d+, column \d+/);
  });

  it("refuses remote refs unless asked", async () => {
    const project = await load({
      root,
      documents: [{ name: "remote", content: { openapi: "3.1.0", a: { $ref: "https://example.com/s.yaml#/x" } } }],
    });
    expect(project.diagnostics.map((d) => d.code)).toContain("REMOTE_REF_DISABLED");
  });

  it("rejects Swagger 2.0 with a pointer to the fix", async () => {
    const project = await load({ root, documents: [{ name: "old", content: { swagger: "2.0" } }] });
    expect(project.diagnostics.find((d) => d.code === "NO_DIALECT")?.message).toMatch(
      /Swagger 2.0 is not supported.*Convert to OpenAPI 3/,
    );
  });

  it("reports an unreadable file rather than throwing", async () => {
    const project = await load({ root, documents: [{ name: "gone", path: "nope.yaml" }] });
    expect(project.diagnostics.map((d) => d.code)).toContain("DOCUMENT_UNREADABLE");
  });

  it("cannot resolve a relative ref from an in-memory document, and says why", async () => {
    const project = await load({
      root,
      documents: [{ name: "mem", content: { openapi: "3.1.0", a: { $ref: "./other.yaml#/x" } } }],
    });
    expect(project.diagnostics.map((d) => d.code)).toContain("NO_BASE_PATH");
  });
});

describe("load — cycles", () => {
  it("terminates when two documents reference each other", async () => {
    const project = await load({
      root,
      documents: [
        { name: "a", path: "cycle-a.yaml", content: "openapi: '3.1.0'\nx:\n  $ref: './cycle-b.yaml#/y'\n" },
        { name: "b", path: "cycle-b.yaml", content: "openapi: '3.1.0'\ny:\n  $ref: './cycle-a.yaml#/x'\n" },
      ],
    });
    expect(project.documents).toHaveLength(2);
  });
});
