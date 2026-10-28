import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { specDir } from "@speculoos/fixtures";
import { parseApiIR } from "@speculoos/core/validate";
import type { ApiIR } from "@speculoos/core";
import { parseRenames, passesFor, renderInspect, renderLint, run, summarise } from "../src/index.js";

const root = specDir;
const build = () => run({ specs: [{ name: "batch", path: resolve(root, "batch.yaml") }], root });

describe("run", () => {
  it("picks the adapter from what the document declares", async () => {
    const { ir } = await build();
    expect(ir?.provenance.dialect).toBe("openapi");
  });

  it("emits IR that validates against the published schema", async () => {
    const { ir } = await build();
    // The generated schema is the contract; an adapter that drifts from it
    // fails here rather than in somebody's renderer.
    expect(() => parseApiIR(JSON.parse(JSON.stringify(ir)))).not.toThrow();
  });

  it("dispatches an AsyncAPI document to the AsyncAPI adapter", async () => {
    const { ir } = await run({
      specs: [{ name: "rt", content: { asyncapi: "3.0.0", info: { title: "x", version: "1" } } }],
      root,
    });
    expect(ir?.provenance).toMatchObject({ dialect: "asyncapi", dialectVersion: "3.0.0" });
  });

  it("refuses a document that declares no dialect", async () => {
    const { diagnostics } = await run({ specs: [{ name: "x", content: { hello: true } }], root });
    expect(diagnostics.map((d) => d.code)).toContain("UNKNOWN_DIALECT");
  });

  it("does not build when loading produced errors", async () => {
    const { ir } = await run({ specs: [{ name: "gone", path: "nope.yaml" }], root });
    expect(ir).toBeUndefined();
  });
});

