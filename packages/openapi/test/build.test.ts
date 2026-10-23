import { describe, expect, it, beforeAll } from "vitest";
import { specDir } from "@speculoos/fixtures";
import { load } from "@speculoos/loader";
import { allOperations, groupByTag, toRows, type ApiIR } from "@speculoos/core";
import { buildOpenApi } from "../src/index.js";

const root = specDir;
let ir: ApiIR;

beforeAll(async () => {
  const project = await load({ root, documents: [{ name: "batch", path: "batch.yaml" }] });
  ir = buildOpenApi({ project });
});

const op = (id: string) => allOperations(ir).find((e) => e.operation.id === id);
const type = (name: string) => ir.schemas[`batch#/components/schemas/${name}`];

describe("document metadata", () => {
  it("carries info, license and provenance", () => {
    expect(ir.info).toMatchObject({ title: "Batch Transcription", version: "2.0.1" });
    expect(ir.info.license).toEqual({ name: "MIT", identifier: "MIT" });
    expect(ir.provenance).toMatchObject({ dialect: "openapi", dialectVersion: "3.1.0" });
  });

  it("carries servers with their variables", () => {
    expect(ir.servers[0]).toMatchObject({ protocol: "https" });
    expect(ir.servers[0]?.variables[0]).toMatchObject({ name: "region", default: "eu", enum: ["eu", "us"] });
  });

  it("defines the security schemes that operations reference by name", () => {
    expect(ir.securitySchemes["bearer"]).toMatchObject({ kind: "http", scheme: "bearer", bearerFormat: "JWT" });
    const oauth = ir.securitySchemes["oauth"];
    if (oauth?.kind !== "oauth2") throw new Error("expected oauth2");
    expect(oauth.flows[0]).toMatchObject({ type: "clientCredentials" });
    expect(oauth.flows[0]?.scopes.map((s) => s.name)).toEqual(["jobs:read", "jobs:write"]);
  });

  it("preserves declared tag order for navigation", () => {
    expect(ir.tags.map((t) => t.name)).toEqual(["Jobs", "Internal"]);
  });

  it("records the document-level security default", () => {
    expect(ir.security).toEqual([[{ scheme: "bearer", scopes: [] }]]);
  });
});

describe("endpoints and operations", () => {
  it("makes one endpoint per path, carrying shared parameters", () => {
    const jobs = ir.endpoints.find((e) => e.address === "/jobs");
    expect(jobs?.addressKind).toBe("path");
    expect(jobs?.parameters.map((p) => p.name)).toEqual(["X-Request-Id"]);
    expect(jobs?.operations.map((o) => o.id)).toEqual(["listJobs", "createJob"]);
  });

  it("keeps operation-level parameters separate from the endpoint's", () => {
    expect(op("listJobs")?.operation).toMatchObject({ kind: "request-response" });
    const operation = op("listJobs")!.operation;
    if (operation.kind !== "request-response") throw new Error("expected rest");
    expect(operation.parameters.map((p) => p.name)).toEqual(["limit"]);
  });

  it("treats path parameters as required whatever the spec says", () => {
    const operation = op("getJob")!.operation;
    if (operation.kind !== "request-response") throw new Error("expected rest");
    expect(operation.parameters[0]).toMatchObject({ name: "id", in: "path", required: true });
  });

  it("carries deprecated through", () => {
    expect(op("getJob")?.operation.deprecated).toBe(true);
  });

  it("models webhooks as endpoints flagged isWebhook", () => {
    const hook = op("jobFinished")!.operation;
    if (hook.kind !== "request-response") throw new Error("expected rest");
    expect(hook.isWebhook).toBe(true);
  });

  it("captures every media variant of a request body", () => {
    const operation = op("createJob")!.operation;
    if (operation.kind !== "request-response") throw new Error("expected rest");
    expect(operation.requestBody?.required).toBe(true);
    expect(operation.requestBody?.content.map((c) => c.mediaType)).toEqual([
      "application/json",
      "multipart/form-data",
    ]);
  });

  it("captures response headers as properties", () => {
    const operation = op("listJobs")!.operation;
    if (operation.kind !== "request-response") throw new Error("expected rest");
    expect(operation.responses[0]?.headers[0]).toMatchObject({ name: "X-Total-Count" });
  });

  it("captures OAS links", () => {
    const operation = op("createJob")!.operation;
    if (operation.kind !== "request-response") throw new Error("expected rest");
    expect(operation.links[0]).toMatchObject({ name: "GetJob", operationId: "getJob" });
  });
});