describe("lint", () => {
  it("shows diagnostics with their code and location", async () => {
    const { ir } = await build();
    const lines = renderLint(ir!.diagnostics, new Set());
    expect(lines.join("\n")).toMatch(/warning\s+NOT\s+batch#/);
  });

  it("hides allow-listed codes and says how many", async () => {
    const { ir } = await build();
    const lines = renderLint(ir!.diagnostics, new Set(["NOT"]));
    expect(lines.join("\n")).toMatch(/1 allow-listed diagnostic\(s\) hidden/);
  });
});

describe("inspect", () => {
  it("summarises the document when given no selector", async () => {
    const { ir } = await build();
    const out = renderInspect(ir!, {});
    expect(out).toContain("POST /jobs");
    expect(out).toContain("TranscriptionConfig");
  });

  it("renders one type, with its composedFrom and back-links", async () => {
    const { ir } = await build();
    const out = renderInspect(ir!, { type: "TranscriptionConfig" });
    expect(out).toContain("extends BaseConfig");
    expect(out).toContain("referenced by: Job");
    expect(out).toContain('"standard" | "enhanced"');
  });

  it("applies each media variant's own view", async () => {
    const { ir } = await build();
    const out = renderInspect(ir!, { operation: "createJob", expand: "always" });
    const [request, response] = out.split("Response 201");
    expect(request).toContain("secret");
    expect(request).not.toMatch(/\bid\*/);
    expect(response).toMatch(/\bid\*/);
    expect(response).not.toContain("secret");
  });

  it("lists candidates when a selector does not match", async () => {
    const { ir } = await build();
    expect(renderInspect(ir!, { type: "Nope" })).toContain("Known types:");
    expect(renderInspect(ir!, { operation: "nope" })).toContain("Known operations:");
  });

  it("does not print a nullable suffix twice", async () => {
    const { ir } = await build();
    const out = renderInspect(ir!, { type: "TranscriptionConfig" });
    expect(out).not.toContain("| null | null");
    expect(out).toContain("string | null");
  });
});

describe("AsyncAPI through the CLI", () => {
  const rtRoot = specDir;
  const buildRt = (file: string) =>
    run({ specs: [{ name: "rt", path: resolve(rtRoot, file) }], root: rtRoot });

  it("emits AsyncAPI IR that validates against the published schema", async () => {
    const { ir } = await buildRt("realtime-v3.yaml");
    expect(() => parseApiIR(JSON.parse(JSON.stringify(ir)))).not.toThrow();
  });

  it("renders message operations with their direction", async () => {
    const { ir } = await buildRt("realtime-v3.yaml");
    const out = renderInspect(ir!, {});
    expect(out).toContain("\u2192 /v2/{language}");
    expect(out).toContain("\u2190 /v2/{language}");
  });

  it("renders the same page from the 2.6 and 3.0 spellings of one API", async () => {
    const v2 = await buildRt("realtime-v2.yaml");
    const v3 = await buildRt("realtime-v3.yaml");
    const render = (ir: typeof v2.ir) =>
      renderInspect(ir!, { operation: "sendToServer", expand: "always" });
    expect(render(v3.ir)).toEqual(render(v2.ir));
  });

  it("shows a 3.x reply", async () => {
    const { ir } = await buildRt("reply-v3.yaml");
    const out = renderInspect(ir!, { operation: "ping", expand: "always" });
    expect(out).toContain("Reply on pong");
    expect(out).toContain("Message Pong");
  });
});

describe("summarise", () => {
  it("counts endpoints, operations and types", async () => {
    const { ir } = await build();
    expect(summarise(ir!)).toMatch(/3 endpoint\(s\), 4 operation\(s\), 5 type\(s\)/);
  });
});

describe("transform passes", () => {
  it("builds the pipeline in a fixed order whatever order the flags come in", () => {
    const names = passesFor({
      prune: true,
      rename: "Job=Transcription",
      tag: "Jobs",
      hideInternal: true,
    }).map((t) => t.displayName);
    expect(names).toEqual([
      "hideInternal(x-internal)",
      "filterByTag(Jobs)",
      "renameTypes",
      "pruneUnreachableTypes",
    ]);
  });

  it("is empty when no transform flag was given", () => {
    expect(passesFor({})).toEqual([]);
  });

  it("takes a custom extension key", () => {
    expect(passesFor({ hideInternal: "x-private" })[0]?.displayName).toBe(
      "hideInternal(x-private)",
    );
  });

  it("rejects a rename that is not Old=New", () => {
    expect(() => parseRenames("Job")).toThrow(/Old=New/);
    expect(() => parseRenames("Job=")).toThrow(/Old=New/);
    expect(parseRenames("Job=Transcription, BaseConfig=Common")).toEqual({
      Job: "Transcription",
      BaseConfig: "Common",
    });
  });

  it("applies the passes to the built IR", async () => {
    const { ir } = await run({
      specs: [{ name: "batch", path: resolve(root, "batch.yaml") }],
      root,
      transforms: passesFor({ hideInternal: true, prune: true }),
      validate: true,
    });
    const ids = ir!.endpoints.flatMap((e) => e.operations.map((o) => o.id));
    expect(ids).not.toContain("getJob");
    expect(Object.values(ir!.schemas).map((d) => d.name)).not.toContain("Unrenderable");
  });

  it("reports which pass produced invalid IR", async () => {
    await expect(
      run({
        specs: [{ name: "batch", path: resolve(root, "batch.yaml") }],
        root,
        transforms: [Object.assign((ir: ApiIR) => ({ ...ir, tags: 1 as never }), { displayName: "bad" })],
        validate: true,
      }),
    ).rejects.toThrow(/Transform bad \(step 1\)/);
  });
});

describe("the speculoos binary", () => {
  // The built CLI, as a shell or a script runs it: exit codes are its API.
  const cli = (...args: string[]) =>
    spawnSync(process.execPath, [resolve(__dirname, "../dist/cli.js"), ...args], { encoding: "utf8" });

  it("succeeds when asked for help", () => {
    for (const flag of ["--help", "-h"]) {
      const { status, stdout } = cli(flag);
      expect(status).toBe(0);
      expect(stdout).toContain("Usage:");
    }
  });

  it("fails with usage on stderr when given no command", () => {
    const { status, stderr } = cli();
    expect(status).toBe(1);
    expect(stderr).toContain("Usage:");
  });
});