describe("view projection is applied at the adapter boundary", () => {
  it("drops readOnly from request bodies and writeOnly from responses", () => {
    const operation = op("createJob")!.operation;
    if (operation.kind !== "request-response") throw new Error("expected rest");

    const requestVariant = operation.requestBody!.content[0]!;
    const responseVariant = operation.responses[0]!.content[0]!;
    expect([requestVariant.view, responseVariant.view]).toEqual(["request", "response"]);

    const request = toRows(requestVariant.node, ir, { expandRefs: "always", view: requestVariant.view });
    const response = toRows(responseVariant.node, ir, { expandRefs: "always", view: responseVariant.view });

    expect(request.map((r) => r.name)).not.toContain("id");
    expect(request.map((r) => r.name)).toContain("secret");
    expect(response.map((r) => r.name)).toContain("id");
    expect(response.map((r) => r.name)).not.toContain("secret");
  });
});

describe("schemas", () => {
  it("registers every declared component, even unreferenced ones", () => {
    expect(type("Unrenderable")).toBeDefined();
  });

  it("assigns unique slugs over the whole registry", () => {
    const slugs = Object.values(ir.schemas).map((d) => d.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("merges allOf into one object with composedFrom", () => {
    const config = type("TranscriptionConfig")!;
    if (config.node.kind !== "object") throw new Error("expected object");
    expect(config.node.composedFrom).toEqual(["batch#/components/schemas/BaseConfig"]);
    expect(config.node.properties.map((p) => p.name)).toEqual(["operating_point", "language"]);
  });

  it("collapses a oneOf of documented consts into an enum", () => {
    const config = type("TranscriptionConfig")!;
    if (config.node.kind !== "object") throw new Error("expected object");
    const point = config.node.properties[0]!.node;
    if (point.kind !== "enum") throw new Error("expected enum");
    expect(point.members.map((m) => m.value)).toEqual(["standard", "enhanced"]);
    expect(point.members[0]?.docs?.description).toBe("Faster.");
  });

  it("folds OAS 3.0-style nullable into the flag", () => {
    const config = type("TranscriptionConfig")!;
    if (config.node.kind !== "object") throw new Error("expected object");
    expect(config.node.properties[1]?.node).toMatchObject({ kind: "string", nullable: true });
  });

  it("detects a dictionary as a map", () => {
    const job = type("Job")!;
    if (job.node.kind !== "object") throw new Error("expected object");
    const tags = job.node.properties.find((p) => p.name === "tags");
    expect(tags?.node).toMatchObject({ kind: "map", values: { kind: "string" } });
  });

  it("keeps $ref sibling descriptions as usage docs", () => {
    const job = type("Job")!;
    if (job.node.kind !== "object") throw new Error("expected object");
    const status = job.node.properties.find((p) => p.name === "status");
    expect(status?.docs.description).toBe("Where this job has got to.");
    expect(type("JobStatus")?.docs.description).toBe("Lifecycle state.");
  });

  it("handles a self-referential schema without expanding forever", () => {
    const rows = toRows({ kind: "ref", target: "batch#/components/schemas/Job", source: { document: "batch", pointer: "" }, docs: {}, nullable: false }, ir, { expandRefs: "always" });
    expect(rows.find((r) => r.name === "parent")?.children).toMatchObject({ kind: "cycle" });
  });

  it("records back-links", () => {
    expect(type("JobStatus")?.referencedBy).toContain("batch#/components/schemas/Job");
  });
});

describe("diagnostics", () => {
  it("reports unrenderable constructs rather than dropping them", () => {
    expect(ir.diagnostics.map((d) => d.code)).toContain("NOT");
    expect(ir.diagnostics.every((d) => d.severity !== "error")).toBe(true);
  });
});

describe("navigation spans the document", () => {
  it("groups operations under declared tags, untagged last", () => {
    const groups = groupByTag(ir);
    expect(groups.map((g) => g.tag.name)).toEqual(["Jobs", "Other"]);
    expect(groups[1]?.entries.map((e) => e.operation.id)).toEqual(["jobFinished"]);
  });
});

describe("determinism", () => {
  it("builds byte-identically twice", async () => {
    const project = await load({ root, documents: [{ name: "batch", path: "batch.yaml" }] });
    const again = buildOpenApi({ project });
    expect(JSON.stringify(again)).toEqual(JSON.stringify(ir));
  });
});
